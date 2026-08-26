package com.olakai.app.ui.theme

import androidx.compose.ui.graphics.Color

/**
 * Palette: looking down through clear water at a reef, with the sun on it.
 * Deep blues carry the UI, aqua marks anything live, coral marks anything urgent.
 */
object Ocean {
    val Abyss = Color(0xFF03101C)
    val Deep = Color(0xFF07223A)
    val Mid = Color(0xFF0B3557)
    val Shallow = Color(0xFF10547F)
    val Aqua = Color(0xFF2BE3C6)
    val AquaDim = Color(0xFF1AA795)
    val Foam = Color(0xFFE8FBF7)
    val Sand = Color(0xFFF3E2C0)
    val Coral = Color(0xFFFF7A5A)
    val Sunset = Color(0xFFFFB35C)
    val Dusk = Color(0xFF6C5CE7)
    val Slate = Color(0xFF9FB6C6)
    val Ink = Color(0xFF00080F)
}

/** Colour for a 0-100 conditions score. */
fun scoreColor(score: Int): Color = when {
    score >= 85 -> Ocean.Aqua
    score >= 70 -> Color(0xFF63D8A4)
    score >= 55 -> Ocean.Sunset
    score >= 40 -> Color(0xFFE9A23B)
    score >= 20 -> Ocean.Coral
    else -> Ocean.Slate
}
