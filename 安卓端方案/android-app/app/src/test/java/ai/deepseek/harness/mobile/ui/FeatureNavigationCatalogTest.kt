package ai.deepseek.harness.mobile.ui

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class FeatureNavigationCatalogTest {
    private val catalog by lazy {
        val resource = File("src/main/assets/design/feature-navigation-v1.1.json")
        FeatureNavigationCatalog.parse(resource.readText(Charsets.UTF_8))
    }

    @Test fun sixPrimaryNavigationEntries() {
        assertEquals(
            listOf("开始", "会话历史", "工作区", "运行中心", "能力中心", "设置"),
            catalog.roots.map { it.title }
        )
    }

    @Test fun backgroundAndContextActionsAreNeverMenuItems() {
        for (id in listOf("sdk", "telemetry", "web-search", "hooks", "translation", "auto-review",
            "approval", "questions", "command", "voice", "office", "webhook")) {
            assertFalse(id, catalog.canOpen(id))
        }
        assertFalse(catalog.search("遥测").any { it.id == "telemetry" })
        assertFalse(catalog.search("网页搜索").any { it.id == "web-search" })
    }

    @Test fun threeLevelsAndMcpRoute() {
        assertTrue(catalog.canOpen("mcp-detail"))
        assertEquals(listOf("mcp", "plugins", "skills", "browser", "computer", "schedule").toSet(),
            catalog.children("capabilities").map { it.id }.toSet())
        assertEquals("capabilities", catalog.get("mcp-detail").root)
        assertEquals(3, catalog.get("mcp-detail").depth)
        assertEquals("mcp", catalog.parentOf("mcp-detail")?.id)
    }

    @Test fun malformedOrMissingSourceIsRejected() {
        val content = File("src/main/assets/design/feature-navigation-v1.1.json").readText()
        org.junit.Assert.assertThrows(IllegalArgumentException::class.java) {
            FeatureNavigationCatalog.parse(content.replace("\"menuDepthLimit\": 3", "\"menuDepthLimit\": 4"))
        }
    }
}
