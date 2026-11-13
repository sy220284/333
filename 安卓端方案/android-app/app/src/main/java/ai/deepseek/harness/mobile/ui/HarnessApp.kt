package ai.deepseek.harness.mobile.ui

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.speech.RecognizerIntent
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
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
import androidx.compose.material3.Checkbox
import androidx.compose.material3.RadioButton
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
import androidx.compose.runtime.mutableStateMapOf
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
import ai.deepseek.harness.mobile.PendingQuestion
import ai.deepseek.harness.mobile.QuestionAnswer
import ai.deepseek.harness.mobile.MainViewModel
import ai.deepseek.harness.mobile.UiState
import ai.deepseek.harness.mobile.runtime.CoreHostService
import ai.deepseek.harness.mobile.runtime.LocalHostState
import ai.deepseek.harness.mobile.runtime.LocalRuntime
import ai.deepseek.harness.mobile.runtime.RuntimeStatus
import kotlinx.coroutines.launch
import androidx.compose.runtime.rememberCoroutineScope

private val light = lightColorScheme(
    primary = Color(0xFF225C50), onPrimary = Color.White,
    background = Color(0xFFF6F4EF), surface = Color(0xFFFCFBF7),
    onBackground = Color(0xFF19231F), onSurface = Color(0xFF19231F),
    surfaceVariant = Color(0xFFECEFE9), outline = Color(0xFFD3DAD3)
)
private val dark = darkColorScheme(
    primary = Color(0xFF9FDACB), onPrimary = Color(0xFF0C201A),
    background = Color(0xFF131A18), surface = Color(0xFF1E2824),
    onBackground = Color(0xFFE9EFE9), onSurface = Color(0xFFE9EFE9),
    surfaceVariant = Color(0xFF293831), outline = Color(0xFF42564C)
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HarnessApp(model: MainViewModel) {
    val state by model.state.collectAsState()
    val context = LocalContext.current
    val catalog = remember(context) {
        context.assets.open("design/feature-navigation-v1.1.json").bufferedReader().use {
            FeatureNavigationCatalog.parse(it.readText())
        }
    }
    val localHost by CoreHostService.state.collectAsState()
    LaunchedEffect(Unit) {
        if (LocalRuntime(context).inspect() is RuntimeStatus.Available) {
            CoreHostService.start(context)
        }
    }
    LaunchedEffect(localHost, state.connected) {
        val host = localHost
        if (!state.connected && host is LocalHostState.Announced) model.connect(host.link)
    }
    var page by rememberSaveable { mutableStateOf("home") }
    var navigationTrail by rememberSaveable { mutableStateOf(arrayListOf("home")) }
    var drawerSearch by rememberSaveable { mutableStateOf("") }
    var conversationDraft by rememberSaveable { mutableStateOf("") }
    var selectedMcp by rememberSaveable { mutableStateOf("") }
    var selectedPlugin by rememberSaveable { mutableStateOf("") }
    var selectedSession by rememberSaveable { mutableStateOf("") }
    var selectedFile by rememberSaveable { mutableStateOf("") }
    var approvalOpen by rememberSaveable { mutableStateOf(false) }
    var questionsOpen by rememberSaveable { mutableStateOf(false) }
    var darkMode by rememberSaveable { mutableStateOf(false) }
    var modelSheet by remember { mutableStateOf(false) }
    val drawer = rememberDrawerState(DrawerValue.Closed)
    val scope = rememberCoroutineScope()
    val snackbar = remember { SnackbarHostState() }
    fun openFeature(id: String) {
        require(catalog.canOpen(id)) { "任务内操作和后台功能不得作为独立菜单页：$id" }
        if (page != id) {
            val route = catalog.get(id)
            navigationTrail = if (route.role == "root") arrayListOf(id)
                else ArrayList(navigationTrail + id)
            page = id
        }
        scope.launch { drawer.close() }
    }
    fun returnToParent() {
        val next = if (navigationTrail.size > 1) {
            navigationTrail = ArrayList(navigationTrail.dropLast(1))
            navigationTrail.last()
        } else {
            catalog.parentOf(page)?.id ?: "home"
        }
        page = next
        if (navigationTrail.size == 1) navigationTrail = arrayListOf(next)
    }
    BackHandler(enabled = page != "home" &&
        drawer.currentValue == DrawerValue.Closed && !modelSheet &&
        !approvalOpen && !questionsOpen) {
        returnToParent()
    }
    LaunchedEffect(state.approvals.firstOrNull()?.eventId) {
        approvalOpen = state.approvals.isNotEmpty()
    }
    LaunchedEffect(state.questions.firstOrNull()?.eventId) {
        questionsOpen = state.questions.isNotEmpty()
    }
    LaunchedEffect(state.promptReceipt?.serial) {
        val receipt = state.promptReceipt ?: return@LaunchedEffect
        if (conversationDraft.trim() == receipt.text) conversationDraft = ""
    }
    LaunchedEffect(state.error) {
        val error = state.error ?: return@LaunchedEffect
        snackbar.showSnackbar(error, withDismissAction = true)
        model.clearError()
    }
    LaunchedEffect(state.actionFeedbackSerial) {
        val response = state.actionFeedback ?: return@LaunchedEffect
        snackbar.showSnackbar(response)
        model.clearActionFeedback()
    }
    MaterialTheme(colorScheme = if (darkMode) dark else light) {
        ModalNavigationDrawer(drawerState = drawer, drawerContent = {
            ModalDrawerSheet {
                Column(Modifier.padding(horizontal = 22.dp, vertical = 28.dp)) {
                    Text("DeepSeek Harness", fontSize = 23.sp, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(6.dp))
                    Text("项目 · 对话 · 工具", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 13.sp)
                }
                OutlinedButton(onClick = {
                    if (state.connected) {
                        model.startSession()
                        openFeature("home")
                    }
                }, enabled = state.connected,
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
                    Icon(Icons.Outlined.Add, contentDescription = null)
                    Spacer(Modifier.width(8.dp))
                    Text("新建任务")
                }
                OutlinedTextField(
                    value = drawerSearch, onValueChange = { drawerSearch = it },
                    label = { Text("查找功能") }, singleLine = true,
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp)
                )
                if (drawerSearch.isNotBlank()) {
                    catalog.search(drawerSearch).take(8).forEach { result ->
                        NavigationDrawerItem(
                            label = { Text(result.title) },
                            selected = page == result.id,
                            onClick = { openFeature(result.id); drawerSearch = "" },
                            modifier = Modifier.padding(horizontal = 12.dp)
                        )
                    }
                }
                TextButton(onClick = { drawerSearch = ""; openFeature("search") },
                    modifier = Modifier.padding(horizontal = 12.dp)) {
                    Text("搜索会话与工作区")
                }
                HorizontalDivider(Modifier.padding(vertical = 8.dp))
                catalog.roots.forEach { item ->
                    val icon = when (item.id) {
                        "home" -> Icons.Outlined.Add
                        "sessions" -> Icons.Outlined.History
                        "projects" -> Icons.Outlined.Folder
                        "settings" -> Icons.Outlined.Settings
                        else -> Icons.Outlined.Build
                    }
                    NavigationDrawerItem(
                        label = { Text(item.title) }, selected = catalog.get(page).root == item.id,
                        icon = { Icon(icon, null) },
                        onClick = { openFeature(item.id) },
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
                                Text(catalog.get(page).title, fontSize = 20.sp, fontWeight = FontWeight.SemiBold)
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
                            if ((page == "home" || page == "chat") && state.connected) {
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
                    val route = catalog.get(page)
                    if (route.depth != 1) {
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically) {
                            TextButton(onClick = ::returnToParent) { Text("返回上一步") }
                            TextButton(onClick = { openFeature("home") }) { Text("回到任务") }
                        }
                        Text(catalog.breadcrumb(page).joinToString(" / ") { it.title },
                            modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
                            fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    if (state.approvals.isNotEmpty() && !approvalOpen) {
                        TextButton(onClick = { approvalOpen = true }) {
                            Text("${state.approvals.size} 项操作等待授权 · 查看")
                        }
                    }
                    if (state.questions.isNotEmpty() && !questionsOpen &&
                        state.approvals.isEmpty()) {
                        TextButton(onClick = { questionsOpen = true }) {
                            Text("${state.questions.size} 组问题等待回答 · 查看")
                        }
                    }
                    when {
                        page == "runtime" || page == "diagnostics" -> RuntimePage()
                        page == "settings" -> SettingsOverview(state, ::openFeature)
                        page == "account" -> AccountStatusPage(model, state) {
                            openFeature("diagnostics")
                        }
                        page == "sandbox" -> PermissionStatusPage(state) {
                            approvalOpen = true
                        }
                        page == "appearance" -> AppearanceSettings(darkMode) { darkMode = it }
                        page == "search" -> SearchScreen(model, catalog, state, ::openFeature) {
                            model.openSession(it); openFeature("home")
                        }
                        page == "sessions" -> SessionListScreen(model, state,
                            resume = { model.openSession(it); openFeature("home") },
                            detail = { selectedSession = it; openFeature("session-detail") },
                            search = { openFeature("search") })
                        page == "session-detail" -> SessionInfoScreen(model, state, selectedSession,
                            resume = { model.openSession(selectedSession); openFeature("home") },
                            back = { openFeature("sessions") })
                        page == "capabilities" -> CapabilityHome(state, ::openFeature)
                        !state.connected -> ConnectionPage(model, state,
                            onDiagnostics = { openFeature("diagnostics") }, modifier = Modifier.fillMaxSize())
                        else -> when (page) {
                            "home", "chat" -> ConversationPage(model, state,
                                conversationDraft, onDraftChange = { conversationDraft = it },
                                modifier = Modifier.fillMaxSize())
                            "projects" -> WorkspacePage(model, state,
                                onOpenSession = { openFeature("home") },
                                onFiles = { openFeature("files") })
                            "files" -> WorkspaceFilesScreen(model, state,
                                preview = { selectedFile = it; openFeature("file-preview") },
                                search = { openFeature("file-search") })
                            "file-preview" -> WorkspaceFilePreview(model, state, selectedFile) {
                                openFeature("file-search")
                            }
                            "file-search" -> WorkspaceFileSearch(model, state,
                                preview = { selectedFile = it; openFeature("file-preview") },
                                openDirectory = {
                                    model.listWorkspaceFiles(it)
                                    openFeature("files")
                                })
                            "task-center" -> RunOverview(state,
                                approval = { approvalOpen = true },
                                questions = { questionsOpen = true },
                                jobs = { openFeature("jobs") },
                                terminal = { openFeature("terminal") })
                            "jobs", "activity" -> JobsPage(model, state)
                            "terminal" -> TerminalInventoryPage(model, state)
                            "mcp" -> McpServicesScreen(model, state) {
                                selectedMcp = it; openFeature("mcp-detail")
                            }
                            "mcp-detail" -> McpServiceScreen(model, state, selectedMcp) {
                                openFeature("mcp")
                            }
                            "plugins" -> PluginListScreen(model, state) {
                                selectedPlugin = it; openFeature("plugin-detail")
                            }
                            "plugin-detail" -> PluginInfoScreen(model, state, selectedPlugin) {
                                openFeature("plugins")
                            }
                            "models" -> ModelSelectionPage(model, state)
                            "skills" -> SkillCatalogPage(model, state) { name ->
                                conversationDraft = "/" + name + " "
                                openFeature("home")
                            }
                            "schedule" -> ScheduleManagementPage(model, state)
                            else -> FeaturePendingPage(route, onBack = ::returnToParent)
                        }
                    }
                }
            }

            if (state.approvals.isNotEmpty() && approvalOpen) {
                val current = state.approvals.first()
                ModalBottomSheet(onDismissRequest = { approvalOpen = false }) {
                    Column(Modifier.padding(24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Text("执行权限确认", style = MaterialTheme.typography.headlineSmall)
                        Text(current.toolName, fontWeight = FontWeight.SemiBold)
                        Text(current.reason, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        current.callId?.let { Text("关联工具调用：$it", fontSize = 12.sp) }
                        current.command?.let { command ->
                            Text("将要执行的命令", fontWeight = FontWeight.SemiBold)
                            SelectionContainer {
                                Text(command, fontSize = 13.sp,
                                    modifier = Modifier.fillMaxWidth().padding(12.dp))
                            }
                        }
                        Text("允许后仅授权这一次操作。关闭弹层将保留等待决定状态。", fontSize = 12.sp)
                        Button(
                            onClick = { model.decideApproval(current.eventId, true) },
                            enabled = !state.approvalSubmitting, modifier = Modifier.fillMaxWidth().height(52.dp)
                        ) { Text("仅本次允许") }
                        OutlinedButton(
                            onClick = { model.decideApproval(current.eventId, false) },
                            enabled = !state.approvalSubmitting, modifier = Modifier.fillMaxWidth().height(52.dp)
                        ) { Text("拒绝操作") }
                        Spacer(Modifier.height(12.dp))
                    }
                }
            }
            if (state.approvals.isEmpty() && state.questions.isNotEmpty() && questionsOpen) {
                val pending = state.questions.first()
                ModalBottomSheet(onDismissRequest = { questionsOpen = false }) {
                    QuestionReplySheet(pending, state.questionSubmitting,
                        onSubmit = { answers -> model.answerQuestions(pending.eventId, answers) },
                        onCancel = { model.cancelQuestion(pending.eventId) })
                }
            }
            if (modelSheet) {
                ModalBottomSheet(onDismissRequest = { modelSheet = false }) {
                    Column(Modifier.padding(20.dp)) {
                        Text("选择模型", style = MaterialTheme.typography.headlineSmall)
                        Spacer(Modifier.height(16.dp))
                        if (state.models.isEmpty()) Text("正在读取 Host 模型目录，或暂无可用模型")
                        if (state.sessionId == null) {
                            Text("请先创建或打开一个会话，再选择模型。")
                        }
                        state.models.forEach { item ->
                            ListItem(
                                headlineContent = { Text(item.name) },
                                supportingContent = { Text(item.provider + " / " + item.model) },
                                modifier = Modifier.clickable(enabled = state.sessionId != null) {
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
private fun ConnectionPage(model: MainViewModel, state: UiState,
    onDiagnostics: () -> Unit, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val runtime = remember(context) { LocalRuntime(context).inspect() }
    val localHost by CoreHostService.state.collectAsState()
    var showRemote by remember { mutableStateOf(false) }
    var link by remember { mutableStateOf("") }
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
                    RuntimeStatus.Checking -> "正在检查本机组件"
                    is RuntimeStatus.Missing -> runtime.reason
                    is RuntimeStatus.NodeReady -> "Node 已包含；当前构建尚缺本机 Harness Host 完整资源"
                    is RuntimeStatus.Available -> "完整运行时已打包；正在检查本机 Host 启动和 API 握手"
                }, fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(when (val host = localHost) {
                    LocalHostState.Idle -> "本机核心尚未启动"
                    is LocalHostState.Starting -> host.step
                    is LocalHostState.Announced -> "Host 已监听本机地址，等待 API 连接验证"
                    is LocalHostState.Failed -> host.reason
                }, fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        if (runtime is RuntimeStatus.Available) {
            Button(onClick = { CoreHostService.start(context) },
                modifier = Modifier.fillMaxWidth().height(52.dp)) { Text("启动本机核心") }
        }
        Button(onClick = onDiagnostics, modifier = Modifier.fillMaxWidth().height(52.dp)) {
            Text("检查本机运行环境")
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
                Button(onClick = {
                    val entered = link
                    link = ""
                    model.connect(entered)
                }, enabled = !state.connecting && link.isNotBlank(),
                    modifier = Modifier.fillMaxWidth().height(52.dp)) {
                    Text(if (state.connecting) "正在验证…" else "连接并验证核心")
                }
            }
        }
    }
}

@Composable
private fun ConversationPage(model: MainViewModel, state: UiState, draft: String,
    onDraftChange: (String) -> Unit, modifier: Modifier = Modifier) {
    val list = rememberLazyListState()
    var voiceError by remember { mutableStateOf<String?>(null) }
    val recognizer = rememberLauncherForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (result.resultCode == Activity.RESULT_OK) {
            val recognized = result.data
                ?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)
                ?.firstOrNull()?.trim()
            if (!recognized.isNullOrBlank()) {
                onDraftChange(if (draft.isBlank()) recognized else draft.trimEnd() + " " + recognized)
                voiceError = null
            }
        }
    }
    fun beginVoiceDraft() {
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
            .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL,
                RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            .putExtra(RecognizerIntent.EXTRA_PROMPT, "语音输入任务草稿")
        try {
            recognizer.launch(intent)
        } catch (error: ActivityNotFoundException) {
            voiceError = "当前设备没有可用的语音识别服务，请使用文字输入。"
        }
    }
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
                Row(verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween) {
                    TextButton(onClick = ::beginVoiceDraft) { Text("语音输入") }
                    if (state.activeModelKey != null) {
                        Text(state.activeModelKey, fontSize = 11.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
                if (voiceError != null) {
                    Text(voiceError!!, color = MaterialTheme.colorScheme.error, fontSize = 12.sp)
                }
                Row(verticalAlignment = Alignment.Bottom,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(
                        value = draft, onValueChange = onDraftChange, modifier = Modifier.weight(1f),
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
                            enabled = state.interactionReady && !state.sending && draft.isNotBlank(), modifier = Modifier.size(52.dp)) {
                            Icon(Icons.Outlined.Send, contentDescription = "发送消息",
                                tint = MaterialTheme.colorScheme.primary)
                        }
                    }
                }
                Text(if (state.sending) "消息正在入队…" else if (!state.interactionReady) "正在建立审批与交互通道…" else "由 Host 确认执行与完成状态",
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

/** Host user-questions/request 的原生表单：按实际问题数量展示，不要求用户预填后台配置。 */
@Composable
private fun QuestionReplySheet(
    pending: PendingQuestion,
    submitting: Boolean,
    onSubmit: (List<QuestionAnswer>) -> Unit,
    onCancel: () -> Unit
) {
    val selections = remember(pending.eventId) { mutableStateMapOf<String, List<String>>() }
    val customs = remember(pending.eventId) { mutableStateMapOf<String, String>() }
    val complete = pending.questions.all { question ->
        selections[question.id].orEmpty().isNotEmpty() || !customs[question.id].isNullOrBlank()
    }
    LazyColumn(contentPadding = PaddingValues(20.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            Text("需要你的回答", style = MaterialTheme.typography.headlineSmall)
            Text("核心已暂停当前步骤，答复后继续。",
                color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 13.sp)
        }
        items(pending.questions, key = { it.id }) { question ->
            Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(9.dp)) {
                Text(question.question, fontSize = 17.sp, fontWeight = FontWeight.SemiBold)
                if (question.detail.isNotBlank()) {
                    Text(question.detail, fontSize = 13.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                question.choices.forEach { option ->
                    val picked = selections[question.id].orEmpty().contains(option.label)
                    Row(Modifier.fillMaxWidth().clickable(enabled = !submitting) {
                        val previous = selections[question.id].orEmpty()
                        selections[question.id] = if (question.multiSelect) {
                            if (picked) previous.filterNot { it == option.label }
                            else previous + option.label
                        } else listOf(option.label)
                    }.padding(vertical = 5.dp), verticalAlignment = Alignment.CenterVertically) {
                        if (question.multiSelect) {
                            Checkbox(checked = picked, onCheckedChange = { enabled ->
                                if (!submitting) {
                                    val previous = selections[question.id].orEmpty()
                                    selections[question.id] = if (enabled) (previous + option.label).distinct()
                                    else previous.filterNot { it == option.label }
                                }
                            }, enabled = !submitting)
                        } else {
                            RadioButton(selected = picked,
                                onClick = { if (!submitting) selections[question.id] = listOf(option.label) },
                                enabled = !submitting)
                        }
                        Column(Modifier.padding(start = 8.dp)) {
                            Text(option.label)
                            if (option.description.isNotBlank()) Text(option.description,
                                color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp)
                        }
                    }
                }
                if (question.choices.isEmpty() || customs.containsKey(question.id)) {
                    OutlinedTextField(value = customs[question.id].orEmpty(),
                        onValueChange = { customs[question.id] = it }, enabled = !submitting,
                        label = { Text("你的回答") }, modifier = Modifier.fillMaxWidth(),
                        minLines = 1, maxLines = 4)
                } else {
                    TextButton(onClick = { customs[question.id] = "" }, enabled = !submitting) {
                        Text("填写其他回答")
                    }
                }
                HorizontalDivider()
            }
        }
        item {
            Button(onClick = {
                onSubmit(pending.questions.map { q ->
                    QuestionAnswer(q.id, selections[q.id].orEmpty(),
                        customs[q.id]?.trim()?.takeIf(String::isNotBlank))
                })
            }, enabled = complete && !submitting,
                modifier = Modifier.fillMaxWidth().height(52.dp)) {
                Text(if (submitting) "正在提交…" else "提交回答")
            }
            OutlinedButton(onClick = onCancel, enabled = !submitting,
                modifier = Modifier.fillMaxWidth().height(52.dp)) { Text("取消回答") }
            Spacer(Modifier.height(24.dp))
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
    val runtime = remember(context) { LocalRuntime(context) }
    val localHost by CoreHostService.state.collectAsState()
    var state by remember { mutableStateOf<RuntimeStatus>(RuntimeStatus.Checking) }
    LaunchedEffect(runtime) { state = runtime.probeNode() }
    Column(Modifier.fillMaxSize().padding(24.dp), verticalArrangement = Arrangement.spacedBy(18.dp)) {
        Text("核心运行诊断", fontSize = 28.sp, fontWeight = FontWeight.Bold)
        Card {
            Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("Android Node / Host", fontWeight = FontWeight.SemiBold)
                Text(when (val current = state) {
                    RuntimeStatus.Checking -> "正在核对 Node 二进制、动态库并执行启动检测"
                    is RuntimeStatus.Missing -> current.reason
                    is RuntimeStatus.NodeReady -> current.detail
                    is RuntimeStatus.Available -> "Node 文件存在，Host 仍需进行完整就绪握手"
                })
            }
        }
        Text(when (val host = localHost) {
            LocalHostState.Idle -> "Host 未启动"
            is LocalHostState.Starting -> "Host 正在启动：" + host.step
            is LocalHostState.Announced -> "Host 已发布本机地址，API 仍需实际握手验证"
            is LocalHostState.Failed -> host.reason
        }, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Button(onClick = { CoreHostService.start(context) }) { Text("启动本机核心") }
            OutlinedButton(onClick = { CoreHostService.stop(context) }) { Text("停止") }
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
