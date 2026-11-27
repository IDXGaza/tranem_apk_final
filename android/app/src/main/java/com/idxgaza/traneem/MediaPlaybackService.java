package com.idxgaza.traneem;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.support.v4.media.session.MediaSessionCompat;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;
import androidx.media.app.NotificationCompat.MediaStyle;

public class MediaPlaybackService extends Service {

    public static final String CHANNEL_ID = "traneem_media";
    public static final int NOTIFICATION_ID = 1;

    public static final String ACTION_START_OR_UPDATE = "com.idxgaza.traneem.ACTION_START_OR_UPDATE";
    public static final String ACTION_STOP = "com.idxgaza.traneem.ACTION_STOP";

    public static final String EXTRA_TITLE = "title";
    public static final String EXTRA_ARTIST = "artist";
    public static final String EXTRA_IS_PLAYING = "isPlaying";

    public static volatile boolean isServiceRunning = false;
    public static volatile Bitmap sharedArtwork = null;

    private PowerManager.WakeLock wakeLock = null;
    private String currentTitle = "ترانيم";
    private String currentArtist = "ترانيم";
    private boolean currentIsPlaying = false;

    @Override
    public void onCreate() {
        super.onCreate();
        isServiceRunning = true;
        createNotificationChannel();
        acquireWakeLock();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        isServiceRunning = true;

        if (intent != null) {
            String action = intent.getAction();
            if (ACTION_STOP.equals(action)) {
                releaseWakeLock();
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                    stopForeground(STOP_FOREGROUND_REMOVE);
                } else {
                    @SuppressWarnings("deprecation")
                    boolean deprecatedRemove = true;
                    stopForeground(deprecatedRemove);
                }
                stopSelf();
                return START_NOT_STICKY;
            }

            if (intent.hasExtra(EXTRA_TITLE)) {
                String t = intent.getStringExtra(EXTRA_TITLE);
                if (t != null && !t.isEmpty()) currentTitle = t;
            }
            if (intent.hasExtra(EXTRA_ARTIST)) {
                String a = intent.getStringExtra(EXTRA_ARTIST);
                currentArtist = (a != null && !a.isEmpty()) ? a : "ترانيم";
            }
            if (intent.hasExtra(EXTRA_IS_PLAYING)) {
                currentIsPlaying = intent.getBooleanExtra(EXTRA_IS_PLAYING, false);
            }
        }

        if (currentIsPlaying) {
            acquireWakeLock();
        }

        Notification notification = buildNotification(currentTitle, currentArtist, sharedArtwork, currentIsPlaying);
        promoteToForeground(notification);

