package com.olakai.app.ui.atlas

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.olakai.app.data.catalog.LandOutline
import com.olakai.app.data.catalog.WorldMapRepository
import com.olakai.app.data.model.Conditions
import com.olakai.app.data.model.Spot
import com.olakai.app.ui.theme.Ocean
import com.olakai.app.ui.theme.scoreColor
import kotlin.math.abs

/**
 * Every spot on one map, coloured by how it is right now.
 *
 * Drawn on a Canvas from a bundled coastline file rather than a map SDK: no API
 * key, no tile downloads, and it still works with no connection.
 */
@Composable
fun AtlasScreen(
    spots: List<Spot>,
    conditions: Map<String, Conditions>,
    onSelect: (Spot) -> Unit,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val repo = remember { WorldMapRepository(context) }
    var land by remember { mutableStateOf(LandOutline()) }
    LaunchedEffect(Unit) { land = repo.land() }

    var scale by remember { mutableFloatStateOf(1f) }
    var offset by remember { mutableStateOf(Offset.Zero) }
    var canvasSize by remember { mutableStateOf(Size.Zero) }

    Column(modifier.fillMaxSize()) {
        Text(
            "Atlas",
            color = Ocean.Foam,
            fontWeight = FontWeight.Black,
            fontSize = 22.sp,
            modifier = Modifier.padding(start = 16.dp, top = 12.dp),
        )
        Text(
            "Pinch to zoom · tap a pin to open the spot",
            color = Ocean.Slate,
            fontSize = 11.sp,
            modifier = Modifier.padding(start = 16.dp, bottom = 8.dp),
        )

        Box(
            Modifier
                .fillMaxSize()
                .background(Brush.verticalGradient(listOf(Ocean.Abyss, Ocean.Deep)))
                .pointerInput(Unit) {
                    detectTransformGestures { _, pan, zoom, _ ->
                        scale = (scale * zoom).coerceIn(1f, 8f)
                        offset += pan
                    }
                }
                .pointerInput(spots, scale, offset, canvasSize) {
                    detectTapGestures { tap ->
                        val nearest = spots.minByOrNull { spot ->
                            val p = project(spot.lon, spot.lat, canvasSize, scale, offset)
                            abs(p.x - tap.x) + abs(p.y - tap.y)
                        } ?: return@detectTapGestures
                        val p = project(nearest.lon, nearest.lat, canvasSize, scale, offset)
                        // Only a tap that lands near the pin counts as a hit.
                        if (abs(p.x - tap.x) < 36f && abs(p.y - tap.y) < 36f) onSelect(nearest)
                    }
                },
        ) {
            Canvas(Modifier.fillMaxSize()) {
                canvasSize = size
                drawLand(land, scale, offset)
                spots.forEach { spot ->
                    val point = project(spot.lon, spot.lat, size, scale, offset)
                    if (point.x < -20f || point.x > size.width + 20f) return@forEach
                    val score = conditions[spot.id]?.score ?: 0
                    val color = scoreColor(score)
                    val radius = (3.5f + score / 22f) * scale.coerceAtMost(2.2f)
                    drawCircle(color.copy(alpha = 0.22f), radius * 2.4f, point)
                    drawCircle(color, radius, point)
                    if (spot.hasLiveCam) drawCircle(Ocean.Foam, radius * 0.36f, point)
                }
            }
        }
    }
}

/** Equirectangular: lon -180..180 across the width, lat 90..-90 down the height. */
private fun project(lon: Double, lat: Double, size: Size, scale: Float, offset: Offset): Offset {
    if (size.width <= 0f) return Offset(-1000f, -1000f)
    val x = ((lon + 180.0) / 360.0).toFloat() * size.width
    val y = ((90.0 - lat) / 180.0).toFloat() * size.height
    val cx = size.width / 2f
    val cy = size.height / 2f
    return Offset((x - cx) * scale + cx + offset.x, (y - cy) * scale + cy + offset.y)
}

private fun DrawScope.drawLand(land: LandOutline, scale: Float, offset: Offset) {
    if (land.polygons.isEmpty()) return
    val fill = Color(0xFF0E2B41)
    val stroke = Color(0x552BE3C6)
    land.polygons.forEach { ring ->
        val path = Path()
        ring.forEachIndexed { index, point ->
            val p = project(point[0], point[1], size, scale, offset)
            if (index == 0) path.moveTo(p.x, p.y) else path.lineTo(p.x, p.y)
        }
        path.close()
        drawPath(path, fill)
        drawPath(path, stroke, style = Stroke(width = 1f))
    }
}
