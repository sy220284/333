package ai.deepseek.harness.mobile.ui

import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ApprovalCommandTest {
    @Test fun shellCommandIsCorrelatedByCallId() {
        val content = Json.parseToJsonElement("""[
            {"type":"text","text":"准备执行"},
            {"type":"tool-call","id":"one","name":"bash","arguments":"{\"command\":\"pwd\"}"},
            {"type":"tool-call","id":"two","name":"terminal_send","arguments":"{\"text\":\"ls -la\\n\"}"}
        ]""")
        val results = approvalCommandsFromContent(content)
        assertEquals("pwd", results.single { it.callId == "one" }.command)
        assertEquals("ls -la\n", results.single { it.callId == "two" }.command)
    }

    @Test fun malformedAndUnrelatedArgumentsNeverInventACommand() {
        val content = Json.parseToJsonElement("""[
            {"type":"tool-call","id":"one","name":"bash","arguments":"broken-json"},
            {"type":"tool-call","id":"two","name":"bash","arguments":"{\"text\":\"wrong field\"}"},
            {"type":"text","text":"okay"}
        ]""")
        assertTrue(approvalCommandsFromContent(content).isEmpty())
    }
}
