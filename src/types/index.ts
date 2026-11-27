export interface TimestampMarker {
  id: string;
  time: number; // In seconds
  title: string;
  note?: string;
}

export interface Track {
  id: string;
  title: string;
  reciter: string; // Artist / Vocalist
  category: string; // e.g., "روحانيات", "مديح", "أناشيد قديمة", "تلاوات"
  audioUrl: string; // Blob URL or remote URL
  audioBlobKey?: string; // Key in IndexedDB for raw binary audio data
  coverUrl?: string; // Image URL or base64
  duration: number; // Seconds
  isFavorite?: boolean;
  timestamps: TimestampMarker[];
  lyrics?: string;
  createdAt: number;
  fileSize?: number; // Size in bytes
}

export interface Playlist {
  id: string;
  title: string;
  description?: string;
  trackIds: string[];
  createdAt: number;
}

export interface SyncDataPackage {
  version: number;
  timestamp: number;
  tracks: Track[];
  playlists: Playlist[];
  audioFiles: Record<string, string>; // audioBlobKey -> base64 data string
}

export interface GoogleDriveUser {
  id: string;
  name: string;
  email: string;
  picture?: string;
  accessToken?: string;
}

export interface CloudBackupMetadata {
  fileId: string;
  fileName: string;
  createdTime: string;
  sizeBytes: number;
  trackCount: number;
  playlistCount: number;
}
