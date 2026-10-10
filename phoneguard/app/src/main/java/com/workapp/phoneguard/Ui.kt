package com.workapp.phoneguard

import android.content.Context
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.Switch
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
    minHeight = dp(44)
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

fun Context.sectionTitle(text: String): TextView = label(text, 18f, bold = true)

/** A thin line between groups inside a card. */
fun Context.divider(): View = View(this).apply {
    setBackgroundColor(C.LINE)
    layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(1))
}

/** A rounded filter/option chip, big enough to hit with a thumb. */
fun Context.chip(text: String, selected: Boolean, onClick: (View) -> Unit): TextView =
    label(text, 14f, C.TEXT, bold = true).apply {
        gravity = Gravity.CENTER
        minHeight = dp(44)
        setPadding(dp(16), dp(8), dp(16), dp(8))
        isClickable = true
        isFocusable = true
        setOnClickListener(onClick)
        setChipSelected(selected)
    }

fun TextView.setChipSelected(selected: Boolean) {
    setTextColor(if (selected) C.ON_ACCENT else C.TEXT)
    background = if (selected) context.rounded(C.GREEN, 22) else context.rounded(0, 22, C.LINE, 1.5)
}

/**
 * A title + explanation with a switch on the right. Tapping anywhere on the row
 * flips the switch, so it is easy to hit.
 */
fun Context.switchRow(
    title: String,
    sub: CharSequence?,
    checked: Boolean,
    onChange: (Boolean) -> Unit,
): LinearLayout {
    val r = row().apply { minimumHeight = dp(52) }
    val texts = column()
    texts.put(label(title, 16f, bold = true), if (sub.isNullOrEmpty()) 0 else 2)
    if (!sub.isNullOrEmpty()) texts.put(label(sub, 13f, C.SUB), 0)
    r.put(texts, 8, weight = 1f)
    val sw = Switch(this).apply { isChecked = checked }
    sw.setOnCheckedChangeListener { _, on -> onChange(on) }
    r.put(sw, 0, wrap = true)
    r.isClickable = true
    r.setOnClickListener { sw.toggle() }
    return r
}

/** One choice in a list of options; [selected] shows a filled dot. */
fun Context.radioRow(title: String, sub: String?, selected: Boolean, onClick: () -> Unit): LinearLayout {
    val r = row().apply {
        minimumHeight = dp(52)
        setPadding(dp(4), dp(8), dp(4), dp(8))
        isClickable = true
        isFocusable = true
        setOnClickListener { onClick() }
    }
    val dot = View(this).apply {
        background = if (selected) rounded(C.GREEN, 11, C.CARD, 5) else rounded(0, 11, C.SUB, 2)
    }
    r.addView(dot, LinearLayout.LayoutParams(dp(22), dp(22)).apply { marginEnd = dp(14) })
    val texts = column()
    texts.put(label(title, 16f, if (selected) C.GREEN else C.TEXT, bold = true), if (sub == null) 0 else 2)
    if (sub != null) texts.put(label(sub, 13f, C.SUB), 0)
    r.addView(texts, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
    return r
}

/**
 * A setup step: a green tick when [done], an amber dot when not, or a blue arrow when
 * PhoneGuard can't tell ([done] = null). The button shows unless the step is done.
 */
fun Context.checkItem(
    done: Boolean?,
    title: String,
    sub: String?,
    action: String? = null,
    onAction: (() -> Unit)? = null,
): LinearLayout {
    val r = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
    val (mark, markColor) = when (done) {
        true -> "✓" to C.GREEN
        false -> "●" to C.AMBER
        null -> "›" to C.BLUE
    }
    r.addView(label(mark, 16f, markColor, bold = true).apply {
        gravity = Gravity.CENTER_HORIZONTAL
    }, LinearLayout.LayoutParams(dp(26), ViewGroup.LayoutParams.WRAP_CONTENT).apply { marginEnd = dp(8) })
    val texts = column()
    val showAction = action != null && onAction != null && done != true
    texts.put(label(title, 15f, if (done == true) C.SUB else C.TEXT, bold = done != true), if (sub != null || showAction) 2 else 0)
    if (sub != null) texts.put(label(sub, 13f, C.SUB), if (showAction) 8 else 0)
    if (showAction) texts.put(pill(action!!, C.GREEN, filled = false) { onAction!!() }, 0, wrap = true)
    r.addView(texts, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
    return r
}

/** A single-line text box in the app's style. */
fun Context.textBox(hint: String): EditText = EditText(this).apply {
    this.hint = hint
    setHintTextColor(C.SUB)
    setTextColor(C.TEXT)
    isSingleLine = true
    background = rounded(C.CARD2, 22)
    minHeight = dp(48)
    setPadding(dp(16), dp(10), dp(16), dp(10))
}
