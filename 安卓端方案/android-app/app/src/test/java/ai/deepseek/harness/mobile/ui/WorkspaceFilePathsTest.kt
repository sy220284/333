package ai.deepseek.harness.mobile.ui

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class WorkspaceFilePathsTest {
    @Test fun joiningRelativeWorkspacePaths() {
        assertEquals("README.md", childWorkspacePath(".", "README.md"))
        assertEquals("src/main.kt", childWorkspacePath("src", "main.kt"))
        assertEquals("src", parentWorkspacePath("src/main"))
        assertEquals(".", parentWorkspacePath("src"))
    }

    @Test fun directoryTraversalCannotBeCreatedByFileName() {
        for (entry in listOf(".", "..", "x/y", "x\\\\y", "", "x\u0000y")) {
            assertThrows("illegal entry: $entry", IllegalArgumentException::class.java) {
                childWorkspacePath(".", entry)
            }
        }
    }
}
