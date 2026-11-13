package ai.deepseek.harness.mobile.ui

import ai.deepseek.harness.mobile.MainViewModel
import ai.deepseek.harness.mobile.UiState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

/** 当前 Session 所属的真实 Host 终端清单。用户输入、PTY与控制权接管仍需双工协议。 */
@Composable
internal fun TerminalInventoryPage(model: MainViewModel, state: UiState) {
    LaunchedEffect(state.connected, state.sessionId) {
        if (state.connected && state.sessionId != null) model.refreshTerminals()
    }
    LazyColumn(contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            Text("交互终端", style = MaterialTheme.typography.headlineMedium)
            Text("从 Harness Host 读取保留的终端状态；交互输入和重连需双工终端协议通过后启用。",
                color = MaterialTheme.colorScheme.onSurfaceVariant)
            OutlinedButton(onClick = { model.refreshTerminals() },
                enabled = state.connected && state.sessionId != null && !state.terminalLoading) {
                Text("刷新终端")
            }
        }
        if (state.sessionId == null) item { Text("请先在工作区创建或恢复一个会话。") }
        if (state.terminalLoading) item { Text("正在读取终端…") }
        if (state.terminalError != null) item {
            Text(state.terminalError, color = MaterialTheme.colorScheme.error)
        }
        if (state.sessionId != null && !state.terminalLoading && state.terminals.isEmpty()) {
            item { Text("当前会话没有保留的终端。") }
        }
        items(state.terminals, key = { it.id }) { row ->
            Card {
                Column(Modifier.fillMaxWidth().padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(row.title, fontWeight = FontWeight.SemiBold)
                    Text("${row.shell} · ${row.state}",
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text("工作目录：${row.cwd}", style = MaterialTheme.typography.bodySmall)
                    Text("创建方：${row.origin} · 控制方：${row.control}",
                        style = MaterialTheme.typography.bodySmall)
                    if (row.exitCode != null) Text("退出码：${row.exitCode}")
                }
            }
        }
    }
}
