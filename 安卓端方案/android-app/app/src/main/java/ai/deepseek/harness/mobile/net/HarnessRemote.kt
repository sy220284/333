package ai.deepseek.harness.mobile.net

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
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
import java.util.concurrent.atomic.AtomicBoolean

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
}

class HarnessRemote private constructor(private val root: HttpUrl, private val cookies: SessionCookies) {
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
            val gateway = HarnessRemote(root, SessionCookies())
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

    /**
     * /api/remote.mux 物理连接；一个物理连接承载一条逻辑流，
     * 逻辑 streamId 与可取消生命周期由本句柄独占。
     */
    fun stream(
        endpoint: String, args: JsonObject,
        onItem: (kotlinx.serialization.json.JsonElement) -> Unit,
        onOpen: () -> Unit = {},
        onError: (Throwable) -> Unit
    ): Closeable {
        require(Regex("^[A-Za-z0-9_$.-]+/[A-Za-z0-9_$.-]+$").matches(endpoint))
        val streamId = UUID.randomUUID().toString()
        val closed = AtomicBoolean(false)
        val wsUrl = root.newBuilder().addPathSegment("api").addPathSegment("remote.mux").build()
        val request = Request.Builder().url(wsUrl).build()
        val socket = http.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                val open = buildJsonObject {
                    put("type", JsonPrimitive("open"))
                    put("streamId", JsonPrimitive(streamId))
                    put("endpoint", JsonPrimitive(endpoint))
                    put("payload", buildJsonObject { put("args", args) })
                }
                if (!webSocket.send(open.toString())) onError(RemoteFailure("connection/stream", "无法打开实时数据流"))
                else onOpen()
            }
            override fun onMessage(webSocket: WebSocket, text: String) {
                try {
                    val frame = json.parseToJsonElement(text).jsonObject
                    if (frame["streamId"]?.jsonPrimitive?.content != streamId) return
                    when (frame["type"]?.jsonPrimitive?.content) {
                        "item" -> frame["value"]?.let(onItem)
                        "error" -> {
                            val error = frame["error"]?.jsonObject
                            onError(RemoteFailure(error?.get("code")?.jsonPrimitive?.content ?: "remote/stream",
                                error?.get("message")?.jsonPrimitive?.content ?: "数据流异常"))
                        }
                        "end" -> if (!closed.get()) onError(RemoteFailure("connection/ended", "实时数据流结束"))
                        else -> onError(RemoteFailure("connection/frame", "未知的数据流帧"))
                    }
                } catch (error: Exception) { onError(error) }
            }
            override fun onMessage(webSocket: WebSocket, bytes: ByteString) {
                onError(RemoteFailure("connection/binary-stream", "收到未协商的二进制数据帧"))
            }
            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                if (!closed.get()) onError(t)
            }
            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                if (!closed.get()) onError(RemoteFailure("connection/closed", "实时连接关闭（$code）"))
            }
        })
        return Closeable {
            if (closed.compareAndSet(false, true)) {
                socket.send(buildJsonObject {
                    put("type", JsonPrimitive("cancel"))
                    put("streamId", JsonPrimitive(streamId))
                }.toString())
                socket.close(1000, "client disposed")
            }
        }
    }
}
