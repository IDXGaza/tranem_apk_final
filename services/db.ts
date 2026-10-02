import { Track } from '../types';

export const DB_NAME = 'TraneemDB';
export const STORE_NAME = 'tracks';
export const VAULT_STORE_NAME = 'safety_vault';
const DB_VERSION = 2;

let dbInstance: IDBDatabase | null = null;
let dbPromise: Promise<IDBDatabase> | null = null;
let onDBChangedCallback: (() => void) | null = null;

export const setOnDBChangedCallback = (cb: (() => void) | null) => {
  onDBChangedCallback = cb;
};

/**
 * Request persistent browser storage to prevent the OS / WebView from randomly
 * clearing IndexedDB under storage pressure or after 7 days in iOS/WebKit.
 */
export const ensureStoragePersistence = async (): Promise<boolean> => {
  try {
    if (typeof window !== 'undefined' && navigator.storage && navigator.storage.persist) {
      const isPersisted = await navigator.storage.persisted();
      if (isPersisted) {
        console.log('📦 Storage already persisted');
        return true;
      }
      const granted = await navigator.storage.persist();
      console.log('📦 Storage persistence requested, result:', granted);
      return granted;
    }
  } catch (err) {
    console.warn('Storage persistence request error:', err);
  }
  return false;
};

/**
 * Initializes and returns the shared IndexedDB instance with automatic retry and error handling.
 */
export const initDB = (retryCount = 0): Promise<IDBDatabase> => {
  if (dbInstance) {
    return Promise.resolve(dbInstance);
  }
  if (dbPromise) {
    return dbPromise;
  }

  dbPromise = new Promise((resolve, reject) => {
    try {
      if (typeof window === 'undefined' || !window.indexedDB) {
        return reject(new Error('IndexedDB is not supported in this environment.'));
      }

      const timeout = setTimeout(() => {
        dbPromise = null;
        if (retryCount < 4) {
          console.warn(`IndexedDB open timeout. Retrying attempt ${retryCount + 1}...`);
          resolve(initDB(retryCount + 1));
        } else {
          reject(new Error('IndexedDB initialization timed out.'));
        }
      }, 7000);

      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = request.result;
        // Primary track store
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
        // Safety vault store (anti-data-loss secondary backup)
        if (!db.objectStoreNames.contains(VAULT_STORE_NAME)) {
          db.createObjectStore(VAULT_STORE_NAME, { keyPath: 'id' });
        }
      };

      request.onsuccess = () => {
        clearTimeout(timeout);
        dbInstance = request.result;

        dbInstance.onversionchange = () => {
          console.warn('IndexedDB versionchange detected, maintaining connection.');
        };

        dbInstance.onclose = () => {
          console.warn('IndexedDB connection closed, resetting instance.');
          dbInstance = null;
          dbPromise = null;
        };

        dbPromise = null;
        resolve(dbInstance);
      };

      request.onerror = () => {
        clearTimeout(timeout);
        dbPromise = null;
        if (retryCount < 4) {
          setTimeout(() => {
            resolve(initDB(retryCount + 1));
          }, 300 * (retryCount + 1));
        } else {
          reject(request.error || new Error('Unknown IndexedDB error'));
        }
      };

      request.onblocked = () => {
        clearTimeout(timeout);
        dbPromise = null;
        console.warn('IndexedDB blocked by other connections. Retrying in 1s...');
        setTimeout(() => {
          resolve(initDB(retryCount + 1));
        }, 1000);
      };
    } catch (error) {
      dbPromise = null;
      reject(error);
    }
  });

  return dbPromise;
};

