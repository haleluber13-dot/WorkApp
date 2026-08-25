package com.workapp.hafaka.data

import kotlinx.serialization.json.Json

/**
 * One JSON configuration for persistence, sync and backup restore.
 *
 * `ignoreUnknownKeys` matters: the web client persists a `meta` block this
 * client has no use for, and a backup taken there must still restore here.
 * `explicitNulls = false` keeps cleared catering counts from being written
 * back as nulls.
 */
val AppJson = Json {
    ignoreUnknownKeys = true
    isLenient = true
    coerceInputValues = true
    encodeDefaults = true
    explicitNulls = false
}
