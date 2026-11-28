
import { Capacitor, registerPlugin } from '@capacitor/core';
const MediaSession = registerPlugin<{
  updateMetadata: (opts: { 
    title: string; 
    artist: string; 
    artworkUrl: string; 
    isPlaying: boolean; 
    duration?: number; 
    position?: number; 
    playbackRate?: number;
  }) => Promise<void>;
  updatePlaybackState: (opts: { isPlaying: boolean; position?: number; duration?: number; playbackRate?: number }) => Promise<void>;
  hideNotification: () => Promise<void>;
  requestNotificationPermission: () => Promise<{ granted: boolean; requested?: boolean }>;
  checkNotificationPermission: () => Promise<{ granted: boolean }>;
  isHeadsetConnected: () => Promise<{ connected: boolean; deviceName?: string }>;
  isIgnoringBatteryOptimizations: () => Promise<{ isIgnoring: boolean }>;
  requestIgnoreBatteryOptimizations: () => Promise<{ requested: boolean }>;
  openBatterySettings: () => Promise<{ opened: boolean }>;
}>('MediaSession');
import React, { useState, useRef, useEffect, useCallback } from 'react';
import * as fflate from 'fflate';
import { Track, Timestamp, PlayerState } from './types';
import Sidebar from './components/Sidebar';
import Player from './components/Player';
import TimestampManager from './components/TimestampManager';
import MarqueeText from './components/MarqueeText';
import RecordingScreen from './components/RecordingScreen';
import { useAudioRecorder } from './hooks/useAudioRecorder';
import GoogleDriveBackupModal from './components/GoogleDriveBackupModal';
import ImageCropperModal from './components/ImageCropperModal';
import { ShareTrackModal } from './components/ShareTrackModal';
import {
  HeadphoneControlsModal,
  SoundProfile,
  HeadphoneGestureSettings,
  DEFAULT_HEADPHONE_GESTURES,
  HeadphoneActionType,
  CustomEqSettings
} from './components/HeadphoneControlsModal';
import { motion, AnimatePresence } from 'framer-motion';
import { Headphones } from 'lucide-react';
import { UserBadge } from './components/UserBadge';

// Unified robust database service (anti-data-loss & safety vault)
import {
  saveTrackToDB,
  deleteTrackFromDB,
  getAllTracksFromDB,
  getTrackFromDB,
  updateTracksMetaCache,
  ensureStoragePersistence
} from './services/db';

const UNIFORM_PLACEHOLDER = "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=600&h=600&auto=format&fit=crop";

const deletedTrackIds = new Set<string>();

const getAudioDuration = (file: File): Promise<number> => {
  return new Promise((resolve) => {
    try {
      const audio = new Audio();
      const url = URL.createObjectURL(file);
      audio.src = url;
      audio.onloadedmetadata = () => {
        const dur = audio.duration;
        URL.revokeObjectURL(url);
        if (isFinite(dur) && !isNaN(dur) && dur > 0) {
          resolve(dur);
        } else {
          resolve(0);
        }
      };
      audio.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(0);
      };
    } catch (e) {
      resolve(0);
    }
  });
};

const App: React.FC = () => {
  const [tracks, setTracks] = useState<Track[]>(() => {
    try {
      const cached = localStorage.getItem('traneem_meta_cache');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch {
      return [];
    }
    return [];
  });

  const [isInitialLoading, setIsInitialLoading] = useState<boolean>(() => {
    try {
      const cached = localStorage.getItem('traneem_meta_cache');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return false;
        }
      }
    } catch {}
    return true;
  });

  const [currentTrackIndex, setCurrentTrackIndex] = useState<number | null>(() => {
    try {
      const cached = localStorage.getItem('traneem_meta_cache');
      const list = cached ? JSON.parse(cached) : [];
      if (Array.isArray(list) && list.length > 0) {
        const restoredId = localStorage.getItem('lastPlayedTrackId');
        const idx = list.findIndex((t: any) => t.id === restoredId);
        return idx !== -1 ? idx : 0;
      }
    } catch {
      return null;
    }
    return null;
  });

  const [soundProfile, setSoundProfile] = useState<SoundProfile>(() => {
    return (localStorage.getItem('traneem_sound_profile') as SoundProfile) || 'balanced';
  });

  const [customEq, setCustomEq] = useState<CustomEqSettings>(() => {
    try {
      const cached = localStorage.getItem('traneem_custom_eq');
      return cached ? JSON.parse(cached) : { bass: 0, mid: 0, treble: 0, gain: 1.0 };
    } catch {
      return { bass: 0, mid: 0, treble: 0, gain: 1.0 };
    }
  });

  const [gestureSettings, setGestureSettings] = useState<HeadphoneGestureSettings>(() => {
    try {
      const cached = localStorage.getItem('traneem_headphone_gestures');
      return cached ? { ...DEFAULT_HEADPHONE_GESTURES, ...JSON.parse(cached) } : DEFAULT_HEADPHONE_GESTURES;
    } catch {
      return DEFAULT_HEADPHONE_GESTURES;
    }
  });

  const gestureSettingsRef = useRef<HeadphoneGestureSettings>(gestureSettings);
  useEffect(() => {
    gestureSettingsRef.current = gestureSettings;
  }, [gestureSettings]);

  const [storagePersisted, setStoragePersisted] = useState(false);

  const bassFilterRef = useRef<BiquadFilterNode | null>(null);
  const midBassFilterRef = useRef<BiquadFilterNode | null>(null);
  const midFilterRef = useRef<BiquadFilterNode | null>(null);
  const trebleFilterRef = useRef<BiquadFilterNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const compressorRef = useRef<DynamicsCompressorNode | null>(null);

  // Request storage persistence and track application usage & opens
  useEffect(() => {
    if (typeof window !== 'undefined') {
      ensureStoragePersistence().then((persisted) => {
        setStoragePersisted(persisted);
        console.log("📦 Storage persistence status:", persisted);
      }).catch((err) => {
        console.error("❌ Storage persistence request failed:", err);
      });

      // Track application open count
      try {
        const currentCount = parseInt(localStorage.getItem('app_open_count') || '0', 10);
        localStorage.setItem('app_open_count', (currentCount + 1).toString());
      } catch (e) {
        console.error("Failed to update open count", e);
      }

      // Track total usage time
      const interval = setInterval(() => {
        try {
          const currentUsage = parseInt(localStorage.getItem('app_total_usage_time') || '0', 10);
          localStorage.setItem('app_total_usage_time', (currentUsage + 1).toString());
        } catch (e) {
          console.error("Failed to update usage time", e);
        }
      }, 1000);

      return () => clearInterval(interval);
    }
  }, []);
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth >= 1024;
    }
    return false;
  });
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isDriveModalOpen, setIsDriveModalOpen] = useState(false);
  const [backupModalMode, setBackupModalMode] = useState<'backup' | 'import' | null>(null);
  const [isBackupProcessing, setIsBackupProcessing] = useState(false);
  const [backupStatusMessage, setBackupStatusMessage] = useState<string | null>(null);
  const [showBackupReminder, setShowBackupReminder] = useState(false);
  const [shuffleHistory, setShuffleHistory] = useState<number[]>([]);
  const [cropperData, setCropperData] = useState<{ image: string; file: File } | null>(null);
  const [sharingTrack, setSharingTrack] = useState<Track | null>(null);
  const [isHeadphonesModalOpen, setIsHeadphonesModalOpen] = useState(false);
  const [isHeadsetConnected, setIsHeadsetConnected] = useState(false);
  const [headsetDeviceName, setHeadsetDeviceName] = useState('مكبر الصوت الافتراضي');
  const lastStatsUpdateRef = useRef<number>(0);

  // Metadata editing state
  const [editingTrack, setEditingTrack] = useState<Track | null>(null);
  const [editName, setEditName] = useState('');
  const [editArtist, setEditArtist] = useState('');
  const [editMode, setEditMode] = useState<'name' | 'artist'>('name');



  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) {
        setIsSidebarOpen(true);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Backup Reminder Logic
  useEffect(() => {
    const lastBackupTime = parseInt(localStorage.getItem('lastBackupTime') || '0');
    const tracksCountAtLastBackup = parseInt(localStorage.getItem('tracksCountAtLastBackup') || '0');
    
    if (lastBackupTime === 0) {
      // First time, initialize
      localStorage.setItem('lastBackupTime', Date.now().toString());
      localStorage.setItem('tracksCountAtLastBackup', tracks.length.toString());
      return;
    }

    const sevenDaysInMs = 7 * 24 * 60 * 60 * 1000;
    const hasAddedMoreThanFive = tracks.length - tracksCountAtLastBackup > 5;
    const isOlderThanSevenDays = (Date.now() - lastBackupTime) > sevenDaysInMs;

    if (hasAddedMoreThanFive && isOlderThanSevenDays) {
      setShowBackupReminder(true);
    } else {
      setShowBackupReminder(false);
    }
  }, [tracks.length]);

  const recordSuccessfulBackup = () => {
    localStorage.setItem('lastBackupTime', Date.now().toString());
    localStorage.setItem('tracksCountAtLastBackup', tracks.length.toString());
    setShowBackupReminder(false);
  };

const compressImageBlob = (
  blob: Blob,
  maxDim: number = 250,
  quality: number = 0.65,
  preferWebP: boolean = false
): Promise<Blob> => {
  return new Promise((resolve) => {
    const img = new Image();
    const objUrl = URL.createObjectURL(blob);
    img.src = objUrl;
    img.onload = () => {
      URL.revokeObjectURL(objUrl);
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(blob);
        return;
      }
      let w = img.width;
      let h = img.height;
      if (w > maxDim || h > maxDim) {
        if (w > h) {
          h = Math.round((h * maxDim) / w);
          w = maxDim;
        } else {
          w = Math.round((w * maxDim) / h);
          h = maxDim;
        }
      }
      canvas.width = Math.max(1, w);
      canvas.height = Math.max(1, h);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      const finishJpeg = () => {
        canvas.toBlob((jpegBlob) => {
          resolve(jpegBlob && jpegBlob.size < blob.size ? jpegBlob : blob);
        }, 'image/jpeg', quality);
      };

      if (preferWebP) {
        canvas.toBlob((webpBlob) => {
          if (webpBlob && webpBlob.size > 0 && webpBlob.type === 'image/webp') {
            resolve(webpBlob.size < blob.size ? webpBlob : blob);
          } else {
            finishJpeg();
          }
        }, 'image/webp', quality);
      } else {
        canvas.toBlob((resultBlob) => {
          resolve(resultBlob || blob);
        }, 'image/jpeg', quality);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(objUrl);
      resolve(blob);
    };
  });
};

const computeBlobFastHash = async (blob: Blob): Promise<string> => {
  const size = blob.size;
  const head = new Uint8Array(await blob.slice(0, Math.min(4096, size)).arrayBuffer());
  const tailStart = Math.max(0, size - 4096);
  const tail = new Uint8Array(await blob.slice(tailStart, size).arrayBuffer());
  let h1 = 2166136261;
  for (let i = 0; i < head.length; i++) {
    h1 ^= head[i];
    h1 = Math.imul(h1, 16777619);
  }
  let h2 = 2166136261;
  for (let i = 0; i < tail.length; i++) {
    h2 ^= tail[i];
    h2 = Math.imul(h2, 16777619);
  }
  return `${size}_${(h1 >>> 0).toString(36)}_${(h2 >>> 0).toString(36)}`;
};

const encodeMonoWav16 = (samples: Float32Array, sampleRate: number): Blob => {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }
  return new Blob([buffer], { type: 'audio/wav' });
};

