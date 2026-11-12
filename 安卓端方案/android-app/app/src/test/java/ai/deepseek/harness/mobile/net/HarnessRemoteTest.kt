package ai.deepseek.harness.mobile.net

import java.util.Collections
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class HarnessRemoteTest {
    private val server = MockWebServer()

    @After fun tearDown() {
        server.shutdown()
    }

    @Test fun deniesPlaintextRemoteHost() {
        try {
            validateHostUrl("http://example.com:8090/".toHttpUrl())
            throw AssertionError("非本机 HTTP 应当被拒绝")
        } catch (expected: IllegalArgumentException) {
            assertTrue(expected.message.orEmpty().contains("HTTPS"))
        }
        validateHostUrl("http://127.0.0.1:8090/".toHttpUrl())
        validateHostUrl("https://example.com/".toHttpUrl())
    }

    @Test fun multiplexesThreeStreamsOverOneAuthenticatedSocket() = runBlocking {
        val socketCount = AtomicInteger(0)
        val opened = Collections.synchronizedSet(mutableSetOf<String>())
        val errors = Collections.synchronizedList(mutableListOf<Throwable>())
        val arrivals = CountDownLatch(3)
        val socketClosed = CountDownLatch(1)
        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse {
                return when {
                    request.path.orEmpty().startsWith("/connect?") -> MockResponse()
                        .setResponseCode(302)
                        .addHeader("Location", "./api/remote.mux")
                        .addHeader("Set-Cookie", "dsh-auth-fixture=fixture; Path=/; HttpOnly; Max-Age=120")
                    request.path == "/api/remote.mux" -> {
                        assertTrue(request.getHeader("Cookie").orEmpty().contains("dsh-auth-fixture"))
                        socketCount.incrementAndGet()
                        MockResponse().withWebSocketUpgrade(object : WebSocketListener() {
                            override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                                webSocket.close(code, reason)
                            }
                            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                                socketClosed.countDown()
                            }
                            override fun onMessage(webSocket: WebSocket, text: String) {
                                val msg = Json.parseToJsonElement(text).jsonObject
                                if (msg["type"]?.jsonPrimitive?.content == "open") {
                                    val id = msg["streamId"]!!.jsonPrimitive.content
                                    opened.add(msg["endpoint"]!!.jsonPrimitive.content)
                                    webSocket.send("""{"type":"item","streamId":""" + Json.encodeToString(
                                        kotlinx.serialization.serializer<String>(), id
                                    ) + ""","value":{"type":"ack"}}""")
                                }
                            }
                        })
                    }
                    else -> MockResponse().setResponseCode(404)
                }
            }
        }
        server.start()
        val remote = HarnessRemote.connectFromLink("http://127.0.0.1:" + server.port + "/?token=fixture")
        val streams = listOf("session/follow", "workspace/follow", "mcpManager/watch").map { endpoint ->
            remote.stream(endpoint, buildJsonObject {}, onItem = { arrivals.countDown() }, onError = { errors.add(it) })
        }
        try {
            assertTrue("三条逻辑流均应收到消息", arrivals.await(10, TimeUnit.SECONDS))
            assertEquals("API Peer 只允许一个物理 WebSocket", 1, socketCount.get())
            assertEquals(setOf("session/follow", "workspace/follow", "mcpManager/watch"), opened)
            assertFalse(errors.toString(), errors.isNotEmpty())
        } finally {
            streams.forEach { it.close() }
            remote.close()
            assertTrue("WebSocket close handshake must finish before server teardown",
                socketClosed.await(8, TimeUnit.SECONDS))
        }
    }
}
