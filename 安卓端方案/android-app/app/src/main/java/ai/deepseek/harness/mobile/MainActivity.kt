package ai.deepseek.harness.mobile

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import ai.deepseek.harness.mobile.ui.HarnessApp

class MainActivity : ComponentActivity() {
    private val model by viewModels<MainViewModel>()
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { HarnessApp(model) }
    }
}
