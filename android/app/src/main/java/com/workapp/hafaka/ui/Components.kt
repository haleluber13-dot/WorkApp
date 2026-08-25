package com.workapp.hafaka.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.runtime.CompositionLocalProvider
import com.workapp.hafaka.model.RosterEntry

/** Initials on a department-coloured circle, with ink picked for contrast. */
@Composable
fun Avatar(name: String, size: Int = 40, hex: String = "#8E8E93") {
    val initials = name.trim().split(" ").filter { it.isNotBlank() }
        .take(2).mapNotNull { it.firstOrNull() }.joinToString("")
    Box(
        Modifier.size(size.dp).clip(CircleShape).background(colorOf(hex)),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            initials.ifBlank { "?" },
            color = inkOn(hex),
            fontSize = (size * 0.38).sp,
            fontWeight = FontWeight.Bold,
        )
    }
}

/** A small status pill — call status, counts, labels. */
@Composable
fun Pill(text: String, hex: String? = null) {
    Text(
        text,
        fontSize = 12.sp,
        fontWeight = FontWeight.SemiBold,
        color = hex?.let { inkOn(it) } ?: MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier
            .clip(CircleShape)
            .background(hex?.let { colorOf(it) } ?: MaterialTheme.colorScheme.surfaceVariant)
            .padding(horizontal = 9.dp, vertical = 3.dp),
    )
}

/** Digits keep dialling order inside an otherwise right-to-left layout. */
@Composable
fun LtrText(text: String, style: androidx.compose.ui.text.TextStyle = MaterialTheme.typography.bodySmall,
            color: Color = MaterialTheme.colorScheme.onSurfaceVariant) {
    CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
        Text(text, style = style, color = color)
    }
}

/** The grouped card that every list sits in. */
@Composable
fun Card(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    Column(
        modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp)
            .clip(RoundedCornerShape(14.dp))
            .background(MaterialTheme.colorScheme.surface),
        content = content,
    )
}

@Composable
fun SectionTitle(text: String, trailing: String? = null) {
    Row(
        Modifier.fillMaxWidth().padding(start = 20.dp, end = 20.dp, top = 18.dp, bottom = 7.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(text, style = MaterialTheme.typography.labelLarge,
             color = MaterialTheme.colorScheme.onSurfaceVariant)
        trailing?.let {
            Text(it, style = MaterialTheme.typography.labelLarge,
                 color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
fun RowDivider() {
    HorizontalDivider(
        Modifier.padding(start = 68.dp),
        thickness = 0.5.dp,
        color = MaterialTheme.colorScheme.outlineVariant,
    )
}

/** The quick-dial chip in the contact bar on the Today screen. */
@Composable
fun ContactChip(entry: RosterEntry, onClick: () -> Unit) {
    Column(
        Modifier.width(68.dp).clickable(onClick = onClick),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Box {
            Avatar(entry.person.name, 54, entry.person.dept.hex)
            Box(
                Modifier
                    .align(Alignment.TopEnd)
                    .size(14.dp)
                    .border(2.5.dp, MaterialTheme.colorScheme.background, CircleShape)
                    .padding(2.5.dp)
                    .clip(CircleShape)
                    .background(colorOf(entry.call.status.hex)),
            )
        }
        Text(
            entry.person.name,
            fontSize = 11.sp,
            fontWeight = FontWeight.SemiBold,
            textAlign = TextAlign.Center,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
            color = MaterialTheme.colorScheme.onBackground,
        )
        entry.roleLabels.firstOrNull()?.let {
            Text(it, fontSize = 10.sp, maxLines = 1,
                 color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
fun EmptyState(
    title: String,
    message: String,
    actionLabel: String? = null,
    onAction: (() -> Unit)? = null,
) {
    Column(
        Modifier.fillMaxWidth().padding(horizontal = 32.dp, vertical = 48.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Text(title, style = MaterialTheme.typography.titleLarge)
        Text(message, style = MaterialTheme.typography.bodyMedium,
             color = MaterialTheme.colorScheme.onSurfaceVariant,
             textAlign = TextAlign.Center)
        if (actionLabel != null && onAction != null) {
            Button(onClick = onAction, modifier = Modifier.padding(top = 6.dp)) { Text(actionLabel) }
        }
    }
}
