import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { Track } from '../types';
import { dbService } from './db';

/**
 * Converts a Blob or Uint8Array to Base64 string for Capacitor Filesystem
 */
async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(',')[1];
      resolve(base64);
    };
    reader.readAsDataURL(blob);
  });
}

export async function shareTrackAudio(track: Track): Promise<{ success: boolean; method: 'native' | 'web_share' | 'download' | 'error'; message?: string }> {
  try {
    let audioBlob: Blob | null = null;

    // 1. Fetch audio binary data
    if (track.audioBlobKey) {
      audioBlob = await dbService.getAudioBlob(track.audioBlobKey);
    }

    if (!audioBlob && track.audioUrl) {
      try {
        const response = await fetch(track.audioUrl);
        audioBlob = await response.blob();
      } catch (e) {
        console.warn('Could not fetch audio URL blob', e);
      }
    }

    const cleanFileName = `${track.title.replace(/[/\\?%*:|"<>]/g, '_')}.mp3`;

    // 2. NATIVE APK PLATFORM
    if (Capacitor.isNativePlatform()) {
      if (audioBlob) {
        const base64Data = await blobToBase64(audioBlob);
        const fileResult = await Filesystem.writeFile({
          path: cleanFileName,
          data: base64Data,
          directory: Directory.Cache,
        });

        await Share.share({
          title: track.title,
          text: `استمع إلى أنشودة "${track.title}" للمنشد ${track.reciter} عبر تطبيق ترانيم`,
          url: fileResult.uri,
          dialogTitle: `مشاركة ${track.title}`,
        });

        return { success: true, method: 'native' };
      } else {
        await Share.share({
          title: track.title,
          text: `استمع إلى أنشودة "${track.title}" للمنشد ${track.reciter} عبر تطبيق ترانيم`,
          url: track.audioUrl,
          dialogTitle: `مشاركة ${track.title}`,
        });
        return { success: true, method: 'native' };
      }
    }

    // 3. WEB / PWA PLATFORM
    if (audioBlob) {
      const audioFile = new File([audioBlob], cleanFileName, { type: audioBlob.type || 'audio/mpeg' });

      // Check if browser supports Web Share API with files
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [audioFile] })) {
        try {
          await navigator.share({
            files: [audioFile],
            title: track.title,
            text: `استمع إلى أنشودة "${track.title}" للمنشد ${track.reciter}`,
          });
          return { success: true, method: 'web_share' };
        } catch (shareErr: any) {
          // If user cancelled or permission denied (NotAllowedError)
          if (shareErr.name === 'AbortError') {
            return { success: false, method: 'web_share', message: 'تم إلغاء المشاركة' };
          }
          // On NotAllowedError or restriction, fallback cleanly to direct file download
          return downloadTrackFile(audioBlob, cleanFileName);
        }
      } else {
        // Fallback to direct file download
        return downloadTrackFile(audioBlob, cleanFileName);
      }
    } else {
      // Fallback download or copy link
      if (navigator.share) {
        try {
          await navigator.share({
            title: track.title,
            text: `استمع إلى أنشودة "${track.title}" للمنشد ${track.reciter}`,
            url: window.location.href,
          });
          return { success: true, method: 'web_share' };
        } catch (e) {
          return { success: false, method: 'web_share' };
        }
      }
    }

    return { success: false, method: 'error', message: 'تعذر الوصول إلى ملف الصوت لمشاركته' };
  } catch (error: any) {
    console.warn('Share track error:', error);
    return { success: false, method: 'error', message: error.message || 'حدث خطأ أثناء المشاركة' };
  }
}

function downloadTrackFile(blob: Blob, fileName: string): { success: boolean; method: 'download'; message?: string } {
  try {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    setTimeout(() => {
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
    }, 1000);
    return { success: true, method: 'download', message: 'تم تنزيل الملف الصوتي بنجاح' };
  } catch (e: any) {
    return { success: false, method: 'download', message: 'فشل تنزيل الملف الصوتي' };
  }
}
