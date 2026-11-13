package ai.deepseek.harness.mobile.ui

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.intOrNull

/**
 * V1.1 的唯一导航来源：71 个源码功能 + 1 个能力聚合页。
 * 映射文件在 android-app/app/src/main/assets/design 下，随 APK 分发。
 * 所有可见路由的深度由资源表确定，任务上下文/后台功能永远不是菜单。
 */
data class FeatureRoute(
    val id: String,
    val title: String,
    val role: String,
    val depth: Int?,
    val parent: String?,
    val root: String,
    val capability: String,
    val primaryAction: String,
    val needsPlatformAdapter: Boolean
) {
    val navigable: Boolean get() = role == "root" || role == "section" || role == "detail"
}

class FeatureNavigationCatalog private constructor(
    private val entries: Map<String, FeatureRoute>,
    val roots: List<FeatureRoute>
) {
    fun get(id: String): FeatureRoute = entries[id] ?: error("未登记的功能路径：$id")

    fun canOpen(id: String): Boolean = entries[id]?.navigable == true

    fun children(id: String): List<FeatureRoute> = entries.values.filter {
        it.parent == id && it.navigable
    }

    /** 只返回有明确界面归属的功能；后台或任务内按需操作不出现在导航搜索中。 */
    fun search(query: String): List<FeatureRoute> {
        val term = query.trim()
        if (term.isBlank()) return emptyList()
        return entries.values.filter {
            it.navigable && (term in it.title || term in it.capability)
        }
    }

    fun parentOf(id: String): FeatureRoute? = get(id).parent?.let(entries::get)

    /** 直接打开三级详情时也能展示真实的一级→二级→三级路径。 */
    fun breadcrumb(id: String): List<FeatureRoute> {
        val path = mutableListOf<FeatureRoute>()
        var current: FeatureRoute? = get(id)
        while (current != null) {
            path.add(current)
            current = current.parent?.let(entries::get)
        }
        path.reverse()
        return path
    }

    companion object {
        private val ROLE_COUNTS = mapOf(
            "root" to 6, "section" to 27, "detail" to 18,
            "contextual" to 15, "background" to 6
        )

        fun parse(raw: String): FeatureNavigationCatalog {
            val document = Json.parseToJsonElement(raw).jsonObject
            require(document["schema"]?.jsonPrimitive?.content == "333-feature-navigation-v1.1") {
                "功能导航清单版本不匹配"
            }
            require(document["menuDepthLimit"]?.jsonPrimitive?.intOrNull == 3) {
                "功能菜单必须最多三级"
            }
            val data = document["features"]?.jsonArray ?: error("缺少功能清单")
            val entries = data.map { value ->
                val item = value.jsonObject
                fun required(key: String) = item[key]?.jsonPrimitive?.content
                    ?: error("功能记录缺少$key")
                val depth = item["depth"]?.jsonPrimitive?.intOrNull
                val parent = item["parent"]?.let { value ->
                    if (value.toString() == "null") null else value.jsonPrimitive.content
                }
                FeatureRoute(
                    id = required("id"), title = required("title"),
                    role = required("role"), depth = depth, parent = parent,
                    root = required("root"), capability = required("capability"),
                    primaryAction = required("primaryAction"),
                    needsPlatformAdapter = required("needsPlatformAdapter").toBooleanStrict()
                )
            }
            require(entries.size == 72) { "V1.1 应有 71 项源码功能和 1 项能力聚合入口" }
            require(entries.map { it.id }.distinct().size == entries.size) { "功能路由 ID 重复" }
            require(entries.groupingBy { it.role }.eachCount() == ROLE_COUNTS) { "功能分类数量不匹配" }
            val map = entries.associateBy { it.id }
            val rootIds = document["roots"]?.jsonArray?.map { it.jsonPrimitive.content }
                ?: error("缺少一级入口顺序")
            require(rootIds == listOf("home", "sessions", "projects", "task-center", "capabilities", "settings")) {
                "一级菜单必须恰好是 V1.1 六个入口"
            }
            val rootRoutes = rootIds.map { map[it] ?: error("入口未定义：$it") }
            require(rootRoutes.all { it.role == "root" && it.depth == 1 && it.parent == null })
            entries.forEach { item ->
                require(item.root in rootIds) { "根入口不存在：${item.id}" }
                if (item.navigable) {
                    require(item.depth in 1..3) { "菜单超过三级：${item.id}" }
                } else {
                    require(item.depth == null) { "后台/任务内操作不允许占用菜单层级：${item.id}" }
                }
                if (item.parent != null) require(map.containsKey(item.parent)) { "父级路由不存在：${item.id}" }
                var cursor = item
                val seen = mutableSetOf<String>()
                while (cursor.parent != null) {
                    require(seen.add(cursor.id)) { "菜单循环引用：${item.id}" }
                    cursor = map.getValue(cursor.parent!!)
                }
                require(cursor.id == item.root) { "入口归属不一致：${item.id}" }
                if (item.role == "section" || item.role == "detail") {
                    require(item.parent != null && map.getValue(item.parent).navigable) {
                        "功能页面必须从已登记的菜单进入：${item.id}"
                    }
                    require(item.depth == map.getValue(item.parent).depth!! + 1) {
                        "菜单层级与父级不一致：${item.id}"
                    }
                }
            }
            return FeatureNavigationCatalog(map, rootRoutes)
        }
    }
}
