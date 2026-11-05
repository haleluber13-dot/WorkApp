plugins {
    id("com.android.application")
}

android {
    namespace = "app.lifemap.kids"
    compileSdk = 34

    defaultConfig {
        applicationId = "app.lifemap.kids"
        minSdk = 24
        targetSdk = 34
        versionCode = 1
        versionName = "1.0"
    }

    // One key, checked into the repo, so every build installs over the previous one.
    // The app has no backend and no secrets, so this key protects nothing but update continuity.
    signingConfigs {
        create("release") {
            storeFile = file("../keystore/lifemap.jks")
            storePassword = "lifemap-kids"
            keyAlias = "lifemap"
            keyPassword = "lifemap-kids"
        }
    }
    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("release")
        }
        debug {
            signingConfig = signingConfigs.getByName("release")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    // The web app itself is the single source of truth: copy ../lifemap into the APK assets at build time.
    sourceSets.getByName("main").assets.srcDir(layout.buildDirectory.dir("generated/www"))
}

val syncWww = tasks.register<Sync>("syncWww") {
    from(rootProject.file("../lifemap")) {
        exclude("README.md", "tools/**", "data/CARDS_SCHEMA.md")
    }
    into(layout.buildDirectory.dir("generated/www/www"))
}
tasks.configureEach {
    if (name != "syncWww" && (name == "preBuild" || name.contains("Assets") || name.contains("Lint") || name.contains("lint"))) dependsOn(syncWww)
}

dependencies {
    implementation(platform("org.jetbrains.kotlin:kotlin-bom:1.8.22"))
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.webkit:webkit:1.11.0")
}
