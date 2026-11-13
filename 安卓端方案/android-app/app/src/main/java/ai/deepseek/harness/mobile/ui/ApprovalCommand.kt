package ai.deepseek.harness.mobile.ui

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/**
 * 对齐 Harness 的 assistant/message.content 工具调用块 (id, name, arguments)。
 * 仅从与当前请求 callId 相符的真实工具调用中展示命令，防止错展示另一项审批。
 */
internal data class ExecutableToolCommand(val callId: String, val toolName: String, val command: String)

internal fun approvalCommandsFromContent(content: JsonElement?): List<ExecutableToolCommand> {
    val blocks = content as? JsonArray ?: return emptyList()
    return blocks.mapNotNull { raw ->
        val item = raw as? JsonObject ?: return@mapNotNull null
        if ((item["type"] as? JsonPrimitive)?.content != "tool-call") return@mapNotNull null
        val id = (item["id"] as? JsonPrimitive)?.content ?: return@mapNotNull null
        val name = (item["name"] as? JsonPrimitive)?.content ?: return@mapNotNull null
        val arguments = (item["arguments"] as? JsonPrimitive)?.content ?: return@mapNotNull null
        val obj = try {
            Json.parseToJsonElement(arguments) as? JsonObject
        } catch (_: kotlinx.serialization.SerializationException) {
            null
        } ?: return@mapNotNull null
        val field = if (name == "terminal_send") "text" else "command"
        val command = (obj[field] as? JsonPrimitive)?.takeIf { it.isString }?.content
            ?.takeIf { it.isNotBlank() } ?: return@mapNotNull null
        ExecutableToolCommand(id, name, command)
    }
}
