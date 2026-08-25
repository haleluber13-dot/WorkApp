package com.workapp.hafaka.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import com.workapp.hafaka.model.ThemeChoice

/** Brand tint, shared with the web and iOS clients. */
val Tint = Color(0xFFF5A524)
val TintInk = Color(0xFF1A1206)

private val Light = lightColorScheme(
    primary = Tint,
    onPrimary = TintInk,
    secondary = Tint,
    background = Color(0xFFF2F2F7),
    onBackground = Color(0xFF000000),
    surface = Color(0xFFFFFFFF),
    onSurface = Color(0xFF000000),
    surfaceVariant = Color(0xFFE9E9EF),
    onSurfaceVariant = Color(0xFF5C5C61),
    outlineVariant = Color(0x2E3C3C43),
    error = Color(0xFFEC0D00),
)

private val Dark = darkColorScheme(
    primary = Tint,
    onPrimary = TintInk,
    secondary = Tint,
    background = Color(0xFF000000),
    onBackground = Color(0xFFFFFFFF),
    surface = Color(0xFF1C1C1E),
    onSurface = Color(0xFFFFFFFF),
    surfaceVariant = Color(0xFF2C2C2E),
    onSurfaceVariant = Color(0xFF9E9EA4),
    outlineVariant = Color(0x805C5C61),
    error = Color(0xFFFF453A),
)

/** Parse "#RRGGBB" from the department palette. */
fun colorOf(hex: String): Color =
    Color(hex.removePrefix("#").toLong(16) or 0xFF000000L)

/**
 * Readable ink on a coloured fill.
 *
 * The department palette runs from very dark to the very light lighting
 * yellow, so a fixed white is unreadable on part of it. Relative luminance
 * per WCAG, picking whichever of white / near-black contrasts better.
 */
fun inkOn(hex: String): Color {
    val v = hex.removePrefix("#").toLong(16)
    fun lin(c: Double) = if (c <= 0.03928) c / 12.92 else Math.pow((c + 0.055) / 1.055, 2.4)
    val r = lin(((v shr 16) and 0xFF) / 255.0)
    val g = lin(((v shr 8) and 0xFF) / 255.0)
    val b = lin((v and 0xFF) / 255.0)
    val l = 0.2126 * r + 0.7152 * g + 0.0722 * b
    return if ((1.05 / (l + 0.05)) >= ((l + 0.05) / 0.10)) Color.White else Color(0xFF141414)
}

private val AppTypography = Typography(
    headlineLarge = Typography().headlineLarge.copy(fontWeight = FontWeight.ExtraBold),
    titleLarge = Typography().titleLarge.copy(fontWeight = FontWeight.Bold),
    labelSmall = Typography().labelSmall.copy(fontSize = 11.sp),
)

@Composable
fun WorkAppTheme(choice: ThemeChoice, content: @Composable () -> Unit) {
    val dark = when (choice) {
        ThemeChoice.AUTO -> isSystemInDarkTheme()
        ThemeChoice.LIGHT -> false
        ThemeChoice.DARK -> true
    }
    MaterialTheme(
        colorScheme = if (dark) Dark else Light,
        typography = AppTypography,
    ) {
        // The app is Hebrew-only. Pin the direction rather than inheriting the
        // device language: a crew member with an English phone should still see
        // the layout the sheets were designed for.
        CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
            content()
        }
    }
}
