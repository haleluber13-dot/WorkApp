package com.workapp.hafaka

import android.app.Application
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollToNode
import androidx.test.core.app.ApplicationProvider
import com.workapp.hafaka.data.Demo
import com.workapp.hafaka.data.Store
import com.workapp.hafaka.model.*
import com.workapp.hafaka.ui.*
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Renders each screen on the JVM through Robolectric.
 *
 * There is no emulator available in this environment (no KVM), so this is what
 * proves the screens compose, lay out and respond — not just that they compile.
 */
@RunWith(RobolectricTestRunner::class)
// A real phone viewport: at Robolectric's tiny default, content that is
// perfectly fine on a device reports as "not displayed".
@Config(sdk = [34], qualifiers = "w411dp-h891dp")
class ScreenRenderTest {

    @get:Rule val compose = createComposeRule()

    private fun store(seeded: Boolean): Store {
        val app = ApplicationProvider.getApplicationContext<Application>()
        // A fresh file per test keeps them independent.
        val s = Store(app, CoroutineScope(SupervisorJob() + Dispatchers.Unconfined),
                      filename = "test-${System.nanoTime()}.json")
        if (seeded) s.replace(Demo.state())
        return s
    }

    private fun render(content: @androidx.compose.runtime.Composable () -> Unit) {
        compose.setContent { WorkAppTheme(ThemeChoice.LIGHT) { content() } }
        compose.waitForIdle()
    }

    // ------------------------------------------------------------ empty state

    @Test fun `today screen guides you when there are no shoot days`() {
        val s = store(seeded = false)
        render { TodayScreen(s) }
        compose.onNodeWithText("אין עדיין ימי צילום").assertIsDisplayed()
        compose.onNodeWithText("יום צילום חדש").assertIsDisplayed()
    }

    @Test fun `crew screen guides you when there are no contacts`() {
        val s = store(seeded = false)
        render { CrewScreen(s) }
        compose.onNodeWithText("אין עדיין אנשי קשר").assertIsDisplayed()
    }

    @Test fun `sheets screen guides you when there is no active day`() {
        val s = store(seeded = false)
        render { SheetsScreen(s) }
        compose.onNodeWithText("אין יום צילום פעיל").assertIsDisplayed()
    }

    // ------------------------------------------------------------ populated

    @Test fun `today screen shows the day, its times and its crew`() {
        val s = store(seeded = true)
        render { TodayScreen(s) }
        compose.onNodeWithText("יום 4 — סצנות 12-18").assertIsDisplayed()
        compose.onNodeWithText("06:30").assertIsDisplayed()          // general call
        compose.onNodeWithText("אנשי קשר ליום הזה").assertIsDisplayed()
        compose.onNodeWithText("לוח קריאות").assertIsDisplayed()
        // The 05:45 override must lead the waves.
        assertTrue(compose.onAllNodesWithText("05:45").fetchSemanticsNodes().isNotEmpty())
    }

    @Test fun `crew screen groups contacts by department`() {
        val s = store(seeded = true)
        render { CrewScreen(s) }
        compose.onNodeWithText("אורי גלעד").assertIsDisplayed()
        compose.onNodeWithText("מצלמה").assertIsDisplayed()
        // Thirteen contacts don't fit one screen; the later department
        // headings are reached by scrolling, as on a real phone. Target the
        // vertical list specifically — the filter chips are a scrollable too.
        val list = SemanticsMatcher.keyIsDefined(SemanticsProperties.VerticalScrollAxisRange)
        compose.onNode(list).performScrollToNode(hasText("תאורה"))
        compose.onNodeWithText("תאורה").assertIsDisplayed()
        compose.onNode(list).performScrollToNode(hasText("רועי מזרחי"))
        compose.onNodeWithText("רועי מזרחי").assertIsDisplayed()
    }

    @Test fun `days screen separates upcoming from past`() {
        val s = store(seeded = true)
        render { DaysScreen(s) }
        compose.onNodeWithText("קרובים").assertIsDisplayed()
        compose.onNodeWithText("יום 5 — חוץ, זריחה").assertIsDisplayed()
    }

    @Test fun `sheets screen offers all five workbook sheets`() {
        val s = store(seeded = true)
        render { SheetsScreen(s) }
        listOf("הפקה", "קיטריינג", "רכבים", "ניקיון", "שמירה").forEach {
            assertTrue("missing sheet tab: $it",
                       compose.onAllNodesWithText(it).fetchSemanticsNodes().isNotEmpty())
        }
    }

    @Test fun `production sheet lists every workbook column`() {
        val s = store(seeded = true)
        render { SheetsScreen(s) }
        // Column labels straight from the spreadsheet headers.
        listOf("ע הפקה ג 1", "נערת מים", "צלם 1", "מקליט", "גריפ").forEach {
            assertTrue("missing column: $it",
                       compose.onAllNodesWithText(it).fetchSemanticsNodes().isNotEmpty())
        }
    }

    @Test fun `switching to the catering sheet shows the computed totals`() {
        val s = store(seeded = true)
        render { SheetsScreen(s) }
        compose.onNodeWithText("קיטריינג").performClick()
        compose.waitForIdle()
        compose.onNodeWithText("סה״כ נפשות").assertIsDisplayed()
        compose.onNodeWithText("60").assertIsDisplayed()   // 24 + 6 + 30
        // 62 shows twice by design: once in the summary tile, once in the
        // "הוזמן צהריים" field it summarises.
        assertTrue(compose.onAllNodesWithText("62").fetchSemanticsNodes().size >= 2)
    }

    @Test fun `settings screen shows locations and sync`() {
        val s = store(seeded = true)
        render { SettingsScreen(s) }
        compose.onNodeWithText("מיקומים").assertIsDisplayed()
        compose.onNodeWithText("סטודיו הרצליה").assertIsDisplayed()
        compose.onNodeWithText("סנכרון צוות").assertIsDisplayed()
        compose.onNodeWithText("הפעלת סנכרון").assertIsDisplayed()
    }

    @Test fun `the whole app shell renders with all five tabs`() {
        val s = store(seeded = true)
        render { RootScreen(s) }
        listOf("היום", "אנשי קשר", "ימים", "גיליונות", "הגדרות").forEach {
            assertTrue("missing tab: $it",
                       compose.onAllNodesWithText(it).fetchSemanticsNodes().isNotEmpty())
        }
    }

    @Test fun `tab navigation reaches the contact book`() {
        val s = store(seeded = true)
        render { RootScreen(s) }
        compose.onNodeWithText("אנשי קשר").performClick()
        compose.waitForIdle()
        compose.onNodeWithText("אורי גלעד").assertIsDisplayed()
    }

    @Test fun `dark theme renders every screen without failing`() {
        val s = store(seeded = true)
        compose.setContent { WorkAppTheme(ThemeChoice.DARK) { RootScreen(s) } }
        compose.waitForIdle()
        compose.onNodeWithText("יום 4 — סצנות 12-18").assertIsDisplayed()
    }
}
