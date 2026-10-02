import { Capacitor } from '@capacitor/core';

export interface DriveBackupFile {
  id: string;
  name: string;
  size?: string;
  createdTime: string;
}

const GOOGLE_CLIENT_ID = '911335724064-2fsqm3qlsciugqe7tri6vk33814uuerq.apps.googleusercontent.com';
const REQUIRED_SCOPES = [
  'https://www.googleapis.com/auth/drive.appdata',
  'email',
  'profile',
  'openid'
];

const loadGsiScript = (): Promise<void> => {
  return new Promise((resolve) => {
    if ((window as any).google?.accounts?.oauth2) {
      return resolve();
    }
    const existing = document.getElementById('gsi-client-script');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => resolve());
      return;
    }
    const script = document.createElement('script');
    script.id = 'gsi-client-script';
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => resolve();
    document.head.appendChild(script);
  });
};

const requestGoogleTokenViaGIS = (): Promise<string> => {
  return new Promise(async (resolve, reject) => {
    try {
      await loadGsiScript();
      const google = (window as any).google;
      if (!google?.accounts?.oauth2?.initTokenClient) {
        return reject(new Error('GIS_UNAVAILABLE'));
      }

      let resolved = false;
      const client = google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: REQUIRED_SCOPES.join(' '),
        callback: async (response: any) => {
          if (resolved) return;
          resolved = true;

          if (response.error) {
            if (response.error === 'popup_closed_by_user' || response.error === 'access_denied') {
              return reject(new Error('تم إغلاق نافذة تسجيل الدخول قبل إكمال العملية'));
            }
            return reject(new Error(response.error_description || response.error || 'تم إلغاء المصادقة'));
          }
          if (!response.access_token) {
            return reject(new Error('لم يتم استلام رمز الوصول من Google'));
          }

          const accessToken = response.access_token;
          localStorage.setItem('google_access_token', accessToken);
          localStorage.setItem('google_token_acquired_at', Date.now().toString());

          // Fetch user profile info
          let traneemUser = {
            displayName: 'مستخدم ترانيم',
            email: '',
            photoURL: '',
            uid: 'user_' + Date.now()
          };
          try {
            const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
              headers: { Authorization: `Bearer ${accessToken}` }
            });
            if (userRes.ok) {
              const userInfo = await userRes.json();
              traneemUser = {
                displayName: userInfo.name || 'مستخدم ترانيم',
                email: userInfo.email || '',
                photoURL: userInfo.picture || '',
                uid: userInfo.sub || ('user_' + Date.now())
              };
            }
          } catch (profileErr) {
            console.warn('Could not fetch user profile info:', profileErr);
          }
          localStorage.setItem('traneem_user', JSON.stringify(traneemUser));

          resolve(accessToken);
        },
        error_callback: (err: any) => {
          if (resolved) return;
          resolved = true;
          reject(new Error(err?.message || 'فشل فتح نافذة تسجيل الدخول'));
        }
      });

      client.requestAccessToken({ prompt: 'select_account' });
    } catch (e) {
      reject(e);
    }
  });
};

