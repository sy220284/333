package ai.deepseek.harness.mobile

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import ai.deepseek.harness.mobile.net.HarnessRemote
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.io.Closeable
import java.util.UUID

data class ChatLine(val seq: Long, val actor: String, val text: String)
data class SessionRow(val id: String, val running: Boolean, val blank: Boolean)
data class ModelRow(val provider: String, val model: String, val name: String)
data class UiState(
    val connecting: Boolean = false, val connected: Boolean = false,
    val connectionStatus: String = "未连接核心", val sessionId: String? = null,
    val sending: Boolean = false, val running: Boolean = false,
    val lines: List<ChatLine> = emptyList(), val sessions: List<SessionRow> = emptyList(),
    val models: List<ModelRow> = emptyList(), val error: String? = null
)

/**
 * Session UI 的单一状态来源。 durable 事件以 seq 去重，
 * 重连时用 Host snapshot 重建状态，不把瞬时 assistant-stream 当持久记录。
 */
class MainViewModel : ViewModel() {
    private val mutable = MutableStateFlow(UiState())
    val state = mutable.asStateFlow()
    private var remote: HarnessRemote? = null
    private var stream: Closeable? = null
    private var retryJob: Job? = null
    private var observedId: String? = null
    private var manualClose = false
    private val events = sortedMapOf<Long, ChatLine>()

    fun connect(link: String) {
        if (mutable.value.connecting) return
        mutable.value = mutable.value.copy(connecting = true, error = null, connectionStatus = "正在验证 Host 身份…")
        viewModelScope.launch {
            try {
                val connection = HarnessRemote.connectFromLink(link)
                val result = connection.call("session/list", buildJsonObject { put("request", buildJsonObject {}) }).jsonObject
                val sessions = result["items"]?.jsonArray?.mapNotNull { item ->
                    val obj = item as? JsonObject ?: return@mapNotNull null
                    val id = obj["sessionId"]?.jsonPrimitive?.content ?: return@mapNotNull null
                    SessionRow(id, obj["running"]?.jsonPrimitive?.content == "true",
                        obj["blank"]?.jsonPrimitive?.content == "true")
                } ?: emptyList()
                remote = connection
                manualClose = false
                mutable.value = mutable.value.copy(connecting = false, connected = true,
                    connectionStatus = "核心 API 已连接", sessions = sessions, error = null)
            } catch (e: Exception) {
                mutable.value = mutable.value.copy(connecting = false, connected = false,
                    connectionStatus = "连接失败", error = e.message ?: "未知连接错误")
            }
        }
    }

    fun startSession() = viewModelScope.launch {
        val connection = remote ?: return@launch
        try {
            val result = connection.call("session/create", buildJsonObject {
                put("request", buildJsonObject {})
            }).jsonObject
            val id = result["sessionId"]?.jsonPrimitive?.content
                ?: error("核心创建会话未返回 sessionId")
            activateSession(id)
        } catch (e: Exception) { showError(e) }
    }

    fun openSession(id: String) { if (id.isNotBlank()) activateSession(id) }

    private fun activateSession(id: String) {
        retryJob?.cancel()
        stream?.close()
        observedId = id
        events.clear()
        mutable.value = mutable.value.copy(sessionId = id, lines = emptyList(), error = null)
        subscribe(id)
    }

    private fun subscribe(id: String) {
        val connection = remote ?: return
        stream?.close()
        stream = connection.stream("session/follow", buildJsonObject {
            put("request", buildJsonObject {
                put("address", buildJsonObject {
                    put("kind", JsonPrimitive("session"))
                    put("sessionId", JsonPrimitive(id))
                })
                put("assistantStream", JsonPrimitive(true))
            })
        }, onItem = { frame ->
            viewModelScope.launch { ingest(frame) }
        }, onOpen = {
            mutable.value = mutable.value.copy(connectionStatus = "实时消息已连接", error = null)
        }, onError = { failure ->
            if (!manualClose && observedId == id) {
                mutable.value = mutable.value.copy(connectionStatus = "实时连接恢复中", error = failure.message)
                scheduleRecovery(id)
            }
        })
    }

    private fun scheduleRecovery(id: String) {
        if (retryJob?.isActive == true) return
        retryJob = viewModelScope.launch {
            delay(900)
            if (!manualClose && observedId == id && remote != null) subscribe(id)
        }
    }

    private fun ingest(frame: JsonElement) {
        val root = frame as? JsonObject ?: return
        when (root["type"]?.jsonPrimitive?.content) {
            "snapshot" -> {
                events.clear()
                val entries = root["records"] as? JsonArray ?: JsonArray(emptyList())
                entries.forEach { ingestEvent(it) }
                publish()
            }
            "event" -> { ingestEvent(root); publish() }
            "assistant-stream" -> {
                // 瞬时帧只用于正在生成的文本渲染。完整结果随后由 durable assistant/message 接管。
                mutable.value = mutable.value.copy(running = true)
            }
        }
    }

