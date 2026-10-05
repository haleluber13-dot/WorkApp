package com.inkform.app;

import android.Manifest;
import android.app.Activity;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.util.Base64;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.Toast;

import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewClientCompat;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.util.ArrayList;

/**
 * InkForm 3D for Android: the tattoo designer web app, bundled in the APK and
 * shown full screen in a WebView. Files are served from a virtual https origin
 * (WebViewAssetLoader) so ES modules, web workers and storage work exactly as
 * on the web. A small JavaScript bridge ("InkAndroid") adds what a WebView
 * lacks: saving images to the Gallery and speech recognition for the AI mic.
 */
public class MainActivity extends Activity {
    private static final String HOME = "https://appassets.androidplatform.net/assets/www/index.html";
    private static final int REQ_FILE = 11;
    private static final int REQ_MIC = 12;

    private WebView web;
    private ValueCallback<Uri[]> fileCallback;
    private SpeechRecognizer recognizer;
    private String pendingLang;
    private boolean pendingPartial;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);

        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#121215"));
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setTextZoom(100);

        final WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        web.setWebViewClient(new WebViewClientCompat() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                WebResourceResponse r = loader.shouldInterceptRequest(request.getUrl());
                if (r != null) {
                    String path = request.getUrl().getPath();
                    if (path != null && (path.endsWith(".js") || path.endsWith(".mjs"))) r.setMimeType("text/javascript");
                    else if (path != null && path.endsWith(".css")) r.setMimeType("text/css");
                    else if (path != null && path.endsWith(".svg")) r.setMimeType("image/svg+xml");
                    else if (path != null && path.endsWith(".woff")) r.setMimeType("font/woff");
                }
                return r;
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri u = request.getUrl();
                if ("appassets.androidplatform.net".equals(u.getHost())) return false;
                // links to other websites open in the browser
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception ignored) { }
                return true;
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                try {
                    startActivityForResult(params.createIntent(), REQ_FILE);
                } catch (Exception e) {
                    fileCallback = null;
                    return false;
                }
                return true;
            }

            @Override
            public void onPermissionRequest(PermissionRequest request) {
                request.deny();
            }
        });

        web.addJavascriptInterface(new Bridge(), "InkAndroid");

        if (savedInstanceState != null) web.restoreState(savedInstanceState);
        else web.loadUrl(HOME);
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    public void onBackPressed() {
        web.evaluateJavascript("window.inkBack ? window.inkBack() : false", value -> {
            if (!"true".equals(value)) MainActivity.super.onBackPressed();
        });
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQ_FILE && fileCallback != null) {
            fileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
            fileCallback = null;
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(requestCode, permissions, results);
        if (requestCode == REQ_MIC) {
            if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED) startRecognizer(pendingLang, pendingPartial);
            else {
                speechEvent("error", null, "not-allowed");
                speechEvent("end", null, null);
                Toast.makeText(this, "Allow the microphone to talk to the assistant", Toast.LENGTH_LONG).show();
            }
        }
    }

    @Override
    protected void onDestroy() {
        if (recognizer != null) recognizer.destroy();
        web.destroy();
        super.onDestroy();
    }

    // ── speech ──────────────────────────────────────────────────────────
    private void speechEvent(String type, String text, String error) {
        try {
            JSONObject o = new JSONObject();
            o.put("type", type);
            if (text != null) o.put("text", text);
            if (error != null) o.put("error", error);
            final String js = "window.__inkSpeech && window.__inkSpeech(" + o + ")";
            runOnUiThread(() -> web.evaluateJavascript(js, null));
        } catch (Exception ignored) { }
    }

    private void startRecognizer(String lang, boolean partial) {
        if (!SpeechRecognizer.isRecognitionAvailable(this)) {
            speechEvent("error", null, "not-available");
            speechEvent("end", null, null);
            Toast.makeText(this, "Speech recognition isn't available on this phone", Toast.LENGTH_LONG).show();
            return;
        }
        if (recognizer != null) recognizer.destroy();
        recognizer = SpeechRecognizer.createSpeechRecognizer(this);
        recognizer.setRecognitionListener(new RecognitionListener() {
            boolean done = false;
            @Override public void onReadyForSpeech(Bundle b) { speechEvent("start", null, null); }
            @Override public void onBeginningOfSpeech() { }
            @Override public void onRmsChanged(float v) { }
            @Override public void onBufferReceived(byte[] bytes) { }
            @Override public void onEndOfSpeech() { }
            @Override public void onError(int code) {
                if (done) return;
                done = true;
                speechEvent("error", null, "code-" + code);
                speechEvent("end", null, null);
            }
            @Override public void onResults(Bundle b) {
                if (done) return;
                done = true;
                ArrayList<String> r = b.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                if (r != null && !r.isEmpty()) speechEvent("result", r.get(0), null);
                speechEvent("end", null, null);
            }
            @Override public void onPartialResults(Bundle b) {
                ArrayList<String> r = b.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                if (r != null && !r.isEmpty()) speechEvent("partial", r.get(0), null);
            }
            @Override public void onEvent(int i, Bundle b) { }
        });
        Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        if (lang != null && !lang.isEmpty()) intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, lang);
        intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, partial);
        intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
        recognizer.startListening(intent);
    }

    // ── files ───────────────────────────────────────────────────────────
    private boolean save(String name, byte[] data, String mime) {
        try {
            boolean image = mime != null && mime.startsWith("image/");
            if (Build.VERSION.SDK_INT >= 29) {
                ContentValues v = new ContentValues();
                v.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
                v.put(MediaStore.MediaColumns.MIME_TYPE, mime);
                v.put(MediaStore.MediaColumns.RELATIVE_PATH,
                        (image ? Environment.DIRECTORY_PICTURES : Environment.DIRECTORY_DOWNLOADS) + "/InkForm");
                Uri collection = image
                        ? MediaStore.Images.Media.EXTERNAL_CONTENT_URI
                        : MediaStore.Downloads.EXTERNAL_CONTENT_URI;
                Uri uri = getContentResolver().insert(collection, v);
                if (uri == null) return false;
                try (OutputStream out = getContentResolver().openOutputStream(uri)) {
                    if (out == null) return false;
                    out.write(data);
                }
                return true;
            }
            // Android 8–9: app-specific folder (no storage permission prompt needed)
            File dir = getExternalFilesDir(image ? Environment.DIRECTORY_PICTURES : Environment.DIRECTORY_DOWNLOADS);
            if (dir == null) return false;
            try (FileOutputStream out = new FileOutputStream(new File(dir, name))) { out.write(data); }
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    /** Methods callable from the web app as window.InkAndroid.* */
    private class Bridge {
        @JavascriptInterface
        public boolean saveFile(String name, String base64, String mime) {
            try {
                String safe = name.replaceAll("[^A-Za-z0-9._-]", "_");
                return save(safe, Base64.decode(base64, Base64.DEFAULT), mime);
            } catch (Exception e) {
                return false;
            }
        }

        @JavascriptInterface
        public void startListening(String lang, boolean partial) {
            runOnUiThread(() -> {
                pendingLang = lang;
                pendingPartial = partial;
                if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                    requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, REQ_MIC);
                } else {
                    startRecognizer(lang, partial);
                }
            });
        }

        @JavascriptInterface
        public void stopListening() {
            runOnUiThread(() -> { if (recognizer != null) recognizer.stopListening(); });
        }

        @JavascriptInterface
        public String platform() { return "android"; }
    }
}
