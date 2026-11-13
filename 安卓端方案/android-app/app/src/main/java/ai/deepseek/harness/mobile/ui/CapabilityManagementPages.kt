package ai.deepseek.harness.mobile.ui

import ai.deepseek.harness.mobile.MainViewModel
import ai.deepseek.harness.mobile.UiState
import ai.deepseek.harness.mobile.ScheduleRow
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

/** 根据选中会话向官方 skills/list 获取技能，不从界面硬编码技能列表。 */
@Composable
internal fun SkillCatalogPage(
    model: MainViewModel,
    state: UiState,
    onCompose: (String) -> Unit
) {
    LaunchedEffect(state.connected, state.sessionId) {
        if (state.connected) model.refreshSkills()
    }
    LazyColumn(contentPadding = PaddingValues(20.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            Text("技能中心", style = MaterialTheme.typography.headlineMedium)
            Text("当前会话能够实际调用的技能", color = MaterialTheme.colorScheme.onSurfaceVariant)
            OutlinedButton(onClick = { model.refreshSkills() },
                enabled = state.connected && state.sessionId != null && !state.skillLoading) {
                Text("刷新技能")
            }
            if (state.skillLoading) Text("正在读取核心技能目录…")
            if (state.skillError != null) {
                Text(state.skillError, color = MaterialTheme.colorScheme.error)
            }
        }
        if (state.skills.isEmpty() && !state.skillLoading && state.skillError == null) {
            item { Text("当前会话没有发现可直接调用的技能。") }
        }
        items(state.skills, key = { it.name }) { skill ->
            Card {
                Column(Modifier.fillMaxWidth().padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("/" + skill.name, fontWeight = FontWeight.SemiBold)
                    Text(skill.description, style = MaterialTheme.typography.bodyMedium)
                    if (skill.whenToUse != null) {
                        Text(skill.whenToUse,
                            color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    Text(if (skill.modelInvocable) "用户与模型均可调用" else "仅用户手动调用",
                        style = MaterialTheme.typography.bodySmall)
                    Button(onClick = { onCompose(skill.name) }, enabled = state.connected) {
                        Text("填写到对话")
                    }
                }
            }
        }
    }
}

/** 计划由用户主动创建或执行，浏览列表不启动任何任务。 */
@Composable
internal fun ScheduleManagementPage(model: MainViewModel, state: UiState) {
    var newOpen by remember { mutableStateOf(false) }
    var newTitle by remember { mutableStateOf("") }
    var newPrompt by remember { mutableStateOf("") }
    var repeat by remember { mutableStateOf(false) }
    var interval by remember { mutableStateOf(86400L) }
    var editTask by remember { mutableStateOf<ScheduleRow?>(null) }
    var editTitle by remember { mutableStateOf("") }
    var editPrompt by remember { mutableStateOf("") }
    var deleteTask by remember { mutableStateOf<ScheduleRow?>(null) }
    var runTask by remember { mutableStateOf<ScheduleRow?>(null) }

    LaunchedEffect(state.connected) {
        if (state.connected) model.refreshSchedules()
    }
    if (newOpen) {
        AlertDialog(onDismissRequest = { newOpen = false },
            title = { Text("创建计划任务") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    OutlinedTextField(newTitle, onValueChange = { newTitle = it },
                        label = { Text("任务名称") }, singleLine = true,
                        modifier = Modifier.fillMaxWidth())
                    OutlinedTextField(newPrompt, onValueChange = { newPrompt = it },
                        label = { Text("执行内容") }, minLines = 2,
                        modifier = Modifier.fillMaxWidth())
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        FilterChip(selected = !repeat, onClick = { repeat = false },
                            label = { Text("执行一次") })
                        FilterChip(selected = repeat, onClick = { repeat = true },
                            label = { Text("定期执行") })
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                        listOf(3600L to "1小时", 86400L to "1天", 604800L to "7天")
                            .forEach { (value, caption) ->
                                FilterChip(selected = interval == value,
                                    onClick = { interval = value }, label = { Text(caption) })
                            }
                    }
                    Text(if (repeat) "按所选间隔持续执行" else "经过所选时间后执行一次",
                        style = MaterialTheme.typography.bodySmall)
                }
            },
            confirmButton = { Button(onClick = {
                model.createSchedule(newTitle, newPrompt, interval, repeat)
                newOpen = false
            }, enabled = newTitle.isNotBlank() && newTitle.length <= 120 &&
                    newPrompt.isNotBlank()) { Text("确认创建") } },
            dismissButton = { TextButton(onClick = { newOpen = false }) { Text("取消") } })
    }
    val editing = editTask
    if (editing != null) {
        AlertDialog(onDismissRequest = { editTask = null },
            title = { Text("编辑任务内容") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(editTitle, onValueChange = { editTitle = it },
                        label = { Text("名称") }, modifier = Modifier.fillMaxWidth())
                    OutlinedTextField(editPrompt, onValueChange = { editPrompt = it },
                        label = { Text("执行内容") }, modifier = Modifier.fillMaxWidth(), minLines = 2)
                }
            },
            confirmButton = { Button(onClick = {
                model.editSchedule(editing.id, editTitle, editPrompt, editing.updatedAt)
                editTask = null
            }, enabled = editTitle.isNotBlank() && editTitle.length <= 120 &&
                editPrompt.isNotBlank()) { Text("保存") } },
            dismissButton = { TextButton(onClick = { editTask = null }) { Text("取消") } })
    }
    val removing = deleteTask
    if (removing != null) {
        AlertDialog(onDismissRequest = { deleteTask = null },
            title = { Text("删除计划任务？") },
            text = { Text("将删除「" + removing.title + "」及其保存的执行记录。") },
            confirmButton = { Button(onClick = {
                model.deleteSchedule(removing)
                deleteTask = null
            }) { Text("确认删除") } },
            dismissButton = { TextButton(onClick = { deleteTask = null }) { Text("取消") } })
    }
    val running = runTask
    if (running != null) {
        AlertDialog(onDismissRequest = { runTask = null },
            title = { Text("立即执行？") },
            text = { Text("确认后，核心将立即执行「" + running.title + "」。") },
            confirmButton = { Button(onClick = {
                model.runSchedule(running)
                runTask = null
            }) { Text("立即执行") } },
            dismissButton = { TextButton(onClick = { runTask = null }) { Text("取消") } })
    }

    LazyColumn(contentPadding = PaddingValues(20.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            Text("计划任务", style = MaterialTheme.typography.headlineMedium)
            Text("仅显示核心中真实保存的任务，创建与运行均需手动确认。",
                style = MaterialTheme.typography.bodySmall)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = { newOpen = true }, enabled = state.connected) {
                    Text("新建计划")
                }
                OutlinedButton(onClick = { model.refreshSchedules() },
                    enabled = state.connected && !state.scheduleLoading) { Text("刷新") }
            }
            if (state.scheduleLoading) Text("正在读取计划…")
            if (state.scheduleError != null) Text(state.scheduleError,
                color = MaterialTheme.colorScheme.error)
        }
        if (state.schedules.isEmpty() && !state.scheduleLoading && state.scheduleError == null) {
            item { Text("尚未创建计划任务。") }
        }
        items(state.schedules, key = { it.id }) { task ->
            Card {
                Column(Modifier.fillMaxWidth().padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(task.title, fontWeight = FontWeight.SemiBold)
                    Text(task.prompt, style = MaterialTheme.typography.bodySmall)
                    Text(task.status + " · " + task.kind + " · 下次：" + task.scheduledAt,
                        style = MaterialTheme.typography.bodySmall)
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        if (task.status == "active" || task.status == "paused") {
                            OutlinedButton(onClick = {
                                model.setScheduleActive(task, task.status != "active")
                            }, enabled = state.connected) {
                                Text(if (task.status == "active") "暂停" else "恢复")
                            }
                        }
                        OutlinedButton(onClick = {
                            editTitle = task.title
                            editPrompt = task.prompt
                            editTask = task
                        }, enabled = state.connected) { Text("编辑") }
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        if (task.status != "ended") {
                            OutlinedButton(onClick = { runTask = task },
                                enabled = state.connected) { Text("立即运行") }
                        }
                        TextButton(onClick = { deleteTask = task },
                            enabled = state.connected) { Text("删除") }
                    }
                }
            }
        }
    }
}