        return START_STICKY;
    }

    private void promoteToForeground(Notification notification) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
            } else {
                startForeground(NOTIFICATION_ID, notification);
            }
        } catch (Exception e) {
            try {
                startForeground(NOTIFICATION_ID, notification);
            } catch (Exception ignored) {
            }
        }
    }

    private void acquireWakeLock() {
        try {
            if (wakeLock == null) {
                PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
                if (pm != null) {
                    wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "traneem:media_service_wakelock");
                    wakeLock.setReferenceCounted(false);
                }
            }
            if (wakeLock != null && !wakeLock.isHeld()) {
                wakeLock.acquire(12 * 60 * 60 * 1000L);
            }
        } catch (Exception ignored) {
        }
    }

    private void releaseWakeLock() {
        try {
            if (wakeLock != null && wakeLock.isHeld()) {
                wakeLock.release();
            }
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
            channel.setDescription("إشعار التحكم في تشغيل الأناشيد في الخلفية وشاشة القفل");
            channel.setShowBadge(false);
            channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            channel.setSound(null, null);

            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) {
                nm.createNotificationChannel(channel);
            }
        }
    }

    private Notification buildNotification(String title, String artist, Bitmap artwork, boolean isPlaying) {
        Intent launchIntent = getPackageManager().getLaunchIntentForPackage(getPackageName());
        if (launchIntent == null) {
            launchIntent = new Intent(this, MainActivity.class);
        }
        launchIntent.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);

        PendingIntent pendingIntent = PendingIntent.getActivity(
            this, 0, launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        PendingIntent prevIntent = PendingIntent.getBroadcast(
            this, 0,
            new Intent("com.idxgaza.traneem.MEDIA_PREVIOUS").setPackage(getPackageName()),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        PendingIntent playPauseIntent = PendingIntent.getBroadcast(
            this, 1,
            new Intent("com.idxgaza.traneem.MEDIA_PLAY_PAUSE").setPackage(getPackageName()),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        PendingIntent nextIntent = PendingIntent.getBroadcast(
            this, 2,
            new Intent("com.idxgaza.traneem.MEDIA_NEXT").setPackage(getPackageName()),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        int playPauseIcon = isPlaying ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play;
        int smallIconRes = android.R.drawable.ic_media_play;
        try {
            int appIcon = getApplicationInfo().icon;
            if (appIcon != 0) smallIconRes = appIcon;
        } catch (Exception ignored) {
        }

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(smallIconRes)
            .setContentTitle(title != null && !title.isEmpty() ? title : "ترانيم")
            .setContentText((artist != null && !artist.isEmpty()) ? artist : "ترانيم")
            .setContentIntent(pendingIntent)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_TRANSPORT)
            .setOnlyAlertOnce(true)
            .setOngoing(true)
            .addAction(android.R.drawable.ic_media_previous, "السابق", prevIntent)
            .addAction(playPauseIcon, isPlaying ? "إيقاف" : "تشغيل", playPauseIntent)
            .addAction(android.R.drawable.ic_media_next, "التالي", nextIntent);

        MediaSessionCompat session = MediaSessionPlugin.activeSession;
        if (session != null && session.getSessionToken() != null) {
            builder.setStyle(
                new MediaStyle()
                    .setMediaSession(session.getSessionToken())
                    .setShowActionsInCompactView(0, 1, 2)
            );
        }

        if (artwork != null) {
            builder.setLargeIcon(artwork);
        }

        return builder.build();
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        if (!currentIsPlaying) {
            releaseWakeLock();
            stopSelf();
        }
        super.onTaskRemoved(rootIntent);
    }

    @Override
    public void onDestroy() {
        isServiceRunning = false;
        releaseWakeLock();
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    public static void startOrUpdate(Context context, String title, String artist, Bitmap artwork, boolean isPlaying) {
        if (context == null) return;
        Context appCtx = context.getApplicationContext();
        sharedArtwork = artwork;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            boolean granted = ContextCompat.checkSelfPermission(
                appCtx,
                android.Manifest.permission.POST_NOTIFICATIONS
            ) == PackageManager.PERMISSION_GRANTED;
            if (!granted && !isServiceRunning && !isPlaying) {
                return;
            }
        }

        Intent serviceIntent = new Intent(appCtx, MediaPlaybackService.class);
        serviceIntent.setAction(ACTION_START_OR_UPDATE);
        serviceIntent.putExtra(EXTRA_TITLE, title != null ? title : "ترانيم");
        serviceIntent.putExtra(EXTRA_ARTIST, artist != null ? artist : "ترانيم");
        serviceIntent.putExtra(EXTRA_IS_PLAYING, isPlaying);

        try {
            ContextCompat.startForegroundService(appCtx, serviceIntent);
        } catch (Exception ignored) {
            try {
                appCtx.startService(serviceIntent);
            } catch (Exception ignored2) {
            }
        }
    }

    public static void stop(Context context) {
        if (context == null || !isServiceRunning) return;
        Context appCtx = context.getApplicationContext();
        Intent stopIntent = new Intent(appCtx, MediaPlaybackService.class);
        stopIntent.setAction(ACTION_STOP);
        try {
            appCtx.startService(stopIntent);
        } catch (Exception e) {
            try {
                appCtx.stopService(new Intent(appCtx, MediaPlaybackService.class));
            } catch (Exception ignored) {
            }
        }
    }
}
