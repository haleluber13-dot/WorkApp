plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.workapp.phoneguard"
    compileSdk = 35
    buildToolsVersion = "35.0.0"

    defaultConfig {
        applicationId = "com.workapp.phoneguard"
        minSdk = 29
        targetSdk = 35
        versionCode = 2
        versionName = "2.0"
    }

    // Release signing comes from a keystore you keep private. Pass it with
    //   -PpgStoreFile=... -PpgStorePassword=... -PpgKeyAlias=... -PpgKeyPassword=...
    // (or the PG_* environment variables). Without it the release build is
    // signed with the debug key so it still installs.
    val storeFilePath = (findProperty("pgStoreFile") ?: System.getenv("PG_STORE_FILE")) as String?
    signingConfigs {
        if (storeFilePath != null) {
            create("release") {
                storeFile = file(storeFilePath)
                storePassword = (findProperty("pgStorePassword") ?: System.getenv("PG_STORE_PASSWORD")) as String?
                keyAlias = (findProperty("pgKeyAlias") ?: System.getenv("PG_KEY_ALIAS")) as String?
                keyPassword = (findProperty("pgKeyPassword") ?: System.getenv("PG_KEY_PASSWORD")) as String?
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"))
            signingConfig = signingConfigs.findByName("release") ?: signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    testOptions {
        unitTests.isReturnDefaultValues = true
    }
    lint {
        abortOnError = false
    }
}

dependencies {
    testImplementation("junit:junit:4.13.2")
}
