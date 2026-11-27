import { Track, Playlist } from '../types';

const DB_NAME = 'TraneemAudioAppDB';
const DB_VERSION = 1;

const STORE_TRACKS = 'tracks';
const STORE_PLAYLISTS = 'playlists';
const STORE_AUDIO_BLOBS = 'audio_blobs';

class IndexedDBService {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private getDB(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_TRACKS)) {
          db.createObjectStore(STORE_TRACKS, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_PLAYLISTS)) {
          db.createObjectStore(STORE_PLAYLISTS, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_AUDIO_BLOBS)) {
          db.createObjectStore(STORE_AUDIO_BLOBS); // key is audioBlobKey string
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    return this.dbPromise;
  }

  // --- TRACKS ---
  async getAllTracks(): Promise<Track[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_TRACKS, 'readonly');
      const store = tx.objectStore(STORE_TRACKS);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async saveTrack(track: Track): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_TRACKS, 'readwrite');
      const store = tx.objectStore(STORE_TRACKS);
      const request = store.put(track);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async deleteTrack(id: string, audioBlobKey?: string): Promise<void> {
    const db = await this.getDB();
    if (audioBlobKey) {
      await this.deleteAudioBlob(audioBlobKey);
    }
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_TRACKS, 'readwrite');
      const store = tx.objectStore(STORE_TRACKS);
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // --- PLAYLISTS ---
  async getAllPlaylists(): Promise<Playlist[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_PLAYLISTS, 'readonly');
      const store = tx.objectStore(STORE_PLAYLISTS);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async savePlaylist(playlist: Playlist): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_PLAYLISTS, 'readwrite');
      const store = tx.objectStore(STORE_PLAYLISTS);
      const request = store.put(playlist);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async deletePlaylist(id: string): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_PLAYLISTS, 'readwrite');
      const store = tx.objectStore(STORE_PLAYLISTS);
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // --- AUDIO BLOBS ---
  async saveAudioBlob(key: string, blob: Blob): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_AUDIO_BLOBS, 'readwrite');
      const store = tx.objectStore(STORE_AUDIO_BLOBS);
      const request = store.put(blob, key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getAudioBlob(key: string): Promise<Blob | null> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_AUDIO_BLOBS, 'readonly');
      const store = tx.objectStore(STORE_AUDIO_BLOBS);
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async deleteAudioBlob(key: string): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_AUDIO_BLOBS, 'readwrite');
      const store = tx.objectStore(STORE_AUDIO_BLOBS);
      const request = store.delete(key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getAllAudioBlobKeys(): Promise<string[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_AUDIO_BLOBS, 'readonly');
      const store = tx.objectStore(STORE_AUDIO_BLOBS);
      const request = store.getAllKeys();
      request.onsuccess = () => resolve((request.result as string[]) || []);
      request.onerror = () => reject(request.error);
    });
  }
}

export const dbService = new IndexedDBService();
