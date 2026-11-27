import { Capacitor } from '@capacitor/core';
import { GoogleAuth } from '@codetrix-studio/capacitor-google-auth';
import { GoogleDriveUser, SyncDataPackage, CloudBackupMetadata } from '../types';

// Standard Google Client ID for Drive integration
const GOOGLE_CLIENT_ID = '885141042733-v738p5312019g5l08283n7v73s5f4p6u.apps.googleusercontent.com';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email';

const USER_STORAGE_KEY = 'traneem_google_user';
const TOKEN_STORAGE_KEY = 'traneem_google_token';
const BACKUP_FILE_NAME = 'traneem_backup_latest.json';

class GoogleDriveService {
  private currentUser: GoogleDriveUser | null = null;
  private isInitialized = false;

  constructor() {
    this.loadSavedUser();
  }

  private loadSavedUser() {
    try {
      const savedUser = localStorage.getItem(USER_STORAGE_KEY);
      const savedToken = localStorage.getItem(TOKEN_STORAGE_KEY);
      if (savedUser && savedToken) {
        this.currentUser = JSON.parse(savedUser);
        if (this.currentUser) {
          this.currentUser.accessToken = savedToken;
        }
      }
    } catch (e) {
      console.warn('Failed to load saved Google Drive user', e);
    }
  }

  public getCurrentUser(): GoogleDriveUser | null {
    return this.currentUser;
  }

  public isConnected(): boolean {
    return !!(this.currentUser && this.currentUser.accessToken);
  }

  /**
   * Initializes Google Auth based on native APK vs Web environment.
   */
  public async init() {
    if (this.isInitialized) return;

    if (Capacitor.isNativePlatform()) {
      try {
        await GoogleAuth.initialize({
          clientId: GOOGLE_CLIENT_ID,
          scopes: ['profile', 'email', 'https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/drive.appdata'],
          grantOfflineAccess: true,
        });
      } catch (err) {
        console.warn('GoogleAuth native init warning:', err);
      }
    }
    this.isInitialized = true;
  }

  /**
   * Performs Google Sign-In cleanly without blank white firebaseapp redirect tabs.
   */
  public async signIn(): Promise<GoogleDriveUser> {
    await this.init();

    if (Capacitor.isNativePlatform()) {
      // Native Android APK Flow via Capacitor GoogleAuth
      const googleUser = await GoogleAuth.signIn();
      const userObj: GoogleDriveUser = {
        id: googleUser.id,
        name: googleUser.name || 'مستخدم ترانيم',
        email: googleUser.email,
        picture: googleUser.imageUrl,
        accessToken: googleUser.authentication.accessToken,
      };
      this.saveUserSession(userObj);
      return userObj;
    } else {
      // Web / PWA Flow using Google Identity Services (GIS) Token Client
      return new Promise((resolve, reject) => {
        if (typeof window === 'undefined' || !(window as any).google?.accounts?.oauth2) {
          // Fallback if script hasn't loaded yet
          const script = document.createElement('script');
          script.src = 'https://accounts.google.com/gsi/client';
          script.onload = () => this.requestGisToken(resolve, reject);
          script.onerror = () => reject(new Error('مكتبة Google Identity Services غير متوفرة'));
          document.head.appendChild(script);
        } else {
          this.requestGisToken(resolve, reject);
        }
      });
    }
  }

