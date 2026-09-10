
import { Capacitor, registerPlugin } from '@capacitor/core';
const MediaSession = registerPlugin<{
  updateMetadata: (opts: { title: string; artist: string; artworkUrl: string; isPlaying: boolean }) => Promise<void>;
  updatePlaybackState: (opts: { isPlaying: boolean }) => Promise<void>;
  hideNotification: () => Promise<void>;
}>('MediaSession');
import React, { useState, useRef, useEffect, useCallback } from 'react';
import * as fflate from 'fflate';
import { signInWithRedirect, getRedirectResult, GoogleAuthProvider, onAuthStateChanged, User } from 'firebase/auth';
import { collection, addDoc, getDocs, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { db, auth } from './firebase';
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
import { motion, AnimatePresence } from 'framer-motion';

// Cloud Sync integrations
import { runCloudSync, SyncProgress } from './services/cloudSync';
import { getAccessToken } from './services/googleDrive';
import { LoginScreen } from './components/LoginScreen';
import { UserBadge } from './components/UserBadge';

// Removed cloud functions syncTrackToCloud and syncDeleteTrackToCloud

const UNIFORM_PLACEHOLDER = "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=600&h=600&auto=format&fit=crop";

const DB_NAME = 'TraneemDB';
const STORE_NAME = 'tracks';

let dbInstance: IDBDatabase | null = null;
const deletedTrackIds = new Set<string>();
try {
  const permanentlyDeletedStr = localStorage.getItem('permanently_deleted_track_ids') || '[]';
  const list = JSON.parse(permanentlyDeletedStr);
  if (Array.isArray(list)) {
    list.forEach(id => deletedTrackIds.add(id));
  }
} catch (e) {
  console.error("Failed to parse permanently_deleted_track_ids on load:", e);
}
let onDBChangedCallback: (() => void) | null = null;

const initDB = (): Promise<IDBDatabase> => {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    try {
      if (!window.indexedDB) {
        return reject(new Error("IndexedDB is not supported in this browser."));
      }
      
      const timeoutId = setTimeout(() => {
        reject(new Error("IndexedDB initialization timed out."));
      }, 5000);

      const request = window.indexedDB.open(DB_NAME, 1);
      
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
      
      request.onsuccess = () => {
        clearTimeout(timeoutId);
        dbInstance = request.result;
        
        dbInstance.onversionchange = () => {
          dbInstance?.close();
          dbInstance = null;
        };
        
        resolve(dbInstance);
      };
      
      request.onerror = () => {
        clearTimeout(timeoutId);
        reject(request.error || new Error("Unknown IndexedDB error"));
      };
      
      request.onblocked = () => {
        clearTimeout(timeoutId);
        reject(new Error("IndexedDB is blocked. Please close other tabs of this app."));
      };
    } catch (error) {
      reject(error);
    }
  });
};

const serializeTrackForDB = async (track: any): Promise<any> => {
  const serialized = { ...track };
  
  // Directly store Blobs in IndexedDB (native & 10x faster)
  // Strip temporary blob URLs to avoid wasting DB space and reference dead object URLs
  delete serialized.url;
  delete serialized.coverUrl;

  return serialized;
};

const deserializeTrackFromDB = (serialized: any): any => {
  if (!serialized) return serialized;
  const track = { ...serialized };
  
  // Backward compatibility with legacy ArrayBuffer records
  if (serialized.fileBuffer && !track.fileBlob) {
    track.fileBlob = new Blob([serialized.fileBuffer], { type: serialized.fileBlobType || 'audio/mpeg' });
    delete track.fileBuffer;
  }
  
  if (serialized.coverBuffer && !track.coverBlob) {
    track.coverBlob = new Blob([serialized.coverBuffer], { type: serialized.coverBlobType || 'image/jpeg' });
    delete track.coverBuffer;
  }
  
  return track;
};

const saveTrackToDB = async (track: any): Promise<void> => {
  let isDeleted = deletedTrackIds.has(track.id);
  if (!isDeleted) {
    try {
      const permanentlyDeletedStr = localStorage.getItem('permanently_deleted_track_ids') || '[]';
      const list = JSON.parse(permanentlyDeletedStr);
      if (Array.isArray(list) && list.includes(track.id)) {
        isDeleted = true;
        deletedTrackIds.add(track.id); // Cache it in memory too
      }
    } catch (e) {}
  }

  if (isDeleted) {
    console.log("saveTrackToDB: Prevented saving a deleted track", track.id);
    return;
  }
  try {
    const db = await initDB();
    const serialized = await serializeTrackForDB(track);
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.objectStore(STORE_NAME).put(serialized);
    });
    
    // Trigger auto-sync callback for real-time changes
    onDBChangedCallback?.();
  } catch (error) {
    console.error("IndexedDB save error:", error);
    throw error;
  }
};

