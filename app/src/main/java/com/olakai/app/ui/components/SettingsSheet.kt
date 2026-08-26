package com.olakai.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.olakai.app.ui.theme.Ocean
import kotlin.math.roundToInt

/**
 * The two settings that actually change how the app behaves day to day: what
 * units the readings are in, and how many cams may decode at once.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsSheet(
    useFeet: Boolean,
    liveBudget: Int,
    camCount: Int,
    spotCount: Int,
    onUseFeet: (Boolean) -> Unit,
    onLiveBudget: (Int) -> Unit,
    onDismiss: () -> Unit,
) {
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = Ocean.Deep,
        contentColor = Ocean.Foam,
    ) {
        Column(Modifier.padding(horizontal = 20.dp).padding(bottom = 32.dp)) {
            Text("Settings", fontWeight = FontWeight.Black, fontSize = 20.sp, color = Ocean.Foam)
            Spacer(Modifier.height(18.dp))

            SectionLabel("Wave height")
            Spacer(Modifier.height(8.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                UnitChip("Metres", !useFeet) { onUseFeet(false) }
                UnitChip("Feet", useFeet) { onUseFeet(true) }
            }

            Spacer(Modifier.height(22.dp))

            SectionLabel("Cams playing at once")
            Spacer(Modifier.height(4.dp))
            Text(
                "$liveBudget of $camCount. Every extra stream is another video " +
                    "decoder — turn it down if the wall stutters, up if your " +
                    "phone can take it.",
                color = Ocean.Slate,
                fontSize = 12.sp,
                lineHeight = 17.sp,
            )
            Slider(
                value = liveBudget.toFloat(),
                onValueChange = { onLiveBudget(it.roundToInt()) },
                valueRange = 1f..12f,
                steps = 10,
                colors = SliderDefaults.colors(
                    thumbColor = Ocean.Aqua,
                    activeTrackColor = Ocean.Aqua,
                    inactiveTrackColor = Color(0x33FFFFFF),
                ),
            )

            Spacer(Modifier.height(14.dp))
            Text(
                "$spotCount spots · $camCount live cams. Spots without an " +
                    "embeddable cam still carry live conditions, the full " +
                    "write-up and travel options.",
                color = Ocean.Slate,
                fontSize = 11.sp,
                lineHeight = 16.sp,
            )
            Spacer(Modifier.height(10.dp))
            Text(
                "Conditions from Open-Meteo. Cams belong to their operators and " +
                    "play in YouTube's own player.",
                color = Ocean.Slate.copy(alpha = 0.7f),
                fontSize = 10.sp,
                lineHeight = 15.sp,
            )
        }
    }
}

@Composable
private fun UnitChip(label: String, selected: Boolean, onClick: () -> Unit) {
    Text(
        label,
        modifier = Modifier
            .clip(RoundedCornerShape(10.dp))
            .background(if (selected) Ocean.Aqua.copy(alpha = 0.22f) else Color(0x14FFFFFF))
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 9.dp),
        color = if (selected) Ocean.Aqua else Ocean.Slate,
        fontWeight = FontWeight.Bold,
        fontSize = 13.sp,
    )
}
