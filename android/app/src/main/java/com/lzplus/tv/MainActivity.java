package com.lzplus.tv;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

/**
 * Pantalla principal de LZ-PLUS para Android TV.
 * Carga la app (assets/index.html) en un WebView sin las restricciones de un navegador:
 * puede leer listas, servidores Xtream y complementos de cualquier sitio.
 * Las películas y series se abren en el reproductor nativo (PlayerActivity).
 */
public class MainActivity extends Activity {
    private WebView web;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON | WindowManager.LayoutParams.FLAG_FULLSCREEN);

        WebView.setWebContentsDebuggingEnabled(true);   // permite revisar errores desde una computadora
        web = new WebView(this);
        web.setBackgroundColor(Color.rgb(6, 8, 15));
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(true);
        s.setAllowFileAccessFromFileURLs(true);
        s.setAllowUniversalAccessFromFileURLs(true);   // sin bloqueos de CORS
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        s.setUserAgentString(s.getUserAgentString() + " LZPLUS-TV/1.0");
        s.setTextZoom(100);              // ignora el tamaño de letra del sistema (si no, la app se sale de la pantalla)
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);

        web.addJavascriptInterface(new Bridge(), "LZ");
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();
                if (url.startsWith("file:")) return false;
                if (url.startsWith("http:") || url.startsWith("https:")) { openExternal(url, null); return true; }
                if (url.startsWith("vlc://")) { openExternal(url.substring(6), "video/*"); return true; }
                return true;
            }
        });
        setContentView(web);
        web.requestFocus();
        web.loadUrl("file:///android_asset/index.html");
    }

    @Override
    public void onBackPressed() {
        // El botón Regresar del control lo maneja la app (cierra ventanas, sale de pantalla completa, etc.)
        web.evaluateJavascript("window.lzBack ? (lzBack(), 1) : 0", null);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == 7 && data != null) {
            long pos = data.getLongExtra("pos", 0), dur = data.getLongExtra("dur", 0);
            web.evaluateJavascript("window.lzProgress && lzProgress(" + pos + "," + dur + ")", null);
        }
    }

    @Override
    protected void onPause() { super.onPause(); web.onPause(); }

    @Override
    protected void onResume() { super.onResume(); web.onResume(); }

    @Override
    protected void onDestroy() { web.destroy(); super.onDestroy(); }

    private void openExternal(String url, String type) {
        try {
            Intent i = new Intent(Intent.ACTION_VIEW);
            if (type != null) i.setDataAndType(Uri.parse(url), type); else i.setData(Uri.parse(url));
            startActivity(Intent.createChooser(i, "Abrir con"));
        } catch (Exception e) {
            Toast.makeText(this, "No hay una app para abrir esto (instala VLC)", Toast.LENGTH_LONG).show();
        }
    }

    /** Funciones que la app web puede llamar como window.LZ.xxx() */
    private class Bridge {
        @JavascriptInterface
        public boolean isNative() { return true; }

        @JavascriptInterface
        public void exit() { runOnUiThread(new Runnable() { public void run() { finish(); } }); }

        @JavascriptInterface
        public void openExternal(final String url) {
            runOnUiThread(new Runnable() { public void run() { MainActivity.this.openExternal(url, "video/*"); } });
        }

        /** json: {"title": "...", "opts": [{"url": "...", "ref": "...", "ua": "..."}], "sub": "url", "subLang": "es"} */
        @JavascriptInterface
        public void play(final String json) {
            runOnUiThread(new Runnable() {
                public void run() {
                    Intent i = new Intent(MainActivity.this, PlayerActivity.class);
                    i.putExtra("data", json);
                    startActivityForResult(i, 7);
                }
            });
        }
    }
}
