package ai.deepseek.harness.mobile

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import ai.deepseek.harness.mobile.net.HarnessRemote
import ai.deepseek.harness.mobile.ui.ExecutableToolCommand
import ai.deepseek.harness.mobile.ui.approvalCommandsFromContent
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
data class SessionSearchRow(val id: String, val snippet: String)
data class ModelRow(val provider: String, val model: String, val name: String)
data class WorkspaceRow(val id: String, val title: String, val path: String, val sessionIds: List<String>)
data class JobRow(val id: String, val label: String, val status: String, val progress: String)
data class McpRow(val name: String, val status: String)
data class PluginRow(val name: String, val status: String)
data class ApprovalRow(
    val clientId: String, val eventId: String, val toolName: String,
    val reason: String, val callId: String? = null,
    val command: String? = null
)
data class QuestionChoice(val label: String, val description: String)
data class QuestionPrompt(val id: String, val question: String, val detail: String, val choices: List<QuestionChoice>, val multiSelect: Boolean)
data class PendingQuestion(val clientId: String, val eventId: String, val questions: List<QuestionPrompt>)
data class QuestionAnswer(val id: String, val selected: List<String>, val custom: String? = null)

/** 只在 session/prompt 收到 Host 成功回执后增加序号；用于安全清除输入草稿。 */
data class PromptReceipt(val serial: Long, val text: String)

/** 官方 workspaceFiles 返回的工作区相对路径；不推测本地 Android 文件路径。 */
data class WorkspaceFileEntry(val name: String, val type: String, val bytes: Long?)
data class WorkspaceFileMatch(val path: String, val type: String)

data class TerminalRow(
    val id: String,
    val title: String,
    val shell: String,
    val cwd: String,
    val state: String,
    val origin: String,
    val control: String,
    val exitCode: Int?
)

