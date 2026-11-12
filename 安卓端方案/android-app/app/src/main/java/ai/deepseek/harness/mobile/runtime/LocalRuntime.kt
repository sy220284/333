package ai.deepseek.harness.mobile.runtime

import android.content.Context
import java.io.File

/**
 * Android Host 检查链的入口。
 * Runtime 二进制须通过签名和哈希校验后由独立构建流水线装进 APK。
 * 当前从磁盘实况判断能否启动，不把缺少 runtime 的 APK 表示为已安装。
 */
sealed interface RuntimeStatus {
    data class Missing(val reason: String) : RuntimeStatus
    data class Available(val node: File, val bundleMarker: String) : RuntimeStatus
}
class LocalRuntime(private val context: Context) {
    fun inspect(): RuntimeStatus {
        val node = File(context.applicationInfo.nativeLibraryDir, "libdsh_node.so")
        if (!node.isFile || !node.canExecute()) return RuntimeStatus.Missing("APK 未包含已验证的 Android Node 运行时")
        val marker = "runtime/dsh-host-manifest.json"
        val exists = try { context.assets.open(marker).use { it.read() }; true }
            catch (_: java.io.FileNotFoundException) { false }
        if (!exists) return RuntimeStatus.Missing("APK 未包含 333 Host 的离线发布清单")
        return RuntimeStatus.Available(node, marker)
    }
}
