package com.idxgaza.traneem

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.os.Build
import android.support.v4.media.MediaMetadataCompat
import android.support.v4.media.session.MediaSessionCompat
import android.support.v4.media.session.PlaybackStateCompat
import android.view.KeyEvent
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import androidx.media.app.NotificationCompat.MediaStyle
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.net.URL

@CapacitorPlugin(name = "MediaSession")
class MediaSessionPlugin : Plugin() {

    companion object {
        var activeSession: MediaSessionCompat? = null
        var activePlugin: MediaSessionPlugin? = null
    }

    private var mediaSession: MediaSessionCompat? = null
    private val CHANNEL_ID = "traneem_media"
    private val NOTIFICATION_ID = 1
    private var audioFocusRequest: android.media.AudioFocusRequest? = null

    private val receiver = object : android.content.BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            val action = intent?.action ?: return
            when (action) {
                "com.idxgaza.traneem.MEDIA_PREVIOUS" -> {
                    notifyListeners("mediaAction", JSObject().apply { put("action", "previous") })
                }
                "com.idxgaza.traneem.MEDIA_PLAY_PAUSE" -> {
                    notifyListeners("mediaAction", JSObject().apply { put("action", "toggle") })
                }
                "com.idxgaza.traneem.MEDIA_NEXT" -> {
                    notifyListeners("mediaAction", JSObject().apply { put("action", "next") })
                }
            }
        }
    }

    private val noisyReceiver = object : android.content.BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (intent?.action == AudioManager.ACTION_AUDIO_BECOMING_NOISY) {
                notifyListeners("mediaAction", JSObject().apply { put("action", "pause") })
                notifyListeners("headsetDisconnected", JSObject())
            }
        }
    }

    override fun load() {
        createNotificationChannel()
        
        mediaSession = MediaSessionCompat(context, "TraneemMediaSession").apply {
            setCallback(object : MediaSessionCompat.Callback() {
                private var headsetClickCount = 0
                private val headsetHandler = android.os.Handler(android.os.Looper.getMainLooper())
                private var lastEventTime = 0L
                private var lastKeyCode = 0

                private val headsetRunnable = Runnable {
                    when (headsetClickCount) {
                        1 -> notifyListeners("mediaAction", JSObject().apply { put("action", "toggle") })
                        2 -> notifyListeners("mediaAction", JSObject().apply { put("action", "next") })
                        3 -> notifyListeners("mediaAction", JSObject().apply { put("action", "previous") })
                    }
                    headsetClickCount = 0
                }

                override fun onMediaButtonEvent(mediaButtonEvent: Intent?): Boolean {
                    val keyEvent = mediaButtonEvent?.getParcelableExtra<KeyEvent>(Intent.EXTRA_KEY_EVENT) ?: return super.onMediaButtonEvent(mediaButtonEvent)
                    
                    // Touch earbuds often send ACTION_DOWN only, or rapid DOWN+UP.
                    // Process on ACTION_DOWN (or single ACTION_UP) with 70ms deduplication window.
                    val now = System.currentTimeMillis()
                    val isRepeat = (now - lastEventTime < 70) && (lastKeyCode == keyEvent.keyCode)
                    
                    if (keyEvent.action == KeyEvent.ACTION_DOWN) {
                        lastEventTime = now
                        lastKeyCode = keyEvent.keyCode

                        when (keyEvent.keyCode) {
                            KeyEvent.KEYCODE_HEADSETHOOK,
                            KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE -> {
                                headsetHandler.removeCallbacks(headsetRunnable)
                                headsetClickCount++
                                if (headsetClickCount >= 3) {
                                    headsetRunnable.run()
                                } else {
                                    headsetHandler.postDelayed(headsetRunnable, 380)
                                }
                                return true
                            }
                            KeyEvent.KEYCODE_MEDIA_PLAY -> {
                                notifyListeners("mediaAction", JSObject().apply { put("action", "play") })
                                return true
                            }
                            KeyEvent.KEYCODE_MEDIA_PAUSE -> {
                                notifyListeners("mediaAction", JSObject().apply { put("action", "pause") })
                                return true
                            }
                            KeyEvent.KEYCODE_MEDIA_NEXT,
                            KeyEvent.KEYCODE_MEDIA_FAST_FORWARD,
                            KeyEvent.KEYCODE_MEDIA_STEP_FORWARD -> {
                                notifyListeners("mediaAction", JSObject().apply { put("action", "next") })
                                return true
                            }
                            KeyEvent.KEYCODE_MEDIA_PREVIOUS,
                            KeyEvent.KEYCODE_MEDIA_REWIND,
                            KeyEvent.KEYCODE_MEDIA_STEP_BACKWARD -> {
                                notifyListeners("mediaAction", JSObject().apply { put("action", "previous") })
                                return true
                            }
                            KeyEvent.KEYCODE_MEDIA_STOP -> {
                                notifyListeners("mediaAction", JSObject().apply { put("action", "stop") })
                                return true
                            }
                            KeyEvent.KEYCODE_MEDIA_RECORD -> {
                                notifyListeners("mediaAction", JSObject().apply { put("action", "toggle") })
                                return true
                            }
                        }
                    } else if (keyEvent.action == KeyEvent.ACTION_UP && !isRepeat) {
                        // Fallback for earbuds that only emit ACTION_UP
                        if (now - lastEventTime > 150) {
                            when (keyEvent.keyCode) {
                                KeyEvent.KEYCODE_HEADSETHOOK,
                                KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE -> {
                                    headsetHandler.removeCallbacks(headsetRunnable)
                                    headsetClickCount++
                                    if (headsetClickCount >= 3) {
                                        headsetRunnable.run()
                                    } else {
                                        headsetHandler.postDelayed(headsetRunnable, 380)
                                    }
                                    return true
                                }
                                KeyEvent.KEYCODE_MEDIA_PLAY -> {
                                    notifyListeners("mediaAction", JSObject().apply { put("action", "play") })
                                    return true
                                }
                                KeyEvent.KEYCODE_MEDIA_PAUSE -> {
                                    notifyListeners("mediaAction", JSObject().apply { put("action", "pause") })
                                    return true
                                }
                                KeyEvent.KEYCODE_MEDIA_NEXT,
                                KeyEvent.KEYCODE_MEDIA_FAST_FORWARD -> {
                                    notifyListeners("mediaAction", JSObject().apply { put("action", "next") })
                                    return true
                                }
                                KeyEvent.KEYCODE_MEDIA_PREVIOUS,
                                KeyEvent.KEYCODE_MEDIA_REWIND -> {
                                    notifyListeners("mediaAction", JSObject().apply { put("action", "previous") })
                                    return true
                                }
                            }
                        }
                    }
                    return super.onMediaButtonEvent(mediaButtonEvent)
                }

                override fun onPlay() {
                    notifyListeners("mediaAction", JSObject().apply { put("action", "play") })
                }
                override fun onPause() {
                    notifyListeners("mediaAction", JSObject().apply { put("action", "pause") })
                }
                override fun onSkipToNext() {
                    notifyListeners("mediaAction", JSObject().apply { put("action", "next") })
                }
                override fun onSkipToPrevious() {
                    notifyListeners("mediaAction", JSObject().apply { put("action", "previous") })
                }
                override fun onFastForward() {
                    notifyListeners("mediaAction", JSObject().apply { put("action", "next") })
                }
                override fun onRewind() {
                    notifyListeners("mediaAction", JSObject().apply { put("action", "previous") })
                }
                override fun onStop() {
                    notifyListeners("mediaAction", JSObject().apply { put("action", "stop") })
                }
                override fun onSeekTo(pos: Long) {
                    notifyListeners("mediaAction", JSObject().apply { 
                        put("action", "seek") 
                        put("position", pos / 1000.0)
                    })
                }
            })
            setFlags(
                MediaSessionCompat.FLAG_HANDLES_MEDIA_BUTTONS or
                MediaSessionCompat.FLAG_HANDLES_TRANSPORT_CONTROLS
            )
            isActive = true
        }
        activeSession = mediaSession
        activePlugin = this
        updatePlaybackState(false, 0.0)

        val filter = android.content.IntentFilter().apply {
            addAction("com.idxgaza.traneem.MEDIA_PREVIOUS")
            addAction("com.idxgaza.traneem.MEDIA_PLAY_PAUSE")
            addAction("com.idxgaza.traneem.MEDIA_NEXT")
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            context.registerReceiver(receiver, filter, Context.RECEIVER_EXPORTED)
        } else {
            context.registerReceiver(receiver, filter)
        }

        try {
            val noisyFilter = android.content.IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY)
            context.registerReceiver(noisyReceiver, noisyFilter)
        } catch (e: Exception) {
            // ignore
        }
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "ترانيم - تشغيل الصوت",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "إشعار التحكم في تشغيل الأناشيد من شاشة القفل ولوحة الإشعارات"
                setShowBadge(false)
                lockscreenVisibility = Notification.VISIBILITY_PUBLIC
                setSound(null, null)
            }
            val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            nm.createNotificationChannel(channel)
        }
    }

    @PluginMethod
    fun requestNotificationPermission(call: PluginCall) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            val granted = ContextCompat.checkSelfPermission(
                context,
                android.Manifest.permission.POST_NOTIFICATIONS
            ) == android.content.pm.PackageManager.PERMISSION_GRANTED
            
            if (granted) {
                call.resolve(JSObject().apply { put("granted", true) })
            } else {
                try {
                    ActivityCompat.requestPermissions(
                        activity,
                        arrayOf(android.Manifest.permission.POST_NOTIFICATIONS),
                        1001
                    )
                    call.resolve(JSObject().apply { 
                        put("granted", false)
                        put("requested", true) 
                    })
                } catch (e: Exception) {
                    call.resolve(JSObject().apply { 
                        put("granted", false)
                        put("error", e.message ?: "Failed to request permission") 
                    })
                }
            }
        } else {
            // Android 12 and below do not require runtime POST_NOTIFICATIONS
            call.resolve(JSObject().apply { put("granted", true) })
        }
    }

    @PluginMethod
    fun checkNotificationPermission(call: PluginCall) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            val granted = ContextCompat.checkSelfPermission(
                context,
                android.Manifest.permission.POST_NOTIFICATIONS
            ) == android.content.pm.PackageManager.PERMISSION_GRANTED
            call.resolve(JSObject().apply { put("granted", granted) })
        } else {
            call.resolve(JSObject().apply { put("granted", true) })
        }
    }

    @PluginMethod
    fun updateMetadata(call: PluginCall) {
        val title = call.getString("title") ?: "ترانيم"
        val artist = call.getString("artist") ?: ""
        val artworkUrl = call.getString("artworkUrl") ?: ""
        val isPlaying = call.getBoolean("isPlaying") ?: false
        val duration = call.getDouble("duration") ?: 0.0
        val position = call.getDouble("position") ?: 0.0

        Thread {
            var bitmap: Bitmap? = null
            if (artworkUrl.isNotEmpty()) {
                if (artworkUrl.startsWith("http://") || artworkUrl.startsWith("https://")) {
                    try {
                        val connection = URL(artworkUrl).openConnection()
                        connection.connectTimeout = 3000
                        connection.readTimeout = 4000
                        bitmap = BitmapFactory.decodeStream(connection.getInputStream())
                    } catch (e: Exception) {
                        // استمر بدون صورة
                    }
                } else if (artworkUrl.startsWith("data:image")) {
                    try {
                        val base64Data = artworkUrl.substringAfter("base64,")
                        val decodedBytes = android.util.Base64.decode(base64Data, android.util.Base64.DEFAULT)
                        bitmap = BitmapFactory.decodeByteArray(decodedBytes, 0, decodedBytes.size)
                    } catch (e: Exception) {
                        // استمر بدون صورة
                    }
                }
            }
            val finalBitmap = bitmap
            activity.runOnUiThread {
                val durationMs = (duration * 1000).toLong()
                val metadataBuilder = MediaMetadataCompat.Builder()
                    .putString(MediaMetadataCompat.METADATA_KEY_TITLE, title)
                    .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, artist)
                
                if (durationMs > 0) {
                    metadataBuilder.putLong(MediaMetadataCompat.METADATA_KEY_DURATION, durationMs)
                }
                if (finalBitmap != null) {
                    metadataBuilder.putBitmap(MediaMetadataCompat.METADATA_KEY_ALBUM_ART, finalBitmap)
                    metadataBuilder.putBitmap(MediaMetadataCompat.METADATA_KEY_ART, finalBitmap)
                }
                
                mediaSession?.setMetadata(metadataBuilder.build())
                updatePlaybackState(isPlaying, position)

                val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as android.media.AudioManager

                if (isPlaying) {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        val focusRequest = android.media.AudioFocusRequest.Builder(android.media.AudioManager.AUDIOFOCUS_GAIN)
                            .setAudioAttributes(
                                android.media.AudioAttributes.Builder()
                                    .setUsage(android.media.AudioAttributes.USAGE_MEDIA)
                                    .setContentType(android.media.AudioAttributes.CONTENT_TYPE_MUSIC)
                                    .build()
                            )
                            .setWillPauseWhenDucked(true)
                            .setAcceptsDelayedFocusGain(true)
                            .setOnAudioFocusChangeListener { focusChange ->
                                when (focusChange) {
                                    android.media.AudioManager.AUDIOFOCUS_LOSS,
                                    android.media.AudioManager.AUDIOFOCUS_LOSS_TRANSIENT -> {
                                        activity.runOnUiThread {
                                            notifyListeners("mediaAction", JSObject().apply { put("action", "pause") })
                                        }
                                    }
                                    android.media.AudioManager.AUDIOFOCUS_GAIN -> {
                                        activity.runOnUiThread {
                                            notifyListeners("mediaAction", JSObject().apply { put("action", "play") })
                                        }
                                    }
                                }
                            }
                            .build()
                        audioFocusRequest = focusRequest
                        audioManager.requestAudioFocus(focusRequest)
                    } else {
                        @Suppress("DEPRECATION")
                        audioManager.requestAudioFocus(
                            { focusChange ->
                                when (focusChange) {
                                    android.media.AudioManager.AUDIOFOCUS_LOSS,
                                    android.media.AudioManager.AUDIOFOCUS_LOSS_TRANSIENT -> {
                                        activity.runOnUiThread {
                                            notifyListeners("mediaAction", JSObject().apply { put("action", "pause") })
                                        }
                                    }
                                    android.media.AudioManager.AUDIOFOCUS_GAIN -> {
                                        activity.runOnUiThread {
                                            notifyListeners("mediaAction", JSObject().apply { put("action", "play") })
                                        }
                                    }
                                }
                            },
                            android.media.AudioManager.STREAM_MUSIC,
                            android.media.AudioManager.AUDIOFOCUS_GAIN
                        )
                    }
                } else {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        audioFocusRequest?.let {
                            audioManager.abandonAudioFocusRequest(it)
                            audioFocusRequest = null
                        }
                    } else {
                        @Suppress("DEPRECATION")
                        audioManager.abandonAudioFocus(null)
                    }
                }

                showNotification(title, artist, finalBitmap, isPlaying)
            }
        }.start()
        call.resolve()
    }

    @PluginMethod
    fun updatePlaybackState(call: PluginCall) {
        val isPlaying = call.getBoolean("isPlaying") ?: false
        val position = call.getDouble("position") ?: 0.0
        updatePlaybackState(isPlaying, position)
        call.resolve()
    }

    private fun updatePlaybackState(isPlaying: Boolean, positionSeconds: Double = 0.0) {
        mediaSession?.isActive = true
        val state = if (isPlaying) PlaybackStateCompat.STATE_PLAYING else PlaybackStateCompat.STATE_PAUSED
        val positionMs = (positionSeconds * 1000).toLong()
        
        val playbackState = PlaybackStateCompat.Builder()
            .setActions(
                PlaybackStateCompat.ACTION_PLAY or
                PlaybackStateCompat.ACTION_PAUSE or
                PlaybackStateCompat.ACTION_PLAY_PAUSE or
                PlaybackStateCompat.ACTION_SKIP_TO_NEXT or
                PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS or
                PlaybackStateCompat.ACTION_STOP or
                PlaybackStateCompat.ACTION_SEEK_TO
            )
            .setState(state, if (positionMs >= 0) positionMs else PlaybackStateCompat.PLAYBACK_POSITION_UNKNOWN, 1.0f)
            .build()
        mediaSession?.setPlaybackState(playbackState)
    }

    private fun showNotification(title: String, artist: String, artwork: Bitmap?, isPlaying: Boolean) {
        val token = mediaSession?.sessionToken ?: return

        // On Android 13+, check POST_NOTIFICATIONS permission
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            val granted = ContextCompat.checkSelfPermission(
                context,
                android.Manifest.permission.POST_NOTIFICATIONS
            ) == android.content.pm.PackageManager.PERMISSION_GRANTED
            if (!granted) {
                try {
                    ActivityCompat.requestPermissions(
                        activity,
                        arrayOf(android.Manifest.permission.POST_NOTIFICATIONS),
                        1001
                    )
                } catch (e: Exception) {
                    // ignore
                }
                return
            }
        }

        val launchIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)
        val pendingIntent = PendingIntent.getActivity(
            context, 0, launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val prevIntent = PendingIntent.getBroadcast(
            context, 0,
            Intent("com.idxgaza.traneem.MEDIA_PREVIOUS").apply { setPackage(context.packageName) },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val playPauseIntent = PendingIntent.getBroadcast(
            context, 1,
            Intent("com.idxgaza.traneem.MEDIA_PLAY_PAUSE").apply { setPackage(context.packageName) },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val nextIntent = PendingIntent.getBroadcast(
            context, 2,
            Intent("com.idxgaza.traneem.MEDIA_NEXT").apply { setPackage(context.packageName) },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val playPauseIcon = if (isPlaying) android.R.drawable.ic_media_pause else android.R.drawable.ic_media_play

        val smallIconRes = try {
            val appIcon = context.applicationInfo.icon
            if (appIcon != 0) appIcon else android.R.drawable.ic_media_play
        } catch (e: Exception) {
            android.R.drawable.ic_media_play
        }

        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(smallIconRes)
            .setContentTitle(title)
            .setContentText(if (artist.isNotEmpty()) artist else "ترانيم")
            .setContentIntent(pendingIntent)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_TRANSPORT)
            .setOnlyAlertOnce(true)
            .setOngoing(isPlaying)
            .apply { if (artwork != null) setLargeIcon(artwork) }
            .addAction(android.R.drawable.ic_media_previous, "السابق", prevIntent)
            .addAction(playPauseIcon, if (isPlaying) "إيقاف" else "تشغيل", playPauseIntent)
            .addAction(android.R.drawable.ic_media_next, "التالي", nextIntent)
            .setStyle(
                MediaStyle()
                    .setMediaSession(token)
                    .setShowActionsInCompactView(0, 1, 2)
            )
            .build()

        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.notify(NOTIFICATION_ID, notification)
    }

    @PluginMethod
    fun hideNotification(call: PluginCall) {
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.cancel(NOTIFICATION_ID)
        call.resolve()
    }

    @PluginMethod
    fun isHeadsetConnected(call: PluginCall) {
        val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        var connected = false
        var deviceName = "مكبر الصوت"
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            val devices = audioManager.getDevices(AudioManager.GET_DEVICES_OUTPUTS)
            for (device in devices) {
                when (device.type) {
                    AudioDeviceInfo.TYPE_WIRED_HEADSET,
                    AudioDeviceInfo.TYPE_WIRED_HEADPHONES -> {
                        connected = true
                        deviceName = "سماعة سلكية"
                        break
                    }
                    AudioDeviceInfo.TYPE_BLUETOOTH_A2DP,
                    AudioDeviceInfo.TYPE_BLUETOOTH_SCO,
                    AudioDeviceInfo.TYPE_BLE_HEADSET -> {
                        connected = true
                        deviceName = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P && device.productName.isNotEmpty()) {
                            device.productName.toString()
                        } else {
                            "سماعة بلوتوث"
                        }
                        break
                    }
                    AudioDeviceInfo.TYPE_USB_HEADSET -> {
                        connected = true
                        deviceName = "سماعة USB"
                        break
                    }
                }
            }
        } else {
            @Suppress("DEPRECATION")
            if (audioManager.isWiredHeadsetOn) {
                connected = true
                deviceName = "سماعة سلكية"
            } else if (audioManager.isBluetoothA2dpOn) {
                connected = true
                deviceName = "سماعة بلوتوث"
            }
        }
        call.resolve(JSObject().apply {
            put("connected", connected)
            put("deviceName", deviceName)
        })
    }

    override fun handleOnDestroy() {
        if (activePlugin == this) activePlugin = null
        if (activeSession == mediaSession) activeSession = null
        try {
            context.unregisterReceiver(receiver)
        } catch (e: Exception) {
            // Ignore if not registered
        }
        try {
            context.unregisterReceiver(noisyReceiver)
        } catch (e: Exception) {
            // Ignore if not registered
        }
        mediaSession?.release()
        mediaSession = null
    }
}
