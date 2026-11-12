import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
}

android {
    namespace = "ai.deepseek.harness.mobile"
    compileSdk = 37

    defaultConfig {
        applicationId = "ai.deepseek.harness.mobile"
        minSdk = 36
        targetSdk = 37
        versionCode = 1
        versionName = "0.1.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_21
        targetCompatibility = JavaVersion.VERSION_21
    }
    // 777 运行时由独立工作流预先构建、验签和核对哈希；UI-only 构建无需重复获取 Node。
    // 只有显式传入完整 payload 目录时才打包，缺失会在配置阶段直接失败。
    val embeddedNode = System.getenv("DSH333_NODE_RUNTIME_DIR")?.takeIf { it.isNotBlank() }
    if (embeddedNode != null) {
        check(file("$embeddedNode/jniLibs/arm64-v8a/libdsh_node.so").isFile) {
            "指定的 Android Node payload 不包含可执行文件：$embeddedNode"
        }
        check(file("$embeddedNode/assets/runtime/node/integrity-manifest.json").isFile) {
            "指定的 Android Node payload 未通过 integrity-manifest 输出：$embeddedNode"
        }
        sourceSets.getByName("main").jniLibs.srcDir(file("$embeddedNode/jniLibs"))
        sourceSets.getByName("main").assets.srcDir(file("$embeddedNode/assets"))
    }
    buildFeatures { compose = true }
    packaging { jniLibs.useLegacyPackaging = true }
}
kotlin { compilerOptions { jvmTarget.set(JvmTarget.JVM_21) } }

dependencies {
    implementation(libs.activity.compose)
    implementation(platform(libs.compose.bom))
    implementation(libs.compose.ui)
    implementation(libs.compose.material3)
    implementation(libs.compose.icons)
    implementation(libs.lifecycle.viewmodel.compose)
    implementation(libs.lifecycle.viewmodel.ktx)
    implementation(libs.coroutines.android)
    implementation(libs.serialization.json)
    implementation(libs.okhttp)
    debugImplementation(libs.compose.tooling)
    implementation(libs.compose.tooling.preview)
    testImplementation(libs.junit)
    testImplementation(libs.mockwebserver)
}
