package com.olakai.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.olakai.app.data.model.Conditions
import com.olakai.app.ui.theme.Ocean
import com.olakai.app.ui.theme.scoreColor

/** The pulsing red dot every viewer already knows means "this is happening now". */
@Composable
fun LiveDot(modifier: Modifier = Modifier, label: String = "LIVE") {
    Row(
        modifier = modifier
            .clip(RoundedCornerShape(6.dp))
            .background(Color(0xCC1B0F12))
            .padding(horizontal = 7.dp, vertical = 3.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(5.dp),
    ) {
        Box(
            Modifier
                .size(7.dp)
                .clip(CircleShape)
                .background(Ocean.Coral),
        )
        Text(
            label,
            color = Color.White,
            fontSize = 9.sp,
            fontWeight = FontWeight.Black,
            letterSpacing = 1.sp,
        )
    }
}

/** Conditions score as a compact badge: number, verdict, colour. */
@Composable
fun ScoreBadge(conditions: Conditions?, modifier: Modifier = Modifier, compact: Boolean = false) {
    val score = conditions?.score ?: 0
    val color = scoreColor(score)
    Row(
        modifier = modifier
            .clip(RoundedCornerShape(8.dp))
            .background(Color(0xB3021018))
            .border(1.dp, color.copy(alpha = 0.45f), RoundedCornerShape(8.dp))
            .padding(horizontal = 8.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Text(
            if (conditions == null) "–" else "$score",
            color = color,
            fontWeight = FontWeight.Black,
            fontSize = if (compact) 13.sp else 16.sp,
        )
        if (!compact) {
            Text(
                conditions?.verdict ?: "No data",
                color = Ocean.Foam.copy(alpha = 0.85f),
                fontSize = 11.sp,
                fontWeight = FontWeight.SemiBold,
            )
        }
    }
}

/** One labelled reading, e.g. "1.8 m" over "SWELL". */
@Composable
fun Metric(
    value: String,
    label: String,
    modifier: Modifier = Modifier,
    color: Color = Ocean.Foam,
) {
    Column(modifier) {
        Text(value, color = color, fontWeight = FontWeight.Bold, fontSize = 15.sp)
        Text(
            label,
            color = Ocean.Slate,
            fontSize = 9.sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = 1.sp,
        )
    }
}

@Composable
fun Tag(text: String, modifier: Modifier = Modifier, color: Color = Ocean.Aqua) {
    Text(
        text.uppercase(),
        modifier = modifier
            .clip(RoundedCornerShape(6.dp))
            .background(color.copy(alpha = 0.14f))
            .padding(horizontal = 7.dp, vertical = 3.dp),
        color = color,
        fontSize = 9.sp,
        fontWeight = FontWeight.Black,
        letterSpacing = 0.8.sp,
    )
}

/** Translucent panel used for anything floating over video or the map. */
@Composable
fun GlassPanel(
    modifier: Modifier = Modifier,
    corner: Int = 20,
    content: @Composable () -> Unit,
) {
    Box(
        modifier
            .clip(RoundedCornerShape(corner.dp))
            .background(
                Brush.verticalGradient(
                    listOf(Color(0xF20A2137), Color(0xF2061726)),
                ),
            )
            .border(1.dp, Color(0x1FFFFFFF), RoundedCornerShape(corner.dp)),
    ) { content() }
}

@Composable
fun SectionLabel(text: String, modifier: Modifier = Modifier) {
    Text(
        text.uppercase(),
        modifier = modifier,
        color = Ocean.Aqua,
        fontSize = 10.sp,
        fontWeight = FontWeight.Black,
        letterSpacing = 1.6.sp,
        style = MaterialTheme.typography.labelSmall,
    )
}
