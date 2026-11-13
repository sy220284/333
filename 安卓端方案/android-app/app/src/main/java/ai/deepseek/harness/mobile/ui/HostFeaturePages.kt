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
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.TextButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/** 原生页面订阅 Host 的实时 Remote 数据；无静态演示内容。 */
@Composable
internal fun WorkspacePage(model: MainViewModel, state: UiState,
    onOpenSession: () -> Unit, onFiles: () -> Unit
) {
    LaunchedEffect(state.connected) { if (state.connected) model.observeWorkspaces() }
    var createOpen by remember { mutableStateOf(false) }
    var createPath by remember { mutableStateOf("") }
    if (createOpen) {
        AlertDialog(onDismissRequest = { createOpen = false },
            title = { Text("添加项目文件夹") },
            text = { OutlinedTextField(createPath, onValueChange = { createPath = it },
                label = { Text("Harness 核心可访问的目录") }, singleLine = true) },
            confirmButton = {
                Button(onClick = { model.createWorkspace(createPath); createOpen = false },
                    enabled = createPath.isNotBlank()) { Text("添加项目") }
            },
            dismissButton = { TextButton(onClick = { createOpen = false }) { Text("取消") } })
    }
    LazyColumn(contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item { PanelHeader("我的项目", "工作区来自当前 Harness 核心", state.panelError) }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = { model.observeWorkspaces() }) { Text("刷新项目") }
                OutlinedButton(onClick = onFiles) { Text("项目文件") }
            }
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = { createOpen = true }, enabled = state.connected) {
                    Text("添加项目")
                }
                OutlinedButton(onClick = { model.initializeDefaultWorkspace() },
                    enabled = state.connected) { Text("初始化默认项目") }
            }
        }
        if (state.workspaces.isEmpty()) item {
            Text("当前核心没有可访问的工作区。可先在 Host 中创建或选择工作区。",
                color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        items(state.workspaces, key = { it.id }) { workspace ->
            var renameOpen by remember(workspace.id) { mutableStateOf(false) }
            var deleteOpen by remember(workspace.id) { mutableStateOf(false) }
            var newTitle by remember(workspace.id) { mutableStateOf(workspace.title) }
            if (renameOpen) {
                AlertDialog(onDismissRequest = { renameOpen = false },
                    title = { Text("重命名项目") },
                    text = { OutlinedTextField(newTitle, onValueChange = { newTitle = it },
                        label = { Text("项目名称") }, singleLine = true) },
                    confirmButton = { Button(onClick = {
                        model.renameWorkspace(workspace.id, newTitle)
                        renameOpen = false
                    }, enabled = newTitle.isNotBlank()) { Text("保存") } },
                    dismissButton = { TextButton(onClick = { renameOpen = false }) { Text("取消") } })
            }
            if (deleteOpen) {
                AlertDialog(onDismissRequest = { deleteOpen = false },
                    title = { Text("移除项目登记？") },
                    text = { Text("仅移除 Harness 的项目登记，原文件和历史会话会保留。") },
                    confirmButton = { Button(onClick = {
                        model.deleteWorkspace(workspace.id)
                        deleteOpen = false
                    }) { Text("确认移除") } },
                    dismissButton = { TextButton(onClick = { deleteOpen = false }) { Text("取消") } })
            }
            Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
                Column(Modifier.fillMaxWidth().padding(18.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(workspace.title, fontWeight = FontWeight.SemiBold, fontSize = 17.sp)
                    Text(workspace.path, fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text("会话 " + workspace.sessionIds.size, fontSize = 12.sp)
                    Button(onClick = { model.startWorkspaceSession(workspace.id); onOpenSession() }) {
                        Text("在此项目中开始")
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        TextButton(onClick = { newTitle = workspace.title; renameOpen = true }) {
                            Text("重命名")
                        }
                        TextButton(onClick = { deleteOpen = true }) { Text("移除登记") }
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
