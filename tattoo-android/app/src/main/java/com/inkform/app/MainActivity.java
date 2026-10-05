package com.inkform.app;

import android.Manifest;
import android.app.Activity;
import android.content.ClipData;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.database.Cursor;
import android.provider.MediaStore;
import android.provider.OpenableColumns;
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

import androidx.core.content.FileProvider;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewClientCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.ByteArrayOutputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

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
    private static final int REQ_PICK = 13;
    private static final int REQ_MIC = 12;

    private WebView web;
    private ValueCallback<Uri[]> fileCallback;
    private SpeechRecognizer recognizer;
    private String pendingLang;
    private boolean pendingPartial;
    private Uri cameraUri;
    private final ArrayList<String> sharedQueue = new ArrayList<>();
    /** Photos picked or shared, served to the page at /picked/<id> straight from the phone (no copying). */
    private final ConcurrentHashMap<String, Uri> served = new ConcurrentHashMap<>();
    private String pickRequestId;

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
                String p0 = request.getUrl().getPath();
                if (p0 != null && p0.startsWith("/picked/") && "appassets.androidplatform.net".equals(request.getUrl().getHost())) {
                    Uri u = served.get(p0.substring(8));
                    if (u == null) return new WebResourceResponse("text/plain", "utf-8", 404, "Not found", null, null);
                    try {
                        String type = getContentResolver().getType(u);
                        return new WebResourceResponse(type == null ? "application/octet-stream" : type, null, getContentResolver().openInputStream(u));
                    } catch (Exception e) {
                        return new WebResourceResponse("text/plain", "utf-8", 404, "Not found", null, null);
                    }
                }
                WebResourceResponse r = loader.shouldInterceptRequest(request.getUrl());
                if (r != null) {
                    String path = request.getUrl().getPath();
                    if (path != null && (path.endsWith(".js") || path.endsWith(".mjs"))) r.setMimeType("text/javascript");
                    else if (path != null && path.endsWith(".css")) r.setMimeType("text/css");
                    else if (path != null && path.endsWith(".svg")) r.setMimeType("image/svg+xml");
                    else if (path != null && path.endsWith(".woff")) r.setMimeType("font/woff");
                    else if (path != null && path.endsWith(".wasm")) r.setMimeType("application/wasm");
                    else if (path != null && path.endsWith(".json")) r.setMimeType("application/json");
                    else if (path != null && path.endsWith(".task")) r.setMimeType("application/octet-stream");
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
                    startActivityForResult(buildChooser(params), REQ_FILE);
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
        handleShared(getIntent());
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
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        handleShared(intent);
    }

    private ArrayList<Uri> resultUris(int resultCode, Intent data) {
        ArrayList<Uri> uris = new ArrayList<>();
        if (resultCode != RESULT_OK) return uris;
        if (data != null) {
            ClipData clip = data.getClipData();
            if (clip != null) for (int i = 0; i < clip.getItemCount(); i++) uris.add(clip.getItemAt(i).getUri());
            else if (data.getData() != null) uris.add(data.getData());
        }
        // the camera writes into cameraUri and returns no data
        if (uris.isEmpty() && cameraUri != null) uris.add(cameraUri);
        return uris;
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQ_PICK) {
            ArrayList<Uri> uris = resultUris(resultCode, data);
            String id = pickRequestId;
            pickRequestId = null;
            cameraUri = null;
            deliver("window.__inkFiles && window.__inkFiles(" + JSONObject.quote(id == null ? "" : id) + ", " + describe(uris) + ")");
            return;
        }
        if (requestCode != REQ_FILE || fileCallback == null) return;
        ArrayList<Uri> uris = resultUris(resultCode, data);
        fileCallback.onReceiveValue(uris.isEmpty() ? null : uris.toArray(new Uri[0]));
        fileCallback = null;
        cameraUri = null;
    }

    private void deliver(String js) { runOnUiThread(() -> web.evaluateJavascript(js, null)); }

    /** JSON list of {url, name, type} for files the page can fetch from /picked/<id>. */
    private String describe(ArrayList<Uri> uris) {
        JSONArray a = new JSONArray();
        for (Uri u : uris) {
            try {
                String id = UUID.randomUUID().toString();
                served.put(id, u);
                JSONObject o = new JSONObject();
                o.put("url", "/picked/" + id);
                o.put("name", displayName(u));
                String type = getContentResolver().getType(u);
                o.put("type", type == null ? "" : type);
                a.put(o);
            } catch (Exception ignored) { }
        }
        return a.toString();
    }

    private String displayName(Uri u) {
        try (Cursor c = getContentResolver().query(u, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (c != null && c.moveToFirst()) { String n = c.getString(0); if (n != null && !n.isEmpty()) return n; }
        } catch (Exception ignored) { }
        String n = u.getLastPathSegment();
        return n == null ? "photo" : n.replaceAll(".*/", "");
    }

    // ── picking files: gallery / photos / drive, several at once, or the camera ──
    private Intent buildChooser(WebChromeClient.FileChooserParams params) {
        return buildChooser(params.getAcceptTypes(), params.getMode() == WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE, params.isCaptureEnabled());
    }

    private Intent buildChooser(String[] accepts, boolean multiple, boolean capture) {
        ArrayList<String> mimes = new ArrayList<>();
        boolean images = false;
        for (String a : accepts) {
            for (String t : a.split(",")) {
                t = t.trim().toLowerCase();
                if (t.isEmpty()) continue;
                if (t.startsWith("image/")) images = true;
                if (t.contains("/")) mimes.add(t);
                else if (t.equals(".json")) mimes.add("application/json");
                else if (t.equals(".heic") || t.equals(".heif")) { mimes.add("image/heic"); mimes.add("image/heif"); images = true; }
                else if (t.equals(".svg")) mimes.add("image/svg+xml");
            }
        }
        Intent pick = new Intent(Intent.ACTION_GET_CONTENT);
        pick.addCategory(Intent.CATEGORY_OPENABLE);
        if (images) pick.setType("image/*");
        else if (mimes.size() == 1) pick.setType(mimes.get(0));
        else {
            pick.setType("*/*");
            if (!mimes.isEmpty()) pick.putExtra(Intent.EXTRA_MIME_TYPES, mimes.toArray(new String[0]));
        }
        pick.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, multiple);

        Intent camera = images ? cameraIntent() : null;
        if (camera != null && capture) return camera;
        Intent chooser = Intent.createChooser(pick, images ? "Add photos" : "Choose a file");
        if (camera != null) chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS, new Intent[]{camera});
        return chooser;
    }

    private Intent cameraIntent() {
        try {
            Intent cam = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
            if (cam.resolveActivity(getPackageManager()) == null) return null;
            File dir = new File(getCacheDir(), "camera");
            if (!dir.exists() && !dir.mkdirs()) return null;
            File photo = new File(dir, "photo-" + System.currentTimeMillis() + ".jpg");
            cameraUri = FileProvider.getUriForFile(this, "com.inkform.app.files", photo);
            cam.putExtra(MediaStore.EXTRA_OUTPUT, cameraUri);
            cam.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
            return cam;
        } catch (Exception e) {
            return null;
        }
    }

    // ── photos shared into the app ("Share → InkForm 3D") ──
    @SuppressWarnings("deprecation")
    private void handleShared(Intent intent) {
        if (intent == null) return;
        final ArrayList<Uri> uris = new ArrayList<>();
        String action = intent.getAction();
        if (Intent.ACTION_SEND.equals(action)) {
            Uri u = intent.getParcelableExtra(Intent.EXTRA_STREAM);
            if (u != null) uris.add(u);
        } else if (Intent.ACTION_SEND_MULTIPLE.equals(action)) {
            ArrayList<Uri> list = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
            if (list != null) uris.addAll(list);
        } else if (Intent.ACTION_VIEW.equals(action) && intent.getData() != null) {
            uris.add(intent.getData());
        }
        if (uris.isEmpty()) return;
        while (uris.size() > 30) uris.remove(uris.size() - 1);
        try {
            JSONArray list = new JSONArray(describe(uris));
            synchronized (sharedQueue) { for (int i = 0; i < list.length(); i++) sharedQueue.add(list.getJSONObject(i).toString()); }
        } catch (Exception ignored) { }
        deliver("window.inkSharedReady && window.inkSharedReady()");
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

        /** Open the phone's own picker (gallery, Google Photos, files, camera) for an <input type=file>. */
        @JavascriptInterface
        public void pickFiles(String requestId, String accept, boolean multiple, boolean capture) {
            runOnUiThread(() -> {
                try {
                    pickRequestId = requestId;
                    startActivityForResult(buildChooser(accept == null ? new String[0] : accept.split(","), multiple, capture), REQ_PICK);
                } catch (Exception e) {
                    pickRequestId = null;
                    deliver("window.__inkFiles && window.__inkFiles(" + JSONObject.quote(requestId) + ", [])");
                    Toast.makeText(MainActivity.this, "Couldn't open the photo picker", Toast.LENGTH_LONG).show();
                }
            });
        }

        /** Photos shared into the app, as a JSON array of {url, name, type}; empties the queue. */
        @JavascriptInterface
        public String takeShared() {
            synchronized (sharedQueue) {
                JSONArray a = new JSONArray();
                for (String s : sharedQueue) { try { a.put(new JSONObject(s)); } catch (Exception ignored) { } }
                sharedQueue.clear();
                return a.toString();
            }
        }
    }
}