    private fun ingestEvent(element: JsonElement) {
        val wrapper = element as? JsonObject ?: return
        val event = wrapper["event"] as? JsonObject ?: return
        val type = event["type"]?.jsonPrimitive?.content ?: return
        val seq = event["seq"]?.jsonPrimitive?.longOrNull ?: return
        if (type == "turn/start") mutable.value = mutable.value.copy(running = true)
        if (type == "turn/end") mutable.value = mutable.value.copy(running = false)
        val data = event["data"] as? JsonObject ?: return
        val surface = event["surfaceOp"] as? JsonObject
        if (surface?.get("op")?.jsonPrimitive?.content == "replace") {
            val start = surface["startSeq"]?.jsonPrimitive?.longOrNull ?: return
            val end = surface["endSeq"]?.jsonPrimitive?.longOrNull ?: return
            events.keys.filter { it in start..end }.forEach { events.remove(it) }
        }
        val message = when (type) {
            "user/message" -> if ((data["source"] as? JsonObject)?.get("kind")?.jsonPrimitive?.content == "user")
                contentText(data["content"])?.let { ChatLine(seq, "user", it) } else null
            "assistant/message" -> contentText((data["message"] as? JsonObject)?.get("content"))
                ?.let { ChatLine(seq, "assistant", it) }
            else -> null
        }
        if (message != null) events[seq] = message
    }

    private fun contentText(element: JsonElement?): String? {
        val parts = element as? JsonArray ?: return null
        val text = parts.mapNotNull { part ->
            val block = part as? JsonObject ?: return@mapNotNull null
            if (block["type"]?.jsonPrimitive?.content == "text")
                block["text"]?.jsonPrimitive?.content else null
        }.joinToString("\n")
        return text.takeIf { it.isNotBlank() }
    }

    private fun publish() {
        mutable.value = mutable.value.copy(lines = events.values.toList())
    }

    fun send(text: String) = viewModelScope.launch {
        val clean = text.trim()
        if (clean.isEmpty() || mutable.value.sending) return@launch
        val connection = remote ?: return@launch
        mutable.value = mutable.value.copy(sending = true, error = null)
        try {
            var id = mutable.value.sessionId
            if (id == null) {
                val created = connection.call("session/create", buildJsonObject { put("request", buildJsonObject {}) }).jsonObject
                id = created["sessionId"]?.jsonPrimitive?.content ?: error("核心没有返回新会话 ID")
                activateSession(id)
            }
            connection.call("session/prompt", buildJsonObject {
                put("request", buildJsonObject {
                    put("requestId", JsonPrimitive(UUID.randomUUID().toString()))
                    put("sessionId", JsonPrimitive(id))
                    put("mode", JsonPrimitive("queue"))
                    put("content", JsonArray(listOf(buildJsonObject {
                        put("type", JsonPrimitive("text"))
                        put("text", JsonPrimitive(clean))
                    })))
                })
            })
            mutable.value = mutable.value.copy(sending = false)
        } catch (e: Exception) {
            mutable.value = mutable.value.copy(sending = false)
            showError(e)
        }
    }

    fun cancel() = viewModelScope.launch {
        val connection = remote ?: return@launch
        val id = mutable.value.sessionId ?: return@launch
        try {
            connection.call("session/cancel", buildJsonObject {
                put("request", buildJsonObject { put("sessionId", JsonPrimitive(id)) })
            })
        } catch (e: Exception) { showError(e) }
    }

    fun refreshModels() = viewModelScope.launch {
        val connection = remote ?: return@launch
        try {
            val data = connection.call("session/modelCatalog", buildJsonObject {}).jsonObject
            val models = data["groups"]?.jsonArray?.flatMap { group ->
                val obj = group as? JsonObject ?: return@flatMap emptyList()
                val provider = obj["id"]?.jsonPrimitive?.content ?: return@flatMap emptyList()
                obj["models"]?.jsonArray?.mapNotNull { entry ->
                    val m = entry as? JsonObject ?: return@mapNotNull null
                    val model = m["id"]?.jsonPrimitive?.content ?: return@mapNotNull null
                    ModelRow(provider, model, m["name"]?.jsonPrimitive?.content ?: model)
                } ?: emptyList()
            } ?: emptyList()
            mutable.value = mutable.value.copy(models = models)
        } catch (e: Exception) { showError(e) }
    }

    fun selectModel(provider: String, model: String) = viewModelScope.launch {
        val connection = remote ?: return@launch
        val id = mutable.value.sessionId ?: return@launch
        try {
            connection.call("session/selectModel", buildJsonObject {
                put("request", buildJsonObject {
                    put("sessionId", JsonPrimitive(id))
                    put("provider", JsonPrimitive(provider))
                    put("model", JsonPrimitive(model))
                })
            })
        } catch (e: Exception) { showError(e) }
    }

    fun clearError() { mutable.value = mutable.value.copy(error = null) }
    private fun showError(e: Throwable) {
        mutable.value = mutable.value.copy(error = e.message ?: "操作失败")
    }
    override fun onCleared() {
        manualClose = true
        retryJob?.cancel()
        stream?.close()
        super.onCleared()
    }
}