// Modern Authentication with Native GoogleAuth on Android and GIS / Firebase Auth on Web
export const getAccessToken = async (forceInteractive: boolean = false): Promise<string> => {
  if (Capacitor.isNativePlatform()) {
    try {
      const { GoogleAuth } = await import('@codetrix-studio/capacitor-google-auth');
      await GoogleAuth.initialize({
        clientId: GOOGLE_CLIENT_ID,
        serverClientId: GOOGLE_CLIENT_ID,
        scopes: ['https://www.googleapis.com/auth/drive.appdata', 'email', 'profile', 'openid'],
        grantOfflineAccess: true
      } as any);

      // 1. Immediate fresh token check (0ms return if token is valid < 50 mins)
      const storedToken = localStorage.getItem('google_access_token');
      const acquiredAt = parseInt(localStorage.getItem('google_token_acquired_at') || '0');
      const isTokenValid = storedToken && (Date.now() - acquiredAt < 50 * 60 * 1000);

      if (!forceInteractive && isTokenValid && storedToken) {
        return storedToken;
      }

      // 2. If not forced interactive and token expired, attempt fast silent refresh with 2.5s timeout
      if (!forceInteractive) {
        try {
          const refreshPromise = GoogleAuth.refresh() as Promise<any>;
          const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('RefreshTimeout')), 2500));
          const authData: any = await Promise.race([refreshPromise, timeoutPromise]);
          
          const refreshedToken = authData?.accessToken || authData?.authentication?.accessToken || authData?.idToken || authData?.authentication?.idToken;
          if (refreshedToken) {
            localStorage.setItem('google_access_token', refreshedToken);
            localStorage.setItem('google_token_acquired_at', Date.now().toString());
            return refreshedToken;
          }
        } catch (silentErr) {
          console.warn('Silent refresh skipped/timed out:', silentErr);
        }

        // Return existing stored token as best-effort if available
        if (storedToken) {
          return storedToken;
        }

        // Do NOT trigger interactive signIn in background mode
        throw new Error('ExpiredToken');
      }

      let user: any = null;
      try {
        user = await GoogleAuth.signIn() as any;
      } catch (nativeSignErr: any) {
        console.warn('Native GoogleAuth.signIn failed, attempting Firebase Auth fallback:', nativeSignErr);
        try {
          const { auth } = await import('../firebase');
          const { signInWithPopup, GoogleAuthProvider } = await import('firebase/auth');
          
          const provider = new GoogleAuthProvider();
          provider.addScope('https://www.googleapis.com/auth/drive.appdata');
          provider.setCustomParameters({ prompt: 'select_account' });
          
          const result = await signInWithPopup(auth, provider);
          const credential = GoogleAuthProvider.credentialFromResult(result);
          const accessToken = credential?.accessToken;
          
          if (accessToken) {
            localStorage.setItem('google_access_token', accessToken);
            localStorage.setItem('google_token_acquired_at', Date.now().toString());

            if (result.user) {
              const traneemUser = {
                displayName: result.user.displayName || 'مستخدم ترانيم',
                email: result.user.email || '',
                photoURL: result.user.photoURL || '',
                uid: result.user.uid || ('user_' + Date.now())
              };
              localStorage.setItem('traneem_user', JSON.stringify(traneemUser));
            }
            return accessToken;
          }
        } catch (fbFallbackErr) {
          console.warn('Firebase fallback also failed:', fbFallbackErr);
        }
        throw nativeSignErr;
      }

      const accessToken = user?.authentication?.accessToken || user?.accessToken || user?.authentication?.idToken || user?.idToken;
      if (!accessToken) {
        throw new Error('لم يتم استلام رمز مصادقة Google من النظام.');
      }
      
      localStorage.setItem('google_access_token', accessToken);
      localStorage.setItem('google_token_acquired_at', Date.now().toString());

      if (user) {
        const traneemUser = {
          displayName: user.displayName || (user.givenName ? `${user.givenName} ${user.familyName || ''}`.trim() : '') || user.name || 'مستخدم ترانيم',
          email: user.email || '',
          photoURL: user.imageUrl || user.photoUrl || '',
          uid: user.id || user.userId || ('user_' + Date.now())
        };
        localStorage.setItem('traneem_user', JSON.stringify(traneemUser));

        // Optionally link with Firebase Auth
        try {
          const { auth } = await import('../firebase');
          const { GoogleAuthProvider, signInWithCredential } = await import('firebase/auth');
          const idToken = user?.authentication?.idToken || user?.idToken;
          if (idToken) {
            const cred = GoogleAuthProvider.credential(idToken, accessToken);
            await signInWithCredential(auth, cred);
          }
        } catch (fbErr) {
          console.warn('Firebase sign-in link skipped or failed:', fbErr);
        }
      }
      
      return accessToken;
    } catch (err: any) {
      console.error('Android GoogleAuth Error:', err);
      const errCode = String(err?.code || err?.statusCode || '');
      const rawMsg = String(err?.message || (typeof err === 'string' ? err : ''));
      
      let msg = '';
      if (errCode === '10' || rawMsg.includes('10')) {
        msg = 'كود (10 - DEVELOPER_ERROR): عدم تطابق بصمة SHA-1 أو اسم الحزمة مع Google Cloud.';
      } else if (errCode === '12500' || rawMsg.includes('12500')) {
        msg = 'كود (12500 - SIGN_IN_FAILED): يرجى مراجعة إعدادات شاشة OAuth أو حسابك.';
      } else if (errCode === '7' || rawMsg.includes('7')) {
        msg = 'كود (7 - NETWORK_ERROR): خطأ في الاتصال بخوادم Google.';
      } else if (rawMsg.includes('canceled') || errCode === '12501' || rawMsg.includes('12501')) {
        msg = 'تم إلغاء تسجيل الدخول.';
      } else {
        msg = rawMsg && rawMsg !== '{}' ? `${rawMsg}` : 'حدث خطأ أثناء المصادقة.';
      }
      throw new Error(msg);
    }
  } else {
    // Web platform
    const storedToken = localStorage.getItem('google_access_token');
    const acquiredAt = parseInt(localStorage.getItem('google_token_acquired_at') || '0');
    const isTokenFresh = storedToken && (Date.now() - acquiredAt < 50 * 60 * 1000);

    if (!forceInteractive && isTokenFresh && storedToken) {
      return storedToken;
    }

    if (!forceInteractive && !isTokenFresh) {
      // In background web mode without user interaction (e.g. auto sync timer)
      throw new Error('ExpiredToken');
    }

    // Web platform: Use Firebase Auth Popup directly (uses authorized firebaseapp.com handler to prevent origin_mismatch errors)
    try {
      const { auth } = await import('../firebase');
      const { signInWithPopup, GoogleAuthProvider } = await import('firebase/auth');
      
      const provider = new GoogleAuthProvider();
      provider.addScope('https://www.googleapis.com/auth/drive.appdata');
      provider.setCustomParameters({
        prompt: 'select_account'
      });
      
      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      const accessToken = credential?.accessToken;
      
      if (!accessToken) {
        throw new Error('فشل الحصول على رمز الوصول من قوقل (Access Token).');
      }

      localStorage.setItem('google_access_token', accessToken);
      localStorage.setItem('google_token_acquired_at', Date.now().toString());

      if (result.user) {
        const traneemUser = {
          displayName: result.user.displayName || 'مستخدم ترانيم',
          email: result.user.email || '',
          photoURL: result.user.photoURL || '',
          uid: result.user.uid || ('user_' + Date.now())
        };
        localStorage.setItem('traneem_user', JSON.stringify(traneemUser));
      }

      return accessToken;
    } catch (err: any) {
      let friendlyMsg = '';
      const errorCode = err?.code || '';
      const errorMsg = err?.message || '';
      
      if (errorCode === 'auth/cancelled-popup-request' || errorMsg.includes('cancelled-popup-request')) {
        friendlyMsg = 'تم إلغاء طلب تسجيل الدخول أو استبداله.';
      } else if (errorCode === 'auth/popup-closed-by-user' || errorMsg.includes('popup-closed-by-user')) {
        friendlyMsg = 'تم إغلاق نافذة تسجيل الدخول قبل إتمام العملية.';
      } else if (errorCode === 'auth/popup-blocked' || errorMsg.includes('popup-blocked')) {
        friendlyMsg = 'تم حظر نافذة تسجيل الدخول المنبثقة من قبل المتصفح. يرجى السماح بالنوافذ المنبثقة وحاول مجدداً.';
      } else if (errorCode === 'auth/unauthorized-domain' || errorMsg.includes('unauthorized-domain')) {
        friendlyMsg = 'النطاق الحالي غير مصرح له في إعدادات Firebase Auth.';
      } else {
        friendlyMsg = errorMsg || errorCode || 'حدث خطأ أثناء المصادقة.';
      }
      throw new Error(`فشل تسجيل الدخول: ${friendlyMsg}`);
    }
  }
};