const optimizeWavAudioForBackup = async (blob: Blob): Promise<Blob> => {
  try {
    if (blob.size < 512 * 1024) return blob;
    const headerBuf = await blob.slice(0, 44).arrayBuffer();
    if (headerBuf.byteLength < 44) return blob;
    const hv = new DataView(headerBuf);
    const isRiff = hv.getUint32(0, false) === 0x52494646; // "RIFF"
    const isWave = hv.getUint32(8, false) === 0x57415645; // "WAVE"
    if (!isRiff || !isWave) return blob;

    const channels = hv.getUint16(22, true);
    const sampleRate = hv.getUint32(24, true);
    const bitsPerSample = hv.getUint16(34, true);
    if (channels === 1 && sampleRate <= 22050 && bitsPerSample <= 16) return blob;

    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    const OfflineCtx = window.OfflineAudioContext || (window as any).webkitOfflineAudioContext;
    if (!AudioCtx || !OfflineCtx) return blob;

    const tempCtx = new AudioCtx();
    const rawBuf = await blob.arrayBuffer();
    const decoded = await tempCtx.decodeAudioData(rawBuf);
    tempCtx.close().catch(() => {});

    const targetRate = 22050;
    const targetLength = Math.max(1, Math.ceil(decoded.duration * targetRate));
    const offline = new OfflineCtx(1, targetLength, targetRate);
    const src = offline.createBufferSource();
    src.buffer = decoded;
    src.connect(offline.destination);
    src.start(0);
    const rendered = await offline.startRendering();
    const compactWav = encodeMonoWav16(rendered.getChannelData(0), targetRate);
    return compactWav.size < blob.size ? compactWav : blob;
  } catch {
    return blob;
  }
};

  const backupCancelRef = useRef(false);

  const createBackupZipBlob = async (
    metadataOnly: boolean = false, 
    excludedTrackIds: string[] = [], 
    compressCovers: boolean = true
  ): Promise<Blob> => {
    setIsBackupProcessing(true);
    setBackupStatusMessage('⏳ جاري جلب البيانات من الذاكرة...');
    backupCancelRef.current = false;
    try {
      const allTracks = await getAllTracksFromDB();
      const filteredTracks = allTracks.filter(t => !excludedTrackIds.includes(t.id));

      const audioKeyToPathMap = new Map<string, string>();
      const coverKeyToPathMap = new Map<string, string>();
      const compactMetadataList: any[] = [];

      const zipChunks: Uint8Array<ArrayBuffer>[] = [];
      let zipError: Error | null = null;
      let resolveZipDone!: (blob: Blob) => void;
      let rejectZipDone!: (err: any) => void;
      const zipDonePromise = new Promise<Blob>((resolve, reject) => {
        resolveZipDone = resolve;
        rejectZipDone = reject;
      });

      const zip = new fflate.Zip((err, chunk, final) => {
        if (err) {
          zipError = err;
          rejectZipDone(err);
          return;
        }
        if (chunk && chunk.length > 0) {
          zipChunks.push(new Uint8Array(chunk));
        }
        if (final) {
          resolveZipDone(new Blob(zipChunks, { type: 'application/zip' }));
        }
      });

      const pushStreamedEntry = async (path: string, data: Uint8Array) => {
        const entry = new fflate.ZipDeflate(path, { level: 9, mem: 12 });
        zip.add(entry);
        const CHUNK_SIZE = 512 * 1024;
        if (data.length === 0) {
          entry.push(new Uint8Array(0), true);
          return;
        }
        for (let offset = 0; offset < data.length; offset += CHUNK_SIZE) {
          if (backupCancelRef.current) throw new Error('CANCELLED');
          const end = Math.min(offset + CHUNK_SIZE, data.length);
          const isLast = end >= data.length;
          entry.push(data.subarray(offset, end), isLast);
          if (!isLast) {
            await new Promise((r) => setTimeout(r, 0));
          }
        }
      };

      for (let i = 0; i < filteredTracks.length; i++) {
        if (backupCancelRef.current || zipError) throw new Error('CANCELLED');
        const t = filteredTracks[i];

        setBackupStatusMessage(`🗜️ ضغط أقصى (${i + 1}/${filteredTracks.length}): ${t.name}`);

        const trackMeta: any = {
          id: t.id,
          name: t.name,
          artist: t.artist || '',
          isFavorite: !!t.isFavorite,
          timestamps: Array.isArray(t.timestamps) ? t.timestamps : [],
          duration: t.duration || 0,
          playbackRate: t.playbackRate || 1,
          order: t.order ?? i,
          playCount: t.playCount || 0,
          listenTime: t.listenTime || 0,
          sourceType: t.sourceType || 'import',
        };

        if (!metadataOnly && t.fileBlob) {
          let audioBlob: Blob = t.fileBlob;
          const isWav = (audioBlob as File).name?.toLowerCase().endsWith('.wav') ||
            audioBlob.type === 'audio/wav' ||
            audioBlob.type === 'audio/x-wav';
          if (isWav) {
            audioBlob = await optimizeWavAudioForBackup(audioBlob);
          }

          const fileKey = await computeBlobFastHash(audioBlob);
          if (audioKeyToPathMap.has(fileKey)) {
            trackMeta.fileBlobPath = audioKeyToPathMap.get(fileKey)!;
          } else {
            const buf = new Uint8Array(await audioBlob.arrayBuffer());
            const path = `a/${t.id}.bin`;
            await pushStreamedEntry(path, buf);
            trackMeta.fileBlobPath = path;
            audioKeyToPathMap.set(fileKey, path);
          }
          if (audioBlob.type) {
            trackMeta.fileMimeType = audioBlob.type;
          }
        }

        if (!metadataOnly && t.coverBlob) {
          let processedCover: Blob = t.coverBlob;
          if (compressCovers) {
            try {
              processedCover = await compressImageBlob(t.coverBlob, 150, 0.45, true);
            } catch (err) {
              console.error("Cover compression failed:", t.name, err);
            }
          }
          const coverKey = await computeBlobFastHash(processedCover);
          if (coverKeyToPathMap.has(coverKey)) {
            trackMeta.coverBlobPath = coverKeyToPathMap.get(coverKey)!;
          } else {
            const coverBuf = new Uint8Array(await processedCover.arrayBuffer());
            const coverPath = `c/${t.id}.bin`;
            await pushStreamedEntry(coverPath, coverBuf);
            trackMeta.coverBlobPath = coverPath;
            coverKeyToPathMap.set(coverKey, coverPath);
          }
          if (processedCover.type) {
            trackMeta.coverMimeType = processedCover.type;
          }
        }

        compactMetadataList.push(trackMeta);
        // Yield to UI loop between tracks to prevent memory spikes and keep app responsive
        await new Promise((r) => setTimeout(r, 0));
      }

      if (backupCancelRef.current) throw new Error('CANCELLED');

      setBackupStatusMessage('📦 جاري التجميع النهائي بأقصى ضغط...');
      const metaBytes = fflate.strToU8(JSON.stringify(compactMetadataList));
      await pushStreamedEntry('metadata.json', metaBytes);
      zip.end();

      return await zipDonePromise;
    } catch (err: any) {
      if (err?.message === 'CANCELLED' || err?.message === 'العملية ألغيت') {
        throw new Error('CANCELLED');
      }
      throw err;
    } finally {
      setIsBackupProcessing(false);
    }
  };

  const handleRestoreFromZipBlob = async (blob: Blob) => {
    setIsBackupProcessing(true);
    setBackupStatusMessage('جاري فك واستعادة البيانات...');
    try {
      const buffer = await blob.arrayBuffer();
      const data = new Uint8Array(buffer);
      
      const decompressed = await new Promise<Record<string, Uint8Array>>((resolve, reject) => {
        fflate.unzip(data, (err, result) => {
          if (err) reject(err);
          else resolve(result);
        });
      });
      
      const metadataU8 = decompressed["metadata.json"];
      if (!metadataU8) throw new Error("الملف غير صالح (مفقود metadata.json)");
      
      const metadata = JSON.parse(fflate.strFromU8(metadataU8));
      
      // Restore in small batches to avoid memory spikes on mobile
      const BATCH_SIZE = 5;
      for (let i = 0; i < metadata.length; i += BATCH_SIZE) {
        const batch = metadata.slice(i, i + BATCH_SIZE);
        setBackupStatusMessage(`جاري استعادة الأناشيد (${Math.min(i + BATCH_SIZE, metadata.length)}/${metadata.length})...`);
        await Promise.all(batch.map(async (t: any) => {
          const trackToSave = { ...t };

          let existingTrack: any = null;
          try {
            existingTrack = await getTrackFromDB(t.id);
          } catch (_) {}

          if (t.fileBlobPath && decompressed[t.fileBlobPath]) {
            trackToSave.fileBlob = new Blob(
              [decompressed[t.fileBlobPath]] as any,
              t.fileMimeType ? { type: t.fileMimeType } : undefined
            );
            delete trackToSave.fileBlobPath;
            delete trackToSave.fileMimeType;
          } else if (existingTrack && existingTrack.fileBlob) {
            trackToSave.fileBlob = existingTrack.fileBlob;
            delete trackToSave.fileBlobPath;
          }

          if (t.coverBlobPath && decompressed[t.coverBlobPath]) {
            trackToSave.coverBlob = new Blob(
              [decompressed[t.coverBlobPath]] as any,
              t.coverMimeType ? { type: t.coverMimeType } : undefined
            );
            delete trackToSave.coverBlobPath;
            delete trackToSave.coverMimeType;
          } else if (existingTrack && existingTrack.coverBlob) {
            trackToSave.coverBlob = existingTrack.coverBlob;
            delete trackToSave.coverBlobPath;
          }

          trackToSave.sourceType = t.sourceType || 'import';
          await saveTrackToDB(trackToSave);
        }));
        await new Promise((r) => setTimeout(r, 0));
      }
      
      const local = await getAllTracksFromDB();
      const withUrls = local.map(t => ({
        ...t,
        url: t.fileBlob ? URL.createObjectURL(t.fileBlob) : (t.audioUrl || ""),
        coverUrl: t.coverBlob ? URL.createObjectURL(t.coverBlob) : (t.coverUrl || UNIFORM_PLACEHOLDER)
      }));
      setTracks(withUrls.sort((a, b) => a.order - b.order));
      localStorage.removeItem('permanently_deleted_track_ids');
      recordSuccessfulBackup();
      setBackupStatusMessage('تمت الاستعادة بنجاح! جاري تحديث المكتبة... ✅');
    } catch (error) {
      console.error("Restore error:", error);
      setBackupStatusMessage('❌ فشل استعادة البيانات. تأكد من أن الملف صحيح.');
    } finally {
      setIsBackupProcessing(false);
      setTimeout(() => setBackupStatusMessage(null), 5000);
    }
  };

  const [defaultView, setDefaultView] = useState<'all' | 'record' | 'import'>(() => {
    return (localStorage.getItem('defaultView') as 'all' | 'record' | 'import') || 'all';
  });

  const handleToggleSourceType = (id: string, explicitType?: 'record' | 'import') => {
    const track = tracksRef.current.find(t => t.id === id);
    if (!track) return;
    const newType = explicitType || ((track.sourceType === 'record' ? 'import' : 'record') as 'record' | 'import');
    const updated: Track = { ...track, sourceType: newType };
    
    setTracks(prev => prev.map(t => t.id === id ? updated : t));
    saveTrackToDB(updated).catch(console.error);
  };

  const setDefaultViewSetting = (view: 'all' | 'record' | 'import') => {
    setDefaultView(view);
    localStorage.setItem('defaultView', view);
  };

  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const isSwipeCancelledRef = useRef<boolean>(false);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (isRecording) return;
    const touch = e.touches[0];
    touchStartXRef.current = touch.clientX;
    touchStartYRef.current = touch.clientY;
    isSwipeCancelledRef.current = false;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (isRecording || touchStartXRef.current === null || touchStartYRef.current === null || isSwipeCancelledRef.current) return;

    const touch = e.touches[0];
    const diffX = touchStartXRef.current - touch.clientX;
    const diffY = touchStartYRef.current - touch.clientY;

    // Reject inputs, buttons, range sliders, or drag-immune widgets from firing global swipe events
    const target = e.target as HTMLElement;
    if (
      target.tagName.toLowerCase() === 'input' || 
      target.tagName.toLowerCase() === 'button' ||
      target.closest('button') ||
      target.closest('.no-swipe') ||
      target.closest('input[type="range"]')
    ) {
      isSwipeCancelledRef.current = true;
      return;
    }

    // Mathematical horizontal swipe priority (width vs slope check)
    // Decreased trigger threshold from 30px to 22px delivers instant, butter-smooth physical response!
    const thresholdX = 22;

    if (Math.abs(diffX) > thresholdX && Math.abs(diffX) > Math.abs(diffY) * 1.2) {
      if (isSidebarOpen) {
        // Swipe to the right (finger moves right, diffX is negative) pushes the right sidebar away
        if (diffX < -thresholdX) {
          setIsSidebarOpen(false);
          touchStartXRef.current = null;
          touchStartYRef.current = null;
        }
      } else {
        // Swipe to the left (finger moves left, pulling from right edge to center, diffX is positive) reveals sidebar
        if (diffX > thresholdX) {
          setIsSidebarOpen(true);
          touchStartXRef.current = null;
          touchStartYRef.current = null;
        }
      }
    }
  };

  const handleTouchEnd = () => {
    touchStartXRef.current = null;
    touchStartYRef.current = null;
    isSwipeCancelledRef.current = false;
  };

  useEffect(() => {
    document.documentElement.classList.add('dark');
  }, []);

  const handleExportZip = async () => {
    try {
      console.log("Starting ZIP export...");
      const zipBlob = await createBackupZipBlob();
      
      const exportName = `traneem_backup_${new Date().toISOString().split('T')[0]}.zip`;
      const isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      const file = new File([zipBlob], exportName, { type: "application/zip" });
      
      if (isMobile && navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: "النسخة الاحتياطية",
          });
        } catch (shareErr) {
          triggerDownload(zipBlob, exportName);
        }
      } else {
        triggerDownload(zipBlob, exportName);
      }
    } catch (e) {
      console.error("Export zip failed", e);
      alert("فشل تصدير النسخة الاحتياطية: " + (e instanceof Error ? e.message : String(e)));
    }
  };

  const triggerDownload = (blob: Blob, filename: string) => {
    try {
      const url = URL.createObjectURL(blob);
      const linkElement = document.createElement('a');
      linkElement.href = url;
      linkElement.download = filename;
      linkElement.style.display = 'none';
      document.body.appendChild(linkElement);
      linkElement.click();
      document.body.removeChild(linkElement);
      setTimeout(() => URL.revokeObjectURL(url), 100);
    } catch (e) {
      console.error("Download failed", e);
      alert("فشل التحميل: " + (e instanceof Error ? e.message : String(e)));
    }
  };

  const handleImportZip = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await handleRestoreFromZipBlob(file);
    e.target.value = '';
  };

  const [playerState, setPlayerState] = useState<PlayerState>({
    isPlaying: false,
    currentTime: 0,
    volume: 1,
    playbackRate: 1,
    isLoading: false,
    isLooping: false
  });

  const audioRef = useRef<HTMLAudioElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastUpdateTimeRef = useRef<number>(0);
  const lastPlayRequestedTimeRef = useRef<number>(0);
  const isTransitioningTrackRef = useRef<boolean>(false);
  const tracksRef = useRef<Track[]>([]);
  const currentTrackIndexRef = useRef<number | null>(null);
  const isPlayingRef = useRef<boolean>(false);
  const isLoopingRef = useRef<boolean>(playerState.isLooping);
  const loadedTrackIdRef = useRef<string | null>(null);
  const currentPositionRef = useRef<number>(0);
  const pendingSeekTimeRef = useRef<number | null>(null);
  const isSeekingRef = useRef<boolean>(false);
  const seekGuardTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectionRequestIdRef = useRef<number>(0);
  const soundProfileRef = useRef<SoundProfile>(soundProfile);
  const customEqRef = useRef<CustomEqSettings>(customEq);

  useEffect(() => {
    soundProfileRef.current = soundProfile;
  }, [soundProfile]);

  useEffect(() => {
    customEqRef.current = customEq;
  }, [customEq]);

  useEffect(() => {
    tracksRef.current = tracks;
    updateTracksMetaCache(tracks);
  }, [tracks]);

  useEffect(() => {
    currentTrackIndexRef.current = currentTrackIndex;
  }, [currentTrackIndex]);

  useEffect(() => {
    isPlayingRef.current = playerState.isPlaying;
  }, [playerState.isPlaying]);

  useEffect(() => {
    isLoopingRef.current = playerState.isLooping;
  }, [playerState.isLooping]);

  const currentTrack = currentTrackIndex !== null ? tracks[currentTrackIndex] : null;

  const resolveTrackPlayUrl = useCallback(async (track: Track): Promise<string | null> => {
    if (track.url && track.url.startsWith('blob:') && track.fileBlob) {
      return track.url;
    }
    if (track.fileBlob) {
      try {
        const blobUrl = URL.createObjectURL(track.fileBlob);
        setTracks(prev => prev.map(t => t.id === track.id ? { ...t, url: blobUrl } : t));
        return blobUrl;
      } catch (e) {}
    }
    try {
      const full = await getTrackFromDB(track.id);
      if (full?.fileBlob) {
        const blobUrl = URL.createObjectURL(full.fileBlob);
        const coverUrl = full.coverBlob ? URL.createObjectURL(full.coverBlob) : undefined;
        setTracks(prev => prev.map(t => t.id === track.id ? {
          ...t,
          fileBlob: full.fileBlob,
          url: blobUrl,
          ...(coverUrl ? { coverBlob: full.coverBlob, coverUrl } : {})
        } : t));
        return blobUrl;
      }
    } catch (e) {
      console.warn("Failed to hydrate track audio from DB:", e);
    }
    if (track.audioUrl) return track.audioUrl;
    if (track.url && !track.url.startsWith('blob:')) return track.url;
    return null;
  }, []);

  // Sync <audio> source imperatively ONLY when active track ID changes and is not already loaded
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (!currentTrack) {
      loadedTrackIdRef.current = null;
      currentPositionRef.current = 0;
      pendingSeekTimeRef.current = null;
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      return;
    }

    if (loadedTrackIdRef.current === currentTrack.id && audio.src && audio.src !== window.location.href && !audio.error) {
      return;
    }

    let cancelled = false;
    loadedTrackIdRef.current = currentTrack.id;
    currentPositionRef.current = 0;
    pendingSeekTimeRef.current = null;

    resolveTrackPlayUrl(currentTrack).then((playUrl) => {
      if (cancelled || !audioRef.current || loadedTrackIdRef.current !== currentTrack.id) return;
      if (!playUrl) return;
      if (audioRef.current.src !== playUrl) {
        audioRef.current.src = playUrl;
        audioRef.current.load();
      }
      if (isPlayingRef.current) {
        lastPlayRequestedTimeRef.current = Date.now();
        audioRef.current.play().catch((err) => {
          if (err?.name !== 'AbortError') {
            console.warn('Auto-play on track sync failed:', err);
          }
        });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [currentTrack?.id, resolveTrackPlayUrl]);

  useEffect(() => {
    if (!playerState.isPlaying || !currentTrack) {
       lastStatsUpdateRef.current = 0;
       return;
    }

    lastStatsUpdateRef.current = Date.now();
    
    const interval = setInterval(() => {
      const now = Date.now();
      const delta = (now - lastStatsUpdateRef.current) / 1000;
      lastStatsUpdateRef.current = now;

      const latestTracks = tracksRef.current;
      const latestTrack = latestTracks.find(t => t.id === currentTrack.id);
      if (!latestTrack) return;

      const updatedTrack = { 
        ...latestTrack, 
        listenTime: (latestTrack.listenTime || 0) + delta
      };

      setTracks(prev => prev.map(t => t.id === currentTrack.id ? updatedTrack : t));

      // Periodic save (10% chance)
      if (Math.random() < 0.1) {
        saveTrackToDB(updatedTrack).catch(() => {});
      }
    }, 5000);

    return () => {
      clearInterval(interval);
      // Final flush on unmount/pause
      if (lastStatsUpdateRef.current > 0) {
        const now = Date.now();
        const delta = (now - lastStatsUpdateRef.current) / 1000;
        lastStatsUpdateRef.current = 0; // Prevent duplicate run

        const latestTracks = tracksRef.current;
        const latestTrack = latestTracks.find(t => t.id === currentTrack.id);
        if (latestTrack) {
          const updatedTrack = { 
            ...latestTrack, 
            listenTime: (latestTrack.listenTime || 0) + delta
          };
          
          setTracks(prev => prev.map(t => t.id === currentTrack.id ? updatedTrack : t));
          saveTrackToDB(updatedTrack).catch(() => {});
        }
      }
    };
  }, [playerState.isPlaying, currentTrack?.id]);

  const {
    isRecording,
    isPaused: isRecordingPaused,
    recordingTime,
    getAnalyser,
    startRecording,
    stopRecording,
    togglePause: toggleRecordingPause,
    cancelRecording
  } = useAudioRecorder((file, durationOverride) => {
    addTrack(file, durationOverride, 'record');
  });

  const handleStartRecording = () => {
    if (playerState.isPlaying && audioRef.current) {
      audioRef.current.pause();
      setPlayerState(prev => ({ ...prev, isPlaying: false }));
    }
    startRecording();
  };

  const applyProfileToNodes = useCallback((profile: SoundProfile, eq: CustomEqSettings) => {
    const bass = bassFilterRef.current;
    const midBass = midBassFilterRef.current;
    const mid = midFilterRef.current;
    const treble = trebleFilterRef.current;
    const gain = gainNodeRef.current;
    const ctx = audioCtxRef.current;

    if (!bass || !midBass || !mid || !treble || !gain || !ctx) return;
    const now = ctx.currentTime;

    if (profile === 'balanced') {
      bass.gain.setValueAtTime(0, now);
      midBass.gain.setValueAtTime(0, now);
      mid.gain.setValueAtTime(0, now);
      treble.gain.setValueAtTime(0, now);
      gain.gain.setValueAtTime(1.0, now);
    } else if (profile === 'vocal') {
      bass.gain.setValueAtTime(-6.0, now);
      midBass.gain.setValueAtTime(-3.0, now);
      mid.gain.setValueAtTime(12.0, now);
      treble.gain.setValueAtTime(6.0, now);
      gain.gain.setValueAtTime(1.1, now);
    } else if (profile === 'bass') {
      bass.gain.setValueAtTime(15.0, now);
      midBass.gain.setValueAtTime(8.0, now);
      mid.gain.setValueAtTime(0, now);
      treble.gain.setValueAtTime(-2.0, now);
      gain.gain.setValueAtTime(1.0, now);
    } else if (profile === 'boost') {
      bass.gain.setValueAtTime(4.0, now);
      midBass.gain.setValueAtTime(3.0, now);
      mid.gain.setValueAtTime(4.0, now);
      treble.gain.setValueAtTime(4.0, now);
      gain.gain.setValueAtTime(1.7, now);
    } else if (profile === 'custom') {
      bass.gain.setValueAtTime(eq.bass, now);
      midBass.gain.setValueAtTime(eq.bass * 0.5, now);
      mid.gain.setValueAtTime(eq.mid, now);
      treble.gain.setValueAtTime(eq.treble, now);
      gain.gain.setValueAtTime(eq.gain, now);
    }
  }, []);

  const initAudioCtx = useCallback((initialProfile?: SoundProfile) => {
    const targetProfile = initialProfile || soundProfileRef.current;
    // Skip attaching WebAudio graph for 'balanced' so Android hardware audio pipeline handles playback & seeks smoothly
    if (targetProfile === 'balanced' && !audioCtxRef.current) {
      return;
    }

    if (audioCtxRef.current || !audioRef.current) {
      if (audioCtxRef.current?.state === 'suspended') {
        audioCtxRef.current.resume().catch(() => {});
      }
      if (audioCtxRef.current) {
        applyProfileToNodes(targetProfile, customEqRef.current);
      }
      return;
    }
    
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioCtxRef.current = ctx;

      ctx.onstatechange = () => {
        if (ctx.state === 'suspended' && isPlayingRef.current) {
          ctx.resume().catch(() => {});
        }
      };

      const source = ctx.createMediaElementSource(audioRef.current);
      sourceRef.current = source;

      const bass = ctx.createBiquadFilter();
      bass.type = 'lowshelf';
      bass.frequency.value = 80;
      bassFilterRef.current = bass;

      const midBass = ctx.createBiquadFilter();
      midBass.type = 'peaking';
      midBass.frequency.value = 200;
      midBass.Q.value = 1.0;
      midBassFilterRef.current = midBass;

      const mid = ctx.createBiquadFilter();
      mid.type = 'peaking';
      mid.frequency.value = 2800;
      mid.Q.value = 1.2;
      midFilterRef.current = mid;

      const treble = ctx.createBiquadFilter();
      treble.type = 'highshelf';
      treble.frequency.value = 8000;
      trebleFilterRef.current = treble;

      const gain = ctx.createGain();
      gain.gain.value = 1.0;
      gainNodeRef.current = gain;

      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.setValueAtTime(-6, ctx.currentTime);
      compressor.knee.setValueAtTime(10, ctx.currentTime);
      compressor.ratio.setValueAtTime(4, ctx.currentTime);
      compressor.attack.setValueAtTime(0.003, ctx.currentTime);
      compressor.release.setValueAtTime(0.25, ctx.currentTime);
      compressorRef.current = compressor;

      source.connect(bass);
      bass.connect(midBass);
      midBass.connect(mid);
      mid.connect(treble);
      treble.connect(gain);
      gain.connect(compressor);
      compressor.connect(ctx.destination);

      applyProfileToNodes(targetProfile, customEqRef.current);
    } catch (e) {
      console.error("AudioContext initialization failed:", e);
    }
  }, [applyProfileToNodes]);

  const applySoundProfile = useCallback((profile: SoundProfile, customSettings?: CustomEqSettings) => {
    setSoundProfile(profile);
    soundProfileRef.current = profile;
    localStorage.setItem('traneem_sound_profile', profile);

    const eq = customSettings || customEqRef.current;
    if (profile !== 'balanced' && !audioCtxRef.current) {
      initAudioCtx(profile);
    } else if (audioCtxRef.current) {
      applyProfileToNodes(profile, eq);
    }
  }, [applyProfileToNodes, initAudioCtx]);

  const handleCustomEqChange = useCallback((eq: CustomEqSettings) => {
    setCustomEq(eq);
    customEqRef.current = eq;
    localStorage.setItem('traneem_custom_eq', JSON.stringify(eq));
    applySoundProfile('custom', eq);
  }, [applySoundProfile]);

  const handleGestureSettingsChange = useCallback((settings: HeadphoneGestureSettings) => {
    setGestureSettings(settings);
    localStorage.setItem('traneem_headphone_gestures', JSON.stringify(settings));
  }, []);

  useEffect(() => {
    let isCancelled = false;
    const loadLocalData = async (retryCount = 0) => {
      try {
        const savedTracks = await getAllTracksFromDB();
        if (isCancelled) return;

        if (savedTracks && savedTracks.length > 0) {
          const sortedTracks = savedTracks.sort((a, b) => (a.order || 0) - (b.order || 0));
          const tracksWithUrls = sortedTracks.map(t => ({
            ...t,
            url: t.fileBlob ? URL.createObjectURL(t.fileBlob) : (t.audioUrl || ""),
            coverUrl: t.coverBlob ? URL.createObjectURL(t.coverBlob) : (t.coverUrl || UNIFORM_PLACEHOLDER)
          }));
          
          setTracks(tracksWithUrls);
          updateTracksMetaCache(tracksWithUrls);
          setIsInitialLoading(false);

          const restoredId = localStorage.getItem('lastPlayedTrackId');
          const restoredIndex = tracksWithUrls.findIndex(t => t.id === restoredId);
          if (restoredIndex !== -1) {
            setCurrentTrackIndex(restoredIndex);
          } else if (tracksWithUrls.length > 0) {
            setCurrentTrackIndex(prev => prev !== null ? prev : 0);
          }
        } else {
          // If DB returned 0 tracks, retry before assuming DB is truly empty
          if (retryCount < 4) {
            console.warn(`IndexedDB returned 0 tracks, retrying attempt ${retryCount + 1}...`);
            setTimeout(() => {
              if (!isCancelled) loadLocalData(retryCount + 1);
            }, 500 * (retryCount + 1));
            return;
          }

          setIsInitialLoading(false);
        }
      } catch (e) {
        console.error("Failed to load tracks from DB", e);
        setIsInitialLoading(false);
      }
    };
    loadLocalData();
    return () => { isCancelled = true; };
  }, []);

  const [hasNotificationPermission, setHasNotificationPermission] = useState<boolean>(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      return Notification.permission === 'granted';
    }
    return false;
  });

  const checkNotificationPermissionStatus = useCallback(async () => {
    if (Capacitor.isNativePlatform()) {
      try {
        const res = await MediaSession.checkNotificationPermission();
        setHasNotificationPermission(!!res?.granted);
      } catch (e) {
        console.warn("Check notification perm error:", e);
      }
    } else if (typeof window !== 'undefined' && 'Notification' in window) {
      setHasNotificationPermission(Notification.permission === 'granted');
    }
  }, []);

  const requestPlaybackNotificationPermission = useCallback(async (): Promise<boolean> => {
    let granted = false;
    if (Capacitor.isNativePlatform()) {
      try {
        const res = await MediaSession.requestNotificationPermission();
        granted = !!res?.granted;
      } catch (e) {
        console.warn('Native notification request error:', e);
      }
    }

    if (typeof window !== 'undefined' && 'Notification' in window) {
      try {
        if (Notification.permission === 'granted') {
          granted = true;
        } else if (Notification.permission !== 'denied') {
          const res = await Notification.requestPermission();
          granted = (res === 'granted');
        }
      } catch (e) {
        console.warn('Web notification request error:', e);
      }
    }

    setHasNotificationPermission(granted);
    return granted;
  }, []);

  const [isBackgroundOptimized, setIsBackgroundOptimized] = useState<boolean>(false);
  const wakeLockRef = useRef<any>(null);

  const checkBackgroundPermissionStatus = useCallback(async () => {
    if (Capacitor.isNativePlatform()) {
      try {
        const res = await (MediaSession as any).isIgnoringBatteryOptimizations();
        if (res && typeof res.isIgnoring === 'boolean') {
          setIsBackgroundOptimized(res.isIgnoring);
        }
      } catch (e) {
        console.warn('Check battery optimization error:', e);
      }
    } else {
      if (typeof navigator !== 'undefined' && 'wakeLock' in navigator) {
        setIsBackgroundOptimized(true);
      }
    }
  }, []);

  const requestBackgroundPlaybackPermission = useCallback(async () => {
    if (Capacitor.isNativePlatform()) {
      try {
        await MediaSession.requestIgnoreBatteryOptimizations();
        setTimeout(async () => {
          await checkBackgroundPermissionStatus();
        }, 1500);
      } catch (e) {
        console.warn('Request battery optimization error:', e);
      }
    } else if (typeof navigator !== 'undefined' && 'wakeLock' in navigator) {
      try {
        wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
        setIsBackgroundOptimized(true);
      } catch (e) {}
    }
  }, [checkBackgroundPermissionStatus]);

  const openNativeBatterySettings = useCallback(async () => {
    if (Capacitor.isNativePlatform()) {
      try {
        await MediaSession.openBatterySettings();
        setTimeout(() => {
          checkBackgroundPermissionStatus();
        }, 1500);
      } catch (e) {
        console.warn('Open battery settings error:', e);
      }
    }
  }, [checkBackgroundPermissionStatus]);

  const triggerBackgroundAndNotificationPermissionIfNeeded = useCallback(async () => {
    if (!hasNotificationPermission) {
      if (localStorage.getItem('traneem_notification_requested') !== 'true') {
        localStorage.setItem('traneem_notification_requested', 'true');
        await requestPlaybackNotificationPermission();
      }
    }
    if (Capacitor.isNativePlatform()) {
      if (localStorage.getItem('traneem_battery_requested') !== 'true') {
        localStorage.setItem('traneem_battery_requested', 'true');
        try {
          const res = await (MediaSession as any).isIgnoringBatteryOptimizations();
          if (res && !res.isIgnoring) {
            await (MediaSession as any).requestIgnoreBatteryOptimizations();
          }
        } catch (e) {}
      }
    }
  }, [hasNotificationPermission, requestPlaybackNotificationPermission]);

  useEffect(() => {
    checkNotificationPermissionStatus();
    checkBackgroundPermissionStatus();
  }, [checkNotificationPermissionStatus, checkBackgroundPermissionStatus]);

  const coverDataUrlCacheRef = useRef<Map<string, string>>(new Map());
  const lastNativeTrackIdRef = useRef<string | null>(null);

  const getTrackCoverArtwork = useCallback(async (track: Track): Promise<string> => {
    if (!track) return UNIFORM_PLACEHOLDER;
    if (track.coverUrl && track.coverUrl.startsWith('data:image')) {
      return track.coverUrl;
    }
    if (coverDataUrlCacheRef.current.has(track.id)) {
      return coverDataUrlCacheRef.current.get(track.id)!;
    }

    let blob: Blob | null = track.coverBlob || null;
    if (!blob && track.coverUrl && track.coverUrl.startsWith('blob:')) {
      try {
        const res = await fetch(track.coverUrl);
        blob = await res.blob();
      } catch (e) {}
    }

    if (!blob) {
      try {
        const dbTrack = await getTrackFromDB(track.id);
        if (dbTrack?.coverBlob) {
          blob = dbTrack.coverBlob;
        }
      } catch (e) {}
    }

    if (blob) {
      try {
        const compressedBlob = await compressImageBlob(blob, 320, 0.8);
        return new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const dataUrl = reader.result as string;
            if (dataUrl) {
              coverDataUrlCacheRef.current.set(track.id, dataUrl);
              resolve(dataUrl);
            } else {
              resolve(track.coverUrl || UNIFORM_PLACEHOLDER);
            }
          };
          reader.onerror = () => resolve(track.coverUrl || UNIFORM_PLACEHOLDER);
          reader.readAsDataURL(compressedBlob);
        });
      } catch (err) {
        return track.coverUrl || UNIFORM_PLACEHOLDER;
      }
    }

    if (track.coverUrl && (track.coverUrl.startsWith('http://') || track.coverUrl.startsWith('https://'))) {
      return track.coverUrl;
    }

    return UNIFORM_PLACEHOLDER;
  }, []);

  const updateMediaSession = useCallback(async (isPlaying: boolean, overrideDuration?: number, overridePosition?: number, explicitTrack?: Track) => {
    const currentIdx = currentTrackIndexRef.current;
    const currentTracks = tracksRef.current;
    const track = explicitTrack || (currentIdx !== null ? currentTracks[currentIdx] : null);
    if (!track) return;

    const audio = audioRef.current;
    const duration = typeof overrideDuration === 'number'
      ? overrideDuration
      : ((audio?.duration && isFinite(audio.duration) && !isNaN(audio.duration)) ? audio.duration : (track.duration || 0));
    const position = typeof overridePosition === 'number'
      ? overridePosition
      : ((audio?.currentTime && isFinite(audio.currentTime) && !isNaN(audio.currentTime)) ? audio.currentTime : 0);

    const coverSrc = (track.coverUrl && track.coverUrl.trim() !== '')
      ? track.coverUrl
      : UNIFORM_PLACEHOLDER;

    // Web MediaSession
    if ('mediaSession' in navigator) {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: track.name,
          artist: track.artist || 'ترانيم',
          album: 'ترانيم - مكتبتي',
          artwork: [
            { src: coverSrc, sizes: '96x96', type: 'image/png' },
            { src: coverSrc, sizes: '128x128', type: 'image/png' },
            { src: coverSrc, sizes: '192x192', type: 'image/png' },
            { src: coverSrc, sizes: '256x256', type: 'image/png' },
            { src: coverSrc, sizes: '384x384', type: 'image/png' },
            { src: coverSrc, sizes: '512x512', type: 'image/png' },
          ]
        });
        navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';

        if ('setPositionState' in navigator.mediaSession && duration > 0) {
          navigator.mediaSession.setPositionState({
            duration: Math.max(duration, 0.1),
            playbackRate: 1.0,
            position: Math.min(Math.max(position, 0), duration)
          });
        }
      } catch (e) {
        console.warn('Web MediaSession error:', e);
      }
    }

    // Native Capacitor Android MediaSession
    if (Capacitor.isNativePlatform()) {
      try {
        const isSameTrack = lastNativeTrackIdRef.current === track.id && !explicitTrack;
        if (isSameTrack) {
          await MediaSession.updatePlaybackState({
            isPlaying,
            position,
            duration,
            playbackRate: 1.0
          });
        } else {
          lastNativeTrackIdRef.current = track.id;
          const customArtwork = await getTrackCoverArtwork(track);

          await MediaSession.updateMetadata({
            title: track.name,
            artist: track.artist || 'ترانيم',
            artworkUrl: customArtwork,
            isPlaying,
            duration,
            position,
            playbackRate: 1.0
          });
        }
      } catch (e) {
        console.warn('Native MediaSession error:', e);
      }
    }
  }, [getTrackCoverArtwork]);

  const seekToTime = useCallback(async (targetTime: number, forcePlay?: boolean) => {
    const audio = audioRef.current;
    if (!audio) return;

    lastPlayRequestedTimeRef.current = Date.now();
    isSeekingRef.current = true;
    if (seekGuardTimerRef.current) clearTimeout(seekGuardTimerRef.current);
    seekGuardTimerRef.current = setTimeout(() => {
      isSeekingRef.current = false;
    }, 1200);

    initAudioCtx();
    if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
      try {
        await audioCtxRef.current.resume();
      } catch (e) {}
    }

    const currentIdx = currentTrackIndexRef.current;
    const currentTracks = tracksRef.current;
    const track = currentIdx !== null ? currentTracks[currentIdx] : null;

    const audioDur = (isFinite(audio.duration) && !isNaN(audio.duration) && audio.duration > 0) ? audio.duration : 0;
    const metaDur = (track?.duration && isFinite(track.duration) && !isNaN(track.duration) && track.duration > 0) ? track.duration : 0;
    const maxDur = audioDur || metaDur;
    const clampedTime = maxDur > 0
      ? Math.max(0, Math.min(targetTime, Math.max(0, maxDur - 0.05)))
      : Math.max(0, targetTime);

    const needsLoad = track && (loadedTrackIdRef.current !== track.id || !audio.src || audio.src === '' || audio.src === window.location.href || audio.error !== null);
    if (needsLoad && track) {
      loadedTrackIdRef.current = track.id;
      pendingSeekTimeRef.current = clampedTime;
      const playUrl = await resolveTrackPlayUrl(track);
      if (playUrl && loadedTrackIdRef.current === track.id) {
        audio.src = playUrl;
        audio.load();
      }
    } else if (audio.readyState < 1) {
      pendingSeekTimeRef.current = clampedTime;
    } else {
      pendingSeekTimeRef.current = null;
      try {
        audio.currentTime = clampedTime;
      } catch (e) {
        pendingSeekTimeRef.current = clampedTime;
      }
    }

    currentPositionRef.current = clampedTime;
    const shouldPlay = forcePlay ?? isPlayingRef.current;
    if (forcePlay) {
      isPlayingRef.current = true;
    }
    setPlayerState(prev => ({
      ...prev,
      currentTime: clampedTime,
      ...(forcePlay ? { isPlaying: true } : {})
    }));
    updateMediaSession(shouldPlay, maxDur, clampedTime);

    if (shouldPlay && audio.paused && audio.readyState >= 1) {
      try {
        await audio.play();
      } catch (error: any) {
        if (error?.name !== 'AbortError' && error?.name !== 'NotAllowedError') {
          console.warn('Seek resume play error:', error);
        }
      }
    }
  }, [initAudioCtx, resolveTrackPlayUrl, updateMediaSession]);

  const handleSeek = useCallback(async (time: number) => {
    await seekToTime(time);
  }, [seekToTime]);

  const handleTimestampSeek = useCallback(async (time: number) => {
    await seekToTime(time, true);
  }, [seekToTime]);

  const handleSkip = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const baseTime = isSeekingRef.current
      ? currentPositionRef.current
      : (isFinite(audio.currentTime) ? audio.currentTime : currentPositionRef.current);
    seekToTime(baseTime + seconds);
  }, [seekToTime]);

  const handlePause = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      if (isFinite(audio.currentTime) && audio.currentTime > 0) {
        currentPositionRef.current = audio.currentTime;
      }
      audio.pause();
      isPlayingRef.current = false;
      setPlayerState(prev => ({ ...prev, isPlaying: false }));
      updateMediaSession(false);
    }
  }, [updateMediaSession]);

  const handlePlay = useCallback(async () => {
    lastPlayRequestedTimeRef.current = Date.now();
    const audio = audioRef.current;
    if (!audio) return;

    initAudioCtx();
    if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
      try {
        await audioCtxRef.current.resume();
      } catch (e) {}
    }

    const currentIdx = currentTrackIndexRef.current;
    const currentTracks = tracksRef.current;
    const track = currentIdx !== null ? currentTracks[currentIdx] : null;

    if (track) {
      const alreadyLoaded = loadedTrackIdRef.current === track.id &&
        audio.src &&
        audio.src !== '' &&
        audio.src !== window.location.href &&
        audio.error === null;

      if (!alreadyLoaded) {
        loadedTrackIdRef.current = track.id;
        if (currentPositionRef.current > 0) {
          pendingSeekTimeRef.current = currentPositionRef.current;
        }
        const playUrl = await resolveTrackPlayUrl(track);
        if (playUrl && loadedTrackIdRef.current === track.id) {
          audio.src = playUrl;
          audio.load();
        }
      }
    }

    isPlayingRef.current = true;
    setPlayerState(prev => ({ ...prev, isPlaying: true }));
    updateMediaSession(true);

    try {
      await audio.play();
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      console.warn("Primary play attempt failed, retrieving fresh blob from IndexedDB:", err);
      if (track && loadedTrackIdRef.current === track.id) {
        try {
          const full = await getTrackFromDB(track.id);
          if (full?.fileBlob && loadedTrackIdRef.current === track.id) {
            const resumeAt = (isFinite(audio.currentTime) && audio.currentTime > 0)
              ? audio.currentTime
              : currentPositionRef.current;
            if (resumeAt > 0) {
              pendingSeekTimeRef.current = resumeAt;
            }
            const freshUrl = URL.createObjectURL(full.fileBlob);
            audio.src = freshUrl;
            audio.load();
            setTracks(prev => prev.map(t => t.id === track.id ? { ...t, fileBlob: full.fileBlob, url: freshUrl } : t));
            await audio.play();
            isPlayingRef.current = true;
            setPlayerState(prev => ({ ...prev, isPlaying: true }));
            updateMediaSession(true);
            return;
          }
        } catch (retryErr: any) {
          if (retryErr?.name === 'AbortError') return;
          console.error("Retry play failed:", retryErr);
        }
      }
      isPlayingRef.current = false;
      setPlayerState(prev => ({ ...prev, isPlaying: false }));
    }
  }, [initAudioCtx, resolveTrackPlayUrl, updateMediaSession]);

  const handleSelectTrack = useCallback(async (index: number) => {
    const currentTracks = tracksRef.current;
    const track = currentTracks[index];
    if (!track) return;

    const reqId = ++selectionRequestIdRef.current;
    isTransitioningTrackRef.current = true;
    isSeekingRef.current = false;
    pendingSeekTimeRef.current = null;
    currentPositionRef.current = 0;
    lastPlayRequestedTimeRef.current = Date.now();
    triggerBackgroundAndNotificationPermissionIfNeeded();
    
    const updatedTrack = { ...track, playCount: (track.playCount || 0) + 1 };
    setTracks(prev => prev.map((t, i) => i === index ? updatedTrack : t));
    saveTrackToDB(updatedTrack).catch(() => {});

    localStorage.setItem('lastPlayedTrackId', track.id);
    loadedTrackIdRef.current = track.id;
    currentTrackIndexRef.current = index;
    isPlayingRef.current = true;
    setCurrentTrackIndex(index);
    setPlayerState(prev => ({ ...prev, isPlaying: true, currentTime: 0 }));
    updateMediaSession(true, updatedTrack.duration || 0, 0, updatedTrack);
    
    const playUrl = await resolveTrackPlayUrl(track);
    if (selectionRequestIdRef.current !== reqId) return;

    const audio = audioRef.current;
    if (audio) {
      initAudioCtx();
      if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
        try {
          await audioCtxRef.current.resume();
        } catch (e) {}
      }

      if (playUrl && audio.src !== playUrl) {
        audio.src = playUrl;
        audio.load();
      } else if (playUrl) {
        audio.currentTime = 0;
      }

      try {
        const playPromise = audio.play();
        if (playPromise !== undefined) {
          playPromise.catch(async (e) => {
            if (e?.name === 'AbortError' || selectionRequestIdRef.current !== reqId) return;
            console.warn("Select track initial play failed, attempting retry from DB:", e);
            try {
              const full = await getTrackFromDB(track.id);
              if (selectionRequestIdRef.current !== reqId) return;
              if (full?.fileBlob && audioRef.current) {
                const freshUrl = URL.createObjectURL(full.fileBlob);
                audioRef.current.src = freshUrl;
                audioRef.current.load();
                await audioRef.current.play();
              }
            } catch (retryErr: any) {
              if (retryErr?.name === 'AbortError') return;
              isTransitioningTrackRef.current = false;
              isPlayingRef.current = false;
              setPlayerState(prev => ({ ...prev, isPlaying: false }));
            }
          });
        }
      } catch (e) {
        console.warn("Manual audio sync failed", e);
        isTransitioningTrackRef.current = false;
      }
    }
    setTimeout(() => {
      if (selectionRequestIdRef.current === reqId) {
        isTransitioningTrackRef.current = false;
      }
    }, 2500);
  }, [initAudioCtx, resolveTrackPlayUrl, updateMediaSession, triggerBackgroundAndNotificationPermissionIfNeeded]);

  const handleShuffle = useCallback(() => {
    if (tracks.length < 2) return;
    
    // Exclude current track index and already played indices in this session
    const availableIndices = tracks.map((_, i) => i)
      .filter(i => i !== currentTrackIndex && !shuffleHistory.includes(i));
    
    let nextIndex: number;
    
    if (availableIndices.length === 0) {
      // If all tracks played, reset history but still exclude current
      const resetAvailable = tracks.map((_, i) => i).filter(i => i !== currentTrackIndex);
      nextIndex = resetAvailable[Math.floor(Math.random() * resetAvailable.length)];
      setShuffleHistory([nextIndex]);
    } else {
      nextIndex = availableIndices[Math.floor(Math.random() * availableIndices.length)];
      setShuffleHistory(prev => [...prev, nextIndex]);
    }
    
    handleSelectTrack(nextIndex);
  }, [tracks, currentTrackIndex, handleSelectTrack, shuffleHistory]);

  const sortTracks = (tracksToSort: Track[]) => {
    return [...tracksToSort].sort((a, b) => {
      if (a.isFavorite && !b.isFavorite) return -1;
      if (!a.isFavorite && b.isFavorite) return 1;
      return (a.order ?? 0) - (b.order ?? 0);
    });
  };

  const handleSkipToNext = useCallback(() => {
    const currentTracks = tracksRef.current;
    const prevIndex = currentTrackIndexRef.current;
    if (prevIndex === null || currentTracks.length === 0) return;

    const sortedTracks = sortTracks(currentTracks);
    const activeTrack = currentTracks[prevIndex];
    if (!activeTrack) return;

    const currentSortedIndex = sortedTracks.findIndex(t => t.id === activeTrack.id);
    const nextSortedIndex = (currentSortedIndex + 1) % sortedTracks.length;
    const nextTrack = sortedTracks[nextSortedIndex];
    const nextIndexInTracks = currentTracks.findIndex(t => t.id === nextTrack.id);

    if (nextIndexInTracks !== -1) {
      handleSelectTrack(nextIndexInTracks);
    }
  }, [handleSelectTrack]);

  const handleSkipToNextRef = useRef(handleSkipToNext);
  useEffect(() => {
    handleSkipToNextRef.current = handleSkipToNext;
  }, [handleSkipToNext]);

  // Pre-hydrate next track blob so background auto-advance has zero IndexedDB delay when screen is locked
  useEffect(() => {
    if (currentTrackIndex === null || tracks.length < 2) return;
    const sorted = sortTracks(tracks);
    const active = tracks[currentTrackIndex];
    if (!active) return;
    const curSortedIdx = sorted.findIndex(t => t.id === active.id);
    if (curSortedIdx === -1) return;
    const upcoming = sorted[(curSortedIdx + 1) % sorted.length];
    if (upcoming && !upcoming.fileBlob && (!upcoming.url || !upcoming.url.startsWith('blob:'))) {
      getTrackFromDB(upcoming.id).then(full => {
        if (full?.fileBlob) {
          const preUrl = URL.createObjectURL(full.fileBlob);
          setTracks(prev => prev.map(t => t.id === upcoming.id ? { ...t, fileBlob: full.fileBlob, url: preUrl } : t));
        }
      }).catch(() => {});
    }
  }, [currentTrackIndex, tracks.length]);

  const handlePlayPause = async () => {
    triggerBackgroundAndNotificationPermissionIfNeeded();
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlayingRef.current) {
      handlePause();
    } else {
      await handlePlay();
    }
  };

  const executeHeadphoneAction = useCallback((actionType: HeadphoneActionType) => {
    switch (actionType) {
      case 'toggle': {
        handlePlayPause();
        break;
      }
      case 'next':
        handleSkipToNext();
        break;
      case 'previous': {
        const currentIdx = currentTrackIndexRef.current;
        const currentTracks = tracksRef.current;
        if (currentIdx !== null && currentTracks.length > 0) {
          if (currentIdx > 0) {
            handleSelectTrack(currentIdx - 1);
          } else {
            handleSelectTrack(currentTracks.length - 1);
          }
        }
        break;
      }
      case 'seek_forward_10':
        handleSkip(10);
        break;
      case 'seek_forward_30':
        handleSkip(30);
        break;
      case 'seek_backward_10':
        handleSkip(-10);
        break;
      case 'seek_backward_30':
        handleSkip(-30);
        break;
      case 'restart':
        handleSeek(0);
        break;
      case 'shuffle':
        handleShuffle();
        break;
      case 'volume_up':
        setPlayerState(prev => {
          const nextVol = Math.min(1, Number((prev.volume + 0.15).toFixed(2)));
          if (audioRef.current) audioRef.current.volume = nextVol;
          return { ...prev, volume: nextVol };
        });
        break;
      case 'volume_down':
        setPlayerState(prev => {
          const nextVol = Math.max(0, Number((prev.volume - 0.15).toFixed(2)));
          if (audioRef.current) audioRef.current.volume = nextVol;
          return { ...prev, volume: nextVol };
        });
        break;
      case 'none':
        break;
    }
  }, [handlePause, handlePlay, handleSkipToNext, handleSelectTrack, handleSkip, handleSeek, handleShuffle]);

  // Media Session logic
  useEffect(() => {
    if (!('mediaSession' in navigator) || !currentTrack) return;

    const setupMediaSession = () => {
      try {
        const coverSrc = (currentTrack.coverUrl && currentTrack.coverUrl.trim() !== '') 
          ? currentTrack.coverUrl 
          : UNIFORM_PLACEHOLDER;

        const metadata: MediaMetadataInit = {
          title: currentTrack.name,
          artist: currentTrack.artist || 'ترانيم',
          album: 'ترانيم - مكتبتي',
          artwork: [
            { src: coverSrc, sizes: '96x96', type: 'image/png' },
            { src: coverSrc, sizes: '128x128', type: 'image/png' },
            { src: coverSrc, sizes: '192x192', type: 'image/png' },
            { src: coverSrc, sizes: '256x256', type: 'image/png' },
            { src: coverSrc, sizes: '384x384', type: 'image/png' },
            { src: coverSrc, sizes: '512x512', type: 'image/png' },
          ]
        };

        navigator.mediaSession.metadata = new MediaMetadata(metadata);
        navigator.mediaSession.playbackState = playerState.isPlaying ? 'playing' : 'paused';

        const handlers: [MediaSessionAction, MediaSessionActionHandler | null][] = [
          ['play', handlePlay],
          ['pause', handlePause],
          ['previoustrack', () => {
            const act = gestureSettingsRef.current.prevButton;
            executeHeadphoneAction(act);
          }],
          ['nexttrack', () => {
            const act = gestureSettingsRef.current.nextButton;
            executeHeadphoneAction(act);
          }],
          ['seekto', (details) => { if (details.seekTime !== undefined) handleSeek(details.seekTime); }],
          ['seekbackward', (details) => handleSkip(-(details.seekOffset || 10))],
          ['seekforward', (details) => handleSkip(details.seekOffset || 10)],
          ['stop', handlePause]
        ];

        for (const [action, handler] of handlers) {
          try {
            navigator.mediaSession.setActionHandler(action, handler);
          } catch (e) {
            // Action not supported in this environment
          }
        }
      } catch (e) {
        console.warn("MediaSession setup failed", e);
      }
    };

    setupMediaSession();
  }, [currentTrack?.id, currentTrack?.name, currentTrack?.coverUrl, playerState.isPlaying, handlePlay, handlePause, executeHeadphoneAction, handleSeek, handleSkip]);

  useEffect(() => {
    if (currentTrack) {
      updateMediaSession(isPlayingRef.current);
    } else {
      if (Capacitor.isNativePlatform()) MediaSession.hideNotification().catch(() => {});
    }
  }, [currentTrack?.id, currentTrack?.name, currentTrack?.coverUrl, updateMediaSession]);

  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      let active = true;
      let listener: any = null;
      try {
        listener = (MediaSession as any).addListener('mediaAction', (data: { action: string; position?: number }) => {
          if (!active) return;
          console.log('Got MediaSession Action:', data.action, data.position);
          
          if (data.action === 'single_tap') {
            executeHeadphoneAction(gestureSettingsRef.current.singleTap);
          } else if (data.action === 'double_tap') {
            executeHeadphoneAction(gestureSettingsRef.current.doubleTap);
          } else if (data.action === 'triple_tap') {
            executeHeadphoneAction(gestureSettingsRef.current.tripleTap);
          } else if (data.action === 'next') {
            executeHeadphoneAction(gestureSettingsRef.current.nextButton);
          } else if (data.action === 'previous') {
            executeHeadphoneAction(gestureSettingsRef.current.prevButton);
          } else if (data.action === 'toggle') {
            executeHeadphoneAction(gestureSettingsRef.current.singleTap);
          } else if (data.action === 'play') {
            handlePlay();
          } else if (data.action === 'pause' || data.action === 'stop') {
            if (Date.now() - lastPlayRequestedTimeRef.current < 1500) {
              console.log('Ignoring transient pause/stop action right after play request');
            } else {
              handlePause();
            }
          } else if (data.action === 'seek' && typeof data.position === 'number') {
            handleSeek(data.position);
          }
        });
      } catch (err) {
        console.error('Error adding MediaSession listener:', err);
      }

      let noisyListener: any = null;
      try {
        noisyListener = (MediaSession as any).addListener('headsetDisconnected', () => {
          const autoPause = localStorage.getItem('traneem_auto_pause_unplug') !== 'false';
          if (autoPause) {
            handlePause();
          }
        });
      } catch (err) {
        console.error('Error adding noisy listener:', err);
      }

      return () => {
        active = false;
        if (listener && typeof listener.remove === 'function') {
          listener.remove();
        }
        if (noisyListener && typeof noisyListener.remove === 'function') {
          noisyListener.remove();
        }
      };
    }
  }, [handlePlay, handlePause, executeHeadphoneAction, handleSeek]);

  // Periodic headphone connection state polling and devicechange listener
  useEffect(() => {
    let active = true;
    let previousHadHeadset = false;

    const checkHeadset = async () => {
      if (Capacitor.isNativePlatform()) {
        try {
          const res = await MediaSession.isHeadsetConnected();
          if (active && res) {
            setIsHeadsetConnected(!!res.connected);
            if (res.deviceName) setHeadsetDeviceName(res.deviceName);
          }
        } catch (e) {}
      } else if (typeof navigator !== 'undefined' && navigator.mediaDevices?.enumerateDevices) {
        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const audioOutputs = devices.filter(d => d.kind === 'audiooutput');
          const hasHeadset = audioOutputs.some(d => 
            d.label.toLowerCase().includes('head') || 
            d.label.toLowerCase().includes('ear') || 
            d.label.toLowerCase().includes('bluetooth') || 
            d.label.toLowerCase().includes('airpod') ||
            d.label.toLowerCase().includes('buds') ||
            d.deviceId !== 'default'
          );
          if (active) {
            setIsHeadsetConnected(hasHeadset);
            const named = audioOutputs.find(d => d.label && d.deviceId !== 'default');
            if (named?.label) setHeadsetDeviceName(named.label);
          }
          if (previousHadHeadset && !hasHeadset && isPlayingRef.current) {
            const autoPause = localStorage.getItem('traneem_auto_pause_unplug') !== 'false';
            if (autoPause) {
              handlePause();
            }
          }
          previousHadHeadset = hasHeadset;
        } catch (e) {}
      }
    };

    checkHeadset();
    const interval = setInterval(checkHeadset, 3500);

    const onDeviceChange = () => {
      checkHeadset();
    };

    if (typeof navigator !== 'undefined' && navigator.mediaDevices?.addEventListener) {
      navigator.mediaDevices.addEventListener('devicechange', onDeviceChange);
    }

    return () => {
      active = false;
      clearInterval(interval);
      if (typeof navigator !== 'undefined' && navigator.mediaDevices?.removeEventListener) {
        navigator.mediaDevices.removeEventListener('devicechange', onDeviceChange);
      }
    };
  }, [handlePause]);

  // Web keyboard & Bluetooth headphone key controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = (document.activeElement?.tagName || '').toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea' || (document.activeElement as any)?.isContentEditable) {
        return;
      }

      if (e.code === 'MediaPlayPause' || (e.code === 'Space' && !e.repeat)) {
        e.preventDefault();
        handlePlayPause();
      } else if (e.code === 'MediaTrackNext') {
        e.preventDefault();
        handleSkipToNext();
      } else if (e.code === 'MediaTrackPrevious') {
        e.preventDefault();
        const currentIdx = currentTrackIndexRef.current;
        const currentTracks = tracksRef.current;
        if (currentIdx !== null && currentTracks.length > 0) {
          if (currentIdx > 0) handleSelectTrack(currentIdx - 1);
          else handleSelectTrack(currentTracks.length - 1);
        }
      } else if (e.code === 'MediaStop') {
        e.preventDefault();
        handlePause();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlePlayPause, handleSkipToNext, handleSelectTrack, handlePause]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateMediaSessionPosition = () => {
      if ('mediaSession' in navigator && audio && !isNaN(audio.duration)) {
        try {
          navigator.mediaSession.setPositionState({
            duration: audio.duration,
            playbackRate: audio.playbackRate,
            position: audio.currentTime
          });
        } catch (e) {
          // Ignore errors if position is out of bounds
        }
      }
    };

    const updateTime = () => {
      if (isSeekingRef.current || audio.seeking) return;
      const now = Date.now();
      if (!audioRef.current || (now - lastUpdateTimeRef.current < 150)) return;
      lastUpdateTimeRef.current = now;
      if (isFinite(audio.currentTime)) {
        currentPositionRef.current = audio.currentTime;
      }
      setPlayerState(prev => ({ ...prev, currentTime: audio.currentTime }));

      if ('mediaSession' in navigator && 'setPositionState' in navigator.mediaSession && !isNaN(audio.duration) && isFinite(audio.duration) && audio.duration > 0) {
        try {
          navigator.mediaSession.setPositionState({
            duration: audio.duration,
            playbackRate: audio.playbackRate || 1.0,
            position: Math.min(Math.max(audio.currentTime, 0), audio.duration)
          });
        } catch (e) { /* ignore */ }
      }
    };
    const onEnded = () => {
      if (!audio) return;
      if (!audio.ended && audio.currentTime < 0.25) return;
      isSeekingRef.current = false;
      pendingSeekTimeRef.current = null;
      isTransitioningTrackRef.current = true;
      lastPlayRequestedTimeRef.current = Date.now();
      if (isLoopingRef.current) {
        audio.currentTime = 0;
        currentPositionRef.current = 0;
        audio.play().catch(() => {});
        setTimeout(() => { isTransitioningTrackRef.current = false; }, 1000);
      } else {
        handleSkipToNextRef.current();
      }
    };
    const onWaiting = () => {
      if (!isSeekingRef.current) {
        setPlayerState(prev => ({ ...prev, isLoading: true }));
      }
    };
    
    const onPlaying = () => {
      isTransitioningTrackRef.current = false;
      isSeekingRef.current = false;
      if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume().catch(() => {});
      }
      if (isFinite(audio.currentTime)) {
        currentPositionRef.current = audio.currentTime;
      }

      setPlayerState(prev => ({ ...prev, isLoading: false, isPlaying: true }));
      updateMediaSession(true);
      if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'playing';
      }
      updateMediaSessionPosition();
    };
    
    const onPause = () => {
      // Do NOT treat natural track end, active seeking, or track switching as user pause
      if (
        audio.ended ||
        audio.seeking ||
        isSeekingRef.current ||
        isTransitioningTrackRef.current ||
        (isFinite(audio.duration) && audio.duration > 0 && audio.currentTime >= audio.duration - 0.35)
      ) {
        return;
      }
      if (Date.now() - lastPlayRequestedTimeRef.current < 1500) {
        console.log('Ignoring transient audio element pause event right after play/seek');
        return;
      }
      if (isFinite(audio.currentTime)) {
        currentPositionRef.current = audio.currentTime;
      }
      isPlayingRef.current = false;
      setPlayerState(prev => ({ ...prev, isPlaying: false }));
      updateMediaSession(false);
      if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'paused';
      }
      updateMediaSessionPosition();
    };

    const onSeeking = () => {
      isSeekingRef.current = true;
      lastPlayRequestedTimeRef.current = Date.now();
    };

    const onSeeked = () => {
      isSeekingRef.current = false;
      if (seekGuardTimerRef.current) {
        clearTimeout(seekGuardTimerRef.current);
        seekGuardTimerRef.current = null;
      }
      if (isFinite(audio.currentTime)) {
        currentPositionRef.current = audio.currentTime;
        setPlayerState(prev => ({ ...prev, currentTime: audio.currentTime, isLoading: false }));
      }
      if (isPlayingRef.current && audio.paused && !audio.ended) {
        lastPlayRequestedTimeRef.current = Date.now();
        audio.play().catch(() => {});
      }
      updateMediaSession(isPlayingRef.current, audio.duration, audio.currentTime);
      updateMediaSessionPosition();
    };

    const onStalled = () => {
      if (isPlayingRef.current && audio.paused && !audio.ended && !isSeekingRef.current) {
        lastPlayRequestedTimeRef.current = Date.now();
        audio.play().catch(() => {});
      }
    };
    
    const onCanPlay = () => {
      setLoadError(null);
      setPlayerState(prev => ({ ...prev, isLoading: false }));
      if (pendingSeekTimeRef.current !== null) {
        const target = pendingSeekTimeRef.current;
        pendingSeekTimeRef.current = null;
        try {
          audio.currentTime = target;
          currentPositionRef.current = target;
          setPlayerState(prev => ({ ...prev, currentTime: target }));
        } catch (e) {}
      }
      if (isPlayingRef.current && audio.paused) {
        lastPlayRequestedTimeRef.current = Date.now();
        const playPromise = audio.play();
        if (playPromise !== undefined) {
          playPromise.catch((err) => {
            if (err?.name !== 'AbortError') {
              isPlayingRef.current = false;
              setPlayerState(prev => ({ ...prev, isPlaying: false }));
            }
          });
        }
      }
    };

    const onLoadedMetadata = () => {
      if (audio && currentTrackIndex !== null) {
        if (pendingSeekTimeRef.current !== null) {
          const target = pendingSeekTimeRef.current;
          pendingSeekTimeRef.current = null;
          try {
            audio.currentTime = target;
            currentPositionRef.current = target;
            setPlayerState(prev => ({ ...prev, currentTime: target }));
          } catch (e) {}
        }
        if (isFinite(audio.duration) && !isNaN(audio.duration) && audio.duration > 0) {
          const realDuration = audio.duration;
          const currentTracks = tracksRef.current;
          const activeTrack = currentTrackIndexRef.current !== null && currentTrackIndexRef.current < currentTracks.length ? currentTracks[currentTrackIndexRef.current] : null;
          
          if (activeTrack && (!activeTrack.duration || Math.abs(activeTrack.duration - realDuration) > 0.2)) {
            const updatedTrack = { ...activeTrack, duration: realDuration, lastModified: new Date().toISOString() };
            setTracks(prev => {
              const newTracks = prev.map((t, idx) => idx === currentTrackIndex ? updatedTrack : t);
              updateTracksMetaCache(newTracks);
              return newTracks;
            });
            saveTrackToDB(updatedTrack).catch(console.error);
          } else {
            setTracks(prev => prev.map((t, idx) => idx === currentTrackIndex ? { ...t, duration: realDuration } : t));
          }
          updateMediaSession(isPlayingRef.current, realDuration, audio.currentTime);
        }
        updateMediaSessionPosition();
      }
    };

    const onError = () => {
      isTransitioningTrackRef.current = false;
      isSeekingRef.current = false;
      setLoadError("فشل تشغيل المقطع.");
      isPlayingRef.current = false;
      setPlayerState(prev => ({ ...prev, isPlaying: false, isLoading: false }));
    };

    audio.addEventListener('timeupdate', updateTime);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('waiting', onWaiting);
    audio.addEventListener('playing', onPlaying);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('seeking', onSeeking);
    audio.addEventListener('seeked', onSeeked);
    audio.addEventListener('stalled', onStalled);
    audio.addEventListener('canplay', onCanPlay);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('error', onError);

    return () => {
      audio.removeEventListener('timeupdate', updateTime);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('waiting', onWaiting);
      audio.removeEventListener('playing', onPlaying);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('seeking', onSeeking);
      audio.removeEventListener('seeked', onSeeked);
      audio.removeEventListener('stalled', onStalled);
      audio.removeEventListener('canplay', onCanPlay);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('error', onError);
    };
  }, [currentTrackIndex, tracks.length, updateMediaSession]);

  const handleToggleLoop = () => setPlayerState(prev => ({ ...prev, isLooping: !prev.isLooping }));

  const handleToggleFavorite = async () => {
    if (!currentTrack) return;
    const updatedTrack = { 
      ...currentTrack, 
      isFavorite: !currentTrack.isFavorite,
      lastModified: new Date().toISOString()
    };
    setTracks(prev => prev.map(t => t.id === currentTrack.id ? updatedTrack : t));
    saveTrackToDB(updatedTrack).catch(console.error);
  };

  const handleOpenEditModal = (track: Track, mode: 'name' | 'artist' = 'name') => {
    setEditingTrack(track);
    setEditName(track.name);
    setEditArtist(track.artist || "");
    setEditMode(mode);
  };

  const handleSaveMetadata = async () => {
    if (!editingTrack) return;
    
    let updatedTrack = { 
      ...editingTrack,
      lastModified: new Date().toISOString()
    };
    if (editMode === 'name') {
      const trimmedName = editName.trim();
      if (!trimmedName) {
        alert("يجب إدخال اسم الأنشودة");
        return;
      }
      updatedTrack.name = trimmedName;
    } else {
      updatedTrack.artist = editArtist.trim();
    }
    
    setTracks(prev => prev.map(t => t.id === editingTrack.id ? updatedTrack : t));
    saveTrackToDB(updatedTrack).catch(console.error);
    setEditingTrack(null);
  };

  const handleUpdateCover = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && currentTrack) {
      const imageUrl = URL.createObjectURL(file);
      setCropperData({ image: imageUrl, file });
      // Reset input value to allow selecting same file again
      e.target.value = '';
    }
  };

  const handleCropComplete = async (croppedBlob: Blob) => {
    if (!currentTrack || !cropperData) return;
    
    try {
      const extension = croppedBlob.type.split('/')[1] || 'jpg';
      const fileName = cropperData.file.name.replace(/\.[^/.]+$/, "") + `_cropped.${extension}`;
      const croppedFile = new File([croppedBlob], fileName, { type: croppedBlob.type });

      const updatedTrack: Track = { 
        ...currentTrack, 
        coverUrl: URL.createObjectURL(croppedFile), 
        coverBlob: croppedFile,
        sourceType: 'import',
        lastModified: new Date().toISOString()
      };
      coverDataUrlCacheRef.current.delete(currentTrack.id);
      setTracks(prev => prev.map(t => t.id === currentTrack.id ? updatedTrack : t));
      saveTrackToDB(updatedTrack);
      updateMediaSession(isPlayingRef.current, undefined, undefined, updatedTrack);
    } catch (error) {
      console.error("Error saving cropped image:", error);
      alert("حدث خطأ أثناء حفظ الصورة");
    } finally {
      setCropperData(null);
    }
  };

  const handleAddTimestamp = () => {
    if (!audioRef.current || !currentTrack) return;
    const newTimestamp: Timestamp = {
      id: Math.random().toString(36).substr(2, 9),
      time: audioRef.current.currentTime,
      label: `علامة ${currentTrack.timestamps.length + 1}`
    };
    const updatedTrack = { 
      ...currentTrack, 
      timestamps: [...currentTrack.timestamps, newTimestamp],
      lastModified: new Date().toISOString()
    };
    setTracks(prev => prev.map(t => t.id === currentTrack.id ? updatedTrack : t));
    saveTrackToDB(updatedTrack);
  };

  const handleRemoveTimestamp = (timestampId: string) => {
    if (!currentTrack) return;
    const updatedTrack = { 
      ...currentTrack, 
      timestamps: currentTrack.timestamps.filter(ts => ts.id !== timestampId),
      lastModified: new Date().toISOString()
    };
    setTracks(prev => prev.map(t => t.id === currentTrack.id ? updatedTrack : t));
    saveTrackToDB(updatedTrack);
  };

  const addTrack = async (file: File, durationOverride?: number, sourceType: 'record' | 'import' = 'import') => {
    const id = Math.random().toString(36).substr(2, 9);
    deletedTrackIds.delete(id);

    let initialDuration = durationOverride || 0;
    if (!initialDuration || initialDuration === 0) {
      initialDuration = await getAudioDuration(file);
    }

    const newTrack: Track = {
      id, name: file.name.replace(/\.[^/.]+$/, ""), artist: "",
      url: URL.createObjectURL(file), coverUrl: UNIFORM_PLACEHOLDER,
      isFavorite: false, timestamps: [], duration: initialDuration, playbackRate: 1,
      order: tracks.length, listenTime: 0, playCount: 0, fileBlob: file, sourceType: sourceType,
      lastModified: new Date().toISOString()
    };
    
    // Optimistic UI update
    setTracks(prev => {
      const updated = [...prev, newTrack];
      setCurrentTrackIndex(updated.length - 1);
      updateTracksMetaCache(updated);
      return updated;
    });
    isPlayingRef.current = true;
    lastPlayRequestedTimeRef.current = Date.now();
    setPlayerState(ps => ({...ps, isPlaying: true, currentTime: 0}));

    // Save to local DB
    try {
      console.log("Saving track to DB:", newTrack.id);
      await saveTrackToDB(newTrack);
      console.log("Save track successful:", newTrack.id);
    } catch (error) {
      console.error("Failed to save track to local DB:", error);
    }
  };

  const removeTrack = async (id: string) => {
    const trackIndexToRemove = tracks.findIndex(t => t.id === id);
    if (trackIndexToRemove === -1) return;

    // If deleting the currently playing track, pause it first to flush stats and clear intervals safely
    if (currentTrackIndex === trackIndexToRemove) {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      setPlayerState(prev => ({ ...prev, isPlaying: false }));
    }

    // Optimistic UI and Index Update
    setTracks(prev => {
      const newTracks = prev.filter(t => t.id !== id);
      updateTracksMetaCache(newTracks);
      
      if (newTracks.length === 0) {
        setCurrentTrackIndex(null);
      } else if (currentTrackIndex !== null) {
        if (trackIndexToRemove === currentTrackIndex) {
          if (currentTrackIndex >= newTracks.length) {
            setCurrentTrackIndex(newTracks.length - 1);
          } else {
            setCurrentTrackIndex(currentTrackIndex);
          }
        } else if (trackIndexToRemove < currentTrackIndex) {
          // Adjust index since an item before the current one was removed
          setCurrentTrackIndex(currentTrackIndex - 1);
        }
      }
      return newTracks;
    });

    try {
      console.log("Deleting track from DB:", id);
      await deleteTrackFromDB(id);
      console.log("Delete track successful:", id);
    } catch (error) {
      console.error("Failed to delete track:", error);
    }
  };

  const handleMoveTrack = async (fromIndex: number, toIndex: number) => {
    const currentTracks = tracksRef.current;
    if (fromIndex < 0 || fromIndex >= currentTracks.length || toIndex < 0 || toIndex >= currentTracks.length) {
      return;
    }
    const newTracks = [...currentTracks];
    const [movedItem] = newTracks.splice(fromIndex, 1);
    newTracks.splice(toIndex, 0, movedItem);
    const updatedTracks = newTracks.map((t, idx) => ({ ...t, order: idx }));

    setTracks(updatedTracks);
    updateTracksMetaCache(updatedTracks);

    // Save the correct updated order to IndexedDB immediately using the updatedTracks array
    try {
      console.log("Saving all tracks after reorder:", updatedTracks.length);
      for (const track of updatedTracks) {
        await saveTrackToDB(track);
      }
      console.log("All tracks saved successfully after reorder");
    } catch (error) {
      console.error("Failed to save reordered tracks:", error);
    }
  };

  // Re-sync currentTrackIndex when tracks order changes to keep selection on same item
  useEffect(() => {
    if (currentTrack?.id) {
      const newIdx = tracks.findIndex(t => t.id === currentTrack.id);
      if (newIdx !== -1 && newIdx !== currentTrackIndex) {
        setCurrentTrackIndex(newIdx);
      }
    }
  }, [tracks, currentTrack?.id, currentTrackIndex]);

  const handleReorderEnd = async () => {
    // Already saved inside handleMoveTrack to prevent stale closure bugs
  };

  const handleShareTrack = (trackToShare?: Track) => {
    const target = trackToShare || currentTrack;
    if (!target) return;
    setSharingTrack(target);
  };

  const handleShare = async () => {
    const shareData = {
      title: 'ترانيم - Traneem',
      text: 'استمع إلى ألحانك المفضلة وقم بإدارتها مع تطبيق ترانيم المتطور.',
      url: window.location.origin
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(window.location.origin);
        alert('تم نسخ رابط التطبيق إلى الحافظة');
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return; // تجاهل الخطأ إذا قام المستخدم بإلغاء المشاركة
      console.error('Error sharing:', err);
    }
  };

  return (
    <div 
      dir="rtl"
      className={`flex flex-col h-screen h-[100dvh] bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 overflow-hidden font-cairo relative transition-colors duration-500`}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* خلفية صورة الأنشودة الحالية الضبابية الخفيفة المحسنة للأداء */}
      {currentTrack?.coverUrl && !isRecording && (
        <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden select-none transition-opacity duration-700">
          <img
            src={currentTrack.coverUrl}
            alt=""
            loading="lazy"
            className="w-full h-full object-cover scale-110 blur-2xl md:blur-3xl opacity-20 dark:opacity-25 saturate-125 transform-gpu will-change-transform"
          />
          <div className="absolute inset-0 bg-slate-50/75 dark:bg-slate-950/80 transition-colors duration-500" />
        </div>
      )}

      {/* الهيدر العلوي */}
      <header className="flex items-center justify-between p-4 bg-white/70 dark:bg-slate-950/70 backdrop-blur-xl border-b border-slate-200/50 dark:border-slate-800/50 shrink-0 z-[100] relative">
        <div className="flex items-center gap-1 md:gap-3">
          {!isRecording && (
            <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 text-[#4da8ab] active:scale-95 transition-transform">
              <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" /></svg>
            </button>
          )}
        </div>

        <h1 className="text-xl md:text-2xl font-black text-[#4da8ab] absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">ترانيم</h1>

        <div className="flex items-center gap-1 md:gap-3">
          <button
            onClick={() => setIsHeadphonesModalOpen(true)}
            className={`p-2 rounded-xl transition-all flex items-center justify-center relative ${
              isHeadsetConnected
                ? 'text-[#4da8ab] bg-[#4da8ab]/10 hover:bg-[#4da8ab]/20 ring-1 ring-[#4da8ab]/30'
                : 'text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
            title="التحكم بالسماعات ومخارج الصوت"
          >
            <Headphones className="w-5 h-5" />
            {isHeadsetConnected && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-900 animate-pulse" />
            )}
          </button>

          <UserBadge
            tracks={tracks}
            onOpenBackup={(mode) => {
              setBackupModalMode(mode || null);
              setIsDriveModalOpen(true);
            }}
            onShareApp={handleShare}
            storagePersisted={storagePersisted}
            isBackgroundOptimized={isBackgroundOptimized}
            onRequestBackgroundPermission={requestBackgroundPlaybackPermission}
            onOpenBatterySettings={openNativeBatterySettings}
          />
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden relative">
        {!isRecording && (
          <div className={`transition-all duration-300 relative z-[200] h-full shrink-0 ${isSidebarOpen ? 'lg:w-[400px] lg:border-l border-slate-200 dark:border-slate-800' : 'w-0'}`}>
            <Sidebar 
              onImport={addTrack} onRemove={removeTrack} onMove={handleMoveTrack}
              onReorderEnd={handleReorderEnd}
              onToggleSourceType={handleToggleSourceType}
              defaultView={defaultView}
              setDefaultView={setDefaultViewSetting}
              tracks={tracks} currentId={currentTrack?.id || null} onSelect={handleSelectTrack}
              onPlayRandom={handleShuffle}
              isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)}
              isRecording={isRecording} onStartRecording={handleStartRecording}
              showBackupReminder={showBackupReminder}
              onOpenBackup={() => {
                setBackupModalMode('backup');
                setIsDriveModalOpen(true);
              }}
              onEditTrack={handleOpenEditModal}
              onShareTrack={handleShareTrack}
              isLoading={isInitialLoading}
              className="fixed inset-y-0 right-0 h-full w-[85%] sm:w-[400px] shadow-2xl z-[200] lg:!relative lg:!w-full lg:!shadow-none lg:!z-10 lg:!inset-auto"
            />
          </div>
        )}
        
        <main className="flex-1 overflow-y-auto scroll-container bg-transparent relative z-10 flex flex-col items-center">
          <div className="px-4 py-8 md:px-8 md:py-12 lg:px-16 lg:py-16 pb-40 md:pb-48 max-w-6xl mx-auto w-full flex-1 flex flex-col items-center justify-start min-h-[500px] bg-white/60 dark:bg-slate-950/60 backdrop-blur-md rounded-3xl my-2 border border-slate-200/30 dark:border-slate-800/30 shadow-xl transition-colors duration-500">
            {isRecording ? (
              <RecordingScreen 
                getAnalyser={getAnalyser}
                isPaused={isRecordingPaused}
                onStop={stopRecording}
                onPause={toggleRecordingPause}
                onCancel={cancelRecording}
              />
            ) : currentTrack ? (
              <div className="w-full flex flex-col items-center space-y-6 md:space-y-10 animate-in fade-in duration-500">
                {!hasNotificationPermission && (
                  <div className="w-full max-w-sm mx-auto px-4 py-2.5 rounded-2xl bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-teal-500/10 border border-amber-500/20 flex items-center justify-between gap-3 text-xs text-amber-800 dark:text-amber-200">
                    <div className="flex items-center gap-2">
                      <span className="text-amber-500 text-sm">🔔</span>
                      <span className="font-semibold">إظهار النشيد في لوحة الإشعارات والقفل:</span>
                    </div>
                    <button
                      onClick={() => requestPlaybackNotificationPermission()}
                      className="px-3 py-1 bg-[#4da8ab] text-white font-bold rounded-xl text-xs active:scale-95 shadow-sm hover:bg-[#3d9194] transition-colors whitespace-nowrap"
                    >
                      طلب الإذن
                    </button>
                  </div>
                )}

                <div className="relative group w-full max-w-[200px] md:max-w-[280px] lg:max-w-sm shrink-0">
                  <div className="relative aspect-square w-full overflow-hidden rounded-[40px] md:rounded-[50px] lg:rounded-[60px] shadow-2xl border-[4px] md:border-[6px] border-white dark:border-slate-900 group-hover:scale-[1.01] transition-all duration-500">
                    <img src={currentTrack.coverUrl || undefined} className="w-full h-full object-cover" alt="" />
                    <button onClick={() => coverInputRef.current?.click()} className="absolute inset-0 bg-black/10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white z-20 cursor-pointer">
                      <svg className="w-8 h-8 md:w-12 md:h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                    </button>
                    <input type="file" ref={coverInputRef} className="absolute w-0 h-0 opacity-0" accept="image/*" onChange={handleUpdateCover} />
                  </div>
                </div>

                <div className="relative z-30 text-center w-full px-4 min-w-0 space-y-3 md:space-y-6">
                  <div className="flex justify-center w-full">
                    <button onClick={() => handleOpenEditModal(currentTrack)} className="flex items-center gap-2 group/title hover:bg-[#4da8ab]/10 bg-[#4da8ab]/5 px-5 py-3 rounded-2xl transition-all active:scale-95 cursor-pointer border border-[#4da8ab]/20 dark:border-[#4da8ab]/10 max-w-[95vw] md:max-w-[70vw] lg:max-w-[650px] overflow-hidden">
                      <div className="flex-1 min-w-0 overflow-hidden">
                        <MarqueeText 
                          text={currentTrack.name} 
                          className="text-xl md:text-3xl lg:text-4xl font-black text-slate-800 dark:text-slate-100 leading-tight group-hover/title:text-[#4da8ab]" 
                          speed={40}
                        />
                      </div>
                      <svg className="w-5 h-5 md:w-6 md:h-6 text-[#4da8ab] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                    </button>
                  </div>
                  <div className="flex justify-center items-center gap-2 w-full">
                    <button onClick={() => handleOpenEditModal(currentTrack, 'artist')} className="flex items-center gap-2 group/artist hover:bg-slate-200 dark:hover:bg-slate-900 bg-slate-100 dark:bg-black border dark:border-slate-800 px-4 py-2 rounded-xl transition-all active:scale-95 cursor-pointer max-w-[80vw] md:max-w-[50vw] overflow-hidden">
                      <div className="flex-1 min-w-0 overflow-hidden">
                        <MarqueeText 
                          text={currentTrack.artist || "إضافة اسم الفنان..."} 
                          className={`text-sm md:text-xl font-bold transition-colors group-hover/artist:text-[#4da8ab] ${currentTrack.artist ? 'text-slate-600 dark:text-slate-300' : 'text-slate-400 italic'}`}
                          speed={30}
                        />
                      </div>
                      <svg className="w-4 h-4 text-slate-400 group-hover/artist:text-[#4da8ab] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                    </button>
                    <button 
                      onClick={() => handleShareTrack()}
                      className="p-2.5 text-[#4da8ab] hover:bg-[#4da8ab]/10 rounded-xl transition-all active:scale-90 border border-[#4da8ab]/20"
                      title="مشاركة المقطع"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
                    </button>
                  </div>
                </div>

                <div className="w-full max-w-2xl px-2">
                  <TimestampManager timestamps={currentTrack.timestamps} onRemove={handleRemoveTimestamp} onSeek={handleTimestampSeek} currentTime={playerState.currentTime} />
                </div>
                <div className="h-64 md:h-80 shrink-0 w-full" aria-hidden="true" />
              </div>
            ) : isInitialLoading ? (
              <div className="h-[60vh] flex flex-col items-center justify-center space-y-6 text-center px-6 animate-pulse">
                <div className="w-20 h-20 bg-[#4da8ab]/10 rounded-[28px] flex items-center justify-center text-[#4da8ab] shadow-lg shadow-[#4da8ab]/10">
                  <svg className="w-10 h-10 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                </div>
                <div className="space-y-2">
                  <h2 className="text-xl font-black text-[#4da8ab]">جاري تجهيز أناشيدك...</h2>
                  <p className="text-xs text-slate-400 font-bold">لحظات ويتم تحميل مكتبتك الصوتية بالكامل</p>
                </div>
              </div>
            ) : (
              <div className="h-[60vh] flex flex-col items-center justify-center space-y-6 text-center px-6 opacity-30">
                <div className="w-20 h-20 bg-[#4da8ab]/5 rounded-[24px] flex items-center justify-center text-[#4da8ab]">
                  <svg className="w-10 h-10" fill="currentColor" viewBox="0 0 24 24"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>
                </div>
                <h2 className="text-lg font-black text-slate-800 dark:text-slate-200">مكتبتك خالية</h2>
              </div>
            )}
          </div>
        </main>
      </div>

      <footer className={`fixed bottom-0 left-0 right-0 transition-all duration-500 z-[50] p-4 md:p-8 pointer-events-none mb-[env(safe-area-inset-bottom,0px)] max-w-[100vw] overflow-hidden ${isSidebarOpen ? 'opacity-0 invisible lg:opacity-100 lg:visible lg:pr-[400px]' : 'opacity-100 visible'}`}>
        <audio ref={audioRef} className="hidden" preload="auto" />
        
        {isBackupProcessing && (
          <div className="max-w-xs mx-auto mb-4 bg-[#4da8ab] text-white py-2 px-4 rounded-full shadow-lg flex items-center justify-center gap-3 animate-bounce pointer-events-auto border border-white/20">
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span className="text-[10px] font-black">{backupStatusMessage || 'جاري معالجة النسخة...'}</span>
          </div>
        )}

        {!isRecording && (
          <div className="max-w-4xl mx-auto bg-white/95 dark:bg-black/80 backdrop-blur-3xl border border-white/50 dark:border-slate-800 shadow-[0_24px_64px_-12px_rgba(0,0,0,0.3)] rounded-[32px] pointer-events-auto transition-colors duration-300">
            <Player 
              track={currentTrack} state={playerState} onPlayPause={handlePlayPause} 
              onSeek={handleSeek} onSkip={handleSkip} 
              onToggleFavorite={handleToggleFavorite} onToggleLoop={handleToggleLoop} 
              onAddTimestamp={handleAddTimestamp}
              onOpenHeadphones={() => setIsHeadphonesModalOpen(true)}
              isHeadsetConnected={isHeadsetConnected}
              hasError={!!loadError} 
            />
          </div>
        )}
      </footer>

      <GoogleDriveBackupModal
        isOpen={isDriveModalOpen}
        onClose={() => {
          setIsDriveModalOpen(false);
          setBackupModalMode(null);
        }}
        initialMode={backupModalMode}
        createBackupZip={createBackupZipBlob}
        restoreBackupZip={handleRestoreFromZipBlob}
        isBackupProcessing={isBackupProcessing}
        setIsBackupProcessing={setIsBackupProcessing}
        backupStatusMessage={backupStatusMessage}
        setBackupStatusMessage={setBackupStatusMessage}
        onBackupSuccess={recordSuccessfulBackup}
        onCancelBackup={() => { backupCancelRef.current = true; }}
      />

      <HeadphoneControlsModal
        isOpen={isHeadphonesModalOpen}
        onClose={() => setIsHeadphonesModalOpen(false)}
        audioRef={audioRef}
        isHeadsetConnected={isHeadsetConnected}
        headsetDeviceName={headsetDeviceName}
        isPlaying={playerState.isPlaying}
        onPlayPause={handlePlayPause}
        onNext={handleSkipToNext}
        onPrevious={() => {
          const currentIdx = currentTrackIndexRef.current;
          const currentTracks = tracksRef.current;
          if (currentIdx !== null && currentTracks.length > 0) {
            if (currentIdx > 0) handleSelectTrack(currentIdx - 1);
            else handleSelectTrack(currentTracks.length - 1);
          }
        }}
        onSeekForward={(sec) => handleSkip(sec)}
        onSeekBackward={(sec) => handleSkip(-sec)}
        onRestart={() => handleSeek(0)}
        onShuffle={handleShuffle}
        soundProfile={soundProfile}
        onSoundProfileChange={applySoundProfile}
        customEq={customEq}
        onCustomEqChange={handleCustomEqChange}
        gestureSettings={gestureSettings}
        onGestureSettingsChange={handleGestureSettingsChange}
      />

      {cropperData && (
        <ImageCropperModal
          image={cropperData.image}
          onClose={() => setCropperData(null)}
          onCropComplete={handleCropComplete}
        />
      )}

      <ShareTrackModal
        isOpen={sharingTrack !== null}
        onClose={() => setSharingTrack(null)}
        track={sharingTrack}
      />

      <AnimatePresence>
        {editingTrack && (
          <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setEditingTrack(null)}
              className="absolute inset-0 bg-black/60 backdrop-blur-md"
            />
            
            {/* Modal Container */}
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white dark:bg-slate-900 rounded-[32px] w-full max-w-md p-6 md:p-8 shadow-2xl border border-slate-100 dark:border-slate-800 relative z-10 flex flex-col space-y-6 text-right"
            >
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
                <button 
                  onClick={() => setEditingTrack(null)}
                  className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
                <h3 className="text-lg md:text-xl font-black text-slate-800 dark:text-slate-100">
                  {editMode === 'name' ? 'تعديل اسم الأنشودة' : 'تعديل اسم الفنان'}
                </h3>
              </div>

              <div className="space-y-4">
                {editMode === 'name' ? (
                  <div className="flex flex-col space-y-2">
                    <label className="text-xs font-black text-slate-400">اسم القصيدة / الأنشودة</label>
                    <input 
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="أدخل اسم الأنشودة"
                      dir="rtl"
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-2xl py-3 px-4 text-sm font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#4da8ab]/40 transition-all"
                    />
                  </div>
                ) : (
                  <div className="flex flex-col space-y-2">
                    <label className="text-xs font-black text-slate-400">اسم الرادود / الفنان</label>
                    <input 
                      type="text"
                      value={editArtist}
                      onChange={(e) => setEditArtist(e.target.value)}
                      placeholder="أدخل اسم الرادود"
                      dir="rtl"
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-2xl py-3 px-4 text-sm font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#4da8ab]/40 transition-all"
                    />
                  </div>
                )}
              </div>

              <div className="flex gap-3 pt-2">
                <button 
                  onClick={handleSaveMetadata}
                  className="flex-1 py-3 bg-[#4da8ab] hover:bg-[#3d8c8e] text-white font-black rounded-2xl shadow-lg transition-all active:scale-[0.98] text-sm"
                >
                  حفظ التغييرات
                </button>
                <button 
                  onClick={() => setEditingTrack(null)}
                  className="flex-1 py-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 font-black rounded-2xl transition-all active:scale-[0.98] text-sm"
                >
                  إلغاء
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default App;