data class UiState(
    val connecting: Boolean = false, val connected: Boolean = false,
    val connectionStatus: String = "未连接核心", val sessionId: String? = null,
    val sending: Boolean = false, val running: Boolean = false,
    val lines: List<ChatLine> = emptyList(), val sessions: List<SessionRow> = emptyList(),
    val archivedSessionIds: List<String> = emptyList(),
    val pinnedSessionIds: List<String> = emptyList(),
    val sessionMatches: List<SessionSearchRow> = emptyList(),
    val sessionSearchQuery: String = "",
    val sessionSearching: Boolean = false,
    val sessionSearchHasMore: Boolean = false,
    val sessionSearchError: String? = null,
    val models: List<ModelRow> = emptyList(), val error: String? = null,
    val settingsNamespaces: List<String> = emptyList(),
    val settingsWritable: Boolean? = null,
    val settingsLoading: Boolean = false,
    val settingsError: String? = null,
    val terminals: List<TerminalRow> = emptyList(),
    val terminalLoading: Boolean = false,
    val terminalError: String? = null,
    val actionFeedbackSerial: Long = 0L,
    val actionFeedback: String? = null,
    val promptReceipt: PromptReceipt? = null,
    val activeModelKey: String? = null,
    val directoryPath: String = ".",
    val directoryEntries: List<WorkspaceFileEntry> = emptyList(),
    val directoryTruncated: Boolean = false,
    val directoryLoading: Boolean = false,
    val filePath: String? = null,
    val fileText: String = "",
    val filePageOffset: Int = 1,
    val filePageLines: Int = 0,
    val fileEof: Boolean = true,
    val fileLoading: Boolean = false,
    val fileMatches: List<WorkspaceFileMatch> = emptyList(),
    val fileSearchIncomplete: Boolean = false,
    val fileSearching: Boolean = false,
    val fileError: String? = null,
    val workspaces: List<WorkspaceRow> = emptyList(),
    val jobs: List<JobRow> = emptyList(),
    val mcpServers: List<McpRow> = emptyList(),
    val plugins: List<PluginRow> = emptyList(),
    val panelError: String? = null,
    val interactionReady: Boolean = false,
    val approvalSubmitting: Boolean = false,
    val approvals: List<ApprovalRow> = emptyList(),
    val questions: List<PendingQuestion> = emptyList(),
    val questionSubmitting: Boolean = false
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
    private var workspaceStream: Closeable? = null
    private var jobStream: Closeable? = null
    private var mcpStream: Closeable? = null
    private var eventsStream: Closeable? = null
    private var eventClientId: String? = null
    private var retryJob: Job? = null
    private var observedId: String? = null
    private var manualClose = false
    private val events = sortedMapOf<Long, ChatLine>()
    private val commandsBySequence = sortedMapOf<Long, List<ExecutableToolCommand>>()
    private var acceptedPromptSerial = 0L
    private var feedbackSerial = 0L
    private var directoryGeneration = 0L
    private var fileGeneration = 0L
    private var searchGeneration = 0L
    private var sessionSearchGeneration = 0L

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
                remote?.close()
                remote = connection
                manualClose = false
                sessionSearchGeneration += 1
                mutable.value = mutable.value.copy(connecting = false, connected = true,
                    connectionStatus = "核心 API 已连接", sessions = sessions,
                    sessionMatches = emptyList(), sessionSearchQuery = "",
                    sessionSearching = false, sessionSearchError = null,
                    archivedSessionIds = emptyList(), pinnedSessionIds = emptyList(),
                    error = null)
                observeRemoteEvents()
                observeWorkspaces()
                observeMcpServers()
                refreshBundles()
            } catch (e: Exception) {
                mutable.value = mutable.value.copy(connecting = false, connected = false,
                    connectionStatus = "连接失败", error = e.message ?: "未知连接错误")
            }
        }
    }

    /** 从 Host 重新获取会话快照，绝不把本地缓存当成服务端事实。 */
    fun refreshSessions() = viewModelScope.launch {
        val connection = remote ?: return@launch
        try {
            val result = connection.call("session/list", buildJsonObject {
                put("request", buildJsonObject {})
            }).jsonObject
            val items = result["items"]?.jsonArray?.mapNotNull { raw ->
                val item = raw as? JsonObject ?: return@mapNotNull null
                val id = item["sessionId"]?.jsonPrimitive?.content ?: return@mapNotNull null
                SessionRow(id,
                    item["running"]?.jsonPrimitive?.content == "true",
                    item["blank"]?.jsonPrimitive?.content == "true")
            } ?: error("核心未返回有效会话目录")
            if (remote === connection) {
                mutable.value = mutable.value.copy(sessions = items, panelError = null)
            }
        } catch (e: Exception) {
            mutable.value = mutable.value.copy(panelError = "会话列表刷新失败：" +
                (e.message ?: "未知错误"))
        }
    }

    /** 使用 Host 的全文历史搜索，结果携带真实会话编号与消息摘要。 */
    fun searchSessions(query: String) = viewModelScope.launch {
        val term = query.trim()
        val connection = remote ?: return@launch
        val generation = ++sessionSearchGeneration
        if (term.isBlank()) {
            mutable.value = mutable.value.copy(sessionMatches = emptyList(),
                sessionSearchQuery = "", sessionSearchHasMore = false,
                sessionSearching = false, sessionSearchError = null)
            return@launch
        }
        mutable.value = mutable.value.copy(sessionMatches = emptyList(),
            sessionSearchQuery = term, sessionSearchHasMore = false,
            sessionSearching = true, sessionSearchError = null)
        try {
            val result = connection.call("session/search", buildJsonObject {
                put("request", buildJsonObject { put("query", JsonPrimitive(term)) })
            }).jsonObject
            val rows = (result["items"] as? JsonArray)?.map { raw ->
                val item = raw as? JsonObject ?: error("会话搜索记录格式无效")
                SessionSearchRow(
                    id = item["sessionId"]?.jsonPrimitive?.content
                        ?: error("会话搜索结果缺少ID"),
                    snippet = item["snippet"]?.jsonPrimitive?.content
                        ?: error("会话搜索结果缺少内容摘要")
                )
            } ?: error("核心未返回会话搜索结果")
            if (connection === remote && generation == sessionSearchGeneration) {
                mutable.value = mutable.value.copy(sessionMatches = rows,
                    sessionSearchHasMore = result["hasMore"]?.jsonPrimitive?.content == "true",
                    sessionSearching = false, sessionSearchError = null)
            }
        } catch (e: Exception) {
            if (connection === remote && generation == sessionSearchGeneration) {
                mutable.value = mutable.value.copy(sessionSearching = false,
                    sessionSearchError = "搜索失败：" + (e.message ?: "未知错误"))
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
        commandsBySequence.clear()
        directoryGeneration += 1
        fileGeneration += 1
        searchGeneration += 1
        mutable.value = mutable.value.copy(sessionId = id, lines = emptyList(),
            running = false, jobs = emptyList(), activeModelKey = null,
            directoryPath = ".", directoryEntries = emptyList(), directoryTruncated = false,
            filePath = null, fileText = "", fileMatches = emptyList(),
            terminals = emptyList(), terminalLoading = false, terminalError = null,
            fileLoading = false, directoryLoading = false, fileSearching = false,
            fileError = null, error = null)
        subscribe(id)
        observeJobs()
        refreshSessions()
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
                commandsBySequence.clear()
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
            commandsBySequence.keys.filter { it in start..end }.forEach { commandsBySequence.remove(it) }
        }
        if (type == "assistant/message") {
            val content = (data["message"] as? JsonObject)?.get("content")
            val commands = approvalCommandsFromContent(content)
            if (commands.isNotEmpty()) commandsBySequence[seq] = commands
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

    private fun commandForApproval(callId: String?): String? {
        if (callId == null) return null
        return commandsBySequence.values.asSequence().flatMap { it.asSequence() }
            .firstOrNull { it.callId == callId }?.command
    }

    private fun publish() {
        mutable.value = mutable.value.copy(
            lines = events.values.toList(),
            approvals = mutable.value.approvals.map { row ->
                row.copy(command = commandForApproval(row.callId))
            }
        )
    }

    fun send(text: String) = viewModelScope.launch {
        val clean = text.trim()
        if (clean.isEmpty() || mutable.value.sending) return@launch
        if (!mutable.value.interactionReady) {
            showError(IllegalStateException("授权通道仍在连接，确认安全后再发送"))
            return@launch
        }
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
            acceptedPromptSerial += 1
            mutable.value = mutable.value.copy(sending = false,
                promptReceipt = PromptReceipt(acceptedPromptSerial, clean))
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

    /** settings/describe 是官方只读、脱敏的配置视图。只展示命名空间和可写状态。 */
    fun refreshSettingsSummary() = viewModelScope.launch {
        val connection = remote ?: return@launch
        mutable.value = mutable.value.copy(settingsLoading = true, settingsError = null)
        try {
            val result = connection.call("settings/describe", buildJsonObject {}).jsonObject
            val list = (result["namespaces"] as? JsonArray)?.map { raw ->
                val item = raw as? JsonObject ?: error("核心设置目录包含无效条目")
                item["ns"]?.jsonPrimitive?.content ?: error("设置条目缺少命名空间")
            } ?: error("核心未返回设置目录")
            if (remote === connection) {
                mutable.value = mutable.value.copy(
                    settingsLoading = false,
                    settingsNamespaces = list,
                    settingsWritable = when (result["writable"]?.jsonPrimitive?.content) {
                        "true" -> true
                        "false" -> false
                        else -> error("核心未返回设置写入能力")
                    }
                )
            }
        } catch (error: Exception) {
            if (remote === connection) {
                mutable.value = mutable.value.copy(settingsLoading = false,
                    settingsError = "设置目录读取失败：" + (error.message ?: "未知错误"))
            }
        }
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
            if (mutable.value.sessionId == id) {
                mutable.value = mutable.value.copy(activeModelKey = "$provider/$model")
            }
        } catch (e: Exception) { showError(e) }
    }



    /** Host waterfall 只有经过明确用户确认才会返回 allowed-once。 */
    private fun observeRemoteEvents() {
        val connection = remote ?: return
        eventsStream?.close()
        eventClientId = null
        mutable.value = mutable.value.copy(interactionReady = false, approvals = emptyList(), questions = emptyList())
        eventsStream = connection.stream("\$events", buildJsonObject {}, onItem = { frame ->
            viewModelScope.launch {
                val item = frame as? JsonObject ?: return@launch
                when (item["type"]?.jsonPrimitive?.content) {
                    "ready" -> {
                        eventClientId = item["clientId"]?.jsonPrimitive?.content
                        mutable.value = mutable.value.copy(
                            interactionReady = eventClientId != null, approvals = emptyList(), approvalSubmitting = false,
                            questions = emptyList(), questionSubmitting = false
                        )
                    }
                    "waterfall" -> {
                        val clientId = eventClientId ?: return@launch
                        val eventId = item["eventId"]?.jsonPrimitive?.content ?: return@launch
                        val event = item["event"]?.jsonPrimitive?.content ?: return@launch
                        if (event == "approval/request") {
                            val request = item["request"] as? JsonObject ?: return@launch
                            val name = request["toolName"]?.jsonPrimitive?.content ?: "工具操作"
                            val reason = request["reason"]?.jsonPrimitive?.content ?: "核心请求执行此操作"
                            val id = request["callId"]?.jsonPrimitive?.content
                            val pending = ApprovalRow(clientId, eventId, name, reason,
                                id, commandForApproval(id))
                            mutable.value = mutable.value.copy(approvals = mutable.value.approvals + pending)
                        } else if (event == "user-questions/request") {
                            val request = item["request"] as? JsonObject ?: return@launch
                            val raw = request["questions"] as? JsonArray ?: return@launch
                            val questions = raw.mapNotNull { entry ->
                                val value = entry as? JsonObject ?: return@mapNotNull null
                                val id = value["id"]?.jsonPrimitive?.content?.takeIf(String::isNotBlank)
                                    ?: return@mapNotNull null
                                val question = value["question"]?.jsonPrimitive?.content
                                    ?: return@mapNotNull null
                                val choices = (value["options"] as? JsonArray)?.mapNotNull { option ->
                                    val obj = option as? JsonObject ?: return@mapNotNull null
                                    val label = obj["label"]?.jsonPrimitive?.content ?: return@mapNotNull null
                                    QuestionChoice(label, obj["description"]?.jsonPrimitive?.content.orEmpty())
                                } ?: emptyList()
                                QuestionPrompt(id, question, value["detail"]?.jsonPrimitive?.content.orEmpty(),
                                    choices, value["multiSelect"]?.jsonPrimitive?.content == "true")
                            }
                            if (questions.size != raw.size || questions.isEmpty()) {
                                showError(IllegalArgumentException("核心返回了无法展示的用户问题"))
                            } else {
                                mutable.value = mutable.value.copy(questions = mutable.value.questions +
                                    PendingQuestion(clientId, eventId, questions))
                            }
                        } else {
                            try {
                                respondToWaterfall(clientId, eventId, buildJsonObject {
                                    put("kind", JsonPrimitive("next"))
                                })
                            } catch (error: Exception) { showError(error) }
                        }
                    }
                    "cancel" -> {
                        val eventId = item["eventId"]?.jsonPrimitive?.content ?: return@launch
                        mutable.value = mutable.value.copy(
                            approvals = mutable.value.approvals.filterNot { it.eventId == eventId },
                            questions = mutable.value.questions.filterNot { it.eventId == eventId },
                            approvalSubmitting = false, questionSubmitting = false
                        )
                    }
                }
            }
        }, onError = { failure ->
            viewModelScope.launch {
                eventClientId = null
                mutable.value = mutable.value.copy(
                    interactionReady = false, approvals = emptyList(), approvalSubmitting = false,
                    questions = emptyList(), questionSubmitting = false,
                    panelError = "审批连接中断：" + (failure.message ?: "未知错误")
                )
            }
        })
    }

    private suspend fun respondToWaterfall(clientId: String, eventId: String, outcome: JsonObject) {
        val connection = remote ?: return
        connection.call("\$events/result", buildJsonObject {
            put("clientId", JsonPrimitive(clientId))
            put("eventId", JsonPrimitive(eventId))
            put("outcome", outcome)
        })
    }

    fun decideApproval(eventId: String, allowed: Boolean) {
        if (mutable.value.approvalSubmitting) return
        val current = mutable.value.approvals.find { it.eventId == eventId } ?: return
        if (current.clientId != eventClientId) return
        mutable.value = mutable.value.copy(approvalSubmitting = true)
        viewModelScope.launch {
            try {
                respondToWaterfall(current.clientId, current.eventId, buildJsonObject {
                    put("kind", JsonPrimitive("result"))
                    put("value", JsonPrimitive(if (allowed) "allowed-once" else "rejected"))
                })
                mutable.value = mutable.value.copy(
                    approvals = mutable.value.approvals.filterNot { it.eventId == eventId },
                    approvalSubmitting = false
                )
                reportActionFeedback(if (allowed) "已授权本次操作" else "已拒绝这次操作")
            } catch (e: Exception) {
                mutable.value = mutable.value.copy(approvalSubmitting = false)
                showError(e)
            }
        }
    }

    /** 仅对当前仍有效的 user-questions/request 发结构化回答，保留 Host 的取消生命周期。 */
    fun answerQuestions(eventId: String, answers: List<QuestionAnswer>) {
        if (mutable.value.questionSubmitting) return
        val pending = mutable.value.questions.firstOrNull { it.eventId == eventId } ?: return
        if (pending.clientId != eventClientId) return
        if (pending.questions.size != answers.size || pending.questions.any { prompt ->
                answers.count { it.id == prompt.id && (it.selected.isNotEmpty() || !it.custom.isNullOrBlank()) } != 1
            }) {
            showError(IllegalArgumentException("请完成全部问题后提交"))
            return
        }
        mutable.value = mutable.value.copy(questionSubmitting = true)
        viewModelScope.launch {
            try {
                val payload = JsonArray(answers.map { answer ->
                    buildJsonObject {
                        put("id", JsonPrimitive(answer.id))
                        put("selected", JsonArray(answer.selected.map { JsonPrimitive(it) }))
                        answer.custom?.takeIf(String::isNotBlank)?.let { put("custom", JsonPrimitive(it)) }
                    }
                })
                respondToWaterfall(pending.clientId, pending.eventId, buildJsonObject {
                    put("kind", JsonPrimitive("result"))
                    put("value", buildJsonObject { put("answers", payload) })
                })
                mutable.value = mutable.value.copy(questionSubmitting = false,
                    questions = mutable.value.questions.filterNot { it.eventId == eventId })
                reportActionFeedback("已向核心提交问题回答")
            } catch (error: Exception) {
                mutable.value = mutable.value.copy(questionSubmitting = false)
                showError(error)
            }
        }
    }

    /** 主动取消未作答问题，向 Host 返回真实拒绝结果，不向模型制造空答案。 */
    fun cancelQuestion(eventId: String) {
        if (mutable.value.questionSubmitting) return
        val pending = mutable.value.questions.firstOrNull { it.eventId == eventId } ?: return
        if (pending.clientId != eventClientId) return
        mutable.value = mutable.value.copy(questionSubmitting = true)
        viewModelScope.launch {
            try {
                respondToWaterfall(pending.clientId, pending.eventId, buildJsonObject {
                    put("kind", JsonPrimitive("rejected"))
                    put("error", buildJsonObject {
                        put("name", JsonPrimitive("UserQuestionError"))
                        put("message", JsonPrimitive("用户取消了问题回答"))
                        put("code", JsonPrimitive("ASK_CANCELLED"))
                    })
                })
                mutable.value = mutable.value.copy(questionSubmitting = false,
                    questions = mutable.value.questions.filterNot { it.eventId == eventId })
                reportActionFeedback("已取消问题回答")
            } catch (error: Exception) {
                mutable.value = mutable.value.copy(questionSubmitting = false)
                showError(error)
            }
        }
    }

    /**
     * 与官方 workspace/follow 的 baseline/replace/upsert/remove/order 流保持同步。
     * 每次重连由 Host 重新发送完整 baseline，因此不保留旧连接的推测数据。
     */
    fun observeWorkspaces() {
        val connection = remote ?: return
        workspaceStream?.close()
        val workspaceMap = linkedMapOf<String, WorkspaceRow>()
        workspaceStream = connection.stream("workspace/follow", buildJsonObject {}, onItem = { frame ->
            viewModelScope.launch {
                val objectFrame = frame as? JsonObject ?: return@launch
                val type = objectFrame["type"]?.jsonPrimitive?.content
                when (type) {
                    "baseline", "replace" -> {
                        workspaceMap.clear()
                        val value = objectFrame["value"] as? JsonObject ?: return@launch
                        val items = value["items"] as? JsonArray ?: return@launch
                        for (item in items) parseWorkspace(item)?.let { workspaceMap[it.id] = it }
                        val archived = (value["archivedSessionIds"] as? JsonArray)
                            ?.map { it.jsonPrimitive.content } ?: error("项目状态缺少归档目录")
                        val pinned = (value["pinnedSessionIds"] as? JsonArray)
                            ?.map { it.jsonPrimitive.content } ?: error("项目状态缺少置顶目录")
                        mutable.value = mutable.value.copy(archivedSessionIds = archived,
                            pinnedSessionIds = pinned)
                    }
                    "archived" -> {
                        val ids = (objectFrame["archivedSessionIds"] as? JsonArray)
                            ?.map { it.jsonPrimitive.content } ?: return@launch
                        mutable.value = mutable.value.copy(archivedSessionIds = ids)
                    }
                    "pinned" -> {
                        val ids = (objectFrame["pinnedSessionIds"] as? JsonArray)
                            ?.map { it.jsonPrimitive.content } ?: return@launch
                        mutable.value = mutable.value.copy(pinnedSessionIds = ids)
                    }
                    "upsert" -> parseWorkspace(objectFrame["workspace"])?.let { workspaceMap[it.id] = it }
                    "remove" -> objectFrame["workspaceId"]?.jsonPrimitive?.content?.let(workspaceMap::remove)
                    "order" -> {
                        val ids = (objectFrame["workspaceIds"] as? JsonArray)
                            ?.mapNotNull { it.jsonPrimitive.content } ?: return@launch
                        val ordered = linkedMapOf<String, WorkspaceRow>()
                        for (id in ids) workspaceMap[id]?.let { ordered[id] = it }
                        workspaceMap.clear()
                        workspaceMap.putAll(ordered)
                    }
                }
                mutable.value = mutable.value.copy(workspaces = workspaceMap.values.toList(), panelError = null)
            }
        }, onError = { e ->
            viewModelScope.launch { mutable.value = mutable.value.copy(panelError = "项目状态订阅失败：" + (e.message ?: "未知错误")) }
        })
    }

    private fun parseWorkspace(value: JsonElement?): WorkspaceRow? {
        val item = value as? JsonObject ?: return null
        val id = item["workspaceId"]?.jsonPrimitive?.content ?: return null
        val title = item["title"]?.jsonPrimitive?.content ?: id
        val path = item["path"]?.jsonPrimitive?.content ?: ""
        val sessions = (item["sessionIds"] as? JsonArray)?.map { it.jsonPrimitive.content } ?: emptyList()
        return WorkspaceRow(id, title, path, sessions)
    }

    /** Host terminal/list 读取已保留的终端，不重新激活 Agent 或启动新 shell。 */
    fun refreshTerminals() = viewModelScope.launch {
        val connection = remote ?: return@launch
        val sessionId = mutable.value.sessionId ?: run {
            mutable.value = mutable.value.copy(
                terminalError = "请选择会话后查看终端", terminals = emptyList()
            )
            return@launch
        }
        mutable.value = mutable.value.copy(terminalLoading = true, terminalError = null)
        try {
            val response = connection.call("terminal/list", buildJsonObject {
                put("sessionId", JsonPrimitive(sessionId))
            }) as? JsonArray ?: error("核心没有返回终端列表")
            val items = response.map { raw ->
                val item = raw as? JsonObject ?: error("无效终端记录")
                val shell = item["shell"] as? JsonObject
                TerminalRow(
                    id = item["id"]?.jsonPrimitive?.content ?: error("终端缺少ID"),
                    title = item["title"]?.jsonPrimitive?.content ?: "终端",
                    shell = shell?.get("name")?.jsonPrimitive?.content ?: "未知 Shell",
                    cwd = item["cwd"]?.jsonPrimitive?.content ?: "",
                    state = item["state"]?.jsonPrimitive?.content ?: "unknown",
                    origin = item["origin"]?.jsonPrimitive?.content ?: "unknown",
                    control = item["control"]?.jsonPrimitive?.content ?: "unknown",
                    exitCode = item["exitCode"]?.jsonPrimitive?.content?.toIntOrNull()
                )
            }
            if (remote === connection && mutable.value.sessionId == sessionId) {
                mutable.value = mutable.value.copy(
                    terminals = items, terminalLoading = false, terminalError = null
                )
            }
        } catch (error: Exception) {
            if (remote === connection && mutable.value.sessionId == sessionId) {
                mutable.value = mutable.value.copy(terminalLoading = false,
                    terminalError = "终端清单读取失败：" + (error.message ?: "未知错误"))
            }
        }
    }

    fun observeJobs() {
        val connection = remote ?: return
        val sessionId = mutable.value.sessionId ?: run {
            mutable.value = mutable.value.copy(jobs = emptyList())
            return
        }
        jobStream?.close()
        jobStream = connection.stream("job/list", buildJsonObject {
            put("request", buildJsonObject { put("sessionId", JsonPrimitive(sessionId)) })
        }, onItem = { frame ->
            viewModelScope.launch {
                val obj = frame as? JsonObject ?: return@launch
                if (obj["type"]?.jsonPrimitive?.content != "rows") return@launch
                val items = (obj["jobs"] as? JsonArray)?.mapNotNull { raw ->
                    val row = raw as? JsonObject ?: return@mapNotNull null
                    val id = row["id"]?.jsonPrimitive?.content ?: return@mapNotNull null
                    JobRow(id, row["label"]?.jsonPrimitive?.content ?: id,
                        row["status"]?.jsonPrimitive?.content ?: "unknown",
                        row["progress"]?.jsonPrimitive?.content ?: "")
                } ?: return@launch
                if (mutable.value.sessionId == sessionId) mutable.value = mutable.value.copy(jobs = items, panelError = null)
            }
        }, onError = { e ->
            viewModelScope.launch { mutable.value = mutable.value.copy(panelError = "后台任务订阅失败：" + (e.message ?: "未知错误")) }
        })
    }

    fun observeMcpServers() {
        val connection = remote ?: return
        mcpStream?.close()
        mcpStream = connection.stream("mcpManager/watch", buildJsonObject {}, onItem = { frame ->
            viewModelScope.launch {
                val rows = (frame as? JsonArray)?.mapNotNull { raw ->
                    val item = raw as? JsonObject ?: return@mapNotNull null
                    val name = item["name"]?.jsonPrimitive?.content ?: return@mapNotNull null
                    val status = (item["status"] as? JsonObject)?.get("state")?.jsonPrimitive?.content ?: "unknown"
                    McpRow(name, status)
                } ?: return@launch
                mutable.value = mutable.value.copy(mcpServers = rows, panelError = null)
            }
        }, onError = { e ->
            viewModelScope.launch { mutable.value = mutable.value.copy(panelError = "MCP 连接状态失败：" + (e.message ?: "未知错误")) }
        })
    }

    /**
     * 真正调用官方 workspaceFiles Remote。
     * lookup 的 wire 参数为 workspaceFileScopeId（见 workspace-files/scope.spec.ts）。
     */
    fun listWorkspaceFiles(path: String = ".") = viewModelScope.launch {
        val connection = remote ?: return@launch
        val sessionId = mutable.value.sessionId ?: run {
            mutable.value = mutable.value.copy(fileError = "请先选择项目会话")
            return@launch
        }
        val generation = ++directoryGeneration
        mutable.value = mutable.value.copy(directoryLoading = true, fileError = null)
        try {
            val result = connection.call("workspaceFiles/list", buildJsonObject {
                put("workspaceFileScopeId", JsonPrimitive(sessionId))
                put("path", JsonPrimitive(path))
            }).jsonObject
            val items = (result["entries"] as? JsonArray)?.map { raw ->
                val file = raw as? JsonObject ?: error("Host 返回了无效目录条目")
                WorkspaceFileEntry(
                    name = file["name"]?.jsonPrimitive?.content ?: error("文件条目缺少名称"),
                    type = file["type"]?.jsonPrimitive?.content ?: error("文件条目缺少类型"),
                    bytes = file["size"]?.jsonPrimitive?.longOrNull
                )
            } ?: error("Host 未返回目录条目")
            if (sessionId == mutable.value.sessionId && generation == directoryGeneration) {
                val actualPath = result["path"]?.jsonPrimitive?.content.orEmpty()
                mutable.value = mutable.value.copy(
                    directoryPath = if (actualPath.isBlank()) "." else actualPath,
                    directoryEntries = items, directoryLoading = false,
                    directoryTruncated = result["truncated"]?.jsonPrimitive?.content == "true",
                    fileError = null
                )
            }
        } catch (error: Exception) {
            if (generation == directoryGeneration) mutable.value = mutable.value.copy(
                directoryLoading = false, fileError = "目录读取失败：" + (error.message ?: "未知错误"))
        }
    }

    fun readWorkspaceFile(path: String, offset: Int = 1) = viewModelScope.launch {
        require(path.isNotBlank() && offset > 0)
        val connection = remote ?: return@launch
        val sessionId = mutable.value.sessionId ?: return@launch
        val generation = ++fileGeneration
        mutable.value = mutable.value.copy(filePath = path, filePageOffset = offset,
            fileLoading = true, fileError = null, fileText = "")
        try {
            val result = connection.call("workspaceFiles/read", buildJsonObject {
                put("workspaceFileScopeId", JsonPrimitive(sessionId))
                put("path", JsonPrimitive(path))
                put("range", buildJsonObject {
                    put("offset", JsonPrimitive(offset))
                    put("limit", JsonPrimitive(100))
                })
            }).jsonObject
            if (sessionId == mutable.value.sessionId && generation == fileGeneration) {
                mutable.value = mutable.value.copy(filePath = path,
                    fileText = result["text"]?.jsonPrimitive?.content ?: error("Host 未返回文本页"),
                    filePageLines = result["lines"]?.jsonPrimitive?.content?.toIntOrNull()
                        ?: error("Host 未返回有效行数"),
                    fileEof = result["eof"]?.jsonPrimitive?.content == "true",
                    fileLoading = false, fileError = null)
            }
        } catch (error: Exception) {
            if (generation == fileGeneration) mutable.value = mutable.value.copy(
                fileLoading = false, fileError = "预览失败：" + (error.message ?: "未知错误"))
        }
    }

    fun searchWorkspaceFiles(query: String) = viewModelScope.launch {
        val term = query.trim()
        if (term.isBlank()) {
            mutable.value = mutable.value.copy(fileMatches = emptyList(), fileSearchIncomplete = false)
            return@launch
        }
        val connection = remote ?: return@launch
        val sessionId = mutable.value.sessionId ?: return@launch
        val generation = ++searchGeneration
        mutable.value = mutable.value.copy(fileSearching = true, fileError = null)
        try {
            val result = connection.call("workspaceFiles/search", buildJsonObject {
                put("workspaceFileScopeId", JsonPrimitive(sessionId))
                put("request", buildJsonObject {
                    put("query", JsonPrimitive(term))
                    put("excludedPaths", JsonArray(emptyList()))
                    put("includeHidden", JsonPrimitive(false))
                    put("respectGitignore", JsonPrimitive(true))
                })
            }).jsonObject
            val matches = (result["matches"] as? JsonArray)?.map { raw ->
                val item = raw as? JsonObject ?: error("Host 文件搜索返回无效结果")
                WorkspaceFileMatch(
                    item["path"]?.jsonPrimitive?.content ?: error("搜索结果缺少路径"),
                    item["type"]?.jsonPrimitive?.content ?: error("搜索结果缺少类型"))
            } ?: error("Host 未返回文件搜索结果")
            if (sessionId == mutable.value.sessionId && generation == searchGeneration) {
                mutable.value = mutable.value.copy(
                    fileMatches = matches, fileSearching = false, fileError = null,
                    fileSearchIncomplete =
                        result["truncated"]?.jsonPrimitive?.content == "true" ||
                        result["incomplete"]?.jsonPrimitive?.content == "true"
                )
            }
        } catch (error: Exception) {
            if (generation == searchGeneration) mutable.value = mutable.value.copy(
                fileSearching = false, fileError = "文件搜索失败：" + (error.message ?: "未知错误"))
        }
    }

    fun refreshBundles() = viewModelScope.launch {
        val connection = remote ?: return@launch
        try {
            val bundles = connection.call("pluginManager/listBundles", buildJsonObject {}) as? JsonArray
                ?: throw IllegalStateException("插件清单未返回数组")
            val items = bundles.mapNotNull { raw ->
                val item = raw as? JsonObject ?: return@mapNotNull null
                val name = item["name"]?.jsonPrimitive?.content ?: return@mapNotNull null
                PluginRow(name, item["version"]?.jsonPrimitive?.content ?: "可用")
            }
            mutable.value = mutable.value.copy(plugins = items, panelError = null)
        } catch (e: Exception) { mutable.value = mutable.value.copy(panelError = "插件清单失败：" + (e.message ?: "未知错误")) }
    }

    /** 创建与管理 Host 登记的工作区；以 RPC 成功回执和 workspace/follow 作为事实来源。 */
    fun initializeDefaultWorkspace() = viewModelScope.launch {
        val connection = remote ?: return@launch
        try {
            val result = connection.call("workspace/initializeDefault", buildJsonObject {})
            if (result is JsonObject && result["workspace"] is JsonObject) {
                reportActionFeedback("已检查并初始化默认项目")
            } else {
                reportActionFeedback("当前核心未提供可初始化的默认项目目录")
            }
            observeWorkspaces()
        } catch (e: Exception) { showError(e) }
    }

    fun createWorkspace(path: String) = viewModelScope.launch {
        val directory = path.trim()
        if (directory.isBlank()) {
            showError(IllegalArgumentException("请输入核心可以访问的项目文件夹路径"))
            return@launch
        }
        val connection = remote ?: return@launch
        try {
            val result = connection.call("workspace/create", buildJsonObject {
                put("request", buildJsonObject { put("path", JsonPrimitive(directory)) })
            }).jsonObject
            val workspace = result["workspace"] as? JsonObject ?: error("核心未返回项目对象")
            val title = workspace["title"]?.jsonPrimitive?.content ?: error("核心未返回项目名称")
            reportActionFeedback(if (result["created"]?.jsonPrimitive?.content == "true")
                "已创建项目：$title" else "项目已存在：$title")
            observeWorkspaces()
        } catch (e: Exception) { showError(e) }
    }

    fun renameWorkspace(workspaceId: String, title: String) = viewModelScope.launch {
        val name = title.trim()
        if (name.isBlank()) {
            showError(IllegalArgumentException("项目名称不能为空"))
            return@launch
        }
        val connection = remote ?: return@launch
        try {
            val result = connection.call("workspace/rename", buildJsonObject {
                put("request", buildJsonObject {
                    put("workspaceId", JsonPrimitive(workspaceId))
                    put("title", JsonPrimitive(name))
                })
            }).jsonObject
            check(result["workspace"] is JsonObject) { "核心未确认项目重命名" }
            reportActionFeedback("项目已重命名：$name")
            observeWorkspaces()
        } catch (e: Exception) { showError(e) }
    }

    fun deleteWorkspace(workspaceId: String) = viewModelScope.launch {
        val connection = remote ?: return@launch
        try {
            val result = connection.call("workspace/delete", buildJsonObject {
                put("request", buildJsonObject { put("workspaceId", JsonPrimitive(workspaceId)) })
            }).jsonObject
            check(result["deleted"]?.jsonPrimitive?.content == "true") {
                "核心未确认删除项目登记"
            }
            reportActionFeedback("已移除项目登记，原有文件和会话仍保留")
            observeWorkspaces()
        } catch (e: Exception) { showError(e) }
    }

    /** 会话归档只更新列表归属；运行中的会话交由用户先行结束。 */
    fun archiveSession(sessionId: String) = viewModelScope.launch {
        val connection = remote ?: return@launch
        try {
            val result = connection.call("workspace/archiveSession", buildJsonObject {
                put("request", buildJsonObject { put("sessionId", JsonPrimitive(sessionId)) })
            }).jsonObject
            check((result["archivedSessionIds"] as? JsonArray)?.any {
                it.jsonPrimitive.content == sessionId
            } == true) { "核心未确认会话归档" }
            reportActionFeedback("会话已归档")
        } catch (e: Exception) { showError(e) }
    }

    fun unarchiveSession(sessionId: String) = viewModelScope.launch {
        val connection = remote ?: return@launch
        try {
            val result = connection.call("workspace/unarchiveSession", buildJsonObject {
                put("request", buildJsonObject { put("sessionId", JsonPrimitive(sessionId)) })
            }).jsonObject
            check((result["archivedSessionIds"] as? JsonArray)?.none {
                it.jsonPrimitive.content == sessionId
            } == true) { "核心未确认会话恢复" }
            reportActionFeedback("会话已恢复")
        } catch (e: Exception) { showError(e) }
    }

    fun setSessionPinned(sessionId: String, pinned: Boolean) = viewModelScope.launch {
        val connection = remote ?: return@launch
        val endpoint = if (pinned) "workspace/pinSession" else "workspace/unpinSession"
        try {
            val result = connection.call(endpoint, buildJsonObject {
                put("request", buildJsonObject { put("sessionId", JsonPrimitive(sessionId)) })
            }).jsonObject
            val ids = (result["pinnedSessionIds"] as? JsonArray)
                ?.map { it.jsonPrimitive.content } ?: error("核心未返回置顶结果")
            check((sessionId in ids) == pinned) { "核心未确认会话置顶状态" }
            reportActionFeedback(if (pinned) "会话已置顶" else "会话已取消置顶")
        } catch (e: Exception) { showError(e) }
    }

    fun startWorkspaceSession(workspaceId: String) = viewModelScope.launch {
        val connection = remote ?: return@launch
        try {
            val value = connection.call("session/create", buildJsonObject {
                put("request", buildJsonObject { put("workspaceId", JsonPrimitive(workspaceId)) })
            }).jsonObject
            activateSession(value["sessionId"]?.jsonPrimitive?.content ?: error("Host 未返回会话编号"))
        } catch (e: Exception) { showError(e) }
    }

    fun stopJob(jobId: String) = viewModelScope.launch {
        val connection = remote ?: return@launch
        val sessionId = mutable.value.sessionId ?: return@launch
        try {
            connection.call("job/kill", buildJsonObject {
                put("request", buildJsonObject {
                    put("sessionId", JsonPrimitive(sessionId))
                    put("jobId", JsonPrimitive(jobId))
                })
            })
        } catch (e: Exception) { showError(e) }
    }

    fun restartMcp(name: String) = viewModelScope.launch {
        val connection = remote ?: return@launch
        try { connection.call("mcpManager/restart", buildJsonObject { put("name", JsonPrimitive(name)) }) }
        catch (e: Exception) { showError(e) }
    }

    fun clearError() { mutable.value = mutable.value.copy(error = null) }
    fun clearActionFeedback() {
        mutable.value = mutable.value.copy(actionFeedback = null)
    }

    private fun reportActionFeedback(message: String) {
        feedbackSerial += 1
        mutable.value = mutable.value.copy(
            actionFeedbackSerial = feedbackSerial, actionFeedback = message
        )
    }

    private fun showError(e: Throwable) {
        mutable.value = mutable.value.copy(error = e.message ?: "操作失败")
    }
    override fun onCleared() {
        manualClose = true
        retryJob?.cancel()
        stream?.close()
        workspaceStream?.close()
        jobStream?.close()
        mcpStream?.close()
        eventsStream?.close()
        remote?.close()
        super.onCleared()
    }
}
