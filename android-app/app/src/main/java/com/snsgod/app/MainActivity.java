package com.snsgod.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.ContentValues;
import android.content.DialogInterface;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.JsPromptResult;
import android.webkit.JsResult;
import android.webkit.ValueCallback;
import android.webkit.WebSettings;
import android.webkit.WebChromeClient;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Iterator;

public class MainActivity extends Activity {
    private static final int FILE_CHOOSER_REQUEST = 7142;
    private static final String STORAGE_PREFS = "snsgod_plugin_storage";

    private WebView webView;
    private ValueCallback<Uri[]> filePathCallback;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        webView = new WebView(this);
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        settings.setUserAgentString(settings.getUserAgentString() + " SNSGodAndroid/0.1");

        webView.addJavascriptInterface(new NativeBridge(), "SNSGodAndroid");
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> filePath, FileChooserParams params) {
                if (filePathCallback != null) filePathCallback.onReceiveValue(null);
                filePathCallback = filePath;

                Intent intent = params.createIntent();
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                try {
                    startActivityForResult(intent, FILE_CHOOSER_REQUEST);
                } catch (Exception error) {
                    Intent fallback = new Intent(Intent.ACTION_GET_CONTENT);
                    fallback.addCategory(Intent.CATEGORY_OPENABLE);
                    fallback.setType("*/*");
                    startActivityForResult(Intent.createChooser(fallback, "파일 선택"), FILE_CHOOSER_REQUEST);
                }
                return true;
            }

            @Override
            public boolean onJsAlert(WebView view, String url, String message, final JsResult result) {
                new AlertDialog.Builder(MainActivity.this)
                        .setMessage(message)
                        .setPositiveButton(android.R.string.ok, new DialogInterface.OnClickListener() {
                            @Override
                            public void onClick(DialogInterface dialog, int which) {
                                result.confirm();
                            }
                        })
                        .setOnCancelListener(new DialogInterface.OnCancelListener() {
                            @Override
                            public void onCancel(DialogInterface dialog) {
                                result.cancel();
                            }
                        })
                        .show();
                return true;
            }

            @Override
            public boolean onJsConfirm(WebView view, String url, String message, final JsResult result) {
                new AlertDialog.Builder(MainActivity.this)
                        .setMessage(message)
                        .setPositiveButton(android.R.string.ok, new DialogInterface.OnClickListener() {
                            @Override
                            public void onClick(DialogInterface dialog, int which) {
                                result.confirm();
                            }
                        })
                        .setNegativeButton(android.R.string.cancel, new DialogInterface.OnClickListener() {
                            @Override
                            public void onClick(DialogInterface dialog, int which) {
                                result.cancel();
                            }
                        })
                        .setOnCancelListener(new DialogInterface.OnCancelListener() {
                            @Override
                            public void onCancel(DialogInterface dialog) {
                                result.cancel();
                            }
                        })
                        .show();
                return true;
            }

            @Override
            public boolean onJsPrompt(WebView view, String url, String message, String defaultValue, final JsPromptResult result) {
                final EditText input = new EditText(MainActivity.this);
                input.setSingleLine(false);
                input.setText(defaultValue == null ? "" : defaultValue);
                input.setSelectAllOnFocus(true);

                new AlertDialog.Builder(MainActivity.this)
                        .setMessage(message)
                        .setView(input)
                        .setPositiveButton(android.R.string.ok, new DialogInterface.OnClickListener() {
                            @Override
                            public void onClick(DialogInterface dialog, int which) {
                                result.confirm(input.getText().toString());
                            }
                        })
                        .setNegativeButton(android.R.string.cancel, new DialogInterface.OnClickListener() {
                            @Override
                            public void onClick(DialogInterface dialog, int which) {
                                result.cancel();
                            }
                        })
                        .setOnCancelListener(new DialogInterface.OnCancelListener() {
                            @Override
                            public void onCancel(DialogInterface dialog) {
                                result.cancel();
                            }
                        })
                        .show();
                return true;
            }
        });
        webView.setWebViewClient(new WebViewClient());
        webView.loadUrl("file:///android_asset/www/index.html");
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != FILE_CHOOSER_REQUEST || filePathCallback == null) return;

        Uri[] results = WebChromeClient.FileChooserParams.parseResult(resultCode, data);
        filePathCallback.onReceiveValue(results);
        filePathCallback = null;
    }

    @Override
    protected void onPause() {
        flushWebState();
        super.onPause();
    }

    @Override
    protected void onStop() {
        flushWebState();
        super.onStop();
    }

    private void flushWebState() {
        if (webView == null) return;
        webView.evaluateJavascript(
                "(function(){try{if(window.__snsGodFlushState){window.__snsGodFlushState();return true;}}catch(e){}return false;})();",
                null);
    }

    @Override
    public void onBackPressed() {
        if (webView == null) {
            super.onBackPressed();
            return;
        }
        webView.evaluateJavascript(
                "(function(){try{return !!(window.__snsGodAndroidBack && window.__snsGodAndroidBack());}catch(e){return false;}})();",
                new ValueCallback<String>() {
                    @Override
                    public void onReceiveValue(String value) {
                        if ("true".equals(value)) return;
                        if (webView.canGoBack()) {
                            webView.goBack();
                            return;
                        }
                        MainActivity.super.onBackPressed();
                    }
                });
    }

    public class NativeBridge {
        @JavascriptInterface
        public String getStorageItem(String key) {
            return getSharedPreferences(STORAGE_PREFS, MODE_PRIVATE).getString(safeStorageKey(key), null);
        }

        @JavascriptInterface
        public void setStorageItem(String key, String value) {
            SharedPreferences.Editor editor = getSharedPreferences(STORAGE_PREFS, MODE_PRIVATE).edit();
            editor.putString(safeStorageKey(key), value == null ? "" : value);
            editor.commit();
        }

        @JavascriptInterface
        public void removeStorageItem(String key) {
            SharedPreferences.Editor editor = getSharedPreferences(STORAGE_PREFS, MODE_PRIVATE).edit();
            editor.remove(safeStorageKey(key));
            editor.commit();
        }

        private String safeStorageKey(String key) {
            return key == null ? "" : key;
        }

        @JavascriptInterface
        public void nativeFetch(String requestId, String url, String optionsJson) {
            new Thread(new Runnable() {
                @Override
                public void run() {
                String payload;
                try {
                    JSONObject options = optionsJson == null || optionsJson.isEmpty()
                            ? new JSONObject()
                            : new JSONObject(optionsJson);
                    JSONObject result = performRequest(url, options);
                    payload = "window.__snsGodNativeFetchResolve("
                            + JSONObject.quote(requestId) + ",null," + result.toString() + ")";
                } catch (Exception error) {
                    payload = "window.__snsGodNativeFetchResolve("
                            + JSONObject.quote(requestId) + "," + JSONObject.quote(error.getMessage()) + ",null)";
                }
                final String script = payload;
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        webView.evaluateJavascript(script, null);
                    }
                });
                }
            }).start();
        }

        @JavascriptInterface
        public String saveDataUrl(String fileName, String dataUrl) {
            try {
                String safeName = sanitizeFileName(fileName == null || fileName.isEmpty() ? "snsgod-export.png" : fileName);
                int comma = dataUrl == null ? -1 : dataUrl.indexOf(',');
                if (comma < 0) throw new IllegalArgumentException("Invalid data URL");

                String meta = dataUrl.substring(0, comma);
                String mime = "application/octet-stream";
                int colon = meta.indexOf(':');
                int semi = meta.indexOf(';');
                if (colon >= 0 && semi > colon) mime = meta.substring(colon + 1, semi);

                byte[] bytes = Base64.decode(dataUrl.substring(comma + 1), Base64.DEFAULT);
                Uri uri = saveBytes(safeName, mime, bytes);
                showToast("저장 완료: " + safeName);
                return uri == null ? "" : uri.toString();
            } catch (Exception error) {
                showToast("저장 실패: " + error.getMessage());
                return "";
            }
        }

        private Uri saveBytes(String fileName, String mime, byte[] bytes) throws Exception {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentValues values = new ContentValues();
                values.put(MediaStore.Downloads.DISPLAY_NAME, fileName);
                values.put(MediaStore.Downloads.MIME_TYPE, mime);
                values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/SNSGod");
                Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                if (uri == null) throw new IllegalStateException("Download provider unavailable");
                try (OutputStream output = getContentResolver().openOutputStream(uri)) {
                    if (output == null) throw new IllegalStateException("Cannot open output stream");
                    output.write(bytes);
                }
                return uri;
            }

            File dir = new File(getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), "SNSGod");
            if (!dir.exists() && !dir.mkdirs()) throw new IllegalStateException("Cannot create download directory");
            File file = new File(dir, fileName);
            try (OutputStream output = new FileOutputStream(file)) {
                output.write(bytes);
            }
            return Uri.fromFile(file);
        }

        private String sanitizeFileName(String value) {
            String cleaned = value.replaceAll("[\\\\/:*?\"<>|\\r\\n]+", "_").trim();
            return cleaned.isEmpty() ? "snsgod-export.png" : cleaned;
        }

        private void showToast(final String message) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    Toast.makeText(MainActivity.this, message, Toast.LENGTH_SHORT).show();
                }
            });
        }

        private JSONObject performRequest(String urlText, JSONObject options) throws Exception {
            HttpURLConnection connection = (HttpURLConnection) new URL(urlText).openConnection();
            String method = options.optString("method", "GET").toUpperCase();
            connection.setRequestMethod(method);
            connection.setConnectTimeout(30000);
            connection.setReadTimeout(120000);

            JSONObject headers = options.optJSONObject("headers");
            if (headers != null) {
                Iterator<String> keys = headers.keys();
                while (keys.hasNext()) {
                    String key = keys.next();
                    connection.setRequestProperty(key, headers.optString(key));
                }
            }

            if (options.has("body") && !"GET".equals(method) && !"HEAD".equals(method)) {
                byte[] body = options.optString("body", "").getBytes(StandardCharsets.UTF_8);
                connection.setDoOutput(true);
                try (OutputStream output = connection.getOutputStream()) {
                    output.write(body);
                }
            }

            int status = connection.getResponseCode();
            InputStream stream = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
            String text = readAll(stream);

            JSONObject response = new JSONObject();
            response.put("ok", status >= 200 && status < 300);
            response.put("status", status);
            response.put("statusText", connection.getResponseMessage());
            response.put("text", text);
            response.put("body", text);
            return response;
        }

        private String readAll(InputStream stream) throws Exception {
            if (stream == null) return "";
            StringBuilder builder = new StringBuilder();
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    if (builder.length() > 0) builder.append('\n');
                    builder.append(line);
                }
            }
            return builder.toString();
        }
    }
}
