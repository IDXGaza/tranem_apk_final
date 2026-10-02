package com.idxgaza.traneem;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import androidx.media.session.MediaButtonReceiver;
import android.support.v4.media.session.MediaSessionCompat;

public class MyMediaButtonReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (Intent.ACTION_MEDIA_BUTTON.equals(intent.getAction())) {
            MediaSessionCompat session = MediaSessionPlugin.activeSession;
            if (session != null && session.isActive()) {
                MediaButtonReceiver.handleIntent(session, intent);
                if (isOrderedBroadcast()) {
                    abortBroadcast();
                }
            }
        }
    }
}
