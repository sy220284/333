package ai.deepseek.harness.mobile.runtime

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.IBinder
import java.io.File
import java.io.IOException
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull

/** API Ready 由远端 RPC 验证，Announced 仅表示 Host 发布了启动链接。 */
sealed interface LocalHostState {
    data object Idle : LocalHostState
    data class Starting(val step: String) : LocalHostState
    data class Announced(val link: String) : LocalHostState
    data class Failed(val reason: String) : LocalHostState
}

class CoreHostService : Service() {
    companion object {
        private const val CHANNEL = "333-local-core"
        private const val NOTIFICATION_ID = 1003
        const val ACTION_START = "ai.deepseek.harness.mobile.runtime.START"
        const val ACTION_STOP = "ai.deepseek.harness.mobile.runtime.STOP"
        val state = MutableStateFlow<LocalHostState>(LocalHostState.Idle)

        fun start(context: Context) {
            context.startForegroundService(Intent(context, CoreHostService::class.java).setAction(ACTION_START))
        }
        fun stop(context: Context) {
            context.startService(Intent(context, CoreHostService::class.java).setAction(ACTION_STOP))
        }
    }
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var startup: Job? = null
    private var child: Process? = null
    private val readyLine = Regex("^dsh web: (https?://\\S+)$")

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        val notifications = getSystemService(NotificationManager::class.java)
        notifications.createNotificationChannel(NotificationChannel(CHANNEL,
            "本机 Harness 核心", NotificationManager.IMPORTANCE_LOW))
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            stopSelf()
            return START_NOT_STICKY
        }
        startForeground(NOTIFICATION_ID, notification(),
            ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
        if (startup?.isActive != true && child?.isAlive != true) {
            startup = scope.launch { launchOfficialHost() }
        }
        return START_NOT_STICKY
    }

    private fun notification(): Notification = Notification.Builder(this, CHANNEL)
        .setContentTitle("DeepSeek Harness")
        .setContentText("本机核心正在运行")
        .setSmallIcon(android.R.drawable.stat_sys_download_done)
        .setOngoing(true)
        .build()

    private suspend fun launchOfficialHost() = withContext(Dispatchers.IO) {
        try {
            state.value = LocalHostState.Starting("校验 Android Node 运行时")
            val checked = LocalRuntime(applicationContext).probeNode()
            require(checked is RuntimeStatus.NodeReady) {
                when (checked) {
                    is RuntimeStatus.Missing -> checked.reason
                    else -> "Node 运行时尚未通过执行验收"
                }
            }
            state.value = LocalHostState.Starting("安装经 SHA-256 校验的官方 Harness Host")
            val entry = HostArchiveInstaller(applicationContext).install()
            val home = File(filesDir, "harness")
            check(home.isDirectory || home.mkdirs()) { "无法建立 Session 持久目录" }
            val libs = File(noBackupFilesDir, "runtime/node/${checked.version}/${checked.abi}/lib")
            val node = File(applicationInfo.nativeLibraryDir, "libdsh_node.so")
            check(node.isFile && entry.isFile && libs.isDirectory) {
                "本机核心依赖路径不完整"
            }
            state.value = LocalHostState.Starting("启动官方 dsh web profile")
            val process = ProcessBuilder(node.absolutePath, entry.absolutePath,
                "web", "--no-open", "--host", "127.0.0.1", "--port", "0")
                .directory(entry.parentFile!!.parentFile)
                .redirectErrorStream(true)
                .apply {
                    environment()["HOME"] = filesDir.absolutePath
                    environment()["DSH_HOME"] = home.absolutePath
                    environment()["TMPDIR"] = cacheDir.absolutePath
                    environment()["LD_LIBRARY_PATH"] = listOf(libs.absolutePath,
                        applicationInfo.nativeLibraryDir).joinToString(":")
                    environment()["DSH_TELEMETRY_DISABLED"] = "1"
                }.start()
            child = process
            var announced = false
            process.inputStream.bufferedReader().use { lines ->
                while (true) {
                    val line = lines.readLine() ?: break
                    val url = readyLine.matchEntire(line.trim())?.groupValues?.get(1)
                    if (url != null) {
                        val parsed = url.toHttpUrlOrNull()
                        if (parsed != null && parsed.scheme == "http" &&
                            parsed.host == "127.0.0.1" &&
                            !parsed.queryParameter("token").isNullOrBlank()) {
                            announced = true
                            state.value = LocalHostState.Announced(url)
                        }
                    }
                    // Host 日志可能包含一次性 URL 和用户数据，不写 Android logcat。
                }
            }
            val code = process.waitFor()
            state.value = LocalHostState.Failed(if (announced)
                "本机 Host 已退出（代码 $code），可在运行诊断中重新启动"
                else "Host 未发布可验证的本机连接地址，退出代码 $code")
        } catch (error: Exception) {
            state.value = LocalHostState.Failed(
                "Host 启动失败：${error.message ?: error.javaClass.simpleName}")
        } finally {
            child?.destroy()
            child = null
        }
    }

    override fun onDestroy() {
        startup?.cancel()
        child?.let { process ->
            process.destroy()
            if (!process.waitFor(2, TimeUnit.SECONDS)) process.destroyForcibly()
        }
        child = null
        scope.cancel()
        state.value = LocalHostState.Idle
        super.onDestroy()
    }
}
