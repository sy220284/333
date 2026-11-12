package ai.deepseek.harness.mobile.net

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.HttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okio.ByteString
import java.io.Closeable
import java.io.IOException
import java.util.UUID
import java.util.concurrent.TimeUnit

/** Host 侧 RemoteError 原样向上暴露，交给 UI 显示用户可理解的错误。 */
class RemoteFailure(val code: String, message: String) : IOException("$code: $message")

/** 校验 URL 的可信边界；仅 loopback 可使用明文 HTTP。 */
internal fun validateHostUrl(url: HttpUrl) {
    require(url.username.isEmpty() && url.password.isEmpty()) { "地址不得包含账号密码" }
    require(url.scheme == "https" || (url.scheme == "http" && url.host in setOf("127.0.0.1", "::1", "localhost"))) {
        "远程核心必须使用 HTTPS，HTTP 仅限手机本地 127.0.0.1"
    }
}

/** Cookie 只在当前进程保存，不存储启动 token 或日志。 */
internal class SessionCookies : CookieJar {
    private val items = mutableListOf<Cookie>()
    @Synchronized override fun saveFromResponse(url: HttpUrl, cookies: List<Cookie>) {
        items.removeAll { old -> cookies.any { it.name == old.name && it.domain == old.domain && it.path == old.path } }
        items.addAll(cookies)
    }
    @Synchronized override fun loadForRequest(url: HttpUrl): List<Cookie> =
        items.filter { it.expiresAt > System.currentTimeMillis() && it.matches(url) }
    @Synchronized fun clear() { items.clear() }
}

