package ai.deepseek.harness.mobile.runtime

import android.content.Context
import android.os.Build
import java.io.File
import java.io.FileOutputStream
import java.nio.channels.FileChannel
import java.nio.file.Files
import java.nio.file.StandardCopyOption
import java.nio.file.StandardOpenOption
import java.security.MessageDigest
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/**
 * Android Node 仅在 nativeLibraryDir 执行；assets 中所有依赖文件在使用前按
 * GitHub 构建出的 integrity-manifest.json 完整验 SHA-256。Host 就绪另有握手验收。
 */
sealed interface RuntimeStatus {
    data object Checking : RuntimeStatus
    data class Missing(val reason: String) : RuntimeStatus
    data class NodeReady(val version: String, val abi: String, val detail: String) : RuntimeStatus
    data class Available(val node: File, val bundleMarker: String) : RuntimeStatus
}

class LocalRuntime(private val context: Context) {
    private val root = "runtime/node"
    private val integrity = "$root/integrity-manifest.json"
    private val expectedNodeName = "libdsh_node.so"

    fun inspect(): RuntimeStatus {
        val node = File(context.applicationInfo.nativeLibraryDir, expectedNodeName)
        if (!node.isFile || !node.canExecute()) return RuntimeStatus.Missing(
            "APK 尚未包含可执行的 Android Node 26；需要采用含运行时的完整构建包"
        )
        if (!assetExists(integrity)) return RuntimeStatus.Missing("APK 缺少 Node SHA-256 完整性清单")
        return if (assetExists("runtime/dsh-host-manifest.json")) {
            RuntimeStatus.Available(node, "runtime/dsh-host-manifest.json")
        } else RuntimeStatus.NodeReady("待验证", Build.SUPPORTED_ABIS.firstOrNull().orEmpty(),
            "Node 文件已包含，仍需验证并启动；Harness Host 离线资源尚未打包")
    }

