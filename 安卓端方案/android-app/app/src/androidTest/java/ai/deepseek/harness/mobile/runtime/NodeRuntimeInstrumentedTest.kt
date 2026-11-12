package ai.deepseek.harness.mobile.runtime

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Tests the actual Node executable inside an installed APK, not a mock URL or
 * desktop Node process. The Host-ready gate is tracked separately.
 */
@RunWith(AndroidJUnit4::class)
class NodeRuntimeInstrumentedTest {
    @Test fun packagedNodeVerifiesAndExecutesOnDevice() = runBlocking {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val state = LocalRuntime(context).probeNode()
        assertTrue("Android Node did not pass signed-payload and actual exec verification: $state",
            state is RuntimeStatus.NodeReady)
    }
}