const serializeTrackForDB = (track: any): any => {
  const serialized = { ...track };
  // Strip transient blob URLs before saving to avoid dead object URLs
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

/**
 * Safely saves a track to IndexedDB.
 * CRITICAL PROTECTION: Under NO circumstances will an existing audio or cover blob be erased
 * if the incoming object doesn't supply one (e.g. metadata rename, favorite toggle, reorder).
 */
export const saveTrackToDB = async (track: any): Promise<void> => {
  try {
    const db = await initDB();

    // 1. Fetch existing track from primary store and safety vault to guarantee blob preservation
    let existing: any = null;
    try {
      existing = await new Promise<any>((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get(track.id);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      });
    } catch {}

    if (!existing) {
      try {
        existing = await new Promise<any>((resolve) => {
          if (!db.objectStoreNames.contains(VAULT_STORE_NAME)) return resolve(null);
          const tx = db.transaction(VAULT_STORE_NAME, 'readonly');
          const req = tx.objectStore(VAULT_STORE_NAME).get(track.id);
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => resolve(null);
        });
      } catch {}
    }

    const serialized = serializeTrackForDB(track);

    // BLOB PRESERVATION SHIELD
    if (!serialized.fileBlob && existing?.fileBlob) {
      serialized.fileBlob = existing.fileBlob;
    }
    if (!serialized.coverBlob && existing?.coverBlob) {
      serialized.coverBlob = existing.coverBlob;
    }

    // Remove from permanently deleted list if user is saving/updating this track
    removePermanentlyDeletedId(track.id);

    // 2. Write to primary store with strict durability if available
    await new Promise<void>((resolve, reject) => {
      const tx = (db as any).transaction([STORE_NAME], 'readwrite', { durability: 'strict' });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.objectStore(STORE_NAME).put(serialized);
    });

    // 3. Simultaneously write to safety vault (anti-data-loss clone)
    try {
      if (db.objectStoreNames.contains(VAULT_STORE_NAME)) {
        const vaultTx = db.transaction([VAULT_STORE_NAME], 'readwrite');
        const vaultRecord = {
          ...serialized,
          _vaultSavedAt: Date.now(),
          _isDeleted: false
        };
        vaultTx.objectStore(VAULT_STORE_NAME).put(vaultRecord);
      }
    } catch (vaultErr) {
      console.warn('Safety vault save note:', vaultErr);
    }

    onDBChangedCallback?.();
  } catch (error) {
    console.error('IndexedDB saveTrackToDB error:', error);
    throw error;
  }
};

/**
 * Soft deletes a track from primary store and tags it in safety vault as deleted
 * instead of instantly incinerating it, allowing instant undo and recovery.
 */
export const deleteTrackFromDB = async (id: string): Promise<void> => {
  addPermanentlyDeletedId(id);

  try {
    const db = await initDB();

    // 1. Move to deleted in safety vault before removing from primary
    try {
      if (db.objectStoreNames.contains(VAULT_STORE_NAME)) {
        const existing = await new Promise<any>((resolve) => {
          const tx = db.transaction(STORE_NAME, 'readonly');
          const req = tx.objectStore(STORE_NAME).get(id);
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => resolve(null);
        });

        if (existing) {
          const vaultTx = db.transaction([VAULT_STORE_NAME], 'readwrite');
          vaultTx.objectStore(VAULT_STORE_NAME).put({
            ...existing,
            _isDeleted: true,
            _deletedAt: Date.now()
          });
        }
      }
    } catch (e) {
      console.warn('Vault delete tagging warning:', e);
    }

    // 2. Delete from primary store
    await new Promise<void>((resolve, reject) => {
      const tx = (db as any).transaction([STORE_NAME], 'readwrite', { durability: 'strict' });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.objectStore(STORE_NAME).delete(id);
    });

    onDBChangedCallback?.();
  } catch (error) {
    console.error('IndexedDB deleteTrackFromDB error:', error);
    throw error;
  }
};

/**
 * Gets a single track by ID.
 */
export const getTrackFromDB = async (id: string): Promise<any> => {
  try {
    const db = await initDB();
    const result = await new Promise<any>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const request = tx.objectStore(STORE_NAME).get(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(tx.error);
    });

    if (result) return deserializeTrackFromDB(result);

    // Fallback to vault if not found in primary store
    if (db.objectStoreNames.contains(VAULT_STORE_NAME)) {
      const vaultResult = await new Promise<any>((resolve) => {
        const tx = db.transaction(VAULT_STORE_NAME, 'readonly');
        const req = tx.objectStore(VAULT_STORE_NAME).get(id);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      });
      if (vaultResult && !vaultResult._isDeleted) {
        return deserializeTrackFromDB(vaultResult);
      }
    }
    return null;
  } catch (error) {
    console.error('IndexedDB getTrackFromDB error:', error);
    return null;
  }
};

/**
 * Retrieves all tracks from the database.
 * SELF-HEALING: If primary store returns 0 items but the safety vault has tracks,
 * it automatically restores them to rescue the user from random storage wiping!
 */
export const getAllTracksFromDB = async (): Promise<any[]> => {
  try {
    const db = await initDB();

    const serializedTracks = await new Promise<any[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const request = tx.objectStore(STORE_NAME).getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(tx.error);
    });

    if (serializedTracks && serializedTracks.length > 0) {
      return serializedTracks.map((t) => deserializeTrackFromDB(t));
    }

    // SELF-HEALING RESCUE PROTOCOL:
    // If primary store is empty, check the safety vault!
    if (db.objectStoreNames.contains(VAULT_STORE_NAME)) {
      console.warn('⚠️ Primary track store is empty! Checking safety vault for recovery...');
      const vaultRecords = await new Promise<any[]>((resolve) => {
        const tx = db.transaction(VAULT_STORE_NAME, 'readonly');
        const req = tx.objectStore(VAULT_STORE_NAME).getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      });

      const activeVaultTracks = vaultRecords.filter((t) => !t._isDeleted);
      if (activeVaultTracks.length > 0) {
        console.log(`🛡️ Found ${activeVaultTracks.length} tracks in safety vault! Automatically restoring...`);
        // Restore to primary store
        try {
          const restoreTx = db.transaction([STORE_NAME], 'readwrite');
          const store = restoreTx.objectStore(STORE_NAME);
          activeVaultTracks.forEach((t) => {
            const clean = { ...t };
            delete clean._vaultSavedAt;
            delete clean._isDeleted;
            delete clean._deletedAt;
            store.put(clean);
          });
        } catch (resErr) {
          console.error('Error during auto-restoration from vault:', resErr);
        }

        return activeVaultTracks.map((t) => deserializeTrackFromDB(t));
      }
    }

    return [];
  } catch (error) {
    console.error('IndexedDB getAllTracksFromDB error:', error);
    return [];
  }
};