const deleteTrackFromDB = async (id: string): Promise<void> => {
  deletedTrackIds.add(id);
  try {
    const permanentlyDeletedStr = localStorage.getItem('permanently_deleted_track_ids') || '[]';
    const permanentlyDeleted = JSON.parse(permanentlyDeletedStr);
    if (!permanentlyDeleted.includes(id)) {
      permanentlyDeleted.push(id);
      localStorage.setItem('permanently_deleted_track_ids', JSON.stringify(permanentlyDeleted));
    }
  } catch (e) {
    console.error("Failed to save permanently deleted track id:", e);
  }

  try {
    const db = await initDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.objectStore(STORE_NAME).delete(id);
    });
    
    // Trigger auto-sync callback for real-time changes
    onDBChangedCallback?.();
  } catch (error) {
    console.error("IndexedDB delete error:", error);
    throw error;
  }
};

const getAllTracksFromDB = async (): Promise<any[]> => {
  try {
    const db = await initDB();
    const serializedTracks = await new Promise<any[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const request = tx.objectStore(STORE_NAME).getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(tx.error);
    });
    return serializedTracks.map(t => deserializeTrackFromDB(t));
  } catch (error) {
    console.error("IndexedDB get all error:", error);
    return [];
  }
};

const getTrackFromDB = async (id: string): Promise<any> => {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const request = tx.objectStore(STORE_NAME).get(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(tx.error);
    });
  } catch (error) {
    console.error("IndexedDB get error:", error);
    return null;
  }
};