/**
 * Safely parses response errors from Google Drive REST API.
 */
const handleDriveResponseError = async (response: Response, actionContext: string): Promise<never> => {
  let errDetail = '';
  try {
    const errJson = await response.json();
    errDetail = errJson?.error?.message || errJson?.error_description || '';
  } catch {
    try {
      errDetail = await response.text();
    } catch {
      errDetail = '';
    }
  }

  if (
    response.status === 401 ||
    errDetail.toLowerCase().includes('invalid credentials') ||
    errDetail.toLowerCase().includes('unauthorized') ||
    errDetail.toLowerCase().includes('token expired')
  ) {
    localStorage.removeItem('google_access_token');
    localStorage.removeItem('google_token_acquired_at');
    throw new Error('ExpiredToken');
  }

  if (
    response.status === 403 ||
    errDetail.toLowerCase().includes('insufficient') ||
    errDetail.toLowerCase().includes('scope') ||
    errDetail.toLowerCase().includes('permission')
  ) {
    throw new Error('صلاحية Google Drive غير كافية. يرجى تسجيل الخروج وإعادة تسجيل الدخول لمنح الصلاحيات السحابية.');
  }

  const msg = errDetail ? `${errDetail} (كود ${response.status})` : (response.statusText || `كود ${response.status}`);
  throw new Error(`${actionContext}: ${msg}`);
};

export const uploadBackupToDrive = async (zipBlob: Blob, accessToken: string, customFilename?: string): Promise<any> => {
  const now = new Date();
  const datePart = `${now.getFullYear()}-${(now.getMonth()+1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`;
  const timePart = `${now.getHours().toString().padStart(2, '0')}-${now.getMinutes().toString().padStart(2, '0')}-${now.getSeconds().toString().padStart(2, '0')}`;
  const filename = customFilename || `نسخة_احتياطية_ترانيم_${datePart}_${timePart}.zip`;
  
  // Use multipart/related for appDataFolder
  const metadata = { 
    name: filename, 
    mimeType: 'application/zip', 
    parents: ['appDataFolder'] 
  };
  const metadataBlob = new Blob([JSON.stringify(metadata)], { type: 'application/json' });
  const boundary = 'traneem_backup_boundary_998877';
  
  const multipartBody = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
    metadataBlob,
    `\r\n--${boundary}\r\nContent-Type: application/zip\r\n\r\n`,
    zipBlob,
    `\r\n--${boundary}--`
  ], { type: `multipart/related; boundary=${boundary}` });
  
  const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: multipartBody
  });
  if (!response.ok) {
    await handleDriveResponseError(response, 'فشل رفع النسخة الاحتياطية');
  }
  return await response.json();
};

