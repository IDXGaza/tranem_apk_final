import { Track } from '../types';
import {
  findFileInDrive,
  uploadFileToDrive,
  updateFileInDrive,
  downloadFileFromDrive,
  downloadJSONFromDrive,
  deleteFileFromDrive,
  getBlobSHA256
} from './googleDrive';
import {
  getAllTracksFromDB,
  saveTrackToDB,
  deleteTrackFromDB,
  getPermanentlyDeletedIds
} from './db';

const getLocalTracks = async (): Promise<Track[]> => {
  return await getAllTracksFromDB();
};

const saveLocalTrack = async (track: Track): Promise<void> => {
  await saveTrackToDB(track);
};

const deleteLocalTrack = async (id: string): Promise<void> => {
  await deleteTrackFromDB(id);
};

export interface SyncProgress {
  status: 'idle' | 'checking' | 'pulling' | 'pushing' | 'completed' | 'error';
  message: string;
  progress: number; // 0 to 100
}

export interface CloudTrackMetadata {
  id: string;
  name: string;
  artist: string;
  audioFileId?: string;
  audioSize?: number;
  audioHash?: string;
  coverFileId?: string;
  coverSize?: number;
  coverHash?: string;
  isFavorite: boolean;
  timestamps: any[];
  duration: number;
  playbackRate: number;
  order: number;
  playCount: number;
  listenTime: number;
  sourceType?: 'record' | 'import';
  lastModified?: string; // ISO string to merge changes
}

export interface CloudIndex {
  version: number;
  lastSyncedAt: string;
  tracks: CloudTrackMetadata[];
}

// Global active sync state tracker
let isSyncing = false;

// Retry with exponential backoff helper
const retryWithBackoff = async <T>(fn: () => Promise<T>, retries = 3, delay = 1000): Promise<T> => {
  try {
    return await fn();
  } catch (error) {
    if (retries <= 1) throw error;
    console.warn(`Sync warning, retrying in ${delay}ms...`, error);
    await new Promise(resolve => setTimeout(resolve, delay));
    return retryWithBackoff(fn, retries - 1, delay * 2);
  }
};

/**
 * Main function to synchronize IndexedDB with Google Drive (appDataFolder).
 * This runs full bidirectional smart merging.
 */
