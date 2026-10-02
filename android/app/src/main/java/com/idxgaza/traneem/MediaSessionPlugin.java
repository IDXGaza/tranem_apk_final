package com.idxgaza.traneem;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.media.AudioAttributes;
import android.media.AudioDeviceInfo;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.support.v4.media.MediaMetadataCompat;
import android.support.v4.media.session.MediaSessionCompat;
import android.support.v4.media.session.PlaybackStateCompat;
import android.util.Base64;
import android.view.KeyEvent;

import androidx.core.app.ActivityCompat;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;
import androidx.media.app.NotificationCompat.MediaStyle;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.InputStream;
import java.net.URL;

@CapacitorPlugin(name = "MediaSession")
public class MediaSessionPlugin extends Plugin {

    public static MediaSessionCompat activeSession = null;
    public static MediaSessionPlugin activePlugin = null;

    private MediaSessionCompat mediaSession = null;
    private final String CHANNEL_ID = "traneem_media";
    private final int NOTIFICATION_ID = 1;
    private AudioFocusRequest audioFocusRequest = null;

    private final BroadcastReceiver receiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (intent == null || intent.getAction() == null) return;
            String action = intent.getAction();
            if ("com.idxgaza.traneem.MEDIA_PREVIOUS".equals(action)) {
                JSObject obj = new JSObject();
                obj.put("action", "previous");
                notifyListeners("mediaAction", obj);
            } else if ("com.idxgaza.traneem.MEDIA_PLAY_PAUSE".equals(action)) {
                JSObject obj = new JSObject();
                obj.put("action", "toggle");
                notifyListeners("mediaAction", obj);
            } else if ("com.idxgaza.traneem.MEDIA_NEXT".equals(action)) {
                JSObject obj = new JSObject();
                obj.put("action", "next");
                notifyListeners("mediaAction", obj);
            }
        }
    };

    private final BroadcastReceiver noisyReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (intent != null && AudioManager.ACTION_AUDIO_BECOMING_NOISY.equals(intent.getAction())) {
                JSObject obj = new JSObject();
                obj.put("action", "pause");
                notifyListeners("mediaAction", obj);
                notifyListeners("headsetDisconnected", new JSObject());
            }
        }
    };

    @Override
    public void load() {
        createNotificationChannel();

        mediaSession = new MediaSessionCompat(getContext(), "TraneemMediaSession");
        mediaSession.setCallback(new MediaSessionCompat.Callback() {
            private int headsetClickCount = 0;
            private final Handler headsetHandler = new Handler(Looper.getMainLooper());
            private long lastEventTime = 0L;
            private int lastKeyCode = 0;

            private final Runnable headsetRunnable = new Runnable() {
                @Override
                public void run() {
                    JSObject obj = new JSObject();
                    if (headsetClickCount == 1) {
                        obj.put("action", "toggle");
                        notifyListeners("mediaAction", obj);
                    } else if (headsetClickCount == 2) {
                        obj.put("action", "next");
                        notifyListeners("mediaAction", obj);
                    } else if (headsetClickCount >= 3) {
                        obj.put("action", "previous");
                        notifyListeners("mediaAction", obj);
                    }
                    headsetClickCount = 0;
                }
            };

            @Override
            public boolean onMediaButtonEvent(Intent mediaButtonEvent) {
                if (mediaButtonEvent == null) return super.onMediaButtonEvent(mediaButtonEvent);
                KeyEvent keyEvent = mediaButtonEvent.getParcelableExtra(Intent.EXTRA_KEY_EVENT);
                if (keyEvent == null) return super.onMediaButtonEvent(mediaButtonEvent);

                long now = System.currentTimeMillis();
                boolean isRepeat = (now - lastEventTime < 70) && (lastKeyCode == keyEvent.getKeyCode());

                if (keyEvent.getAction() == KeyEvent.ACTION_DOWN) {
                    lastEventTime = now;
                    lastKeyCode = keyEvent.getKeyCode();

                    switch (keyEvent.getKeyCode()) {
                        case KeyEvent.KEYCODE_HEADSETHOOK:
                        case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE:
                            headsetHandler.removeCallbacks(headsetRunnable);
                            headsetClickCount++;
                            if (headsetClickCount >= 3) {
                                headsetRunnable.run();
                            } else {
                                headsetHandler.postDelayed(headsetRunnable, 380);
                            }
                            return true;

                        case KeyEvent.KEYCODE_MEDIA_PLAY: {
                            JSObject obj = new JSObject();
                            obj.put("action", "play");
                            notifyListeners("mediaAction", obj);
                            return true;
                        }

                        case KeyEvent.KEYCODE_MEDIA_PAUSE: {
                            JSObject obj = new JSObject();
                            obj.put("action", "pause");
                            notifyListeners("mediaAction", obj);
                            return true;
                        }

                        case KeyEvent.KEYCODE_MEDIA_NEXT:
                        case KeyEvent.KEYCODE_MEDIA_FAST_FORWARD:
                        case KeyEvent.KEYCODE_MEDIA_STEP_FORWARD: {
                            JSObject obj = new JSObject();
                            obj.put("action", "next");
                            notifyListeners("mediaAction", obj);
                            return true;
                        }

                        case KeyEvent.KEYCODE_MEDIA_PREVIOUS:
                        case KeyEvent.KEYCODE_MEDIA_REWIND:
                        case KeyEvent.KEYCODE_MEDIA_STEP_BACKWARD: {
                            JSObject obj = new JSObject();
                            obj.put("action", "previous");
                            notifyListeners("mediaAction", obj);
                            return true;
                        }

                        case KeyEvent.KEYCODE_MEDIA_STOP: {
                            JSObject obj = new JSObject();
                            obj.put("action", "stop");
                            notifyListeners("mediaAction", obj);
                            return true;
                        }

                        case KeyEvent.KEYCODE_MEDIA_RECORD: {
                            JSObject obj = new JSObject();
                            obj.put("action", "toggle");
                            notifyListeners("mediaAction", obj);
                            return true;
                        }
                    }
                } else if (keyEvent.getAction() == KeyEvent.ACTION_UP && !isRepeat) {
                    if (now - lastEventTime > 150) {
                        switch (keyEvent.getKeyCode()) {
                            case KeyEvent.KEYCODE_HEADSETHOOK:
                            case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE:
                                headsetHandler.removeCallbacks(headsetRunnable);
                                headsetClickCount++;
                                if (headsetClickCount >= 3) {
                                    headsetRunnable.run();
                                } else {
                                    headsetHandler.postDelayed(headsetRunnable, 380);
                                }
                                return true;

                            case KeyEvent.KEYCODE_MEDIA_PLAY: {
                                JSObject obj = new JSObject();
                                obj.put("action", "play");
                                notifyListeners("mediaAction", obj);
                                return true;
                            }

                            case KeyEvent.KEYCODE_MEDIA_PAUSE: {
                                JSObject obj = new JSObject();
                                obj.put("action", "pause");
                                notifyListeners("mediaAction", obj);
                                return true;
                            }

                            case KeyEvent.KEYCODE_MEDIA_NEXT:
                            case KeyEvent.KEYCODE_MEDIA_FAST_FORWARD: {
                                JSObject obj = new JSObject();
                                obj.put("action", "next");
                                notifyListeners("mediaAction", obj);
                                return true;
                            }

                            case KeyEvent.KEYCODE_MEDIA_PREVIOUS:
                            case KeyEvent.KEYCODE_MEDIA_REWIND: {
                                JSObject obj = new JSObject();
                                obj.put("action", "previous");
                                notifyListeners("mediaAction", obj);
                                return true;
                            }
                        }
                    }
                }
                return super.onMediaButtonEvent(mediaButtonEvent);
            }

            @Override
            public void onPlay() {
                JSObject obj = new JSObject();
                obj.put("action", "play");
                notifyListeners("mediaAction", obj);
            }

            @Override
            public void onPause() {
                JSObject obj = new JSObject();
                obj.put("action", "pause");
                notifyListeners("mediaAction", obj);
            }

            @Override
            public void onSkipToNext() {
                JSObject obj = new JSObject();
                obj.put("action", "next");
                notifyListeners("mediaAction", obj);
            }

            @Override
            public void onSkipToPrevious() {
                JSObject obj = new JSObject();
                obj.put("action", "previous");
                notifyListeners("mediaAction", obj);
            }

            @Override
            public void onFastForward() {
                JSObject obj = new JSObject();
                obj.put("action", "next");
                notifyListeners("mediaAction", obj);
            }

            @Override
            public void onRewind() {
                JSObject obj = new JSObject();
                obj.put("action", "previous");
                notifyListeners("mediaAction", obj);
            }

            @Override
            public void onStop() {
                JSObject obj = new JSObject();
                obj.put("action", "stop");
                notifyListeners("mediaAction", obj);
            }

            @Override
            public void onSeekTo(long pos) {
                JSObject obj = new JSObject();
                obj.put("action", "seek");
                obj.put("position", pos / 1000.0);
                notifyListeners("mediaAction", obj);
            }
        });

        mediaSession.setFlags(
            MediaSessionCompat.FLAG_HANDLES_MEDIA_BUTTONS |
            MediaSessionCompat.FLAG_HANDLES_TRANSPORT_CONTROLS
        );
        mediaSession.setActive(true);

        activeSession = mediaSession;
        activePlugin = this;
        updatePlaybackStateInternal(false, 0.0);

        IntentFilter filter = new IntentFilter();
        filter.addAction("com.idxgaza.traneem.MEDIA_PREVIOUS");
        filter.addAction("com.idxgaza.traneem.MEDIA_PLAY_PAUSE");
        filter.addAction("com.idxgaza.traneem.MEDIA_NEXT");

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            getContext().registerReceiver(receiver, filter, Context.RECEIVER_EXPORTED);
        } else {
            getContext().registerReceiver(receiver, filter);
        }

        try {
            IntentFilter noisyFilter = new IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY);
            getContext().registerReceiver(noisyReceiver, noisyFilter);
        } catch (Exception ignored) {
        }
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "ترانيم - تشغيل الصوت",
                NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("إشعار التحكم في تشغيل الأناشيد من شاشة القفل ولوحة الإشعارات");
            channel.setShowBadge(false);
            channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            channel.setSound(null, null);

            NotificationManager nm = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) {
                nm.createNotificationChannel(channel);
            }
        }
    }

    @PluginMethod
    public void requestNotificationPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            boolean granted = ContextCompat.checkSelfPermission(
                getContext(),
                android.Manifest.permission.POST_NOTIFICATIONS
            ) == PackageManager.PERMISSION_GRANTED;

            if (granted) {
                JSObject res = new JSObject();
                res.put("granted", true);
                call.resolve(res);
            } else {
                try {
                    ActivityCompat.requestPermissions(
                        getActivity(),
                        new String[]{android.Manifest.permission.POST_NOTIFICATIONS},
                        1001
                    );
                    JSObject res = new JSObject();
                    res.put("granted", false);
                    res.put("requested", true);
                    call.resolve(res);
                } catch (Exception e) {
                    JSObject res = new JSObject();
                    res.put("granted", false);
                    res.put("error", e.getMessage() != null ? e.getMessage() : "Failed to request permission");
                    call.resolve(res);
                }
            }
        } else {
            JSObject res = new JSObject();
            res.put("granted", true);
            call.resolve(res);
        }
    }

    @PluginMethod
    public void checkNotificationPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            boolean granted = ContextCompat.checkSelfPermission(
                getContext(),
                android.Manifest.permission.POST_NOTIFICATIONS
            ) == PackageManager.PERMISSION_GRANTED;
            JSObject res = new JSObject();
            res.put("granted", granted);
            call.resolve(res);
        } else {
            JSObject res = new JSObject();
            res.put("granted", true);
            call.resolve(res);
        }
    }

    private String lastTitle = "ترانيم";
    private String lastArtist = "";
    private Bitmap lastBitmap = null;
    private boolean lastIsPlaying = false;

    @PluginMethod
    public void updateMetadata(PluginCall call) {
        final String title = call.getString("title", "ترانيم");
        final String artist = call.getString("artist", "");
        final String artworkUrl = call.getString("artworkUrl", "");
        final boolean isPlaying = Boolean.TRUE.equals(call.getBoolean("isPlaying", false));
        final double duration = call.getDouble("duration", 0.0);
        final double position = call.getDouble("position", 0.0);

        lastTitle = title;
        lastArtist = artist;
        lastIsPlaying = isPlaying;

        final long durationMs = (long) (duration * 1000);

        // Immediate check: If artwork is base64 data, decode it instantly on the spot
        Bitmap instantBitmap = lastBitmap;
        if (artworkUrl != null && artworkUrl.startsWith("data:image")) {
            try {
                String base64Data = artworkUrl.substring(artworkUrl.indexOf("base64,") + 7);
                byte[] decodedBytes = Base64.decode(base64Data, Base64.DEFAULT);
                instantBitmap = BitmapFactory.decodeByteArray(decodedBytes, 0, decodedBytes.length);
                if (instantBitmap != null) {
                    lastBitmap = instantBitmap;
                }
            } catch (Exception ignored) {
            }
        }
        final Bitmap targetBitmap = instantBitmap;

        // Immediate 0ms UI update with target cover bitmap
        getActivity().runOnUiThread(new Runnable() {
            @Override
            public void run() {
                if (mediaSession != null) {
                    MediaMetadataCompat.Builder immediateBuilder = new MediaMetadataCompat.Builder()
                        .putString(MediaMetadataCompat.METADATA_KEY_TITLE, title)
                        .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, artist);

                    if (durationMs > 0) {
                        immediateBuilder.putLong(MediaMetadataCompat.METADATA_KEY_DURATION, durationMs);
                    }
                    if (targetBitmap != null) {
                        immediateBuilder.putBitmap(MediaMetadataCompat.METADATA_KEY_ALBUM_ART, targetBitmap);
                        immediateBuilder.putBitmap(MediaMetadataCompat.METADATA_KEY_ART, targetBitmap);
                    }
                    mediaSession.setMetadata(immediateBuilder.build());
                }
                updatePlaybackStateInternal(isPlaying, position);
                showNotification(title, artist, targetBitmap, isPlaying);
            }
        });

        // Background asynchronous artwork fetching only for remote HTTP/HTTPS URLs
        if (artworkUrl != null && (artworkUrl.startsWith("http://") || artworkUrl.startsWith("https://"))) {
            new Thread(new Runnable() {
                @Override
                public void run() {
                    Bitmap bitmap = null;
                    try {
                        java.net.URLConnection connection = new URL(artworkUrl).openConnection();
                        connection.setConnectTimeout(2500);
                        connection.setReadTimeout(3000);
                        InputStream input = connection.getInputStream();
                        bitmap = BitmapFactory.decodeStream(input);
                    } catch (Exception ignored) {
                    }

                    if (bitmap != null) {
                        lastBitmap = bitmap;
                        final Bitmap finalBitmap = bitmap;
                        getActivity().runOnUiThread(new Runnable() {
                            @Override
                            public void run() {
                                if (mediaSession != null) {
                                    MediaMetadataCompat.Builder metadataBuilder = new MediaMetadataCompat.Builder()
                                        .putString(MediaMetadataCompat.METADATA_KEY_TITLE, title)
                                        .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, artist);

                                    if (durationMs > 0) {
                                        metadataBuilder.putLong(MediaMetadataCompat.METADATA_KEY_DURATION, durationMs);
                                    }
                                    metadataBuilder.putBitmap(MediaMetadataCompat.METADATA_KEY_ALBUM_ART, finalBitmap);
                                    metadataBuilder.putBitmap(MediaMetadataCompat.METADATA_KEY_ART, finalBitmap);

                                    mediaSession.setMetadata(metadataBuilder.build());
                                }
                                showNotification(title, artist, finalBitmap, lastIsPlaying);
                            }
                        });
                    }
                }
            }).start();
        }

        call.resolve();
    }

    @PluginMethod
    public void updatePlaybackState(PluginCall call) {
        boolean isPlaying = Boolean.TRUE.equals(call.getBoolean("isPlaying", false));
        double position = call.getDouble("position", 0.0);
        lastIsPlaying = isPlaying;
        updatePlaybackStateInternal(isPlaying, position);
        showNotification(lastTitle, lastArtist, lastBitmap, isPlaying);
        call.resolve();
    }

    private void updatePlaybackStateInternal(boolean isPlaying, double positionSeconds) {
        if (mediaSession == null) return;
        mediaSession.setActive(true);
        int state = isPlaying ? PlaybackStateCompat.STATE_PLAYING : PlaybackStateCompat.STATE_PAUSED;
        long positionMs = (long) (positionSeconds * 1000);

        PlaybackStateCompat.Builder playbackState = new PlaybackStateCompat.Builder()
            .setActions(
                PlaybackStateCompat.ACTION_PLAY |
                PlaybackStateCompat.ACTION_PAUSE |
                PlaybackStateCompat.ACTION_PLAY_PAUSE |
                PlaybackStateCompat.ACTION_SKIP_TO_NEXT |
                PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS |
                PlaybackStateCompat.ACTION_STOP |
                PlaybackStateCompat.ACTION_SEEK_TO
            )
            .setState(state, positionMs >= 0 ? positionMs : PlaybackStateCompat.PLAYBACK_POSITION_UNKNOWN, 1.0f);

        mediaSession.setPlaybackState(playbackState.build());
    }

    private void showNotification(String title, String artist, Bitmap artwork, boolean isPlaying) {
        if (mediaSession == null) return;
        MediaSessionCompat.Token token = mediaSession.getSessionToken();
        if (token == null) return;

        Context context = getContext();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            boolean granted = ContextCompat.checkSelfPermission(
                context,
                android.Manifest.permission.POST_NOTIFICATIONS
            ) == PackageManager.PERMISSION_GRANTED;
            if (!granted) return;
        }

        Intent launchIntent = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        PendingIntent pendingIntent = PendingIntent.getActivity(
            context, 0, launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        PendingIntent prevIntent = PendingIntent.getBroadcast(
            context, 0,
            new Intent("com.idxgaza.traneem.MEDIA_PREVIOUS").setPackage(context.getPackageName()),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        PendingIntent playPauseIntent = PendingIntent.getBroadcast(
            context, 1,
            new Intent("com.idxgaza.traneem.MEDIA_PLAY_PAUSE").setPackage(context.getPackageName()),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        PendingIntent nextIntent = PendingIntent.getBroadcast(
            context, 2,
            new Intent("com.idxgaza.traneem.MEDIA_NEXT").setPackage(context.getPackageName()),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        int playPauseIcon = isPlaying ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play;
        int smallIconRes = android.R.drawable.ic_media_play;
        try {
            int appIcon = context.getApplicationInfo().icon;
            if (appIcon != 0) smallIconRes = appIcon;
        } catch (Exception ignored) {
        }

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(smallIconRes)
            .setContentTitle(title)
            .setContentText((artist != null && !artist.isEmpty()) ? artist : "ترانيم")
            .setContentIntent(pendingIntent)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_TRANSPORT)
            .setOnlyAlertOnce(true)
            .setOngoing(isPlaying)
            .addAction(android.R.drawable.ic_media_previous, "السابق", prevIntent)
            .addAction(playPauseIcon, isPlaying ? "إيقاف" : "تشغيل", playPauseIntent)
            .addAction(android.R.drawable.ic_media_next, "التالي", nextIntent)
            .setStyle(
                new MediaStyle()
                    .setMediaSession(token)
                    .setShowActionsInCompactView(0, 1, 2)
            );

        if (artwork != null) {
            builder.setLargeIcon(artwork);
        }

        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) {
            nm.notify(NOTIFICATION_ID, builder.build());
        }
    }

    @PluginMethod
    public void hideNotification(PluginCall call) {
        NotificationManager nm = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) {
            nm.cancel(NOTIFICATION_ID);
        }
        call.resolve();
    }

    @PluginMethod
    public void isHeadsetConnected(PluginCall call) {
        AudioManager audioManager = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
        boolean connected = false;
        String deviceName = "مكبر الصوت";

        if (audioManager != null) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                AudioDeviceInfo[] devices = audioManager.getDevices(AudioManager.GET_DEVICES_OUTPUTS);
                for (AudioDeviceInfo device : devices) {
                    int type = device.getType();
                    if (type == AudioDeviceInfo.TYPE_WIRED_HEADSET || type == AudioDeviceInfo.TYPE_WIRED_HEADPHONES) {
                        connected = true;
                        deviceName = "سماعة سلكية";
                        break;
                    } else if (type == AudioDeviceInfo.TYPE_BLUETOOTH_A2DP || type == AudioDeviceInfo.TYPE_BLUETOOTH_SCO || type == AudioDeviceInfo.TYPE_BLE_HEADSET) {
                        connected = true;
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P && device.getProductName() != null && device.getProductName().length() > 0) {
                            deviceName = device.getProductName().toString();
                        } else {
                            deviceName = "سماعة بلوتوث";
                        }
                        break;
                    } else if (type == AudioDeviceInfo.TYPE_USB_HEADSET) {
                        connected = true;
                        deviceName = "سماعة USB";
                        break;
                    }
                }
            } else {
                @SuppressWarnings("deprecation")
                boolean isWired = audioManager.isWiredHeadsetOn();
                @SuppressWarnings("deprecation")
                boolean isBt = audioManager.isBluetoothA2dpOn();
                if (isWired) {
                    connected = true;
                    deviceName = "سماعة سلكية";
                } else if (isBt) {
                    connected = true;
                    deviceName = "سماعة بلوتوث";
                }
            }
        }

        JSObject res = new JSObject();
        res.put("connected", connected);
        res.put("deviceName", deviceName);
        call.resolve(res);
    }

    @Override
    public void handleOnDestroy() {
        if (activePlugin == this) activePlugin = null;
        if (activeSession == mediaSession) activeSession = null;
        try {
            getContext().unregisterReceiver(receiver);
        } catch (Exception ignored) {
        }
        try {
            getContext().unregisterReceiver(noisyReceiver);
        } catch (Exception ignored) {
        }
        if (mediaSession != null) {
            mediaSession.release();
            mediaSession = null;
        }
    }
}
