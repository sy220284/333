package ai.deepseek.harness.mobile.ui

import ai.deepseek.harness.mobile.MainViewModel
import ai.deepseek.harness.mobile.UiState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

/** 配置由 Host settings/describe 提供脱敏视图，界面不复制或缓存密码。 */
@Composable
internal fun AccountStatusPage(model: MainViewModel, state: UiState, showDiagnostics: () -> Unit) {
    LaunchedEffect(state.connected) { if (state.connected) model.refreshSettingsSummary() }
    Column(Modifier.fillMaxSize().padding(24.dp), verticalArrangement = Arrangement.spacedBy(15.dp)) {
        Text("账户与授权", style = MaterialTheme.typography.headlineMedium)
        Text("核心连接状态", fontWeight = FontWeight.SemiBold)
        Text(state.connectionStatus, color = MaterialTheme.colorScheme.onSurfaceVariant)
        if (!state.connected) {
            Text("当前没有与 Harness Core 建立 API 连接，无法核实模型账户或凭据状态。")
            OutlinedButton(onClick = showDiagnostics) { Text("检查核心运行状态") }
        } else {
            Text("设置服务", fontWeight = FontWeight.SemiBold)
            Text(if (state.settingsLoading) "正在读取核心设置..."
                else if (state.settingsWritable == true) "当前核心允许修改已授权的设置"
                else if (state.settingsWritable == false) "当前核心的设置受只读策略管理"
                else "核心尚未返回设置状态")
            if (state.settingsError != null) {
                Text(state.settingsError, color = MaterialTheme.colorScheme.error)
            }
            Text("可见配置领域：${state.settingsNamespaces.size} 个")
            if (state.settingsNamespaces.isNotEmpty()) {
                Card {
                    Column(Modifier.fillMaxWidth().padding(14.dp),
                        verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        state.settingsNamespaces.forEach { ns ->
                            Text(ns, style = MaterialTheme.typography.bodySmall)
                        }
                    }
                }
            }
            Text("凭据值由核心持有，并在设置描述中脱敏；本页不显示密钥原文，也不根据配置名称推断已登录。",
                color = MaterialTheme.colorScheme.onSurfaceVariant)
            OutlinedButton(onClick = { model.refreshSettingsSummary() }) {
                Text("重新检查")
            }
        }
    }
}

/** 用户主动审批仍通过任务弹层；权限页只展示当前实际状态。 */
@Composable
internal fun PermissionStatusPage(state: UiState, onCheck: () -> Unit) {
    Column(Modifier.fillMaxSize().padding(24.dp), verticalArrangement = Arrangement.spacedBy(15.dp)) {
        Text("执行权限", style = MaterialTheme.typography.headlineMedium)
        Text("当前授权来源：Harness 核心", fontWeight = FontWeight.SemiBold)
        Text(if (state.interactionReady) "已连接可处理授权的交互通道"
            else "交互授权通道尚未就绪",
            color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text("等待决定的工具操作：${state.approvals.size} 项")
        Text("当前任务的系统权限与工作区写入范围由实际 Host 执行策略控制。",
            color = MaterialTheme.colorScheme.onSurfaceVariant)
        if (state.approvals.isNotEmpty()) {
            OutlinedButton(onClick = onCheck) { Text("查看等待授权的操作") }
        }
    }
}