const updateTracksMetaCache = (trackList: Track[]) => {
  try {
    if (!Array.isArray(trackList) || trackList.length === 0) return;

    const metaList = trackList.map(t => ({
      id: t.id,
      name: t.name,
      artist: t.artist,
      duration: t.duration,
      order: t.order,
      isFavorite: t.isFavorite,
      timestamps: t.timestamps,
      sourceType: t.sourceType,
      playCount: t.playCount,
      listenTime: t.listenTime,
      url: (t.url && !t.url.startsWith('blob:')) ? t.url : (t.audioUrl || ''),
      coverUrl: (t.coverUrl && !t.coverUrl.startsWith('blob:')) ? t.coverUrl : UNIFORM_PLACEHOLDER
    }));
    localStorage.setItem('traneem_meta_cache', JSON.stringify(metaList));
  } catch (e) {
    console.warn("Failed to update tracks meta cache:", e);
  }
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

  // Request storage persistence and track application usage & opens
  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (navigator.storage && navigator.storage.persist) {
        navigator.storage.persist().then((persisted) => {
          console.log("📦 Storage persistence status:", persisted);
        }).catch((err) => {
          console.error("❌ Storage persistence request failed:", err);
        });
      }

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
  const [user, setUser] = useState<any>(() => {
    try {
      const cached = localStorage.getItem('traneem_user');
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  });
  const [isSkipLogin, setIsSkipLogin] = useState(() => {
    return localStorage.getItem('skip_cloud_sync') === 'true';
  });
  const [syncProgress, setSyncProgress] = useState<SyncProgress>({
    status: 'idle',
    message: '',
    progress: 0
  });
  const syncDebounceRef = useRef<any>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isDriveModalOpen, setIsDriveModalOpen] = useState(false);
  const [backupModalMode, setBackupModalMode] = useState<'backup' | 'import' | null>(null);
  const [isBackupProcessing, setIsBackupProcessing] = useState(false);
  const [backupStatusMessage, setBackupStatusMessage] = useState<string | null>(null);
  const [showBackupReminder, setShowBackupReminder] = useState(false);
  const [shuffleHistory, setShuffleHistory] = useState<number[]>([]);
  const [cropperData, setCropperData] = useState<{ image: string; file: File } | null>(null);
  const [sharingTrack, setSharingTrack] = useState<Track | null>(null);
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

const compressImageBlob = (blob: Blob, maxDim: number = 250, quality: number = 0.65): Promise<Blob> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = URL.createObjectURL(blob);
    img.onload = () => {
      URL.revokeObjectURL(img.src);
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
      canvas.width = w;
      canvas.height = h;
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob((resultBlob) => {
        resolve(resultBlob || blob);
      }, 'image/jpeg', quality);
    };
    img.onerror = () => {
      resolve(blob);
    };
  });
};

  const [backupCancelSignal, setBackupCancelSignal] = useState(false);

  const createBackupZipBlob = async (
    metadataOnly: boolean = false, 
    excludedTrackIds: string[] = [], 
    compressCovers: boolean = true
  ): Promise<Blob> => {
    setIsBackupProcessing(true);
    setBackupStatusMessage('⏳ جاري جلب البيانات من الذاكرة...');
    setBackupCancelSignal(false);
    try {
      const allTracks = await getAllTracksFromDB();
      // Filter out excluded tracks
      const filteredTracks = allTracks.filter(t => !excludedTrackIds.includes(t.id));
      const files: any = {};
      
      // Map to deduplicate audio files using size + hash of first 1KB
      const fileKeyToPathMap = new Map<string, string>();
      
      // Parallelize processing to maximize speed
      await Promise.all(filteredTracks.map(async (t, i) => {
        if (backupCancelSignal) throw new Error('العملية ألغيت');
        
        const trackMetadata = { ...t };
        
        // Progress reporting (every 5 tracks to avoid UI lag)
        if (i % 5 === 0 || i === filteredTracks.length - 1) {
          setBackupStatusMessage(`📦 تجهيز: ${t.name} (${i + 1}/${filteredTracks.length})`);
        }

        if (!metadataOnly && t.fileBlob) {
          // Calculate quick hash from size and first 1KB
          const size = t.fileBlob.size;
          const slice = t.fileBlob.slice(0, 1024);
          const sliceBuf = await slice.arrayBuffer();
          const arr = new Uint8Array(sliceBuf);
          let hash = 0;
          for (let j = 0; j < arr.length; j++) {
            hash = (hash << 5) - hash + arr[j];
            hash |= 0;
          }
          const fileKey = `${size}_${hash}`;

          if (fileKeyToPathMap.has(fileKey)) {
            // Deduplicate! Reuse existing file path in zip
            const existingPath = fileKeyToPathMap.get(fileKey)!;
            trackMetadata.fileBlobPath = existingPath;
          } else {
            const buf = await t.fileBlob.arrayBuffer();
            // MP3/M4A/WebM is already compressed, store without compression for max speed
            // But if it is a WAV file, we compress it (lossless deflate) to save massive space!
            const isWav = t.fileBlob.name?.toLowerCase().endsWith('.wav') || 
                          t.fileBlob.type === 'audio/wav' || 
                          t.fileBlob.type === 'audio/x-wav';
            const level = isWav ? 6 : 0;
            const path = `audio/${t.id}.blob`;
            
            files[path] = [new Uint8Array(buf), { level }];
            trackMetadata.fileBlobPath = path;
            fileKeyToPathMap.set(fileKey, path);
          }
        }
        
        if (!metadataOnly && t.coverBlob) {
          let processedCover = t.coverBlob;
          if (compressCovers) {
            try {
              if (i % 3 === 0) {
                setBackupStatusMessage(`⚙️ جاري ضغط الغلاف لـ: ${t.name}`);
              }
              processedCover = await compressImageBlob(t.coverBlob, 250, 0.65);
            } catch (err) {
              console.error("Cover compression failed:", t.name, err);
            }
          }
          const buf = await processedCover.arrayBuffer();
          // Images are compressed, store without compression
          files[`covers/${t.id}.blob`] = [new Uint8Array(buf), { level: 0 }];
          trackMetadata.coverBlobPath = `covers/${t.id}.blob`;
        }
        
        delete trackMetadata.fileBlob;
        delete trackMetadata.coverBlob;
        delete trackMetadata.url;
        delete trackMetadata.coverUrl;
        
        filteredTracks[i] = trackMetadata;
      }));

      if (backupCancelSignal) throw new Error('العملية ألغيت');

      // metadata.json is text, compress it maximum to keep ZIP size down
      files["metadata.json"] = [fflate.strToU8(JSON.stringify(filteredTracks)), { level: 9 }];
      
      setBackupStatusMessage('⚡ جاري الحفظ النهائي (سرعة قصوى)...');
      return new Promise((resolve, reject) => {
        // Main zip with no compression for immediate speed
        fflate.zip(files, { level: 0 }, (err, data) => {
          if (err) reject(err);
          else resolve(new Blob([data], { type: "application/zip" }));
        });
      });
    } catch (err: any) {
      if (err.message === 'العملية ألغيت') {
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
      
      // Optimization: Parallel save to DB
      await Promise.all(metadata.map(async (t: any) => {
        const trackToSave = { ...t };
        
        // Fetch existing track to preserve blob if the ZIP does not contain it (e.g., metadata-only backup)
        let existingTrack: any = null;
        try {
          existingTrack = await getTrackFromDB(t.id);
        } catch (_) {}

        if (t.fileBlobPath && decompressed[t.fileBlobPath]) {
          trackToSave.fileBlob = new Blob([decompressed[t.fileBlobPath]] as any);
          delete trackToSave.fileBlobPath;
        } else if (existingTrack && existingTrack.fileBlob) {
          trackToSave.fileBlob = existingTrack.fileBlob;
          delete trackToSave.fileBlobPath;
        }

        if (t.coverBlobPath && decompressed[t.coverBlobPath]) {
          trackToSave.coverBlob = new Blob([decompressed[t.coverBlobPath]] as any);
          delete trackToSave.coverBlobPath;
        } else if (existingTrack && existingTrack.coverBlob) {
          trackToSave.coverBlob = existingTrack.coverBlob;
          delete trackToSave.coverBlobPath;
        }

        trackToSave.sourceType = 'import';
        await saveTrackToDB(trackToSave);
      }));
      
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
  
  // Handle initial firebase auth listener and redirect authentication results
  useEffect(() => {
    // Check if returning from a browser redirect sign-in flow
    if (!Capacitor.isNativePlatform()) {
      import('firebase/auth').then(({ getRedirectResult, GoogleAuthProvider }) => {
        getRedirectResult(auth)
          .then((result) => {
            if (result) {
              const credential = GoogleAuthProvider.credentialFromResult(result);
              const accessToken = credential?.accessToken;
              if (accessToken) {
                localStorage.setItem('google_access_token', accessToken);
                localStorage.setItem('google_token_acquired_at', Date.now().toString());
                handleStartSync(accessToken);
              }
            }
          })
          .catch((err) => {
            console.warn('Redirect auth result error:', err);
          });
      });
    }

    return onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        const traneemUser = {
          displayName: currentUser.displayName || 'مستخدم ترانيم',
          email: currentUser.email || '',
          photoURL: currentUser.photoURL || '',
          uid: currentUser.uid
        };
        setUser(currentUser);
        localStorage.setItem('traneem_user', JSON.stringify(traneemUser));
      }
    });
  }, []);

  const handleStartSync = async (providedToken?: string, forceInteractive: boolean = false) => {
    try {
      setSyncProgress({ status: 'checking', message: 'جاري بدء المزامنة السحابية...', progress: 15 });
      
      let token = providedToken;
      if (!token) {
        token = await getAccessToken(forceInteractive);
      }
      
      const syncedTracks = await runCloudSync(token, (prog) => {
        setSyncProgress(prog);
      });
      
      const tracksWithUrls = syncedTracks.map(t => ({
        ...t,
        url: t.fileBlob ? URL.createObjectURL(t.fileBlob) : (t.audioUrl || ""),
        coverUrl: t.coverBlob ? URL.createObjectURL(t.coverBlob) : (t.coverUrl || UNIFORM_PLACEHOLDER)
      }));
      
      setTracks(tracksWithUrls.sort((a, b) => (a.order || 0) - (b.order || 0)));
      
      setSyncProgress({ status: 'completed', message: 'اكتملت المزامنة بنجاح! ✅', progress: 100 });
      setTimeout(() => {
        setSyncProgress(prev => prev.status === 'completed' ? { status: 'idle', message: '', progress: 0 } : prev);
      }, 3500);
    } catch (err: any) {
      console.warn('Sync attempt failed:', err);
      let errMsg = err?.message || err;
      if (errMsg === 'ExpiredToken' || String(errMsg).includes('ExpiredToken')) {
        if (Capacitor.isNativePlatform() && !forceInteractive) {
          // Attempt immediate silent refresh on Android
          try {
            const freshToken = await getAccessToken(false);
            if (freshToken && freshToken !== providedToken) {
              return await handleStartSync(freshToken, false);
            }
          } catch (silentErr) {
            console.warn('Silent refresh attempt finished:', silentErr);
          }
        }
        errMsg = 'انتهت صلاحية جلسة المزامنة. اضغط على شارة الحساب لتجديد تسجيل الدخول.';
      }
      setSyncProgress({ status: 'error', message: `حالة المزامنة: ${errMsg}`, progress: 100 });
    }
  };

  const triggerGoogleLogin = async () => {
    setIsLoggingIn(true);
    setLoginError(null);
    try {
      const token = await getAccessToken(true);
      if (token) {
        localStorage.setItem('google_access_token', token);
        localStorage.setItem('google_token_acquired_at', Date.now().toString());
        localStorage.removeItem('skip_cloud_sync');
        setIsSkipLogin(false);
      }
      
      let finalUser: any = auth.currentUser;
      if (!finalUser) {
        const cachedUserStr = localStorage.getItem('traneem_user');
        if (cachedUserStr) {
          try {
            finalUser = JSON.parse(cachedUserStr);
          } catch (e) {
            console.error("Failed to parse cached user:", e);
          }
        }
      }
      
      if (!finalUser && token) {
        // Fallback user object if profile fetch was delayed
        finalUser = {
          displayName: 'مستخدم ترانيم',
          email: '',
          photoURL: '',
          uid: 'user_' + Date.now()
        };
      }

      if (finalUser) {
        setUser(finalUser);
        localStorage.setItem('traneem_user', JSON.stringify({
          displayName: finalUser.displayName || 'مستخدم ترانيم',
          email: finalUser.email || '',
          photoURL: finalUser.photoURL || '',
          uid: finalUser.uid || ''
        }));
      }
      
      if (token) {
        await handleStartSync(token);
      }
    } catch (error: any) {
      console.error("Login failed:", error);
      const msg = error?.message || String(error);
      setLoginError(msg);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    try {
      await auth.signOut();
      localStorage.removeItem('google_access_token');
      localStorage.removeItem('google_token_acquired_at');
      localStorage.removeItem('traneem_user');
      localStorage.removeItem('synced_track_ids');
      localStorage.removeItem('permanently_deleted_track_ids');
      setUser(null);
      
      // Re-load offline database tracks
      const savedTracks = await getAllTracksFromDB();
      const sortedTracks = savedTracks.sort((a, b) => (a.order || 0) - (b.order || 0));
      const tracksWithUrls = sortedTracks.map(t => ({
        ...t,
        url: t.fileBlob ? URL.createObjectURL(t.fileBlob) : (t.audioUrl || ""),
        coverUrl: t.coverBlob ? URL.createObjectURL(t.coverBlob) : (t.coverUrl || UNIFORM_PLACEHOLDER)
      }));
      setTracks(tracksWithUrls);
      if (tracksWithUrls.length > 0) {
        setCurrentTrackIndex(0);
      } else {
        setCurrentTrackIndex(null);
      }
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  const triggerAutoSyncWithCloud = useCallback(() => {
    if (!user || isSkipLogin) return;

    if (syncDebounceRef.current) {
      clearTimeout(syncDebounceRef.current);
    }

    syncDebounceRef.current = setTimeout(async () => {
      console.log('Debounced auto-sync triggered...');
      try {
        const token = await getAccessToken(false);
        if (token) {
          await handleStartSync(token, false);
        }
      } catch (e) {
        console.log('Auto sync silent check skipped:', e);
      }
    }, 8000);
  }, [user, isSkipLogin]);

  // Bind the global IndexedDB change callback to trigger our auto-sync
  useEffect(() => {
    onDBChangedCallback = () => {
      triggerAutoSyncWithCloud();
    };
    return () => {
      onDBChangedCallback = null;
    };
  }, [triggerAutoSyncWithCloud]);

  // Handle auto-sync on mount
  useEffect(() => {
    let timer: any;
    const checkAndInitSync = async () => {
      if (!user || isSkipLogin) return;
      try {
        const token = await getAccessToken(false);
        if (token) {
          await handleStartSync(token, false);
        }
      } catch (err) {
        console.log('Initial sync check finished without blocking:', err);
        setSyncProgress({
          status: 'idle',
          message: '',
          progress: 0
        });
      }
    };

    timer = setTimeout(() => {
      checkAndInitSync();
    }, 3500);

    return () => clearTimeout(timer);
  }, [user, isSkipLogin]);

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
  const tracksRef = useRef<Track[]>([]);
  const currentTrackIndexRef = useRef<number | null>(null);
  const isPlayingRef = useRef<boolean>(false);

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

  const currentTrack = currentTrackIndex !== null ? tracks[currentTrackIndex] : null;

  // Fast hydration: load the active track's audio blob immediately so it is ready within 15ms
  useEffect(() => {
    if (currentTrack && (!currentTrack.url || currentTrack.url === '' || (currentTrack.url.startsWith('http') && !currentTrack.audioUrl))) {
      if (!currentTrack.fileBlob) {
        getTrackFromDB(currentTrack.id).then(fullTrack => {
          if (fullTrack?.fileBlob) {
            const playUrl = URL.createObjectURL(fullTrack.fileBlob);
            const coverUrl = fullTrack.coverBlob ? URL.createObjectURL(fullTrack.coverBlob) : undefined;
            setTracks(prev => prev.map(t => t.id === currentTrack.id ? {
              ...t,
              fileBlob: fullTrack.fileBlob,
              url: playUrl,
              ...(coverUrl ? { coverBlob: fullTrack.coverBlob, coverUrl } : {})
            } : t));
          }
        }).catch(err => {
          console.warn("Fast track hydration error:", err);
        });
      }
    }
  }, [currentTrack?.id]);

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

  const initAudioCtx = useCallback(() => {
    if (audioCtxRef.current || !audioRef.current) {
      if (audioCtxRef.current?.state === 'suspended') {
        audioCtxRef.current.resume();
      }
      return;
    }
    
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioCtxRef.current = ctx;

      const source = ctx.createMediaElementSource(audioRef.current);
      sourceRef.current = source;

      source.connect(ctx.destination);
    } catch (e) {
      console.error("AudioContext initialization failed:", e);
    }
  }, []);

  useEffect(() => {
    let isCancelled = false;
    const loadLocalData = async () => {
      try {
        const savedTracks = await getAllTracksFromDB();
        if (isCancelled) return;
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
      } catch (e) {
        console.error("Failed to load tracks from DB", e);
        setIsInitialLoading(false);
      }
    };
    loadLocalData();
    return () => { isCancelled = true; };
  }, []);

  const handleSelectTrack = useCallback(async (index: number) => {
    const track = tracks[index];
    if (!track) return;
    
    // Increment play count
    const updatedTrack = { ...track, playCount: (track.playCount || 0) + 1 };
    setTracks(prev => prev.map((t, i) => i === index ? updatedTrack : t));
    saveTrackToDB(updatedTrack);

    localStorage.setItem('lastPlayedTrackId', track.id);
    setCurrentTrackIndex(index);
    setPlayerState(prev => ({ ...prev, isPlaying: true, currentTime: 0 }));
    updateMediaSession(true);
    
    let playUrl = track.url;
    if (!playUrl || playUrl === '' || (playUrl.startsWith('http') && !track.audioUrl)) {
      if (!track.fileBlob) {
        try {
          const full = await getTrackFromDB(track.id);
          if (full?.fileBlob) {
            playUrl = URL.createObjectURL(full.fileBlob);
            setTracks(prev => prev.map(t => t.id === track.id ? { ...t, fileBlob: full.fileBlob, url: playUrl } : t));
          }
        } catch (e) {
          console.warn("Failed to get track audio blob:", e);
        }
      }
    }

    // Attempt play immediately to capture user gesture
    if (audioRef.current) {
      initAudioCtx();
      try {
        if (playUrl) {
          audioRef.current.src = playUrl;
          audioRef.current.load();
        }
        
        const playPromise = audioRef.current.play();
        if (playPromise !== undefined) {
          playPromise.catch(e => {
            if (e.name !== 'NotAllowedError') console.warn("Select track play failed:", e);
          });
        }
      } catch (e) {
        console.warn("Manual audio sync failed", e);
      }
    }
  }, [tracks, initAudioCtx]);

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

  const sortTracks = (tracks: Track[]) => {
    return [...tracks].sort((a, b) => {
      if (a.isFavorite && !b.isFavorite) return -1;
      if (!a.isFavorite && b.isFavorite) return 1;
      return (a.order ?? 0) - (b.order ?? 0);
    });
  };

  const handleSkipToNext = useCallback(() => {
    setCurrentTrackIndex(prevIndex => {
      if (prevIndex !== null && tracks.length > 0) {
        const sortedTracks = sortTracks(tracks);
        const currentTrack = tracks[prevIndex];
        const currentSortedIndex = sortedTracks.findIndex(t => t.id === currentTrack.id);
        
        const nextSortedIndex = (currentSortedIndex + 1) % sortedTracks.length;
        const nextTrack = sortedTracks[nextSortedIndex];
        const nextIndexInTracks = tracks.findIndex(t => t.id === nextTrack.id);
        
        handleSelectTrack(nextIndexInTracks);
        return nextIndexInTracks;
      }
      return prevIndex;
    });
  }, [tracks, handleSelectTrack]);

  const handlePlayPause = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    initAudioCtx();

    if (playerState.isPlaying) {
      audio.pause();
      setPlayerState(prev => ({ ...prev, isPlaying: false }));
      updateMediaSession(false);
      return;
    }

    // Ensure audio src is loaded if not already
    if ((!audio.src || audio.src === '' || audio.src === window.location.href) && currentTrack) {
      let playUrl = currentTrack.url;
      if (!playUrl || playUrl === '' || (playUrl.startsWith('http') && !currentTrack.audioUrl)) {
        try {
          const full = await getTrackFromDB(currentTrack.id);
          if (full?.fileBlob) {
            playUrl = URL.createObjectURL(full.fileBlob);
            setTracks(prev => prev.map(t => t.id === currentTrack.id ? { ...t, fileBlob: full.fileBlob, url: playUrl } : t));
          }
        } catch (e) {
          console.warn("PlayPause get blob error:", e);
        }
      }
      if (playUrl) {
        audio.src = playUrl;
        audio.load();
      }
    }

    setPlayerState(prev => ({ ...prev, isPlaying: true }));
    updateMediaSession(true);
    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise.catch(error => {
        setPlayerState(prev => ({ ...prev, isPlaying: false }));
        if (error.name !== 'NotAllowedError') {
          console.error(error);
        }
      });
    }
  };

  const handleSeek = useCallback((time: number) => {
    const audio = audioRef.current;
    if (audio) {
      audio.currentTime = time;
      setPlayerState(prev => ({ ...prev, currentTime: time }));
    }
  }, []);

  const handleTimestampSeek = useCallback((time: number) => {
    const audio = audioRef.current;
    if (audio) {
      audio.currentTime = time;
      setPlayerState(prev => ({ ...prev, currentTime: time, isPlaying: true }));
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch(error => {
          setPlayerState(prev => ({ ...prev, isPlaying: false }));
          if (error.name !== 'NotAllowedError') {
            console.error(error);
          }
        });
      }
    }
  }, []);

  const handleSkip = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (audio) {
      const newTime = Math.max(0, Math.min(audio.currentTime + seconds, audio.duration || 0));
      audio.currentTime = newTime;
      setPlayerState(prev => ({ ...prev, currentTime: newTime }));
    }
  }, []);

  const handlePause = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      setPlayerState(prev => ({ ...prev, isPlaying: false }));
      updateMediaSession(false);
    }
  }, []);

  const handlePlay = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      initAudioCtx();
      setPlayerState(prev => ({ ...prev, isPlaying: true }));
      updateMediaSession(true);
      audio.play().catch(err => {
        console.error("Playback failed:", err);
        setPlayerState(prev => ({ ...prev, isPlaying: false }));
      });
    }
  }, [initAudioCtx]);

  const updateMediaSession = useCallback(async (isPlaying: boolean) => {
    if (!Capacitor.isNativePlatform()) return;
    const currentIdx = currentTrackIndexRef.current;
    const currentTracks = tracksRef.current;
    if (currentIdx === null) return;
    const track = currentTracks[currentIdx];
    if (!track) return;
    try {
      const artworkUrl = (track.coverUrl && !track.coverUrl.startsWith('blob:'))
        ? track.coverUrl
        : '';
      await MediaSession.updateMetadata({
        title: track.name,
        artist: track.artist || 'ترانيم',
        artworkUrl,
        isPlaying,
      });
    } catch (e) {
      console.warn('MediaSession error:', e);
    }
  }, []);

  // Media Session logic
  useEffect(() => {
    if (!('mediaSession' in navigator) || !currentTrack) return;

    const setupMediaSession = () => {
      try {
        const coverSrc = (currentTrack.coverUrl && !currentTrack.coverUrl.startsWith('blob:')) 
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
            if (currentTrackIndex !== null && currentTrackIndex > 0) handleSelectTrack(currentTrackIndex - 1);
            else if (currentTrackIndex === 0 && tracks.length > 0) handleSelectTrack(tracks.length - 1);
          }],
          ['nexttrack', handleSkipToNext],
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
  }, [currentTrack?.id, currentTrack?.name, currentTrack?.coverUrl, playerState.isPlaying, handlePlay, handlePause, handleSelectTrack, handleSkipToNext, handleSeek, handleSkip, currentTrackIndex, tracks.length]);

  useEffect(() => {
    if (!currentTrack) {
      if (Capacitor.isNativePlatform()) MediaSession.hideNotification().catch(() => {});
    }
  }, [currentTrack]);

  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      let active = true;
      let listener: any = null;
      try {
        listener = (MediaSession as any).addListener('mediaAction', (data: { action: string }) => {
          if (!active) return;
          console.log('Got MediaSession Action:', data.action);
          
          if (data.action === 'play') {
            handlePlay();
          } else if (data.action === 'pause') {
            handlePause();
          } else if (data.action === 'toggle') {
            const audio = audioRef.current;
            const actuallyPlaying = audio && !audio.paused && !audio.ended && audio.readyState > 2;
            if (actuallyPlaying) {
              handlePause();
            } else {
              handlePlay();
            }
          } else if (data.action === 'next') {
            handleSkipToNext();
          } else if (data.action === 'previous') {
            const currentIdx = currentTrackIndexRef.current;
            const currentTracks = tracksRef.current;
            if (currentIdx !== null) {
              if (currentIdx > 0) {
                handleSelectTrack(currentIdx - 1);
              } else if (currentIdx === 0 && currentTracks.length > 0) {
                handleSelectTrack(currentTracks.length - 1);
              }
            }
          } else if (data.action === 'stop') {
            handlePause();
          }
        });
      } catch (err) {
        console.error('Error adding MediaSession listener:', err);
      }
      return () => {
        active = false;
        if (listener && typeof listener.remove === 'function') {
          listener.remove();
        }
      };
    }
  }, [handlePlay, handlePause, handleSkipToNext, handleSelectTrack]);

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
      const now = Date.now();
      if (!audioRef.current || (now - lastUpdateTimeRef.current < 150)) return;
      lastUpdateTimeRef.current = now;
      setPlayerState(prev => ({ ...prev, currentTime: audio.currentTime }));

      // Sync position state to MediaSession periodically
      if ('mediaSession' in navigator && 'setPositionState' in navigator.mediaSession && !isNaN(audio.duration)) {
        try {
          navigator.mediaSession.setPositionState({
            duration: audio.duration,
            playbackRate: audio.playbackRate,
            position: audio.currentTime
          });
        } catch (e) { /* ignore */ }
      }
    };
    const onEnded = () => playerState.isLooping ? (audio.currentTime = 0, audio.play().catch(() => {})) : handleSkipToNext();
    const onWaiting = () => setPlayerState(prev => ({ ...prev, isLoading: true }));
    
    const onPlaying = () => {
      setPlayerState(prev => ({ ...prev, isLoading: false, isPlaying: true }));
      if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'playing';
      }
      updateMediaSessionPosition();
    };
    
    const onPause = () => {
      setPlayerState(prev => ({ ...prev, isPlaying: false }));
      if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'paused';
      }
      updateMediaSessionPosition();
    };

    const onSeeked = () => {
      updateMediaSessionPosition();
    };

    const onRateChange = () => {
      updateMediaSessionPosition();
    };
    
    const onCanPlay = () => {
      setLoadError(null);
      setPlayerState(prev => ({ ...prev, isLoading: false }));
      if (playerState.isPlaying) {
        const playPromise = audio.play();
        if (playPromise !== undefined) {
          playPromise.catch(() => {
            setPlayerState(prev => ({ ...prev, isPlaying: false }));
          });
        }
      }
    };

    const onLoadedMetadata = () => {
      if (audio && currentTrackIndex !== null) {
        if (isFinite(audio.duration) && !isNaN(audio.duration)) {
          setTracks(prev => prev.map((t, idx) => idx === currentTrackIndex ? { ...t, duration: audio.duration } : t));
        }
        audio.playbackRate = playerState.playbackRate;
        updateMediaSessionPosition();
      }
    };

    const onError = () => {
      setLoadError("فشل تشغيل المقطع.");
      setPlayerState(prev => ({ ...prev, isPlaying: false, isLoading: false }));
    };

    audio.addEventListener('timeupdate', updateTime);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('waiting', onWaiting);
    audio.addEventListener('playing', onPlaying);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('seeked', onSeeked);
    audio.addEventListener('ratechange', onRateChange);
    audio.addEventListener('canplay', onCanPlay);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('error', onError);

    return () => {
      audio.removeEventListener('timeupdate', updateTime);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('waiting', onWaiting);
      audio.removeEventListener('playing', onPlaying);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('seeked', onSeeked);
      audio.removeEventListener('ratechange', onRateChange);
      audio.removeEventListener('canplay', onCanPlay);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('error', onError);
    };
  }, [currentTrackIndex, playerState.playbackRate, playerState.isLooping, tracks.length, playerState.isPlaying]);

  const handleToggleLoop = () => setPlayerState(prev => ({ ...prev, isLooping: !prev.isLooping }));
  const handleRateChange = (rate: number) => {
    if (audioRef.current) audioRef.current.playbackRate = rate;
    setPlayerState(prev => ({ ...prev, playbackRate: rate }));
  };

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
      setTracks(prev => prev.map(t => t.id === currentTrack.id ? updatedTrack : t));
      saveTrackToDB(updatedTrack);
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
    const newTrack: Track = {
      id, name: file.name.replace(/\.[^/.]+$/, ""), artist: "",
      url: URL.createObjectURL(file), coverUrl: UNIFORM_PLACEHOLDER,
      isFavorite: false, timestamps: [], duration: durationOverride || 0, playbackRate: 1,
      order: tracks.length, listenTime: 0, playCount: 0, fileBlob: file, sourceType: sourceType,
      lastModified: new Date().toISOString()
    };
    
    // Optimistic UI update
    setTracks(prev => {
      const updated = [...prev, newTrack];
      setCurrentTrackIndex(updated.length - 1);
      return updated;
    });
    setPlayerState(ps => ({...ps, isPlaying: true}));

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

  const handleShareTrack = () => {
    if (!currentTrack) return;
    setSharingTrack(currentTrack);
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
      className={`flex flex-col h-screen h-[100dvh] bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 overflow-hidden font-cairo ${!isRecording ? 'watercolor-bg' : ''} relative transition-colors duration-300`}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* الهيدر العلوي */}
      <header className="flex items-center justify-between p-4 bg-white/80 dark:bg-slate-950/80 backdrop-blur-lg border-b border-slate-100 dark:border-slate-800 shrink-0 z-[100] relative">
        <div className="flex items-center gap-1 md:gap-3">
          {!isRecording && (
            <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 text-[#4da8ab] active:scale-95 transition-transform">
              <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" /></svg>
            </button>
          )}
        </div>

        <h1 className="text-xl md:text-2xl font-black text-[#4da8ab] absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">ترانيم</h1>

        <div className="flex items-center gap-1 md:gap-3">
          <UserBadge
            user={user}
            onLogout={handleLogout}
            syncProgress={syncProgress}
            onSyncNow={() => {
              handleStartSync(undefined, true);
            }}
            tracks={tracks}
            onOpenBackup={(mode) => {
              setBackupModalMode(mode || null);
              setIsDriveModalOpen(true);
            }}
            onGoogleLogin={triggerGoogleLogin}
            isLoggingIn={isLoggingIn}
            loginError={loginError}
            onShareApp={handleShare}
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
              isLoading={isInitialLoading}
              className="fixed inset-y-0 right-0 h-full w-[85%] sm:w-[400px] shadow-2xl z-[200] lg:!relative lg:!w-full lg:!shadow-none lg:!z-10 lg:!inset-auto"
            />
          </div>
        )}
        
        <main className="flex-1 overflow-y-auto scroll-container bg-transparent relative z-10 flex flex-col items-center">
          <div className="px-4 py-8 md:px-8 md:py-12 lg:px-16 lg:py-16 pb-40 md:pb-48 max-w-6xl mx-auto w-full flex-1 flex flex-col items-center justify-start min-h-[500px] bg-white dark:bg-slate-950 transition-colors duration-300">
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
                      onClick={handleShareTrack}
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
        <audio ref={audioRef} src={currentTrack?.url || undefined} className="hidden" preload="auto" crossOrigin="anonymous" />
        
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
              onSeek={handleSeek} onSkip={handleSkip} onRateChange={handleRateChange} 
              onToggleFavorite={handleToggleFavorite} onToggleLoop={handleToggleLoop} 
              onAddTimestamp={handleAddTimestamp} hasError={!!loadError} 
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
        onCancelBackup={() => setBackupCancelSignal(true)}
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

      {/* Onboarding Login Screen overlay */}
      {!user && !isSkipLogin && (
        <LoginScreen
          onLogin={triggerGoogleLogin}
          isLoading={isLoggingIn}
          errorMessage={loginError}
          onSkip={() => {
            setIsSkipLogin(true);
            localStorage.setItem('skip_cloud_sync', 'true');
          }}
        />
      )}
    </div>
  );
};

export default App;
