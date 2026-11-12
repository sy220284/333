package ai.deepseek.harness.mobile.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Build
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.Folder
import androidx.compose.material.icons.outlined.History
import androidx.compose.material.icons.outlined.Menu
import androidx.compose.material.icons.outlined.Send
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material.icons.outlined.Stop
import androidx.compose.material.icons.outlined.Tune
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.DrawerValue
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.ModalDrawerSheet
import androidx.compose.material3.ModalNavigationDrawer
import androidx.compose.material3.NavigationDrawerItem
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.material3.rememberDrawerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.collectAsState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import ai.deepseek.harness.mobile.ChatLine
import ai.deepseek.harness.mobile.MainViewModel
import ai.deepseek.harness.mobile.UiState
import ai.deepseek.harness.mobile.runtime.LocalRuntime
import ai.deepseek.harness.mobile.runtime.RuntimeStatus
import kotlinx.coroutines.launch
import androidx.compose.runtime.rememberCoroutineScope

private val light = lightColorScheme(
    primary = Color(0xFF0878C9), onPrimary = Color.White,
    background = Color(0xFFFAFAFA), surface = Color.White,
    onBackground = Color(0xFF15191F), onSurface = Color(0xFF15191F),
    surfaceVariant = Color(0xFFF2F5F7), outline = Color(0xFFDDE2E8)
)
private val dark = darkColorScheme(
    primary = Color(0xFF22D3EE), onPrimary = Color(0xFF071019),
    background = Color(0xFF070C14), surface = Color(0xFF101825),
    onBackground = Color(0xFFEFF4FA), onSurface = Color(0xFFEFF4FA),
    surfaceVariant = Color(0xFF1B2533), outline = Color(0xFF293646)
)

