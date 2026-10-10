package com.workapp.phoneguard.shield

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test
import java.io.File
import java.io.InputStreamReader
import java.util.zip.GZIPInputStream

/** Checks the committed assets: the app's parser must read exactly what the Python script wrote. */
class BundledListsTest {
    private val dir = listOf(File("src/main/assets/blocklists"), File("app/src/main/assets/blocklists")).firstOrNull { it.isDirectory }

    @Test
    fun parserAgreesWithGeneratorOnEveryList() {
        assumeTrue("assets folder not found from ${File(".").absolutePath}", dir != null)
        val meta = File(dir, "meta.json").readText()
        var total = 0
        val start = System.nanoTime()
        for (c in ShieldCategory.values()) {
            val expected = Regex("\"${c.name}\"\\s*:\\s*\\{[^}]*\"count\"\\s*:\\s*(\\d+)").find(meta)!!.groupValues[1].toInt()
            val b = LongArrayBuilder()
            File(dir, c.name.lowercase() + ".txt.gz").inputStream().use { raw ->
                InputStreamReader(GZIPInputStream(raw), Charsets.UTF_8).use { r -> HostsParser.parse(r) { b.add(DomainHash.of(it)) } }
            }
            val list = b.build()
            assertEquals(c.name, expected, list.size)
            assertTrue(list.size > 0)
            total += list.size
        }
        val ms = (System.nanoTime() - start) / 1_000_000
        println("Parsed $total bundled domains in $ms ms")
    }
}
