pluginManagement {
    repositories { google(); mavenCentral(); gradlePluginPortal() }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google(); mavenCentral()
        // Optional offline fallback for environments where Maven Central rate-limits downloads.
        System.getenv("LIFEMAP_M2")?.let { dir -> if (File(dir).isDirectory) maven { url = File(dir).toURI() } }
    }
}
rootProject.name = "LifeMap"
include(":app")