export const runCloudSync = async (
  accessToken: string,
  onProgress?: (progress: SyncProgress) => void
): Promise<Track[]> => {
  if (isSyncing) {
    console.log('Sync already in progress. Skipping.');
    return await getLocalTracks();
  }
  isSyncing = true;
  onProgress?.({ status: 'checking', message: 'جاري الاتصال بالسحابة والتحقق من الملفات...', progress: 10 });

  try {
    // 1. Locate or create index.json
    let indexFileId = await findFileInDrive('traneem_index.json', accessToken);
    let cloudIndex: CloudIndex = { version: 1, lastSyncedAt: new Date().toISOString(), tracks: [] };

    if (indexFileId) {
      try {
        cloudIndex = await downloadJSONFromDrive(indexFileId, accessToken);
        if (!cloudIndex || !Array.isArray(cloudIndex.tracks)) {
          throw new Error('فهرس السحابة غير صالح');
        }
      } catch (err) {
        console.error('Failed to download or parse index:', err);
        throw new Error('فشل قراءة الفهرس السحابي من Google Drive. تم إيقاف المزامنة لحماية مكتبتك من الفقدان.');
      }
    }

    // 2. Load all local tracks
    const localTracks = await getLocalTracks();
    const localTracksMap = new Map<string, Track>();
    localTracks.forEach(t => localTracksMap.set(t.id, t));

    const cloudTracksMap = new Map<string, CloudTrackMetadata>();
    cloudIndex.tracks.forEach(t => cloudTracksMap.set(t.id, t));

    // Track list to update locally and on cloud
    const tracksToDownload: CloudTrackMetadata[] = [];
    const tracksToUpload: Track[] = [];
    const cloudTracksUpdatedList: CloudTrackMetadata[] = [];

    onProgress?.({ status: 'pulling', message: 'مقارنة البيانات وتحديد التغييرات المتبادلة...', progress: 30 });

    // 3. Smart Merge Logic
    // Collect all IDs (local + cloud)
    const allIds = new Set([...localTracksMap.keys(), ...cloudTracksMap.keys()]);
    
    // We should also look at deleted track IDs from local session if possible,
    // but the safest standard merge is:
    // If deleted locally (was there in cloud index before, but not local anymore),
    // we delete it from cloud index AND delete files from Drive!
    // But how do we distinguish "deleted locally" from "new cloud track not yet downloaded"?
    // We can look at `localStorage` where we store the synced track IDs.
    const previouslySyncedIdsStr = localStorage.getItem('synced_track_ids') || '[]';
    const previouslySyncedIds = new Set<string>(JSON.parse(previouslySyncedIdsStr));

    const permanentlyDeleted = getPermanentlyDeletedIds();

    for (const id of allIds) {
      if (permanentlyDeleted.has(id) && localTracks.length > 0) {
        const local = localTracksMap.get(id);
        const cloud = cloudTracksMap.get(id);

        if (cloud) {
          console.log(`Track ${id} is marked as permanently deleted. Removing from cloud/Drive.`);
          if (cloud.audioFileId) await deleteFileFromDrive(cloud.audioFileId, accessToken).catch(console.error);
          if (cloud.coverFileId) await deleteFileFromDrive(cloud.coverFileId, accessToken).catch(console.error);
        }
        if (local) {
          console.log(`Track ${id} is marked as permanently deleted. Removing from local DB.`);
          await deleteLocalTrack(id);
        }
        continue;
      }

      const local = localTracksMap.get(id);
      const cloud = cloudTracksMap.get(id);

      if (local && cloud) {
        // Exists in both! Compare activity / modifications
        const localListenTime = local.listenTime || 0;
        const cloudListenTime = cloud.listenTime || 0;
        
        const localLastModified = (local as any).lastModified ? new Date((local as any).lastModified).getTime() : 0;
        const cloudLastModified = cloud.lastModified ? new Date(cloud.lastModified).getTime() : 0;

        let localIsNewer = false;
        
        if (localLastModified > 0 || cloudLastModified > 0) {
          localIsNewer = localLastModified > cloudLastModified;
        } else {
          // Fallback to direct user edits check
          const isMetadataDifferent = (local.name !== cloud.name) || 
                                      (local.artist !== cloud.artist);
          
          if (isMetadataDifferent) {
            localIsNewer = true;
          } else {
            localIsNewer = (local.playbackRate !== cloud.playbackRate) ||
                           (local.isFavorite !== cloud.isFavorite) ||
                           (local.timestamps.length !== cloud.timestamps.length) ||
                           (local.playCount > cloud.playCount) ||
                           (localListenTime > cloudListenTime);
          }
        }

        if (localIsNewer) {
          tracksToUpload.push(local);
          cloudTracksUpdatedList.push({
            ...cloud,
            name: local.name,
            artist: local.artist,
            isFavorite: local.isFavorite,
            timestamps: local.timestamps,
            duration: local.duration,
            playbackRate: local.playbackRate,
            order: local.order,
            playCount: Math.max(local.playCount, cloud.playCount),
            listenTime: Math.max(localListenTime, cloudListenTime),
            sourceType: local.sourceType,
            lastModified: (local as any).lastModified || new Date().toISOString()
          });
        } else {
          // Cloud has newer metadata or same, sync back to local metadata
          const updatedLocal: Track = {
            ...local,
            name: cloud.name,
            artist: cloud.artist,
            isFavorite: cloud.isFavorite,
            timestamps: cloud.timestamps,
            duration: cloud.duration,
            playbackRate: cloud.playbackRate,
            order: cloud.order,
            playCount: cloud.playCount,
            listenTime: cloud.listenTime,
            sourceType: cloud.sourceType || local.sourceType,
            lastModified: cloud.lastModified
          } as any;
          await saveLocalTrack(updatedLocal);
          cloudTracksUpdatedList.push(cloud);
        }
      } else if (cloud && !local) {
        // Exists in cloud but not local
        // Only delete from cloud if the user explicitly clicked delete on this device AND has other tracks
        if (permanentlyDeleted.has(id) && localTracks.length > 0) {
          console.log(`Track ${id} explicitly deleted by user. Deleting from cloud.`);
          if (cloud.audioFileId) await deleteFileFromDrive(cloud.audioFileId, accessToken).catch(console.error);
          if (cloud.coverFileId) await deleteFileFromDrive(cloud.coverFileId, accessToken).catch(console.error);
        } else {
          // Track is in cloud: restore it by downloading to local device!
          tracksToDownload.push(cloud);
        }
      } else if (local && !cloud) {
        // Exists locally but not in cloud
        if (permanentlyDeleted.has(id)) {
          console.log(`Track ${id} marked deleted. Removing from local DB.`);
          await deleteLocalTrack(id);
          localTracksMap.delete(id);
        } else {
          // Local track should ALWAYS be preserved and uploaded to cloud!
          tracksToUpload.push(local);
        }
      }
    }

    // 4. Download missing tracks from Cloud
    const totalToDownload = tracksToDownload.length;
    for (let i = 0; i < totalToDownload; i++) {
      const cloudTrack = tracksToDownload[i];
      const percent = Math.round(30 + (i / totalToDownload) * 30);
      onProgress?.({
        status: 'pulling',
        message: `📥 جاري تنزيل نشيد: ${cloudTrack.name} (${i + 1}/${totalToDownload})`,
        progress: percent
      });

      let audioBlob: Blob | undefined;
      let coverBlob: Blob | undefined;

      if (cloudTrack.audioFileId) {
        try {
          audioBlob = await retryWithBackoff(() => downloadFileFromDrive(cloudTrack.audioFileId!, accessToken));
        } catch (e) {
          console.error(`Failed to download audio for ${cloudTrack.name}:`, e);
        }
      }

      if (cloudTrack.coverFileId) {
        try {
          coverBlob = await retryWithBackoff(() => downloadFileFromDrive(cloudTrack.coverFileId!, accessToken));
        } catch (e) {
          console.error(`Failed to download cover for ${cloudTrack.name}:`, e);
        }
      }

      const restoredTrack: Track = {
        id: cloudTrack.id,
        name: cloudTrack.name,
        artist: cloudTrack.artist,
        url: '', // Will be generated as Object URL on App load
        coverUrl: '', // Will be generated on App load
        isFavorite: cloudTrack.isFavorite,
        timestamps: cloudTrack.timestamps || [],
        duration: cloudTrack.duration || 0,
        playbackRate: cloudTrack.playbackRate || 1.0,
        order: cloudTrack.order,
        playCount: cloudTrack.playCount || 0,
        listenTime: cloudTrack.listenTime || 0,
        fileBlob: audioBlob,
        coverBlob: coverBlob,
        sourceType: cloudTrack.sourceType || 'import'
      };

      await saveLocalTrack(restoredTrack);
      cloudTracksUpdatedList.push(cloudTrack);
    }

    // 5. Upload missing/updated tracks to Cloud
    const totalToUpload = tracksToUpload.length;
    for (let i = 0; i < totalToUpload; i++) {
      const localTrack = tracksToUpload[i];
      const percent = Math.round(60 + (i / totalToUpload) * 30);
      onProgress?.({
        status: 'pushing',
        message: `📤 جاري رفع نشيد: ${localTrack.name} (${i + 1}/${totalToUpload})`,
        progress: percent
      });

      let audioFileId = '';
      let coverFileId = '';
      let audioHash = '';
      let coverHash = '';

      // Find if track already has cloud reference or if we find it by name/metadata
      const existingCloudTrack = cloudTracksMap.get(localTrack.id);

      // Audio Upload
      if (localTrack.fileBlob) {
        audioHash = await getBlobSHA256(localTrack.fileBlob);
        
        // Skip upload if file id already exists and hash matches
        if (existingCloudTrack && existingCloudTrack.audioFileId && existingCloudTrack.audioHash === audioHash) {
          audioFileId = existingCloudTrack.audioFileId;
        } else {
          const extension = localTrack.fileBlob.type.split('/')[1] || 'mp3';
          const filename = `traneem_audio_${localTrack.id}.${extension}`;
          const res = await retryWithBackoff(() =>
            uploadFileToDrive(filename, localTrack.fileBlob!.type, localTrack.fileBlob!, accessToken)
          );
          audioFileId = res.id;
        }
      }

      // Cover Upload
      if (localTrack.coverBlob) {
        coverHash = await getBlobSHA256(localTrack.coverBlob);

        if (existingCloudTrack && existingCloudTrack.coverFileId && existingCloudTrack.coverHash === coverHash) {
          coverFileId = existingCloudTrack.coverFileId;
        } else {
          const extension = localTrack.coverBlob.type.split('/')[1] || 'jpg';
          const filename = `traneem_cover_${localTrack.id}.${extension}`;
          const res = await retryWithBackoff(() =>
            uploadFileToDrive(filename, localTrack.coverBlob!.type, localTrack.coverBlob!, accessToken)
          );
          coverFileId = res.id;
        }
      }

      // Update or push into cloud track metadata list
      const metaIndex = cloudTracksUpdatedList.findIndex(t => t.id === localTrack.id);
      const newCloudTrackMeta: CloudTrackMetadata = {
        id: localTrack.id,
        name: localTrack.name,
        artist: localTrack.artist,
        audioFileId: audioFileId || existingCloudTrack?.audioFileId,
        audioSize: localTrack.fileBlob?.size || existingCloudTrack?.audioSize,
        audioHash: audioHash || existingCloudTrack?.audioHash,
        coverFileId: coverFileId || existingCloudTrack?.coverFileId,
        coverSize: localTrack.coverBlob?.size || existingCloudTrack?.coverSize,
        coverHash: coverHash || existingCloudTrack?.coverHash,
        isFavorite: localTrack.isFavorite,
        timestamps: localTrack.timestamps || [],
        duration: localTrack.duration || 0,
        playbackRate: localTrack.playbackRate || 1.0,
        order: localTrack.order,
        playCount: localTrack.playCount || 0,
        listenTime: localTrack.listenTime || 0,
        sourceType: localTrack.sourceType || 'import',
        lastModified: new Date().toISOString()
      };

      if (metaIndex !== -1) {
        cloudTracksUpdatedList[metaIndex] = newCloudTrackMeta;
      } else {
        cloudTracksUpdatedList.push(newCloudTrackMeta);
      }
    }

    // 6. Update and upload the traneem_index.json file
    onProgress?.({ status: 'pushing', message: 'جاري تحديث الفهرس السحابي...', progress: 95 });
    
    cloudIndex.tracks = cloudTracksUpdatedList;
    cloudIndex.lastSyncedAt = new Date().toISOString();

    const indexBlob = new Blob([JSON.stringify(cloudIndex, null, 2)], { type: 'application/json' });
    if (indexFileId) {
      await retryWithBackoff(() => updateFileInDrive(indexFileId!, indexBlob, accessToken));
    } else {
      await retryWithBackoff(() => uploadFileToDrive('traneem_index.json', 'application/json', indexBlob, accessToken));
    }

    // Save successfully synced track IDs to local storage to track future deletions correctly
    const syncedIds = cloudTracksUpdatedList.map(t => t.id);
    localStorage.setItem('synced_track_ids', JSON.stringify(syncedIds));

    // Clear the successfully processed local permanently deleted track IDs list
    localStorage.removeItem('permanently_deleted_track_ids');

    onProgress?.({ status: 'completed', message: 'اكتملت المزامنة بنجاح! ✅', progress: 100 });
    
    // Return final synced track list
    const finalTracks = await getLocalTracks();
    return finalTracks;
  } catch (error: any) {
    console.error('Cloud Sync failed:', error);
    let errorMsg = error?.message || error;
    if (errorMsg === 'ExpiredToken') {
      errorMsg = 'انتهت صلاحية جلسة تسجيل الدخول. يرجى تسجيل الدخول مجدداً لتفعيل المزامنة السحابية.';
    }
    onProgress?.({ status: 'error', message: `فشلت المزامنة: ${errorMsg}`, progress: 100 });
    throw new Error(errorMsg);
  } finally {
    isSyncing = false;
  }
};