private val pages = listOf("对话", "历史会话", "我的项目", "任务记录", "扩展中心", "运行诊断", "设置")

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HarnessApp(model: MainViewModel) {
    val state by model.state.collectAsState()
    var page by rememberSaveable { mutableStateOf("对话") }
    var darkMode by rememberSaveable { mutableStateOf(false) }
    var modelSheet by remember { mutableStateOf(false) }
    val drawer = rememberDrawerState(DrawerValue.Closed)
    val scope = rememberCoroutineScope()
    val snackbar = remember { SnackbarHostState() }
    LaunchedEffect(state.error) {
        val error = state.error ?: return@LaunchedEffect
        snackbar.showSnackbar(error, withDismissAction = true)
        model.clearError()
    }
    MaterialTheme(colorScheme = if (darkMode) dark else light) {
        ModalNavigationDrawer(drawerState = drawer, drawerContent = {
            ModalDrawerSheet {
                Column(Modifier.padding(horizontal = 22.dp, vertical = 28.dp)) {
                    Text("DeepSeek Harness", fontSize = 23.sp, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(6.dp))
                    Text("项目 · 对话 · 工具", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 13.sp)
                }
                HorizontalDivider()
                pages.forEach { item ->
                    val icon = when (item) {
                        "对话" -> Icons.Outlined.Add
                        "历史会话" -> Icons.Outlined.History
                        "我的项目" -> Icons.Outlined.Folder
                        "设置" -> Icons.Outlined.Settings
                        else -> Icons.Outlined.Build
                    }
                    NavigationDrawerItem(
                        label = { Text(item) }, selected = page == item,
                        icon = { Icon(icon, null) },
                        onClick = { page = item; scope.launch { drawer.close() } },
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 2.dp)
                    )
                }
            }
        }) {
            Scaffold(
                snackbarHost = { SnackbarHost(snackbar) },
                topBar = {
                    TopAppBar(
                        title = {
                            Column {
                                Text(if (page == "对话") "新对话" else page, fontSize = 20.sp, fontWeight = FontWeight.SemiBold)
                                Text(state.connectionStatus, fontSize = 11.sp,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    maxLines = 1, overflow = TextOverflow.Ellipsis)
                            }
                        },
                        navigationIcon = {
                            IconButton(onClick = { scope.launch { drawer.open() } }) {
                                Icon(Icons.Outlined.Menu, contentDescription = "打开导航")
                            }
                        },
                        actions = {
                            if (page == "对话" && state.connected) {
                                IconButton(onClick = { model.startSession() }) {
                                    Icon(Icons.Outlined.Add, contentDescription = "新建会话")
                                }
                                IconButton(onClick = { model.refreshModels(); modelSheet = true }) {
                                    Icon(Icons.Outlined.Tune, contentDescription = "选择模型")
                                }
                            }
                        }
                    )
                }
            ) { insets ->
                Column(Modifier.fillMaxSize().padding(insets)) {
                    if (!state.connected) {
                        ConnectionPage(model, state, Modifier.fillMaxSize())
                    } else when (page) {
                        "对话" -> ConversationPage(model, state, Modifier.fillMaxSize())
                        "历史会话" -> SessionHistory(state, onOpen = { model.openSession(it); page = "对话" })
                        "运行诊断" -> RuntimePage()
                        "设置" -> SettingsPage(darkMode, onMode = { darkMode = it })
                        "我的项目" -> PlannedCapabilityPage("我的项目", "项目目录与文件浏览",
                            listOf("最近工作区", "文件浏览与预览", "工作区搜索", "代码改动审阅"),
                            "工作区 Remote 已具备，原生浏览器实现正在接入。")
                        "任务记录" -> PlannedCapabilityPage("任务记录", "过程和结果",
                            listOf("正在执行", "终端与后台任务", "历史执行结果", "操作日志"),
                            "job 和 terminal Remote 已具备，原生事件显示正在接入。")
                        "扩展中心" -> PlannedCapabilityPage("扩展中心", "按需添加能力",
                            listOf("技能与预设", "MCP 服务", "插件市场", "权限与审批"),
                            "扩展接口已经装配；功能入口以实际 Host 状态为准。")
                    }
                }
            }
            if (modelSheet) {
                ModalBottomSheet(onDismissRequest = { modelSheet = false }) {
                    Column(Modifier.padding(20.dp)) {
                        Text("选择模型", style = MaterialTheme.typography.headlineSmall)
                        Spacer(Modifier.height(16.dp))
                        if (state.models.isEmpty()) Text("正在读取 Host 模型目录，或暂无可用模型")
                        state.models.forEach { item ->
                            ListItem(
                                headlineContent = { Text(item.name) },
                                supportingContent = { Text(item.provider + " / " + item.model) },
                                modifier = Modifier.clickable {
                                    model.selectModel(item.provider, item.model)
                                    modelSheet = false
                                }
                            )
                        }
                        Spacer(Modifier.height(18.dp))
                    }
                }
            }
        }
    }
}

