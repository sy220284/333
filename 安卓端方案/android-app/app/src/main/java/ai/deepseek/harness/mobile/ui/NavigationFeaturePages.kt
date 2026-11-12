package ai.deepseek.harness.mobile.ui

import ai.deepseek.harness.mobile.MainViewModel
import ai.deepseek.harness.mobile.UiState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

/** 领域页只放与当下工作相关的二级动作，详细对象在列表选定后才进入。 */
@Composable
internal fun SectionRouteActions(
    sections: List<FeatureRoute>,
    onOpen: (String) -> Unit
) {
    val actions = sections.filter { it.role == "section" }
    if (actions.isEmpty()) return
    LazyRow(
        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        items(actions, key = { it.id }) { entry ->
            TextButton(onClick = { onOpen(entry.id) }) {
                Text(entry.title, maxLines = 1)
            }
        }
    }
}

/** 功能尚无 Android 原生实现时明确展示真实状态，绝不伪造工具执行成功。 */
@Composable
internal fun FeaturePendingPage(feature: FeatureRoute, onBack: () -> Unit) {
    Column(Modifier.padding(horizontal = 24.dp, vertical = 28.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Text(feature.title, style = MaterialTheme.typography.headlineMedium,
            fontWeight = FontWeight.SemiBold)
        Card {
            Column(Modifier.fillMaxWidth().padding(20.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("此功能尚未接通当前 Android 客户端",
                    color = MaterialTheme.colorScheme.onSurface)
                Text(if (feature.needsPlatformAdapter)
                    "需要先完成本机平台适配，或连接提供该能力的受信任 Harness Host。"
                else
                    "核心包含相应能力，原生界面与实际操作接口仍需连接验收。",
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        OutlinedButton(onClick = onBack) { Text("返回上一级") }
    }
}

/** 由 Host 返回的真实目录显示模型；选择动作复用已存在的 Remote 方法。 */
@Composable
internal fun ModelSelectionPage(model: MainViewModel, state: UiState) {
    LaunchedEffect(state.connected) { if (state.connected) model.refreshModels() }
    Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("模型选择", style = MaterialTheme.typography.headlineMedium)
        if (!state.connected) {
            Text("核心尚未连接，模型目录不可用。")
        } else if (state.models.isEmpty()) {
            Text("当前核心没有返回可用的模型；可在账户和授权中检查连接。")
        } else {
            state.models.forEach { item ->
                Card {
                    Column(Modifier.fillMaxWidth().padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(item.name, fontWeight = FontWeight.Medium)
                        Text("${item.provider} / ${item.model}",
                            color = MaterialTheme.colorScheme.onSurfaceVariant)
                        OutlinedButton(onClick = {
                            model.selectModel(item.provider, item.model)
                        }) { Text("使用此模型") }
                    }
                }
            }
        }
    }
}
