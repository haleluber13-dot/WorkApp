package com.olakai.app.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import okhttp3.Call
import okhttp3.Callback
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody
import okhttp3.Response
import java.io.IOException
import java.util.concurrent.TimeUnit
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/** One shared client so connections and the DNS cache are reused app-wide. */
object Http {
    val client: OkHttpClient by lazy {
        OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(25, TimeUnit.SECONDS)
            .callTimeout(40, TimeUnit.SECONDS)
            .retryOnConnectionFailure(true)
            .build()
    }

    val json: Json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        explicitNulls = false
        coerceInputValues = true
    }

    private const val UA = "OlaKai/1.0 (Android)"

    suspend fun getString(url: String): String = withContext(Dispatchers.IO) {
        val request = Request.Builder().url(url).header("User-Agent", UA).build()
        execute(request).use { response ->
            if (!response.isSuccessful) throw IOException("HTTP ${response.code} for $url")
            response.body?.string().orEmpty()
        }
    }

    suspend fun getStringAuthorized(url: String, bearer: String): String =
        withContext(Dispatchers.IO) {
            val request = Request.Builder()
                .url(url)
                .header("User-Agent", UA)
                .header("Authorization", "Bearer $bearer")
                .build()
            execute(request).use { response ->
                if (!response.isSuccessful) throw IOException("HTTP ${response.code} for $url")
                response.body?.string().orEmpty()
            }
        }

    suspend fun postString(
        url: String,
        body: RequestBody,
        headers: Map<String, String> = emptyMap(),
    ): String = withContext(Dispatchers.IO) {
        val builder = Request.Builder().url(url).post(body).header("User-Agent", UA)
        headers.forEach { (k, v) -> builder.header(k, v) }
        execute(builder.build()).use { response ->
            if (!response.isSuccessful) throw IOException("HTTP ${response.code} for $url")
            response.body?.string().orEmpty()
        }
    }

    private suspend fun execute(request: Request): Response =
        suspendCancellableCoroutine { cont ->
            val call = client.newCall(request)
            cont.invokeOnCancellation { call.cancel() }
            call.enqueue(object : Callback {
                override fun onFailure(call: Call, e: IOException) {
                    if (!cont.isCancelled) cont.resumeWithException(e)
                }

                override fun onResponse(call: Call, response: Response) {
                    cont.resume(response)
                }
            })
        }
}
