package com.lzplus.tv;

import android.app.Activity;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.WindowManager;
import android.widget.Toast;

import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MimeTypes;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.datasource.DefaultHttpDataSource;
import androidx.media3.exoplayer.DefaultRenderersFactory;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
import androidx.media3.exoplayer.source.MediaSource;
import androidx.media3.ui.PlayerView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Collections;
import java.util.HashMap;
import java.util.Map;

/**
 * Reproductor nativo (Media3 / ExoPlayer): abre MKV, HEVC, AC3 y casi cualquier formato.
 * Recibe varias opciones y, si una falla o no arranca, pasa sola a la siguiente.
 */
public class PlayerActivity extends Activity {
    private static final String VLC_UA = "VLC/3.0.20 LibVLC/3.0.20";
    private static final long START_TIMEOUT_MS = 20000;

    private ExoPlayer player;
    private PlayerView view;
    private JSONArray opts = new JSONArray();
    private int index = 0;
    private String sub, subLang;
    private long startMs = 0;
    private String audioLang = "es";
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable startWatchdog = new Runnable() {
        public void run() {
            if (player != null && !player.isPlaying() && player.getPlaybackState() != Player.STATE_READY) next("no arrancó");
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON | WindowManager.LayoutParams.FLAG_FULLSCREEN);
        try {
            JSONObject d = new JSONObject(getIntent().getStringExtra("data"));
            opts = d.optJSONArray("opts");
            if (opts == null) opts = new JSONArray();
            sub = d.optString("sub", null);
            subLang = d.optString("subLang", null);
            startMs = d.optLong("start", 0) * 1000L;
            audioLang = d.optString("audioLang", "es");
            setTitle(d.optString("title", "LZ-PLUS"));
        } catch (Exception e) { opts = new JSONArray(); }

        view = new PlayerView(this);
        view.setKeepScreenOn(true);
        view.setShowSubtitleButton(true);
        view.setControllerShowTimeoutMs(4000);
        setContentView(view);

        DefaultRenderersFactory renderers = new DefaultRenderersFactory(this)
                .setEnableDecoderFallback(true)
                .setExtensionRendererMode(DefaultRenderersFactory.EXTENSION_RENDERER_MODE_PREFER);
        player = new ExoPlayer.Builder(this, renderers).build();
        view.setPlayer(player);
        // Audio en español si la película lo trae (o el idioma original si así lo elegiste)
        androidx.media3.common.TrackSelectionParameters.Builder tsp = player.getTrackSelectionParameters().buildUpon();
        if (audioLang != null && audioLang.length() > 0) tsp.setPreferredAudioLanguages("es", "es-419", "es-MX", "spa", "lat");
        if (subLang != null && subLang.length() > 0) tsp.setPreferredTextLanguage(subLang);
        player.setTrackSelectionParameters(tsp.build());
        player.addListener(new Player.Listener() {
            @Override
            public void onPlayerError(PlaybackException error) { next(error.getErrorCodeName()); }

            @Override
            public void onIsPlayingChanged(boolean isPlaying) { if (isPlaying) handler.removeCallbacks(startWatchdog); }
        });
        view.requestFocus();
        playIndex(0);
    }

    private void playIndex(int i) {
        handler.removeCallbacks(startWatchdog);
        index = i;
        if (index >= opts.length()) {
            Toast.makeText(this, opts.length() == 0 ? "No hay video para reproducir" : "Ninguna opción se pudo reproducir", Toast.LENGTH_LONG).show();
            finish();
            return;
        }
        JSONObject o = opts.optJSONObject(index);
        if (o == null) { playIndex(index + 1); return; }
        String url = o.optString("url", "");
        String ua = o.optString("ua", "");
        String ref = o.optString("ref", "");

        DefaultHttpDataSource.Factory http = new DefaultHttpDataSource.Factory()
                .setUserAgent(ua.length() > 0 ? ua : VLC_UA)
                .setAllowCrossProtocolRedirects(true)
                .setConnectTimeoutMs(10000)
                .setReadTimeoutMs(20000);
        if (ref.length() > 0) {
            Map<String, String> h = new HashMap<>();
            h.put("Referer", ref);
            http.setDefaultRequestProperties(h);
        }

        MediaItem.Builder b = new MediaItem.Builder().setUri(Uri.parse(url));
        String lower = url.toLowerCase();
        if (lower.contains(".m3u8")) b.setMimeType(MimeTypes.APPLICATION_M3U8);
        else if (lower.contains(".mpd")) b.setMimeType(MimeTypes.APPLICATION_MPD);
        if (sub != null && sub.length() > 0) {
            String mime = sub.toLowerCase().contains(".vtt") ? MimeTypes.TEXT_VTT : MimeTypes.APPLICATION_SUBRIP;
            MediaItem.SubtitleConfiguration sc = new MediaItem.SubtitleConfiguration.Builder(Uri.parse(sub))
                    .setMimeType(mime).setLanguage(subLang).setSelectionFlags(C.SELECTION_FLAG_DEFAULT).build();
            b.setSubtitleConfigurations(Collections.singletonList(sc));
        }
        MediaSource source = new DefaultMediaSourceFactory(http).createMediaSource(b.build());
        player.setMediaSource(source);
        if (startMs > 0) player.seekTo(startMs);   // continuar donde te quedaste
        player.prepare();
        player.setPlayWhenReady(true);
        if (opts.length() > 1) Toast.makeText(this, "Opción " + (index + 1) + " de " + opts.length(), Toast.LENGTH_SHORT).show();
        handler.postDelayed(startWatchdog, START_TIMEOUT_MS);
    }

    private void next(String why) {
        if (isFinishing()) return;
        playIndex(index + 1);
    }

    @Override
    protected void onPause() {
        super.onPause();
        // Avisa a la app hasta dónde se vio (para "Continuar viendo")
        if (player != null) {
            android.content.Intent r = new android.content.Intent();
            r.putExtra("pos", Math.max(0, player.getCurrentPosition() / 1000));
            long d = player.getDuration();
            r.putExtra("dur", d > 0 ? d / 1000 : 0);
            setResult(RESULT_OK, r);
        }
    }

    @Override
    protected void onStop() {
        super.onStop();
        handler.removeCallbacks(startWatchdog);
        if (player != null) { player.release(); player = null; }
        finish();
    }
}
