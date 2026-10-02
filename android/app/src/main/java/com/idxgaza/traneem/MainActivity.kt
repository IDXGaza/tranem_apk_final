package com.idxgaza.traneem

import android.content.Intent
import android.os.Bundle
import android.view.KeyEvent
import com.codetrixstudio.capacitor.GoogleAuth.GoogleAuth
import com.getcapacitor.BridgeActivity

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        registerPlugin(GoogleAuth::class.java)
        registerPlugin(MediaSessionPlugin::class.java)
        super.onCreate(savedInstanceState)
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        when (event.keyCode) {
            KeyEvent.KEYCODE_MEDIA_PLAY,
            KeyEvent.KEYCODE_MEDIA_PAUSE,
            KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE,
            KeyEvent.KEYCODE_HEADSETHOOK,
            KeyEvent.KEYCODE_MEDIA_NEXT,
            KeyEvent.KEYCODE_MEDIA_PREVIOUS,
            KeyEvent.KEYCODE_MEDIA_FAST_FORWARD,
            KeyEvent.KEYCODE_MEDIA_REWIND,
            KeyEvent.KEYCODE_MEDIA_STEP_FORWARD,
            KeyEvent.KEYCODE_MEDIA_STEP_BACKWARD,
            KeyEvent.KEYCODE_MEDIA_STOP,
            KeyEvent.KEYCODE_MEDIA_RECORD -> {
                val session = MediaSessionPlugin.activeSession
                if (session != null) {
                    val mediaIntent = Intent(Intent.ACTION_MEDIA_BUTTON).apply {
                        putExtra(Intent.EXTRA_KEY_EVENT, event)
                    }
                    androidx.media.session.MediaButtonReceiver.handleIntent(session, mediaIntent)
                    return true
                }
            }
        }
        return super.dispatchKeyEvent(event)
    }
}