/**
 * Manually restores all tracks from the safety vault into the primary library.
 */
export const restoreFromSafetyVault = async (): Promise<any[]> => {
  const db = await initDB();
  if (!db.objectStoreNames.contains(VAULT_STORE_NAME)) {
    throw new Error('مستودع الأمان غير متوفر.');
  }

  const vaultRecords = await new Promise<any[]>((resolve, reject) => {
    const tx = db.transaction(VAULT_STORE_NAME, 'readonly');
    const req = tx.objectStore(VAULT_STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(tx.error);
  });

  const activeTracks = vaultRecords.filter((t) => !t._isDeleted);
  if (activeTracks.length === 0) {
    throw new Error('لا توجد أناشيد محفوظة في مستودع الأمان الاحتياطي.');
  }

  const restoreTx = db.transaction([STORE_NAME], 'readwrite');
  const store = restoreTx.objectStore(STORE_NAME);
  activeTracks.forEach((t) => {
    const clean = { ...t };
    delete clean._vaultSavedAt;
    delete clean._isDeleted;
    delete clean._deletedAt;
    store.put(clean);
  });

  await new Promise<void>((resolve, reject) => {
    restoreTx.oncomplete = () => resolve();
    restoreTx.onerror = () => reject(restoreTx.error);
  });

  return activeTracks.map((t) => deserializeTrackFromDB(t));
};

/**
 * Permanently deleted IDs management with 7-day TTL to avoid infinite accumulation
 * that causes random track wipes when cloud sync runs.
 */
interface DeletedEntry {
  id: string;
  deletedAt: number;
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export const getPermanentlyDeletedIds = (): Set<string> => {
  try {
    const raw = localStorage.getItem('permanently_deleted_track_ids');
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    const now = Date.now();
    const validIds = new Set<string>();

    if (Array.isArray(parsed)) {
      const cleanList: DeletedEntry[] = [];
      for (const item of parsed) {
        if (typeof item === 'string') {
          // Legacy format without timestamp, keep for now
          validIds.add(item);
          cleanList.push({ id: item, deletedAt: now });
        } else if (item && typeof item.id === 'string') {
          if (now - (item.deletedAt || 0) < SEVEN_DAYS_MS) {
            validIds.add(item.id);
            cleanList.push(item);
          }
        }
      }
      localStorage.setItem('permanently_deleted_track_ids', JSON.stringify(cleanList));
    }
    return validIds;
  } catch (e) {
    return new Set();
  }
};

export const addPermanentlyDeletedId = (id: string) => {
  try {
    const current = getPermanentlyDeletedIds();
    current.add(id);
    const list: DeletedEntry[] = Array.from(current).map((i) => ({ id: i, deletedAt: Date.now() }));
    localStorage.setItem('permanently_deleted_track_ids', JSON.stringify(list));
  } catch {}
};

export const removePermanentlyDeletedId = (id: string) => {
  try {
    const raw = localStorage.getItem('permanently_deleted_track_ids');
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const filtered = parsed.filter((item: any) => {
        const itemId = typeof item === 'string' ? item : item.id;
        return itemId !== id;
      });
      localStorage.setItem('permanently_deleted_track_ids', JSON.stringify(filtered));
    }
  } catch {}
};

/**
 * Updates localStorage metadata cache with safety checks.
 * NEVER overwrites existing cached metadata with an empty array.
 */
export const updateTracksMetaCache = (trackList: Track[]) => {
  try {
    if (!Array.isArray(trackList) || trackList.length === 0) {
      // NEVER purge cache if trackList is empty!
      return;
    }

    const metaList = trackList.map((t) => ({
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
      url: t.url && !t.url.startsWith('blob:') ? t.url : t.audioUrl || '',
      coverUrl: t.coverUrl && !t.coverUrl.startsWith('blob:') ? t.coverUrl : ''
    }));

    const json = JSON.stringify(metaList);
    localStorage.setItem('traneem_meta_cache', json);
    localStorage.setItem('traneem_safety_backup', json);
    localStorage.setItem('traneem_last_saved_time', Date.now().toString());
  } catch (e) {
    console.warn('Failed to update tracks meta cache:', e);
  }
};