class HarnessRemote private constructor(
    private val root: HttpUrl,
    private val cookies: SessionCookies,
    private val launchToken: String
) : Closeable {
    // 官方每个 API Peer 最多拥有一条物理 WebSocket；各业务 streamId 必须复用该 socket。
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val lock = Any()
    private val subscribers = linkedMapOf<String, StreamSubscription>()
    private var physicalSocket: WebSocket? = null
    private var socketReady = false
    private var dialing = false
    private var authenticated = true
    private var disposed = false
    private var generation = 0L
    private var failureCount = 0

    private data class StreamSubscription(
        val endpoint: String,
        val args: JsonObject,
        val onItem: (JsonElement) -> Unit,
        val onOpen: () -> Unit,
        val onError: (Throwable) -> Unit
    )
    private val json = Json { ignoreUnknownKeys = false }
    private val http = OkHttpClient.Builder()
        .cookieJar(cookies).followRedirects(false).followSslRedirects(false)
        .callTimeout(30, TimeUnit.SECONDS).build()

    companion object {
        /**
         * 用户只需粘贴 Host 启动时给出的链接，自动解析 token。
         * 接受根页面 URL 或 /connect URL，但严格限定同一源。
         */
        suspend fun connectFromLink(link: String): HarnessRemote {
            val linkUrl = link.trim().toHttpUrlOrNull() ?: throw IllegalArgumentException("连接地址格式无效")
            validateHostUrl(linkUrl)
            val token = linkUrl.queryParameter("token")?.takeIf { it.isNotBlank() }
                ?: throw IllegalArgumentException("连接链接缺少 Host 签发的 token")
            val path = linkUrl.encodedPath
            val basePath = if (path.endsWith("/connect")) path.removeSuffix("connect") else path
            require(basePath.endsWith("/")) { "请使用 Host 原始启动链接，不要附加页面路径" }
            val root = linkUrl.newBuilder().query(null).fragment(null).encodedPath(basePath).build()
            val gateway = HarnessRemote(root, SessionCookies(), token)
            gateway.exchange(token)
            return gateway
        }
    }

    private suspend fun exchange(token: String) = withContext(Dispatchers.IO) {
        val url = root.newBuilder().addPathSegment("connect")
            .addQueryParameter("token", token).addQueryParameter("interactions", "answer").build()
        val request = Request.Builder().url(url).get().build()
        http.newCall(request).execute().use { response ->
            if (response.code != 302) throw RemoteFailure("connection/auth", "Host 身份交换失败（HTTP ${response.code}）")
            if (cookies.loadForRequest(root).isEmpty()) throw RemoteFailure("connection/no-cookie", "Host 未签发会话凭据")
        }
    }

    /**
     * 遵循 @Remote 精确具名参数；args 须匹配生成描述符。
     * 调用只返回服务器确认的 value；本层不伪造成功或默认业务结果。
     */
    suspend fun call(endpoint: String, args: JsonObject): kotlinx.serialization.json.JsonElement = withContext(Dispatchers.IO) {
        require(Regex("^[A-Za-z0-9_$.-]+/[A-Za-z0-9_$.-]+$").matches(endpoint)) { "Remote endpoint 非法" }
        val id = UUID.randomUUID().toString()
        val envelope = buildJsonObject {
            put("type", JsonPrimitive("client-request"))
            put("rpcId", JsonPrimitive(id))
            put("method", JsonPrimitive(endpoint))
            put("payload", buildJsonObject { put("args", args) })
        }
        val relative = endpoint.split("/")
        val url = root.newBuilder().addPathSegment("api")
            .addPathSegment(relative[0]).addPathSegment(relative[1]).build()
        val request = Request.Builder().url(url)
            .post(envelope.toString().toRequestBody("application/json".toMediaType())).build()
        http.newCall(request).execute().use { response ->
            if (!response.isSuccessful) throw RemoteFailure("connection/http", "核心请求失败（HTTP ${response.code}）")
            if (response.header("content-type")?.substringBefore(';') != "application/json")
                throw RemoteFailure("connection/media-type", "核心返回了不支持的响应格式")
            val body = response.body?.string() ?: throw RemoteFailure("connection/empty", "核心返回空响应")
            val frame = json.parseToJsonElement(body).jsonObject
            if (frame["type"]?.jsonPrimitive?.content != "server-response" ||
                frame["rpcId"]?.jsonPrimitive?.content != id)
                throw RemoteFailure("connection/rpc-id", "请求与响应不匹配")
            val result = frame["result"]?.jsonObject ?: throw RemoteFailure("connection/envelope", "无效的 RPC 响应")
            if (result["ok"]?.jsonPrimitive?.booleanOrNull == true)
                result["value"] ?: kotlinx.serialization.json.JsonNull
            else {
                val error = result["error"]?.jsonObject ?: throw RemoteFailure("connection/envelope", "核心拒绝请求但未提供错误详情")
                throw RemoteFailure(error["code"]?.jsonPrimitive?.content ?: "remote/error",
                    error["message"]?.jsonPrimitive?.content ?: "请求被核心拒绝")
            }
        }
    }

    /** 复用一个 WebSocket 的逻辑 Remote stream，遵循单 Peer/单 socket 约束。 */
    fun stream(
        endpoint: String,
        args: JsonObject,
        onItem: (JsonElement) -> Unit,
        onOpen: () -> Unit = {},
        onError: (Throwable) -> Unit
    ): Closeable {
        require(Regex("^[A-Za-z0-9_$.-]+/[A-Za-z0-9_$.-]+$").matches(endpoint)) { "非法流端点" }
        val streamId = UUID.randomUUID().toString()
        synchronized(lock) {
            check(!disposed) { "连接已关闭" }
            subscribers[streamId] = StreamSubscription(endpoint, args, onItem, onOpen, onError)
            if (socketReady) {
                val socket = physicalSocket ?: error("Socket 状态不一致")
                if (!socket.send(openFrame(streamId, endpoint, args))) {
                    socket.cancel()
                }
            } else {
                dialLocked()
            }
        }
        return Closeable {
            synchronized(lock) {
                if (subscribers.remove(streamId) != null && socketReady) {
                    physicalSocket?.send(buildJsonObject {
                        put("type", JsonPrimitive("cancel"))
                        put("streamId", JsonPrimitive(streamId))
                    }.toString())
                }
            }
        }
    }

    private fun openFrame(id: String, endpoint: String, args: JsonObject): String =
        buildJsonObject {
            put("type", JsonPrimitive("open"))
            put("streamId", JsonPrimitive(id))
            put("endpoint", JsonPrimitive(endpoint))
            put("payload", buildJsonObject { put("args", args) })
        }.toString()

    /** lock 已被持有。网络操作一律由 IO scope 执行，避免阻塞 Compose 主线程。 */
    private fun dialLocked() {
        if (disposed || dialing || socketReady || subscribers.isEmpty()) return
        dialing = true
        val target = ++generation
        scope.launch {
            try {
                if (!authenticated) exchange(launchToken)
                synchronized(lock) {
                    if (disposed || target != generation) return@launch
                    authenticated = true
                }
                val url = root.newBuilder().addPathSegment("api").addPathSegment("remote.mux").build()
                val socket = http.newWebSocket(Request.Builder().url(url).build(), socketListener(target))
                synchronized(lock) {
                    if (disposed || target != generation) socket.close(1000, "disposed")
                    else physicalSocket = socket
                }
            } catch (error: Exception) {
                disconnected(target, error)
            }
        }
    }

    private fun socketListener(target: Long): WebSocketListener = object : WebSocketListener() {
        override fun onOpen(webSocket: WebSocket, response: Response) {
            val current: List<Pair<String, StreamSubscription>>
            synchronized(lock) {
                if (disposed || target != generation) {
                    webSocket.close(1000, "stale")
                    return
                }
                physicalSocket = webSocket
                socketReady = true
                dialing = false
                failureCount = 0
                current = subscribers.toList()
            }
            for ((id, observer) in current) {
                val valid = synchronized(lock) { subscribers[id] === observer && socketReady && generation == target }
                if (valid) {
                    if (!webSocket.send(openFrame(id, observer.endpoint, observer.args))) {
                        webSocket.cancel()
                        return
                    }
                    observer.onOpen()
                }
            }
        }

        override fun onMessage(webSocket: WebSocket, text: String) {
            val frame = try { json.parseToJsonElement(text).jsonObject } catch (e: Exception) {
                disconnected(target, RemoteFailure("connection/invalid-frame", "Host 发送了无效流消息"))
                webSocket.cancel()
                return
            }
            val id = frame["streamId"]?.jsonPrimitive?.content ?: return
            val observer = synchronized(lock) { if (target == generation) subscribers[id] else null } ?: return
            when (frame["type"]?.jsonPrimitive?.content) {
                "item" -> observer.onItem(frame["value"] ?: JsonNull)
                "error" -> {
                    val error = frame["error"] as? JsonObject
                    synchronized(lock) { subscribers.remove(id) }
                    observer.onError(RemoteFailure(error?.get("code")?.jsonPrimitive?.content ?: "remote/stream",
                        error?.get("message")?.jsonPrimitive?.content ?: "数据流异常"))
                }
                "end" -> {
                    synchronized(lock) { subscribers.remove(id) }
                    observer.onError(RemoteFailure("connection/stream-ended", "数据流已结束"))
                }
                else -> {
                    synchronized(lock) { subscribers.remove(id) }
                    observer.onError(RemoteFailure("connection/unknown-frame", "未知 Remote 数据流帧"))
                }
            }
        }

        override fun onMessage(webSocket: WebSocket, bytes: ByteString) {
            disconnected(target, RemoteFailure("connection/binary-stream", "收到未协商的二进制数据流"))
            webSocket.cancel()
        }

        override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
            disconnected(target, t)
        }

        override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
            disconnected(target, RemoteFailure("connection/closed", "WebSocket 已关闭：" + code))
        }
    }

    /** 网络失败后必须重新交换 API Peer Cookie；旧 Peer 在 Host 端已被释放。 */
    private fun disconnected(target: Long, error: Throwable) {
        val current: List<StreamSubscription>
        val retryDelay: Long?
        synchronized(lock) {
            if (disposed || generation != target) return
            physicalSocket = null
            socketReady = false
            dialing = false
            authenticated = false
            failureCount += 1
            current = subscribers.values.toList()
            retryDelay = if (current.isNotEmpty() && failureCount <= 7) {
                (500L shl (failureCount - 1)).coerceAtMost(8_000L)
            } else null
        }
        current.forEach { it.onError(error) }
        if (retryDelay != null) scope.launch {
            delay(retryDelay)
            synchronized(lock) { if (generation == target) dialLocked() }
        }
    }

    override fun close() {
        synchronized(lock) {
            if (disposed) return
            disposed = true
            generation++
            subscribers.clear()
            physicalSocket?.close(1000, "client closing")
            physicalSocket = null
            socketReady = false
        }
        scope.cancel()
        cookies.clear()
        http.dispatcher.executorService.shutdown()
        http.connectionPool.evictAll()
    }
}
