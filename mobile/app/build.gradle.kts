plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.jetbrains.kotlin.android)
    alias(libs.plugins.ksp)
}

android {
    namespace = "com.zapp.swapmanager"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.zapp.swapmanager"
        minSdk = 26
        targetSdk = 34
        versionCode = 13
        versionName = "0.3.3-beta.1"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        vectorDrawables {
            useSupportLibrary = true
        }
    }

    signingConfigs {
        create("release") {
            val keystorePath = (project.findProperty("KEYSTORE_PATH") as? String)
                ?: System.getenv("KEYSTORE_PATH")
                ?: (rootProject.file("zapp-release.keystore").takeIf { it.exists() }?.absolutePath)

            if (keystorePath != null && file(keystorePath).exists()) {
                storeFile = file(keystorePath)
                storePassword = (project.findProperty("KEYSTORE_PASSWORD") as? String)
                    ?: System.getenv("KEYSTORE_PASSWORD")
                    ?: "zappswapmanager"
                keyAlias = (project.findProperty("KEY_ALIAS") as? String)
                    ?: System.getenv("KEY_ALIAS")
                    ?: "zapp"
                keyPassword = (project.findProperty("KEY_PASSWORD") as? String)
                    ?: System.getenv("KEY_PASSWORD")
                    ?: "zappswapmanager"
            } else {
                val debugKeystore = rootProject.file("app/build/debug.keystore")
                val userDebug = file("${System.getProperty("user.home")}/.android/debug.keystore")
                val fallbackFile = if (userDebug.exists()) userDebug else debugKeystore
                if (!fallbackFile.exists()) {
                    fallbackFile.parentFile?.mkdirs()
                    try {
                        val keytoolPath = org.gradle.internal.jvm.Jvm.current().javaHome.resolve("bin/keytool").absolutePath
                        ProcessBuilder(
                            keytoolPath, "-genkeypair", "-v",
                            "-keystore", fallbackFile.absolutePath,
                            "-alias", "androiddebugkey",
                            "-keyalg", "RSA",
                            "-keysize", "2048",
                            "-validity", "10000",
                            "-storepass", "android",
                            "-keypass", "android",
                            "-dname", "CN=Android Debug,O=Android,C=US"
                        ).start().waitFor()
                    } catch (_: Exception) {}
                }
                storeFile = fallbackFile
                storePassword = "android"
                keyAlias = "androiddebugkey"
                keyPassword = "android"
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("release")
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    buildFeatures {
        compose = true
    }
    composeOptions {
        kotlinCompilerExtensionVersion = "1.5.14"
    }
    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.ui)
    implementation(libs.androidx.ui.graphics)
    implementation(libs.androidx.ui.tooling.preview)
    implementation(libs.androidx.material3)
    implementation(libs.androidx.material.icons.extended)

    // Room Database
    implementation(libs.androidx.room.runtime)
    implementation(libs.androidx.room.ktx)
    ksp(libs.androidx.room.compiler)

    // WorkManager
    implementation(libs.androidx.work.runtime.ktx)

    // Retrofit & OkHttp
    implementation(libs.retrofit)
    implementation(libs.retrofit.converter.gson)
    implementation(libs.okhttp.logging)

    // Testing
    testImplementation(libs.junit)
    testImplementation(libs.kotlinx.coroutines.test)
}
