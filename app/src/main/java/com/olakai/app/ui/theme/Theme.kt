package com.olakai.app.ui.theme

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import androidx.core.view.WindowCompat

private val SurfDarkColors = darkColorScheme(
    primary = Ocean.Aqua,
    onPrimary = Ocean.Ink,
    primaryContainer = Ocean.Mid,
    onPrimaryContainer = Ocean.Foam,
    secondary = Ocean.Coral,
    onSecondary = Ocean.Ink,
    tertiary = Ocean.Sunset,
    background = Ocean.Abyss,
    onBackground = Ocean.Foam,
    surface = Ocean.Deep,
    onSurface = Ocean.Foam,
    surfaceVariant = Ocean.Mid,
    onSurfaceVariant = Ocean.Slate,
    outline = Color(0x33FFFFFF),
    error = Ocean.Coral,
)

// The app is night-first -- a light scheme exists so system light mode is not broken.
private val SurfLightColors = lightColorScheme(
    primary = Ocean.AquaDim,
    onPrimary = Color.White,
    secondary = Ocean.Coral,
    background = Color(0xFFF3F8FB),
    onBackground = Ocean.Abyss,
    surface = Color.White,
    onSurface = Ocean.Abyss,
    surfaceVariant = Color(0xFFDCE9F0),
    onSurfaceVariant = Color(0xFF4A6474),
)

private val SurfTypography = Typography().run {
    val display = FontFamily.SansSerif
    copy(
        displayLarge = displayLarge.copy(fontFamily = display, fontWeight = FontWeight.Black, letterSpacing = (-1).sp),
        displayMedium = displayMedium.copy(fontFamily = display, fontWeight = FontWeight.Black, letterSpacing = (-0.5).sp),
        headlineLarge = headlineLarge.copy(fontFamily = display, fontWeight = FontWeight.ExtraBold),
        headlineMedium = headlineMedium.copy(fontFamily = display, fontWeight = FontWeight.ExtraBold),
        headlineSmall = headlineSmall.copy(fontFamily = display, fontWeight = FontWeight.Bold),
        titleLarge = titleLarge.copy(fontFamily = display, fontWeight = FontWeight.Bold),
        titleMedium = titleMedium.copy(fontFamily = display, fontWeight = FontWeight.SemiBold),
        labelLarge = labelLarge.copy(fontWeight = FontWeight.Bold, letterSpacing = 0.6.sp),
        labelMedium = labelMedium.copy(fontWeight = FontWeight.Bold, letterSpacing = 0.8.sp),
        labelSmall = labelSmall.copy(fontWeight = FontWeight.Bold, letterSpacing = 1.2.sp),
    )
}

private fun Context.findActivity(): Activity? {
    var context: Context? = this
    while (context is ContextWrapper) {
        if (context is Activity) return context
        context = context.baseContext
    }
    return null
}

@Composable
fun OlaKaiTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    val colors = if (darkTheme) SurfDarkColors else SurfLightColors
    val activity = LocalContext.current.findActivity()

    SideEffect {
        activity?.window?.let { window ->
            WindowCompat.getInsetsController(window, window.decorView)
                .isAppearanceLightStatusBars = !darkTheme
        }
    }

    MaterialTheme(
        colorScheme = colors,
        typography = SurfTypography,
        content = content,
    )
}