@Composable
private fun ConnectionPage(model: MainViewModel, state: UiState, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val runtime = remember(context) { LocalRuntime(context).inspect() }
    var showRemote by remember { mutableStateOf(false) }
    var link by rememberSaveable { mutableStateOf("") }
    Column(modifier.padding(horizontal = 24.dp, vertical = 30.dp),
        verticalArrangement = Arrangement.spacedBy(20.dp)) {
        Spacer(Modifier.height(12.dp))
        Text("让你的想法，\n成为下一步。", style = MaterialTheme.typography.headlineLarge,
            fontWeight = FontWeight.Bold, lineHeight = 40.sp)
        Text("一处处理对话、项目和工具。所有执行状态由 Harness 核心确认。",
            color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 15.sp, lineHeight = 22.sp)
        Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
            shape = RoundedCornerShape(20.dp)) {
            Column(Modifier.fillMaxWidth().padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Icon(Icons.Outlined.Folder, null, tint = MaterialTheme.colorScheme.primary)
                Text("本机核心", fontWeight = FontWeight.SemiBold, fontSize = 18.sp)
                Text(when (runtime) {
                    is RuntimeStatus.Missing -> runtime.reason
                    is RuntimeStatus.Available -> "已找到 Node 运行时和 Host 清单，仍需核心握手验证"
                }, fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text("运行时发布物尚未纳入安装包时，该功能明确显示待安装状态。",
                    fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        OutlinedButton(onClick = { showRemote = !showRemote }, modifier = Modifier.fillMaxWidth().height(52.dp)) {
            Text(if (showRemote) "收起远程连接" else "连接另一台设备上的 Harness")
        }
        AnimatedVisibility(showRemote, enter = fadeIn(tween(180)), exit = fadeOut(tween(120))) {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                OutlinedTextField(value = link, onValueChange = { link = it },
                    modifier = Modifier.fillMaxWidth(), maxLines = 2,
                    label = { Text("粘贴 Host 提供的连接链接") },
                    supportingText = { Text("必须包含 Host 签发的 token；远程连接使用 HTTPS") })
                Button(onClick = { model.connect(link) }, enabled = !state.connecting && link.isNotBlank(),
                    modifier = Modifier.fillMaxWidth().height(52.dp)) {
                    Text(if (state.connecting) "正在验证…" else "连接并验证核心")
                }
            }
        }
    }
}

@Composable
private fun ConversationPage(model: MainViewModel, state: UiState, modifier: Modifier = Modifier) {
    var draft by rememberSaveable { mutableStateOf("") }
    val list = rememberLazyListState()
    Column(modifier) {
        if (state.lines.isEmpty()) {
            Column(Modifier.weight(1f).fillMaxWidth().padding(horizontal = 28.dp),
                verticalArrangement = Arrangement.Center) {
                Text("今天，想解决什么？", fontSize = 30.sp, fontWeight = FontWeight.Bold, lineHeight = 38.sp)
                Spacer(Modifier.height(12.dp))
                Text("描述任务，Harness 会在选定的工作区中执行。",
                    color = MaterialTheme.colorScheme.onSurfaceVariant, lineHeight = 24.sp)
                Spacer(Modifier.height(20.dp))
                Text("项目梳理   ·   代码审查   ·   创作写作", fontSize = 12.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        } else {
            LazyColumn(modifier = Modifier.weight(1f), state = list,
                contentPadding = PaddingValues(horizontal = 20.dp, vertical = 24.dp),
                verticalArrangement = Arrangement.spacedBy(22.dp)) {
                items(state.lines, key = { it.seq }) { line -> MessageRow(line) }
                if (state.running) item {
                    Text("核心正在处理…", fontSize = 12.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
        Surface(shadowElevation = 8.dp) {
            Column(Modifier.fillMaxWidth().navigationBarsPadding().imePadding().padding(12.dp)) {
                Row(verticalAlignment = Alignment.Bottom,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(
                        value = draft, onValueChange = { draft = it }, modifier = Modifier.weight(1f),
                        placeholder = { Text("描述你的需求…") },
                        minLines = 1, maxLines = 5, shape = RoundedCornerShape(20.dp)
                    )
                    if (state.running) {
                        IconButton(onClick = { model.cancel() }, modifier = Modifier.size(52.dp)) {
                            Icon(Icons.Outlined.Stop, contentDescription = "停止当前任务",
                                tint = MaterialTheme.colorScheme.error)
                        }
                    } else {
                        IconButton(onClick = { if (!state.sending && draft.isNotBlank()) model.send(draft) },
                            enabled = !state.sending && draft.isNotBlank(), modifier = Modifier.size(52.dp)) {
                            Icon(Icons.Outlined.Send, contentDescription = "发送消息",
                                tint = MaterialTheme.colorScheme.primary)
                        }
                    }
                }
                Text(if (state.sending) "消息正在入队…" else "由 Host 确认执行与完成状态",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontSize = 11.sp, modifier = Modifier.padding(horizontal = 8.dp, vertical = 6.dp))
            }
        }
    }
}

@Composable
private fun MessageRow(line: ChatLine) {
    val isUser = line.actor == "user"
    Row(Modifier.fillMaxWidth(), horizontalArrangement = if (isUser) Arrangement.End else Arrangement.Start) {
        Surface(color = if (isUser) MaterialTheme.colorScheme.surfaceVariant else MaterialTheme.colorScheme.surface,
            shape = RoundedCornerShape(if (isUser) 18.dp else 10.dp),
            modifier = Modifier.widthIn(max = 490.dp)) {
            SelectionContainer {
                Text(line.text, modifier = Modifier.padding(16.dp),
                    fontSize = 15.sp, lineHeight = 25.sp)
            }
        }
    }
}

@Composable
private fun SessionHistory(state: UiState, onOpen: (String) -> Unit) {
    LazyColumn(contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item {
            Text("继续上次的工作", fontSize = 26.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(12.dp))
        }
        if (state.sessions.isEmpty()) item {
            Text("当前 Host 尚无历史会话", color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        items(state.sessions, key = { it.id }) { row ->
            Card(onClick = { onOpen(row.id) }) {
                Column(Modifier.fillMaxWidth().padding(16.dp)) {
                    Text("会话 " + row.id.take(10), fontWeight = FontWeight.SemiBold)
                    Spacer(Modifier.height(5.dp))
                    Text(if (row.running) "运行中" else if (row.blank) "尚未开始" else "可继续",
                        color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp)
                }
            }
        }
    }
}

@Composable
private fun RuntimePage() {
    val context = LocalContext.current
    val state = remember(context) { LocalRuntime(context).inspect() }
    Column(Modifier.fillMaxSize().padding(24.dp), verticalArrangement = Arrangement.spacedBy(18.dp)) {
        Text("核心运行诊断", fontSize = 28.sp, fontWeight = FontWeight.Bold)
        Card {
            Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("Android Node / Host", fontWeight = FontWeight.SemiBold)
                Text(when (state) {
                    is RuntimeStatus.Missing -> state.reason
                    is RuntimeStatus.Available -> "文件存在：等待签名、哈希及运行握手检查"
                })
            }
        }
        Text("本机运行完整验收依次要求 Node、Host、Session、Shell/PTY、沙箱及 MCP。"
            + " 未通过的环节应保留在诊断中，便于定位。",
            color = MaterialTheme.colorScheme.onSurfaceVariant, lineHeight = 23.sp)
    }
}

@Composable
private fun SettingsPage(darkMode: Boolean, onMode: (Boolean) -> Unit) {
    Column(Modifier.fillMaxSize().padding(24.dp)) {
        Text("偏好与安全", fontSize = 28.sp, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(20.dp))
        ListItem(headlineContent = { Text("深色模式") }, supportingContent = { Text("更适合低光环境") },
            trailingContent = { Switch(checked = darkMode, onCheckedChange = onMode) })
        HorizontalDivider()
        ListItem(headlineContent = { Text("执行权限") },
            supportingContent = { Text("由 Host 的权限策略决定实际许可") })
        ListItem(headlineContent = { Text("凭据安全") },
            supportingContent = { Text("启动令牌只用于握手，不在 UI 中持续显示") })
    }
}

@Composable
private fun PlannedCapabilityPage(title: String, subtitle: String, entries: List<String>, explanation: String) {
    LazyColumn(contentPadding = PaddingValues(24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            Text(subtitle, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 13.sp)
            Text(title, fontSize = 28.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(14.dp))
        }
        items(entries) { label ->
            Card {
                Row(Modifier.fillMaxWidth().padding(18.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Outlined.Build, null, tint = MaterialTheme.colorScheme.primary)
                    Spacer(Modifier.width(14.dp))
                    Text(label, fontWeight = FontWeight.Medium)
                }
            }
        }
        item {
            Spacer(Modifier.height(20.dp))
            Text(explanation, fontSize = 13.sp, lineHeight = 20.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}
