package ai.deepseek.harness.mobile.runtime

import android.content.Context
import java.io.File
import java.io.FileOutputStream
import java.nio.channels.FileChannel
import java.nio.file.Files
import java.nio.file.StandardCopyOption
import java.nio.file.StandardOpenOption
import java.security.MessageDigest
import java.util.zip.ZipInputStream
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/**
 * 安装随 APK 出货的官方 dsh 发布物。归档 SHA-256 是唯一的内容身份，
 * 目录原子发布，损坏时拒绝启动，绝不从公网下载可执行代码。
 */
class HostArchiveInstaller(private val context: Context) {
    private val manifestAsset = "runtime/dsh-host-manifest.json"
    private val archiveAsset = "runtime/host/package.zip"
    private val shaPattern = Regex("[0-9a-f]{64}")
    private val maxUncompressedBytes = 1_500_000_000L
    private val maxEntries = 200_000

    suspend fun install(): File = withContext(Dispatchers.IO) {
        val manifest = context.assets.open(manifestAsset).bufferedReader().use {
            Json.parseToJsonElement(it.readText()).jsonObject
        }
        require(manifest["format"]?.jsonPrimitive?.content == "333-host-v1") { "Host 发布格式不匹配" }
        val digest = manifest["sha256"]?.jsonPrimitive?.content
            ?: error("Host 缺少 SHA-256")
        require(shaPattern.matches(digest)) { "Host SHA-256 格式不正确" }
        val entry = manifest["entry"]?.jsonPrimitive?.content
            ?: error("Host 缺少入口")
        require(entry == "lib/bin.js") { "Host 必须使用官方 dsh CLI 入口" }
        val links = manifest["links"]?.jsonObject ?: error("Host 清单缺少 pnpm 链接映射")
        require(links.size <= maxEntries) { "Host 包的符号链接超出上限" }
        val length = manifest["bytes"]?.jsonPrimitive?.content?.toLongOrNull()
            ?: error("Host 缺少归档长度")
        require(length > 0) { "Host 发布包为空" }
        val root = File(context.noBackupFilesDir, "runtime/host")
        check(root.isDirectory || root.mkdirs()) { "无法建立 Host 数据目录" }

        FileChannel.open(File(root, ".install.lock").toPath(),
            StandardOpenOption.CREATE, StandardOpenOption.WRITE).use { channel ->
            channel.lock().use {
                val target = File(root, digest)
                val marker = File(target, ".archive-sha256")
                val executable = File(target, entry)
                if (marker.isFile && marker.readText() == digest && executable.isFile) {
                    return@withContext executable
                }
                // 避免旧版覆盖正在运行的 Host。每个哈希占独立目录。
                val actual = MessageDigest.getInstance("SHA-256")
                var compressedLength = 0L
                context.assets.open(archiveAsset).buffered().use { input ->
                    val buffer = ByteArray(65536)
                    while (true) {
                        val count = input.read(buffer)
                        if (count == -1) break
                        if (count > 0) {
                            actual.update(buffer, 0, count)
                            compressedLength += count
                            require(compressedLength <= length) { "Host 归档长度超过清单" }
                        }
                    }
                }
                require(compressedLength == length && actual.digest().toHex() == digest) {
                    "Host 发布包 SHA-256/长度不匹配"
                }
                val stage = File(root, ".$digest.installing")
                if (stage.exists()) check(stage.deleteRecursively()) { "无法清理过期的 Host 暂存目录" }
                check(stage.mkdirs()) { "无法创建 Host 暂存目录" }
                try {
                    var totalBytes = 0L
                    var entries = 0
                    ZipInputStream(context.assets.open(archiveAsset).buffered()).use { zip ->
                        while (true) {
                            val item = zip.nextEntry ?: break
                            entries++
                            require(entries <= maxEntries) { "Host 发布包的条目数量超过上限" }
                            val name = item.name
                            require(name.isNotBlank() && !name.startsWith("/") &&
                                !name.contains('\\') && name.split('/').none { it == "." || it == ".." || it.isEmpty() }) {
                                "Host 发布包含非法路径"
                            }
                            val output = File(stage, name)
                            require(output.canonicalPath.startsWith(stage.canonicalPath + File.separator)) {
                                "Host 发布物试图越过应用私有目录"
                            }
                            if (item.isDirectory) {
                                check(output.isDirectory || output.mkdirs()) { "无法建立 Host 子目录" }
                            } else {
                                check(output.parentFile!!.isDirectory || output.parentFile!!.mkdirs()) {
                                    "无法建立 Host 文件目录"
                                }
                                FileOutputStream(output).use { file ->
                                    val buf = ByteArray(65536)
                                    while (true) {
                                        val n = zip.read(buf)
                                        if (n == -1) break
                                        if (n > 0) {
                                            totalBytes += n
                                            require(totalBytes <= maxUncompressedBytes) {
                                                "Host 发布包解压量超过安全上限"
                                            }
                                            file.write(buf, 0, n)
                                        }
                                    }
                                    file.fd.sync()
                                }
                            }
                            zip.closeEntry()
                        }
                    }
                    check(File(stage, entry).isFile) { "Host 缺少官方启动入口" }
                    // pnpm 发布目录中的相对 symlink 指向同一归档内已解包的包。
                    // 逐个创建后统一解析目标，杜绝经过其他链接的越界路径。
                    val stageRoot = stage.canonicalPath + File.separator
                    for ((name, value) in links) {
                        val targetValue = value.jsonPrimitive.content
                        require(name.isNotBlank() && !name.startsWith("/") &&
                            !name.contains('\\') && name.split('/').none { it == "." || it == ".." || it.isEmpty() }) {
                            "非法 Host 链接名称"
                        }
                        require(targetValue.isNotBlank() && !targetValue.startsWith("/") &&
                            !targetValue.contains('\\')) { "Host 链接目标必须是相对路径" }
                        val link = File(stage, name)
                        check(link.parentFile!!.isDirectory && !Files.exists(link.toPath())) {
                            "Host 链接目标位置冲突或父目录不存在：$name"
                        }
                        Files.createSymbolicLink(link.toPath(), java.nio.file.Path.of(targetValue))
                    }
                    for ((name, _) in links) {
                        val link = File(stage, name)
                        require(link.canonicalPath.startsWith(stageRoot) &&
                            (link.isDirectory || link.isFile)) {
                            "Host 链接越界、失效或循环：$name"
                        }
                    }
                    File(stage, ".archive-sha256").writeText(digest)
                    if (target.exists()) check(target.deleteRecursively()) { "无法清理损坏的旧 Host" }
                    Files.move(stage.toPath(), target.toPath(), StandardCopyOption.ATOMIC_MOVE)
                } finally {
                    if (stage.exists()) stage.deleteRecursively()
                }
                check(executable.isFile) { "Host 发布完成后入口不可读取" }
                executable
            }
        }
    }
    private fun ByteArray.toHex(): String = joinToString("") { "%02x".format(it.toInt() and 255) }
}
