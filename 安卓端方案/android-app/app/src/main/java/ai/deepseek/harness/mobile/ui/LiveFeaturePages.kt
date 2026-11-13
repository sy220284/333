package ai.deepseek.harness.mobile.ui

import ai.deepseek.harness.mobile.MainViewModel
import ai.deepseek.harness.mobile.UiState
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

/** V1.1 的原生信息架构：只显示当前 Host 实际报告的对象和状态。 */
@Composable
private fun Destination(title: String, subtitle: String, id: String, open: (String) -> Unit) {
    Card(onClick = { open(id) }) {
        Column(Modifier.fillMaxWidth().padding(18.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(title, fontWeight = FontWeight.SemiBold)
            Text(subtitle, style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
internal fun CapabilityHome(state: UiState, open: (String) -> Unit) {
    var more by rememberSaveable { mutableStateOf(false) }
    LazyColumn(contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            Text("能力中心", style = MaterialTheme.typography.headlineMedium)
            Text("先选择用途，再查看当前设备和核心真正可用的能力。",
                color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        item { Destination("技能", "按需读取已安装技能", "skills", open) }
        item { Destination("插件中心", "当前发现 ${state.plugins.size} 个插件包", "plugins", open) }
        item { Destination("MCP 工具连接", "已发现 ${state.mcpServers.size} 个服务", "mcp", open) }
        item { TextButton(onClick = { more = !more }) {
            Text(if (more) "收起其他能力" else "浏览器、设备操作与自动化") } }
        if (more) {
            item { Destination("浏览器操作", "查看支持的执行环境", "browser", open) }
            item { Destination("设备操作", "检查授权和设备适配", "computer", open) }
            item { Destination("自动化任务", "仅在主动创建后保存计划", "schedule", open) }
        }
    }
}

@Composable
internal fun McpServicesScreen(model: MainViewModel, state: UiState, detail: (String) -> Unit) {
    LaunchedEffect(state.connected) { if (state.connected) model.observeMcpServers() }
    LazyColumn(contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            Text("MCP 工具连接", style = MaterialTheme.typography.headlineMedium)
            Text("来自 Harness Host 的实时状态", color = MaterialTheme.colorScheme.onSurfaceVariant)
            OutlinedButton(onClick = { model.observeMcpServers() }, enabled = state.connected) {
                Text("刷新服务状态")
            }
        }
        if (state.mcpServers.isEmpty()) item {
            Text(if (state.connected) "当前 Host 没有发现 MCP 服务。" else "连接核心后读取 MCP 服务。")
        }
        items(state.mcpServers, key = { it.name }) { item ->
            Destination(item.name, "连接状态：${item.status}", item.name, detail)
        }
    }
}

@Composable
internal fun McpServiceScreen(model: MainViewModel, state: UiState, name: String, back: () -> Unit) {
    val server = state.mcpServers.firstOrNull { it.name == name }
    Column(Modifier.fillMaxSize().padding(24.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Text("MCP 服务详情", style = MaterialTheme.typography.headlineMedium)
        if (server == null) {
            Text("请选择核心实际发现的服务。")
            OutlinedButton(onClick = back) { Text("返回服务列表") }
        } else {
            Text(server.name, fontWeight = FontWeight.SemiBold)
            Text("连接状态：${server.status}")
            Button(onClick = { model.restartMcp(server.name) }, enabled = state.connected) {
                Text("请求重新连接")
            }
            Text("服务状态随后由核心订阅更新；资源与模板须由该服务的真实接口返回。",
                color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
internal fun PluginListScreen(model: MainViewModel, state: UiState, detail: (String) -> Unit) {
    LaunchedEffect(state.connected) { if (state.connected) model.refreshBundles() }
    LazyColumn(contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            Text("插件中心", style = MaterialTheme.typography.headlineMedium)
            Text("仅展示核心报告的已安装插件包。", color = MaterialTheme.colorScheme.onSurfaceVariant)
            OutlinedButton(onClick = { model.refreshBundles() }, enabled = state.connected) { Text("刷新插件") }
        }
        if (state.plugins.isEmpty()) item { Text("当前没有可显示的插件包。") }
        items(state.plugins, key = { it.name }) { item ->
            Destination(item.name, "版本：${item.status}", item.name, detail)
        }
    }
}

@Composable
internal fun PluginInfoScreen(state: UiState, name: String, back: () -> Unit) {
    val item = state.plugins.firstOrNull { it.name == name }
    Column(Modifier.fillMaxSize().padding(24.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Text("插件详情", style = MaterialTheme.typography.headlineMedium)
        if (item == null) {
            Text("请选择当前核心已安装的插件。")
            OutlinedButton(onClick = back) { Text("返回插件中心") }
        } else {
            Text(item.name, fontWeight = FontWeight.SemiBold)
            Text("当前版本：${item.status}")
            Text("安装和启停需要核心确认。当前只展示真实安装信息。",
                color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
internal fun SessionListScreen(model: MainViewModel, state: UiState,
    resume: (String) -> Unit, detail: (String) -> Unit, search: () -> Unit
) {
    LaunchedEffect(state.connected) { if (state.connected) model.refreshSessions() }
    LazyColumn(contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            Text("会话历史", style = MaterialTheme.typography.headlineMedium)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = search) { Text("搜索") }
                OutlinedButton(onClick = { model.refreshSessions() }, enabled = state.connected) { Text("刷新") }
            }
        }
        if (state.sessions.isEmpty()) item {
            Text(if (state.connected) "当前没有历史会话。" else "连接核心后可恢复历史会话。")
        }
        items(state.sessions, key = { it.id }) { item ->
            Card {
                Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("会话 ${item.id.take(12)}", fontWeight = FontWeight.SemiBold)
                    Text(if (item.running) "正在执行" else if (item.blank) "尚未开始" else "可继续",
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedButton(onClick = { detail(item.id) }) { Text("详情") }
                        Button(onClick = { resume(item.id) }) { Text("继续") }
                    }
                }
            }
        }
    }
}

@Composable
internal fun SessionInfoScreen(state: UiState, id: String,
    resume: () -> Unit, back: () -> Unit
) {
    val item = state.sessions.firstOrNull { it.id == id }
    Column(Modifier.fillMaxSize().padding(24.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Text("会话信息", style = MaterialTheme.typography.headlineMedium)
        if (item == null) {
            Text("会话已不在当前核心列表中。")
            OutlinedButton(onClick = back) { Text("重新选择会话") }
        } else {
            Text(item.id, fontWeight = FontWeight.Medium)
            Text(if (item.running) "执行中" else if (item.blank) "尚未开始" else "可以继续")
            Button(onClick = resume) { Text("继续此会话") }
        }
    }
}

@Composable
internal fun SearchScreen(catalog: FeatureNavigationCatalog, state: UiState,
    open: (String) -> Unit, resume: (String) -> Unit
) {
    var query by rememberSaveable { mutableStateOf("") }
    val term = query.trim()
    val paths = if (term.isEmpty()) emptyList() else catalog.search(term)
    val sessions = if (term.isEmpty()) emptyList() else state.sessions.filter { it.id.contains(term, true) }
    val workspaces = if (term.isEmpty()) emptyList() else state.workspaces.filter {
        it.title.contains(term, true) || it.path.contains(term, true)
    }
    LazyColumn(contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            Text("全局查找", style = MaterialTheme.typography.headlineMedium)
            OutlinedTextField(value = query, onValueChange = { query = it },
                placeholder = { Text("会话、工作区或功能") },
                modifier = Modifier.fillMaxWidth(), singleLine = true)
            Text("仅搜索核心当前已读取的会话、工作区和功能目录。",
                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        if (term.isNotEmpty()) {
            item { Text("功能入口", fontWeight = FontWeight.SemiBold) }
            items(paths, key = { it.id }) { item ->
                TextButton(onClick = { open(item.id) }) {
                    Text(catalog.breadcrumb(item.id).joinToString(" / ") { it.title })
                }
            }
            item { Text("会话", fontWeight = FontWeight.SemiBold) }
            items(sessions, key = { it.id }) { item ->
                TextButton(onClick = { resume(item.id) }) { Text("继续 ${item.id}") }
            }
            item { Text("工作区", fontWeight = FontWeight.SemiBold) }
            items(workspaces, key = { it.id }) { item ->
                TextButton(onClick = { open("projects") }) { Text(item.title + " · " + item.path) }
            }
            if (paths.isEmpty() && sessions.isEmpty() && workspaces.isEmpty()) item {
                Text("当前已加载数据无匹配结果。")
            }
        }
    }
}

@Composable
internal fun RunOverview(state: UiState, approval: () -> Unit, questions: () -> Unit,
    jobs: () -> Unit, terminal: () -> Unit
) {
    LazyColumn(contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            Text("运行中心", style = MaterialTheme.typography.headlineMedium)
            Text("当前任务与等待决定事项", color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        if (state.approvals.isNotEmpty()) item {
            Destination("等待授权", "${state.approvals.size} 项操作正在等待决定", "approval") { approval() }
        }
        if (state.questions.isNotEmpty()) item {
            Destination("待回答问题", "${state.questions.size} 组问题", "questions") { questions() }
        }
        item {
            Text(if (state.running) "当前会话运行中" else "当前会话没有运行任务",
                fontWeight = FontWeight.SemiBold)
            Text("已订阅后台作业 ${state.jobs.size} 个",
                color = MaterialTheme.colorScheme.onSurfaceVariant)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = jobs) { Text("任务详情") }
                OutlinedButton(onClick = terminal) { Text("交互终端") }
            }
        }
        if (state.jobs.isEmpty()) item { Text("当前没有后台作业。") }
        items(state.jobs, key = { it.id }) { item ->
            Card {
                Column(Modifier.fillMaxWidth().padding(16.dp)) {
                    Text(item.label, fontWeight = FontWeight.Medium)
                    Text(item.status + " · " + item.progress,
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}

@Composable
internal fun SettingsOverview(state: UiState, open: (String) -> Unit) {
    var advanced by rememberSaveable { mutableStateOf(false) }
    LazyColumn(contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            Text("设置", style = MaterialTheme.typography.headlineMedium)
            Text("常用偏好与权限，技术诊断按需展开。", color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        item { Destination("模型选择", "选择当前会话的模型", "models", open) }
        item { Destination("账户与授权", "查看核心真实凭据状态", "account", open) }
        item { Destination("外观与交互", "主题与文字显示", "appearance", open) }
        item { Destination("执行权限", "按照核心策略授权", "sandbox", open) }
        item { TextButton(onClick = { advanced = !advanced }) {
            Text(if (advanced) "收起高级设置" else "环境、诊断与使用统计") } }
        if (advanced) {
            item { Destination("核心运行环境", state.connectionStatus, "runtime", open) }
            item { Destination("问题诊断", "检查本机核心状态", "diagnostics", open) }
            item { Destination("使用统计", "查看核心返回的真实使用记录", "usage", open) }
            item { Destination("反馈", "检查后提交问题反馈", "feedback", open) }
        }
    }
}

@Composable
internal fun AppearanceSettings(darkMode: Boolean, onMode: (Boolean) -> Unit) {
    Column(Modifier.fillMaxSize().padding(24.dp), verticalArrangement = Arrangement.spacedBy(20.dp)) {
        Text("外观与交互", style = MaterialTheme.typography.headlineMedium)
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("深色模式", fontWeight = FontWeight.SemiBold)
            Switch(checked = darkMode, onCheckedChange = onMode)
        }
    }
}