    suspend fun probeNode(): RuntimeStatus = withContext(Dispatchers.IO) {
        val initial = inspect()
        if (initial is RuntimeStatus.Missing) return@withContext initial
        try {
            val manifest = context.assets.open(integrity).bufferedReader().use {
                Json.parseToJsonElement(it.readText()).jsonObject
            }
            require(manifest["format"]?.jsonPrimitive?.content == "333-node-v2") { "运行时清单版本不匹配" }
            val abi = manifest["abi"]?.jsonPrimitive?.content ?: error("运行时没有 ABI 声明")
            require(abi in Build.SUPPORTED_ABIS) { "此设备 ABI 不支持已打包的 Node：$abi" }
            val version = manifest["nodeVersion"]?.jsonPrimitive?.content ?: error("缺少 Node 版本")
            require(Regex("26\\.[0-9]+\\.[0-9]+").matches(version)) { "运行时 Node 主版本不符合固定基线" }
            val files = manifest["files"]?.jsonObject ?: error("Node 运行时清单缺少 SHA-256 文件列表")
            val node = File(context.applicationInfo.nativeLibraryDir, expectedNodeName)
            val executableKey = "jniLibs/$abi/$expectedNodeName"
            val expectedNodeSha = files[executableKey]?.jsonPrimitive?.content
                ?: error("Node 可执行文件缺少摘要")
            require(checksum(node) == expectedNodeSha) { "Node 可执行文件 SHA-256 校验失败" }
            val libraries = manifest["libraries"]?.jsonObject
                ?: error("运行时缺少动态库别名映射")
            val blobs = manifest["blobs"]?.jsonObject ?: error("运行时缺少动态库资源清单")
            require(libraries.isNotEmpty() && libraries.values.map { it.jsonPrimitive.content }.toSet() == blobs.keys) {
                "动态库别名与资源清单不一致"
            }
            val allowedName = Regex("[a-zA-Z0-9._+\\-]+")
            val allowedSha = Regex("[0-9a-f]{64}")
            val store = File(context.noBackupFilesDir, "$root/$version/$abi/lib")
            val lockDir = File(context.noBackupFilesDir, "$root/shared/$abi")
            val canonicalDir = File(lockDir, "blobs")
            check(lockDir.isDirectory || lockDir.mkdirs()) { "无法创建运行时共享锁目录" }
            FileChannel.open(File(lockDir, ".prepare.lock").toPath(),
                StandardOpenOption.CREATE, StandardOpenOption.WRITE).use { channel ->
                channel.lock().use {
                    check(store.isDirectory || store.mkdirs()) { "无法建立运行库目录" }
                    check(canonicalDir.isDirectory || canonicalDir.mkdirs()) { "无法建立共享资源目录" }
                    for ((name, digestValue) in libraries) {
                        require(allowedName.matches(name)) { "非法动态库名称：$name" }
                        val digest = digestValue.jsonPrimitive.content
                        require(allowedSha.matches(digest)) { "动态库摘要格式错误：$name" }
                        val canonical = File(canonicalDir, digest)
                        if (!canonical.isFile || checksum(canonical) != digest) {
                            val stage = File(canonicalDir, ".$digest.tmp")
                            try {
                                Files.deleteIfExists(stage.toPath())
                                val hash = MessageDigest.getInstance("SHA-256")
                                var bytes = 0L
                                context.assets.open("$root/$abi/blobs/$digest").use { input ->
                                    FileOutputStream(stage).use { output ->
                                        val buffer = ByteArray(65536)
                                        while (true) {
                                            val n = input.read(buffer)
                                            if (n == -1) break
                                            if (n == 0) continue
                                            output.write(buffer, 0, n)
                                            hash.update(buffer, 0, n)
                                            bytes += n
                                        }
                                        output.fd.sync()
                                    }
                                }
                                require(hash.digest().toHex() == digest) { "运行库摘要校验失败：$name" }
                                require(bytes == blobs[digest]?.jsonPrimitive?.content?.toLong()) {
                                    "运行库大小与清单不一致：$name"
                                }
                                Files.move(stage.toPath(), canonical.toPath(),
                                    StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE)
                            } finally {
                                Files.deleteIfExists(stage.toPath())
                            }
                        }
                        // Android app-private storage can reject hard links even on the
                        // same volume. A verified copy keeps the DT_NEEDED basename stable.
                        val target = File(store, name)
                        if (target.isFile && checksum(target) == digest) continue
                        val staging = File(store, ".$name.tmp")
                        try {
                            Files.deleteIfExists(staging.toPath())
                            Files.copy(canonical.toPath(), staging.toPath())
                            require(checksum(staging) == digest) {
                                "动态库展开后的 SHA-256 校验失败：$name"
                            }
                            Files.move(staging.toPath(), target.toPath(),
                                StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE)
                        } finally {
                            Files.deleteIfExists(staging.toPath())
                        }
                    }
                }
            }
            val command = ProcessBuilder(node.absolutePath, "--version")
                .redirectErrorStream(true)
            command.environment()["LD_LIBRARY_PATH"] =
                listOf(store.absolutePath, context.applicationInfo.nativeLibraryDir).joinToString(":")
            command.environment()["HOME"] = context.filesDir.absolutePath
            command.environment()["TMPDIR"] = context.cacheDir.absolutePath
            val process = command.start()
            try {
                if (!process.waitFor(12, TimeUnit.SECONDS)) {
                    process.destroyForcibly()
                    throw IllegalStateException("Node --version 启动超时")
                }
                val output = process.inputStream.bufferedReader().use { it.readText().trim() }
                require(process.exitValue() == 0 && output == "v$version") {
                    "Node 自检失败：exit=${process.exitValue()}，output=$output"
                }
            } finally {
                if (process.isAlive) process.destroyForcibly()
            }
            RuntimeStatus.NodeReady(version, abi,
                "Node v$version 已校验并成功执行。Harness Host 离线资源与启动链仍需部署验收。")
        } catch (e: Exception) {
            RuntimeStatus.Missing("Android Node 自检失败：${e.message ?: e::class.java.simpleName}")
        }
    }

    private fun assetExists(name: String): Boolean = try {
        context.assets.open(name).use { true }
    } catch (_: java.io.FileNotFoundException) {
        false
    }

    private fun checksum(file: File): String {
        val hash = MessageDigest.getInstance("SHA-256")
        file.inputStream().buffered().use { input ->
            val buf = ByteArray(65536)
            while (true) {
                val n = input.read(buf)
                if (n == -1) break
                if (n > 0) hash.update(buf, 0, n)
            }
        }
        return hash.digest().toHex()
    }

    private fun ByteArray.toHex(): String = joinToString("") { "%02x".format(it.toInt() and 255) }
}
