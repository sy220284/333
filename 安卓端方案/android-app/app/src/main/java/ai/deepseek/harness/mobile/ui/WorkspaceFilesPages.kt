package ai.deepseek.harness.mobile.ui

import ai.deepseek.harness.mobile.MainViewModel
import ai.deepseek.harness.mobile.UiState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

/** Host 给出的目录相对路径。客户端只允许通过正规目录项拼接子路径。 */
internal fun childWorkspacePath(directory: String, name: String): String {
    require(name.isNotBlank() && name != "." && name != ".." &&
        '/' !in name && '\\' !in name && '\u0000' !in name) {
        "非法工作区文件名称"
    }
    return if (directory == "." || directory.isEmpty()) name else "$directory/$name"
}

internal fun parentWorkspacePath(directory: String): String {
    if (directory.isBlank() || directory == ".") return "."
    return directory.substringBeforeLast('/', ".").ifBlank { "." }
}

/** 当前 Session 的 Host 文件列表，不借用手机本地存储路径。 */
@Composable
internal fun WorkspaceFilesScreen(model: MainViewModel, state: UiState,
    preview: (String) -> Unit, search: () -> Unit
) {
    LaunchedEffect(state.connected, state.sessionId) {
        if (state.connected && state.sessionId != null &&
            !state.directoryLoading && state.directoryEntries.isEmpty()) {
            model.listWorkspaceFiles(state.directoryPath)
        }
    }
    LazyColumn(contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            Text("项目文件", style = MaterialTheme.typography.headlineMedium)
            Text("当前 Session 工作区的真实文件，不读取其他应用私有目录。",
                color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        if (state.sessionId == null) {
            item {
                Text("尚未选择会话。先创建会话，或从工作区打开已有任务。")
                Button(onClick = { model.startSession() }, enabled = state.connected) {
                    Text("新建工作区会话")
                }
            }
        } else {
            item {
                Text("目录：${state.directoryPath}", fontWeight = FontWeight.Medium)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = {
                        model.listWorkspaceFiles(parentWorkspacePath(state.directoryPath))
                    }, enabled = !state.directoryLoading && state.directoryPath != ".") {
                        Text("上一级")
                    }
                    OutlinedButton(onClick = {
                        model.listWorkspaceFiles(state.directoryPath)
                    }, enabled = !state.directoryLoading) { Text("刷新") }
                    OutlinedButton(onClick = search) { Text("搜索") }
                }
            }
            if (state.directoryLoading) item { Text("正在读取 Host 文件目录…") }
            if (!state.fileError.isNullOrBlank()) item {
                Text(state.fileError, color = MaterialTheme.colorScheme.error)
            }
            if (!state.directoryLoading && state.directoryEntries.isEmpty()) item {
                Text("当前文件夹没有可显示的内容。")
            }
            items(state.directoryEntries, key = { it.name }) { file ->
                Card(onClick = {
                    val path = childWorkspacePath(state.directoryPath, file.name)
                    if (file.type == "directory") model.listWorkspaceFiles(path)
                    else if (file.type == "file") preview(path)
                }) {
                    Column(Modifier.fillMaxWidth().padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text(file.name, fontWeight = FontWeight.SemiBold)
                        Text(when (file.type) {
                            "directory" -> "文件夹 · 点击打开"
                            "file" -> "文件 · ${file.bytes?.let { "$it 字节" } ?: "大小未知"}"
                            else -> "不支持直接打开的文件类型"
                        }, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
            if (state.directoryTruncated) item {
                Text("核心已限制本次目录结果数量。使用文件搜索定位其他条目。",
                    color = MaterialTheme.colorScheme.error)
            }
        }
    }
}

/** 通过 workspaceFiles/read 按 100 行读取；保留下一页与文件版本的真实边界。 */
@Composable
internal fun WorkspaceFilePreview(model: MainViewModel, state: UiState,
    path: String, search: () -> Unit
) {
    LaunchedEffect(state.sessionId, path) {
        if (state.connected && state.sessionId != null && path.isNotBlank())
            model.readWorkspaceFile(path)
    }
    val suffix = path.substringAfterLast('.', "").lowercase()
    val documentKind = when (suffix) {
        "doc", "docx", "odt" -> "文字文档"
        "xls", "xlsx", "ods" -> "电子表格"
        "ppt", "pptx", "odp" -> "演示文稿"
        else -> null
    }
    LazyColumn(contentPadding = PaddingValues(20.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)) {
        item {
            Text("文件预览", style = MaterialTheme.typography.headlineMedium)
            Text(path, color = MaterialTheme.colorScheme.onSurfaceVariant)
            if (documentKind != null) {
                Text("$documentKind · Office 预览与格式转换须使用已连接的 Office Kit",
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        if (state.fileLoading) item { Text("正在从核心读取文件…") }
        if (!state.fileError.isNullOrBlank()) item {
            Text(state.fileError, color = MaterialTheme.colorScheme.error)
        }
        if (!state.fileLoading && state.fileError == null && state.filePath == path) {
            item {
                Text("第 ${state.filePageOffset} 行起 · 本页 ${state.filePageLines} 行",
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
                SelectionContainer {
                    Text(state.fileText.ifEmpty { "此页为空。" },
                        modifier = Modifier.fillMaxWidth(), style = MaterialTheme.typography.bodyMedium)
                }
            }
            if (!state.fileEof) item {
                Button(onClick = {
                    model.readWorkspaceFile(path, state.filePageOffset + state.filePageLines)
                }, enabled = state.filePageLines > 0) { Text("读取下一页") }
            }
        }
        item {
            OutlinedButton(onClick = search) { Text("搜索工作区文件") }
        }
    }
}

@Composable
internal fun WorkspaceFileSearch(model: MainViewModel, state: UiState,
    preview: (String) -> Unit, openDirectory: (String) -> Unit
) {
    var query by rememberSaveable { mutableStateOf("") }
    LazyColumn(contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            Text("文件搜索", style = MaterialTheme.typography.headlineMedium)
            Text("查询当前 Session 的工作区相对路径或文件名。",
                color = MaterialTheme.colorScheme.onSurfaceVariant)
            OutlinedTextField(value = query, onValueChange = { query = it },
                placeholder = { Text("输入文件名或相对路径") }, singleLine = true,
                modifier = Modifier.fillMaxWidth())
            Button(onClick = { model.searchWorkspaceFiles(query) },
                enabled = state.connected && state.sessionId != null &&
                    query.isNotBlank() && !state.fileSearching) { Text("查找文件") }
        }
        if (state.fileSearching) item { Text("核心正在检索工作区…") }
        if (!state.fileError.isNullOrBlank()) item {
            Text(state.fileError, color = MaterialTheme.colorScheme.error)
        }
        items(state.fileMatches, key = { it.path }) { match ->
            Card(onClick = {
                if (match.type == "directory") openDirectory(match.path)
                else if (match.type == "file") preview(match.path)
            }) {
                Column(Modifier.fillMaxWidth().padding(16.dp)) {
                    Text(match.path, fontWeight = FontWeight.Medium)
                    Text(match.type, style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
        if (state.fileSearchIncomplete) item {
            Text("搜索已达到核心结果或时间限制；可缩小搜索范围。",
                color = MaterialTheme.colorScheme.error)
        }
    }
}
