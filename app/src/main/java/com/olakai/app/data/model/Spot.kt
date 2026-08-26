package com.olakai.app.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/** How a cam's video actually gets on screen. */
@Serializable
enum class CamKind {
    /** Direct HLS (.m3u8) pulled by ExoPlayer -- cheapest to run many at once. */
    @SerialName("hls") HLS,

    /** YouTube live, shown in the official embedded player (their terms require it). */
    @SerialName("youtube") YOUTUBE,

    /** Still image refreshed on an interval -- some coastal cams only offer this. */
    @SerialName("still") STILL,

    /** No embeddable feed. We link out to the operator instead of faking a stream. */
    @SerialName("external") EXTERNAL,
}

@Serializable
data class Cam(
    val id: String,
    val title: String,
    val kind: CamKind,
    /**
     * HLS -> .m3u8 URL.
     * YOUTUBE -> a channel id (UC...) preferred, or a video id; a channel id keeps
     *            working when the operator restarts the broadcast.
     * STILL -> image URL.
     * EXTERNAL -> web page URL.
     */
    val source: String,
    val provider: String = "",
    val attribution: String = "",
    val pageUrl: String = "",
    /** Set when [source] is a channel id rather than a single video id. */
    val isChannel: Boolean = false,
    /** Cams the operator streams around the clock sort to the front of the wall. */
    val roundTheClock: Boolean = true,
) {
    val youTubeEmbedUrl: String
        get() = if (isChannel) {
            "https://www.youtube.com/embed/live_stream?channel=$source"
        } else {
            "https://www.youtube.com/embed/$source"
        }

    val youTubeWatchUrl: String
        get() = if (isChannel) {
            "https://www.youtube.com/channel/$source/live"
        } else {
            "https://www.youtube.com/watch?v=$source"
        }

    /** Poster frame for a tile that is not currently holding a live decoder. */
    val thumbnailUrl: String?
        get() = when (kind) {
            CamKind.YOUTUBE ->
                if (isChannel) null else "https://i.ytimg.com/vi/$source/hqdefault.jpg"
            CamKind.STILL -> source
            else -> null
        }

    val isLiveVideo: Boolean get() = kind == CamKind.HLS || kind == CamKind.YOUTUBE
}

/** Everything the side panel says about a place. */
@Serializable
data class SpotInfo(
    val about: String,
    val breakType: String,
    val bottom: String,
    val wave: String,
    val level: String,
    val bestSwell: String,
    val bestWind: String,
    val bestTide: String,
    val bestSeason: String,
    val waterTemp: String,
    val crowd: String,
    val hazards: List<String> = emptyList(),
    val localTip: String = "",
)

/** Getting there: which airport, and what happens after you land. */
@Serializable
data class Access(
    /** IATA codes, nearest/most useful first. */
    val airports: List<String>,
    val transfer: String,
    val transferMinutes: Int,
    val visaNote: String = "",
)

@Serializable
data class Spot(
    val id: String,
    val name: String,
    val region: String,
    val country: String,
    val countryCode: String,
    val lat: Double,
    val lon: Double,
    val timezone: String,
    val tags: List<String> = emptyList(),
    val info: SpotInfo,
    val access: Access,
    val cams: List<Cam> = emptyList(),
    /** Operator pages worth opening when we have no embeddable feed. */
    val externalCams: List<Cam> = emptyList(),
) {
    val title: String get() = name
    val subtitle: String get() = "$region, $country"
    val hasLiveCam: Boolean get() = cams.any { it.isLiveVideo }
    val primaryAirport: String? get() = access.airports.firstOrNull()
}

@Serializable
data class SpotCatalog(
    val version: Int = 1,
    @SerialName("updated") val updatedIso: String = "",
    val spots: List<Spot> = emptyList(),
)
