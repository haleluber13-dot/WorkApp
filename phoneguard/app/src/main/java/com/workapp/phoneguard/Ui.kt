package com.workapp.phoneguard

import android.content.Context
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.TextView

object C {
    const val BG = 0xFF0E1621.toInt()
    const val CARD = 0xFF172333.toInt()
    const val CARD2 = 0xFF1F2E42.toInt()
    const val LINE = 0xFF2A3B52.toInt()
    const val TEXT = 0xFFE8EEF5.toInt()
    const val SUB = 0xFF8FA3B8.toInt()
    const val GREEN = 0xFF2ECC71.toInt()
    const val RED = 0xFFFF5252.toInt()
    const val AMBER = 0xFFFFB300.toInt()
    const val BLUE = 0xFF64B5F6.toInt()
    const val ON_ACCENT = 0xFF0E1621.toInt()
}

fun Context.dp(v: Number): Int =
    TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v.toFloat(), resources.displayMetrics).toInt()

fun Context.rounded(color: Int, radiusDp: Number = 14, strokeColor: Int = 0, strokeDp: Number = 0) =
    GradientDrawable().apply {
        setColor(color)
        cornerRadius = dp(radiusDp).toFloat()
        if (strokeColor != 0) setStroke(dp(strokeDp), strokeColor)
    }

fun Context.label(
    text: CharSequence,
    sizeSp: Float = 15f,
    color: Int = C.TEXT,
    bold: Boolean = false,
): TextView = TextView(this).apply {
    this.text = text
    setTextSize(TypedValue.COMPLEX_UNIT_SP, sizeSp)
    setTextColor(color)
    if (bold) typeface = Typeface.DEFAULT_BOLD
    setLineSpacing(0f, 1.15f)
}

/** A rounded, tappable button. Filled when [fill] is set, outlined otherwise. */
fun Context.pill(
    text: String,
    color: Int = C.GREEN,
    filled: Boolean = true,
    onClick: (View) -> Unit,
): TextView = label(text, 14f, if (filled) C.ON_ACCENT else color, bold = true).apply {
    gravity = Gravity.CENTER
    setPadding(dp(16), dp(10), dp(16), dp(10))
    background = if (filled) rounded(color, 22) else rounded(0, 22, color, 1.5)
    isClickable = true
    isFocusable = true
    setOnClickListener(onClick)
}

fun Context.column(): LinearLayout = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }

fun Context.row(): LinearLayout = LinearLayout(this).apply {
    orientation = LinearLayout.HORIZONTAL
    gravity = Gravity.CENTER_VERTICAL
}

fun Context.card(color: Int = C.CARD): LinearLayout = column().apply {
    background = rounded(color, 18)
    setPadding(dp(16), dp(16), dp(16), dp(16))
}

/** Adds [child] with a bottom margin, full width unless [wrap]. */
fun LinearLayout.put(child: View, bottomDp: Int = 12, wrap: Boolean = false, weight: Float = 0f): View {
    val w = if (wrap || weight > 0f) ViewGroup.LayoutParams.WRAP_CONTENT else ViewGroup.LayoutParams.MATCH_PARENT
    val lp = if (orientation == LinearLayout.HORIZONTAL) {
        LinearLayout.LayoutParams(if (weight > 0f) 0 else ViewGroup.LayoutParams.WRAP_CONTENT,
            ViewGroup.LayoutParams.WRAP_CONTENT, weight).apply { marginEnd = context.dp(bottomDp) }
    } else {
        LinearLayout.LayoutParams(w, ViewGroup.LayoutParams.WRAP_CONTENT, weight)
            .apply { bottomMargin = context.dp(bottomDp) }
    }
    addView(child, lp)
    return child
}

fun Context.bullet(text: String, color: Int = C.SUB): TextView = label("•  $text", 14f, color)