  private requestGisToken(
    resolve: (user: GoogleDriveUser) => void,
    reject: (error: any) => void
  ) {
    try {
      const client = (window as any).google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: DRIVE_SCOPE,
        callback: async (response: any) => {
          if (response.error) {
            reject(new Error(response.error_description || 'فشل الحصول على تصريح Google'));
            return;
          }
          if (response.access_token) {
            try {
              // Fetch user info from Google API
              const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                headers: { Authorization: `Bearer ${response.access_token}` },
              });
              const userInfo = await userInfoRes.json();

              const userObj: GoogleDriveUser = {
                id: userInfo.sub || 'google_user',
                name: userInfo.name || 'مستخدم ترانيم',
                email: userInfo.email || '',
                picture: userInfo.picture || '',
                accessToken: response.access_token,
              };

              this.saveUserSession(userObj);
              resolve(userObj);
            } catch (err) {
              // Fallback user object if userinfo call fails
              const userObj: GoogleDriveUser = {
                id: 'google_user_' + Date.now(),
                name: 'مستخدم ترانيم',
                email: 'user@gmail.com',
                accessToken: response.access_token,
              };
              this.saveUserSession(userObj);
              resolve(userObj);
            }
          } else {
            reject(new Error('لم يتم استلام رمز الدخول من Google'));
          }
        },
      });

      client.requestAccessToken({ prompt: 'consent' });
    } catch (e) {
      reject(e);
    }
  }

  private saveUserSession(user: GoogleDriveUser) {
    this.currentUser = user;
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
    if (user.accessToken) {
      localStorage.setItem(TOKEN_STORAGE_KEY, user.accessToken);
    }
  }

  public async signOut(): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      try {
        await GoogleAuth.signOut();
      } catch (e) {
        console.warn('Native signOut error:', e);
      }
    }
    this.currentUser = null;
    localStorage.removeItem(USER_STORAGE_KEY);
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  }

  /**
   * Uploads full backup JSON to Google Drive
   */
  public async uploadBackup(data: SyncDataPackage, onProgress?: (percent: number) => void): Promise<string> {
    if (!this.currentUser || !this.currentUser.accessToken) {
      throw new Error('يرجى تسجيل الدخول بحساب Google أولاً');
    }

    const token = this.currentUser.accessToken;
    const jsonString = JSON.stringify(data);
    const blob = new Blob([jsonString], { type: 'application/json' });

    if (onProgress) onProgress(20);

    // Check if existing file exists in Google Drive
    const searchRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=name='${BACKUP_FILE_NAME}' and trashed=false`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    if (onProgress) onProgress(40);

    let existingFileId: string | null = null;
    if (searchRes.ok) {
      const searchData = await searchRes.json();
      if (searchData.files && searchData.files.length > 0) {
        existingFileId = searchData.files[0].id;
      }
    }

    if (onProgress) onProgress(60);

    let uploadRes: Response;
    if (existingFileId) {
      // Update existing file
      uploadRes = await fetch(
        `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=media`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: jsonString,
        }
      );
    } else {
      // Create multipart new file
      const metadata = {
        name: BACKUP_FILE_NAME,
        mimeType: 'application/json',
      };

      const formData = new FormData();
      formData.append(
        'metadata',
        new Blob([JSON.stringify(metadata)], { type: 'application/json' })
      );
      formData.append('file', blob);

      uploadRes = await fetch(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        }
      );
    }

    if (!uploadRes.ok) {
      if (uploadRes.status === 401) {
        // Token expired, re-authenticate
        await this.signIn();
        return this.uploadBackup(data, onProgress);
      }
      throw new Error(`فشل الرفع إلى Google Drive (رمز الخطأ ${uploadRes.status})`);
    }

    if (onProgress) onProgress(100);
    const resultData = await uploadRes.json();
    return resultData.id || existingFileId || 'backup_ok';
  }

  /**
   * Downloads latest backup file from Google Drive
   */
  public async downloadBackup(onProgress?: (percent: number) => void): Promise<SyncDataPackage> {
    if (!this.currentUser || !this.currentUser.accessToken) {
      throw new Error('يرجى تسجيل الدخول بحساب Google أولاً');
    }

    const token = this.currentUser.accessToken;
    if (onProgress) onProgress(20);

    // Search for backup file
    const searchRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=name='${BACKUP_FILE_NAME}' and trashed=false&fields=files(id,name,size,modifiedTime)`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    if (onProgress) onProgress(50);

    if (!searchRes.ok) {
      if (searchRes.status === 401) {
        await this.signIn();
        return this.downloadBackup(onProgress);
      }
      throw new Error('فشل الاتصال بـ Google Drive');
    }

    const searchData = await searchRes.json();
    if (!searchData.files || searchData.files.length === 0) {
      throw new Error('لم يتم العثور على أي نسخة احتياطية سابقة في حسابك');
    }

    const fileId = searchData.files[0].id;
    if (onProgress) onProgress(70);

    // Download file content
    const downloadRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    if (!downloadRes.ok) {
      throw new Error('فشل تحميل ملف النسخة الاحتياطية من السحابة');
    }

    if (onProgress) onProgress(90);
    const backupPackage: SyncDataPackage = await downloadRes.json();
    if (onProgress) onProgress(100);

    return backupPackage;
  }

  /**
   * Retrieves info about current cloud backup
   */
  public async getBackupMetadata(): Promise<CloudBackupMetadata | null> {
    if (!this.currentUser || !this.currentUser.accessToken) return null;

    try {
      const token = this.currentUser.accessToken;
      const searchRes = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=name='${BACKUP_FILE_NAME}' and trashed=false&fields=files(id,name,size,modifiedTime)`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (!searchRes.ok) return null;
      const searchData = await searchRes.json();

      if (searchData.files && searchData.files.length > 0) {
        const file = searchData.files[0];
        return {
          fileId: file.id,
          fileName: file.name,
          createdTime: file.modifiedTime || new Date().toISOString(),
          sizeBytes: parseInt(file.size || '0', 10),
          trackCount: 0,
          playlistCount: 0,
        };
      }
    } catch (e) {
      console.warn('Error fetching backup metadata', e);
    }
    return null;
  }
}

export const googleDriveService = new GoogleDriveService();
