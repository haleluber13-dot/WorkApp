package com.olakai.app.ui.components

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.olakai.app.data.model.CamKind
import com.olakai.app.ui.theme.Ocean
import com.olakai.app.ui.wall.CamTile

/**
 * One cell of the wall.
 *
 * [live] decides whether this tile actually holds a decoder. Tiles past the
 * device's budget render a still card instead, so a wall of fifty cams costs
 * the same as a wall of four.
 */
@Composable
fun CamTileView(
    tile: CamTile,
    live: Boolean,
    selected: Boolean,
    useFeet: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val borderAlpha by animateFloatAsState(
        targetValue = if (selected) 0.9f else 0.10f,
        label = "tileBorder",
    )

    Box(
        modifier
            .aspectRatio(16f / 10f)
            .clip(RoundedCornerShape(16.dp))
            .background(Ocean.Ink)
            .border(
                width = if (selected) 2.dp else 1.dp,
                color = Ocean.Aqua.copy(alpha = borderAlpha),
                shape = RoundedCornerShape(16.dp),
            )
            .clickable(onClick = onClick),
    ) {
        when {
            tile.isOperatorLink -> OperatorCard(tile)
            live -> when (tile.cam.kind) {
                CamKind.YOUTUBE -> YouTubeLive(tile.cam, Modifier.fillMaxSize())
                CamKind.HLS -> HlsLive(tile.cam, Modifier.fillMaxSize())
                else -> StillFrame(tile)
            }
            else -> StillFrame(tile)
        }

        // Legibility scrim -- cam feeds are bright and captions sit on top.
        Box(
            Modifier
                .fillMaxSize()
                .background(
                    // Light at the top, clear through the middle so the wave is
                    // never dimmed, and only dark enough at the base to carry
                    // the caption.
                    Brush.verticalGradient(
                        0f to Color(0x59000000),
                        0.28f to Color(0x00000000),
                        0.72f to Color(0x40000000),
                        1f to Color(0xB3000814),
                    ),
                ),
        )

        Row(
            Modifier
                .align(Alignment.TopStart)
                .padding(8.dp),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            when {
                tile.isOperatorLink -> Tag("${tile.cam.provider.substringBefore(' ')} ↗", color = Ocean.Aqua)
                live -> LiveDot()
                else -> Tag("PAUSED", color = Ocean.Slate)
            }
            ScoreBadge(tile.conditions, compact = true)
        }

        Column(
            Modifier
                .align(Alignment.BottomStart)
                .fillMaxWidth()
                .padding(horizontal = 10.dp, vertical = 9.dp),
        ) {
            Text(
                tile.spot.name,
                color = Ocean.Foam,
                fontWeight = FontWeight.Black,
                fontSize = 15.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                tile.spot.subtitle,
                color = Ocean.Slate,
                fontSize = 11.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Spacer(Modifier.height(2.dp))
            Text(
                tile.conditions.summaryLine(useFeet),
                color = Ocean.Aqua,
                fontSize = 11.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

/**
 * A cam we may link to but not embed. Says so plainly, so nobody sits waiting
 * for video that is never going to start.
 */
@Composable
private fun OperatorCard(tile: CamTile) {
    Column(
        Modifier
            .fillMaxSize()
            .background(Brush.linearGradient(listOf(Color(0xFF0A3550), Color(0xFF0E5273))))
            // The caption sits over the bottom of every tile; keep clear of it.
            .padding(start = 16.dp, end = 16.dp, top = 26.dp, bottom = 62.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            tile.cam.title.substringAfter("— ", tile.cam.title),
            color = Ocean.Foam,
            fontWeight = FontWeight.Black,
            fontSize = 15.sp,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
            textAlign = androidx.compose.ui.text.style.TextAlign.Center,
        )
        Spacer(Modifier.height(6.dp))
        Text(
            "Live at ${tile.cam.provider} · tap to watch",
            color = Ocean.Aqua,
            fontSize = 11.sp,
            fontWeight = FontWeight.SemiBold,
            textAlign = androidx.compose.ui.text.style.TextAlign.Center,
        )
    }
}

/** What a tile shows when it is not holding a live decoder. */
@Composable
private fun StillFrame(tile: CamTile) {
    Box(Modifier.fillMaxSize()) {
        val thumb = tile.cam.thumbnailUrl
        if (thumb != null) {
            AsyncImage(
                model = thumb,
                contentDescription = tile.spot.name,
                modifier = Modifier.fillMaxSize(),
                contentScale = androidx.compose.ui.layout.ContentScale.Crop,
            )
        } else {
            // No poster available -- an ocean gradient beats a grey rectangle.
            Box(
                Modifier
                    .fillMaxSize()
                    .background(
                        Brush.linearGradient(
                            listOf(Ocean.Deep, Ocean.Mid, Ocean.Shallow),
                        ),
                    ),
            )
        }
        Box(
            Modifier
                .align(Alignment.Center)
                .size(42.dp)
                .clip(RoundedCornerShape(21.dp))
                .background(Color(0x99021018)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                Icons.Filled.PlayArrow,
                contentDescription = "Go live",
                tint = Ocean.Foam,
                modifier = Modifier.size(24.dp),
            )
        }
    }
}