export const updateBackupInDrive = async (fileId: string, zipBlob: Blob, accessToken: string): Promise<any> => {
  const url = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`;
  
  const response = await fetch(url, {
    method: 'PATCH',
    headers: { 
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/zip'
    },
    body: zipBlob
  });
  
  if (!response.ok) {
    await handleDriveResponseError(response, 'فشل تحديث النسخة الاحتياطية');
  }
  return await response.json();
};

export const listBackupsInDrive = async (accessToken: string): Promise<DriveBackupFile[]> => {
  const q = encodeURIComponent("(name contains 'traneem_backup' or name contains 'ترانيم') and mimeType = 'application/zip' and trashed = false");
  const url = `https://www.googleapis.com/drive/v3/files?q=${q}&spaces=appDataFolder&orderBy=createdTime+desc&fields=files(id,name,size,createdTime)`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) {
    await handleDriveResponseError(response, 'فشل جلب قائمة النسخ الاحتياطية');
  }
  const data = await response.json();
  return data.files || [];
};

export const downloadBackupFromDrive = async (fileId: string, accessToken: string): Promise<Blob> => {
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!response.ok) {
    await handleDriveResponseError(response, 'فشل تحميل النسخة الاحتياطية');
  }
  return await response.blob();
};

export const deleteBackupFromDrive = async (fileId: string, accessToken: string): Promise<void> => {
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!response.ok && response.status !== 404) {
    await handleDriveResponseError(response, 'فشل حذف النسخة الاحتياطية');
  }
};

// --- New individual file helpers for auto-sync ---

/**
 * Calculates SHA-256 hash of a Blob for deduplication.
 */
export const getBlobSHA256 = async (blob: Blob): Promise<string> => {
  const buffer = await blob.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

/**
 * Uploads a file to appDataFolder and returns the metadata including ID.
 */
export const uploadFileToDrive = async (
  filename: string,
  mimeType: string,
  blob: Blob,
  accessToken: string
): Promise<{ id: string }> => {
  const metadata = {
    name: filename,
    parents: ['appDataFolder']
  };
  const metadataBlob = new Blob([JSON.stringify(metadata)], { type: 'application/json' });
  const boundary = 'traneem_boundary_unique_998';
  
  const multipartBody = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
    metadataBlob,
    `\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
    blob,
    `\r\n--${boundary}--`
  ], { type: `multipart/related; boundary=${boundary}` });
  
  const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: multipartBody
  });
  
  if (!response.ok) {
    await handleDriveResponseError(response, `فشل الرفع ${filename}`);
  }
  return response.json();
};

/**
 * Updates an existing file content in Drive.
 */
export const updateFileInDrive = async (
  fileId: string,
  blob: Blob,
  accessToken: string
): Promise<any> => {
  const url = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`;
  const response = await fetch(url, {
    method: 'PATCH',
    headers: { 
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': blob.type || 'application/octet-stream'
    },
    body: blob
  });
  if (!response.ok) {
    await handleDriveResponseError(response, `فشل تحديث الملف ${fileId}`);
  }
  return response.json();
};

/**
 * Downloads file as Blob.
 */
export const downloadFileFromDrive = async (fileId: string, accessToken: string): Promise<Blob> => {
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!response.ok) {
    await handleDriveResponseError(response, `فشل تحميل الملف ${fileId}`);
  }
  return response.blob();
};

/**
 * Downloads file and parses as JSON.
 */
export const downloadJSONFromDrive = async (fileId: string, accessToken: string): Promise<any> => {
  const blob = await downloadFileFromDrive(fileId, accessToken);
  const text = await blob.text();
  return JSON.parse(text);
};

/**
 * Finds a file by exact name in appDataFolder, returning file ID if found.
 */
export const findFileInDrive = async (filename: string, accessToken: string): Promise<string | null> => {
  const q = encodeURIComponent(`name = '${filename}' and trashed = false`);
  const url = `https://www.googleapis.com/drive/v3/files?q=${q}&spaces=appDataFolder&fields=files(id,name)`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) {
    await handleDriveResponseError(response, `فشل البحث عن الملف ${filename}`);
  }
  const data = await response.json();
  if (data.files && data.files.length > 0) {
    return data.files[0].id;
  }
  return null;
};

/**
 * Deletes a file from Drive by ID.
 */
export const deleteFileFromDrive = async (fileId: string, accessToken: string): Promise<void> => {
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!response.ok && response.status !== 404) {
    await handleDriveResponseError(response, `فشل حذف الملف ${fileId}`);
  }
};

