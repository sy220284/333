package ai.deepseek.harness.mobile.ui

import ai.deepseek.harness.mobile.MainViewModel
import ai.deepseek.harness.mobile.UiState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/** 原生页面订阅 Host 的实时 Remote 数据；无静态演示内容。 */
@Composable
internal fun WorkspacePage(model: MainViewModel, state: UiState, onOpenSession: () -> Unit) {
    LaunchedEffect(state.connected) { if (state.connected) model.observeWorkspaces() }
    LazyColumn(contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item { PanelHeader("我的项目", "工作区来自当前 Harness 核心", state.panelError) }
        item { OutlinedButton(onClick = { model.observeWorkspaces() }) { Text("刷新项目") } }
        if (state.workspaces.isEmpty()) item {
            Text("当前核心没有可访问的工作区。可先在 Host 中创建或选择工作区。",
                color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        items(state.workspaces, key = { it.id }) { workspace ->
            Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
                Column(Modifier.fillMaxWidth().padding(18.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(workspace.title, fontWeight = FontWeight.SemiBold, fontSize = 17.sp)
                    Text(workspace.path, fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text("会话 " + workspace.sessionIds.size, fontSize = 12.sp)
                    Button(onClick = { model.startWorkspaceSession(workspace.id); onOpenSession() }) {
                        Text("在此项目中开始")
                    }
                }
            }
        }
    }
}

@Composable
internal fun JobsPage(model: MainViewModel, state: UiState) {
    LaunchedEffect(state.connected, state.sessionId) { if (state.connected && state.sessionId != null) model.observeJobs() }
    LazyColumn(contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item { PanelHeader("任务记录", "当前会话的后台任务 · 状态以核心事件为准", state.panelError) }
        item { OutlinedButton(onClick = { model.observeJobs() }, enabled = state.sessionId != null) { Text("刷新任务") } }
        if (state.sessionId == null) item {
            Text("先在对话页进入一个会话，即可查看该会话的后台任务。")
        } else if (state.jobs.isEmpty()) item {
            Text("此会话暂无后台任务", color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        items(state.jobs, key = { it.id }) { job ->
            Card {
                Column(Modifier.fillMaxWidth().padding(18.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(job.label, fontWeight = FontWeight.SemiBold)
                    Text(job.status + if (job.progress.isBlank()) "" else " · " + job.progress,
                        color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp)
                    Text(job.id, fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    if (job.status == "running" || job.status == "stopping") {
                        OutlinedButton(onClick = { model.stopJob(job.id) }) { Text("请求停止任务") }
                    }
                }
            }
        }
    }
}

@Composable
internal fun ExtensionsPage(model: MainViewModel, state: UiState) {
    LaunchedEffect(state.connected) {
        if (state.connected) {
            model.observeMcpServers()
            model.refreshBundles()
        }
    }
    LazyColumn(contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item { PanelHeader("扩展中心", "按需使用核心当前可用的能力", state.panelError) }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = { model.observeMcpServers() }) { Text("刷新 MCP") }
                OutlinedButton(onClick = { model.refreshBundles() }) { Text("刷新插件") }
            }
        }
        item { Text("MCP 服务", fontWeight = FontWeight.SemiBold, fontSize = 19.sp) }
        if (state.mcpServers.isEmpty()) item {
            Text("当前 Host 没有可见的 MCP 服务。", color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        items(state.mcpServers, key = { "mcp-" + it.name }) { server ->
            Card {
                Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(server.name, fontWeight = FontWeight.Medium)
                    Text("状态：" + server.status, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp)
                    if (server.status != "connected" && server.status != "disabled") {
                        OutlinedButton(onClick = { model.restartMcp(server.name) }) { Text("重连服务") }
                    }
                }
            }
        }
        item {
            Spacer(Modifier.height(8.dp))
            Text("插件包", fontWeight = FontWeight.SemiBold, fontSize = 19.sp)
        }
        if (state.plugins.isEmpty()) item {
            Text("当前没有可显示的插件包。", color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        items(state.plugins, key = { "plugin-" + it.name }) { plugin ->
            Card {
                Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(plugin.name, fontWeight = FontWeight.Medium)
                    Text(plugin.status, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp)
                }
            }
        }
    }
}

@Composable
private fun PanelHeader(title: String, subtitle: String, error: String?) {
    Column(verticalArrangement = Arrangement.spacedBy(7.dp)) {
        Text(title, fontSize = 28.sp, fontWeight = FontWeight.Bold)
        Text(subtitle, fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        if (!error.isNullOrBlank()) {
            Text(error, fontSize = 13.sp, color = MaterialTheme.colorScheme.error)
        }
    }
}
