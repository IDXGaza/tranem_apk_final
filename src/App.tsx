import React, { useState, useEffect } from 'react';
import { 
  Cloud, Music, User, Plus, RefreshCw, Sparkles, CheckCircle2, 
  AlertCircle, Shield, Bookmark, Share2, Volume2, HardDrive
} from 'lucide-react';
import { Track, Playlist, GoogleDriveUser, TimestampMarker, SyncDataPackage } from './types';
import { dbService } from './services/db';
import { googleDriveService } from './services/googleDrive';
import { INITIAL_TRACKS } from './data/defaultTracks';
import { AudioPlayer } from './components/AudioPlayer';
import { TrackList } from './components/TrackList';
import { UserBadge } from './components/UserBadge';
import { ShareTrackModal } from './components/ShareTrackModal';
import { TimestampsModal } from './components/TimestampsModal';
import { AddTrackModal } from './components/AddTrackModal';
import { GoogleDriveBackupModal } from './components/GoogleDriveBackupModal';

export function App() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [user, setUser] = useState<GoogleDriveUser | null>(null);

  // Modals state
  const [isUserBadgeOpen, setIsUserBadgeOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isTimestampsModalOpen, setIsTimestampsModalOpen] = useState(false);
  const [isDriveBackupModalOpen, setIsDriveBackupModalOpen] = useState(false);

  const [activeShareTrack, setActiveShareTrack] = useState<Track | null>(null);
  const [activeTimestampsTrack, setActiveTimestampsTrack] = useState<Track | null>(null);

  // Sync state
  const [isSyncing, setIsSyncing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [syncProgress, setSyncProgress] = useState(0);
  const [syncStatusText, setSyncStatusText] = useState('');
  const [lastSyncTime, setLastSyncTime] = useState<number | null>(() => {
    const saved = localStorage.getItem('traneem_last_sync_time');
    return saved ? parseInt(saved, 10) : null;
  });

  // Toast notifications
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'info' | 'error' = 'info') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 4000);
  };

  // Initial setup: load IndexedDB tracks and Google Drive user session
  useEffect(() => {
    loadInitialData();
    const googleUser = googleDriveService.getCurrentUser();
    if (googleUser) {
      setUser(googleUser);
    }
  }, []);

  const loadInitialData = async () => {
    try {
      const storedTracks = await dbService.getAllTracks();
      if (storedTracks && storedTracks.length > 0) {
        setTracks(storedTracks);
        setCurrentTrack(storedTracks[0]);
      } else {
        // Seed default tracks
        for (const tr of INITIAL_TRACKS) {
          await dbService.saveTrack(tr);
        }
        setTracks(INITIAL_TRACKS);
        setCurrentTrack(INITIAL_TRACKS[0]);
      }

      const storedPlaylists = await dbService.getAllPlaylists();
      setPlaylists(storedPlaylists);
    } catch (e) {
      console.warn('Error loading database', e);
      setTracks(INITIAL_TRACKS);
      setCurrentTrack(INITIAL_TRACKS[0]);
    }
  };

  // GOOGLE DRIVE OAUTH LOGINS
  const handleGoogleLogin = async () => {
    try {
      showToast('جاري الاتصال بـ Google Drive...', 'info');
      const googleUser = await googleDriveService.signIn();
      setUser(googleUser);
      showToast(`مرحباً ${googleUser.name}! تم ربط حساب Google Drive بنجاح`, 'success');
    } catch (err: any) {
      showToast(err.message || 'فشل تسجيل الدخول بـ Google', 'error');
      throw err;
    }
  };

  const handleGoogleLogout = async () => {
    await googleDriveService.signOut();
    setUser(null);
    showToast('تم فصل حساب Google Drive', 'info');
  };

  // CLOUD SYNC & RESTORE
  const handleSyncToCloud = async () => {
    if (!user) {
      setIsUserBadgeOpen(true);
      showToast('يرجى ربط حساب Google Drive أولاً للمزامنة', 'info');
      return;
    }

    setIsSyncing(true);
    setSyncProgress(10);
    setSyncStatusText('تجميع البيانات الصوتيّة والعلامات...');

    try {
      // Package tracks & binary audio blobs
      const audioBlobsMap: Record<string, string> = {};

      for (const track of tracks) {
        if (track.audioBlobKey) {
          const blob = await dbService.getAudioBlob(track.audioBlobKey);
          if (blob) {
            const base64 = await new Promise<string>((resolve) => {
              const reader = new FileReader();
              reader.onload = () => resolve((reader.result as string).split(',')[1]);
              reader.readAsDataURL(blob);
            });
            audioBlobsMap[track.audioBlobKey] = base64;
          }
        }
      }

      const syncPackage: SyncDataPackage = {
        version: 1,
        timestamp: Date.now(),
        tracks,
        playlists,
        audioFiles: audioBlobsMap,
      };

      setSyncStatusText('رفع الملفات والعلامات إلى Google Drive...');
      await googleDriveService.uploadBackup(syncPackage, (p) => setSyncProgress(p));

      const now = Date.now();
      setLastSyncTime(now);
      localStorage.setItem('traneem_last_sync_time', now.toString());

      showToast('تمت المزامنة وحفظ جميع الأناشيد والعلامات الزمنية في السحابة بنجاح', 'success');
    } catch (err: any) {
      showToast(err.message || 'حدث خطأ أثناء المزامنة مع السحابة', 'error');
    } finally {
      setIsSyncing(false);
      setSyncProgress(0);
      setSyncStatusText('');
    }
  };

  const handleRestoreFromCloud = async () => {
    if (!user) {
      setIsUserBadgeOpen(true);
      showToast('يرجى ربط حساب Google Drive أولاً لاستعادة البيانات', 'info');
      return;
    }

    setIsRestoring(true);
    setSyncProgress(10);
    setSyncStatusText('تنزيل النسخة الاحتياطية من السحابة...');

    try {
      const backupData = await googleDriveService.downloadBackup((p) => setSyncProgress(p));

      if (backupData && backupData.tracks) {
        setSyncStatusText('استعادة الملفات الصوتية والعلامات الزمنية...');

        // Restore audio blobs to IndexedDB
        if (backupData.audioFiles) {
          for (const [key, base64Data] of Object.entries(backupData.audioFiles)) {
            const byteCharacters = atob(base64Data);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
              byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: 'audio/mpeg' });
            await dbService.saveAudioBlob(key, blob);
          }
        }

        // Restore tracks
        for (const track of backupData.tracks) {
          // Regenerate blob URL if audioBlobKey exists
          if (track.audioBlobKey) {
            const blob = await dbService.getAudioBlob(track.audioBlobKey);
            if (blob) {
              track.audioUrl = URL.createObjectURL(blob);
            }
          }
          await dbService.saveTrack(track);
        }

        setTracks(backupData.tracks);
        if (backupData.tracks.length > 0) {
          setCurrentTrack(backupData.tracks[0]);
        }

        showToast(`تمت استعادة ${backupData.tracks.length} أنشودة والعلامات بنجاح!`, 'success');
      }
    } catch (err: any) {
      showToast(err.message || 'حدث خطأ أثناء استعادة البيانات من السحابة', 'error');
    } finally {
      setIsRestoring(false);
      setSyncProgress(0);
      setSyncStatusText('');
    }
  };

  // TRACK ACTIONS
  const handleSelectTrack = (track: Track) => {
    if (currentTrack?.id === track.id) {
      setIsPlaying(!isPlaying);
    } else {
      setCurrentTrack(track);
      setIsPlaying(true);
    }
  };

  const handleToggleFavorite = async (trackId: string) => {
    const updated = tracks.map((t) => (t.id === trackId ? { ...t, isFavorite: !t.isFavorite } : t));
    setTracks(updated);
    const target = updated.find((t) => t.id === trackId);
    if (target) {
      await dbService.saveTrack(target);
    }
  };

  const handleDeleteTrack = async (trackId: string) => {
    const target = tracks.find((t) => t.id === trackId);
    await dbService.deleteTrack(trackId, target?.audioBlobKey);

    const updated = tracks.filter((t) => t.id !== trackId);
    setTracks(updated);

    if (currentTrack?.id === trackId) {
      setCurrentTrack(updated[0] || null);
      setIsPlaying(false);
    }
    showToast('تم حذف الأنشودة من المكتبة', 'info');
  };

  const handleAddTrack = async (newTrack: Track) => {
    await dbService.saveTrack(newTrack);
    setTracks([newTrack, ...tracks]);
    setCurrentTrack(newTrack);
    setIsPlaying(true);
  };

  const handleSaveTimestamps = async (trackId: string, timestamps: TimestampMarker[]) => {
    const updated = tracks.map((t) => (t.id === trackId ? { ...t, timestamps } : t));
    setTracks(updated);

    const target = updated.find((t) => t.id === trackId);
    if (target) {
      await dbService.saveTrack(target);
    }

    if (currentTrack?.id === trackId) {
      setCurrentTrack({ ...currentTrack, timestamps });
    }

    if (activeTimestampsTrack?.id === trackId) {
      setActiveTimestampsTrack({ ...activeTimestampsTrack, timestamps });
    }

    showToast('تم تحديث العلامات الزمنية للأنشودة', 'success');
  };

  const handleNextTrack = () => {
    if (tracks.length === 0) return;
    const currentIndex = tracks.findIndex((t) => t.id === currentTrack?.id);
    const nextIndex = (currentIndex + 1) % tracks.length;
    setCurrentTrack(tracks[nextIndex]);
    setIsPlaying(true);
  };

  const handlePrevTrack = () => {
    if (tracks.length === 0) return;
    const currentIndex = tracks.findIndex((t) => t.id === currentTrack?.id);
    const prevIndex = (currentIndex - 1 + tracks.length) % tracks.length;
    setCurrentTrack(tracks[prevIndex]);
    setIsPlaying(true);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-['Cairo',sans-serif]">
      
      {/* TOAST NOTIFICATION */}
      {toast && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl shadow-2xl border text-sm font-bold flex items-center space-x-2 space-x-reverse transition animate-bounce ${
          toast.type === 'success'
            ? 'bg-emerald-950/90 border-emerald-500 text-emerald-300'
            : toast.type === 'error'
            ? 'bg-rose-950/90 border-rose-500 text-rose-300'
            : 'bg-slate-900/90 border-slate-700 text-slate-200'
        }`}>
          {toast.type === 'success' && <CheckCircle2 className="w-5 h-5 ml-1 text-emerald-400" />}
          {toast.type === 'error' && <AlertCircle className="w-5 h-5 ml-1 text-rose-400" />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* HEADER NAVBAR */}
      <header className="sticky top-0 z-30 bg-slate-950/80 backdrop-blur-md border-b border-slate-900 px-4 md:px-8 py-3.5">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          
          {/* LOGO */}
          <div className="flex items-center space-x-3 space-x-reverse">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-400 p-0.5 shadow-lg shadow-emerald-500/20">
              <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center text-emerald-400 font-extrabold text-xl">
                ت
              </div>
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tight text-white flex items-center">
                ترانيم <span className="text-xs mr-2 px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-500/30">سحابي</span>
              </h1>
              <p className="text-[11px] text-slate-400">منصة الأناشيد والتسجيلات الإسلامية</p>
            </div>
          </div>

          {/* ACTION BUTTONS & USER BADGE */}
          <div className="flex items-center space-x-2.5 space-x-reverse">
            
            {/* GOOGLE DRIVE CLOUD SYNC BUTTON */}
            <button
              onClick={() => setIsUserBadgeOpen(true)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center space-x-2 space-x-reverse border ${
                user
                  ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300 hover:bg-emerald-900/60'
                  : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
              }`}
            >
              <Cloud className={`w-4 h-4 ml-1 ${user ? 'text-emerald-400 animate-pulse' : 'text-slate-400'}`} />
              <span className="hidden sm:inline">
                {user ? `متصل بالسحابة (${user.name.split(' ')[0]})` : 'الربط بالسحابة'}
              </span>
            </button>

            {/* PROFILE DRAWER BUTTON */}
            <button
              onClick={() => setIsUserBadgeOpen(true)}
              className="w-10 h-10 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-300 hover:bg-slate-800 transition"
              title="الملف الشخصي والمزامنة"
            >
              {user?.picture ? (
                <img src={user.picture} alt={user.name} className="w-full h-full rounded-xl object-cover" />
              ) : (
                <User className="w-5 h-5" />
              )}
            </button>
          </div>
        </div>
      </header>

      {/* MAIN CONTAINER */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 md:px-8 pt-6">
        
        {/* HERO BANNER FOR DRIVE CLOUD INTEGRATION */}
        {!user && (
          <div className="mb-6 bg-gradient-to-r from-emerald-950/80 via-slate-900 to-teal-950/80 border border-emerald-500/30 rounded-3xl p-6 shadow-xl relative overflow-hidden flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="space-y-2 z-10 text-center md:text-right">
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                <Cloud className="w-3.5 h-3.5 ml-1" /> مزامنة تلقائية عبر Google Drive
              </span>
              <h2 className="text-xl md:text-2xl font-black text-white">احفظ أناشيدك وعلاماتك الزمنية بأمان في سحابتك</h2>
              <p className="text-xs md:text-sm text-slate-300 max-w-xl leading-relaxed">
                ربط التطبيق بـ Google Drive يحفظ جميع الملفات الصوتية، الصور، والعلامات الزمنية بدون حدود للحجم، حتى تعمل على أي جهاز آخر.
              </p>
            </div>

            <button
              onClick={() => setIsUserBadgeOpen(true)}
              className="z-10 shrink-0 px-6 py-3.5 bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 font-black rounded-2xl shadow-lg shadow-emerald-500/20 hover:scale-105 transition"
            >
              ربط Google Drive الآن
            </button>
          </div>
        )}

        {/* TRACKS LIST SECTION */}
        <TrackList
          tracks={tracks}
          currentTrack={currentTrack}
          isPlaying={isPlaying}
          onSelectTrack={handleSelectTrack}
          onToggleFavorite={handleToggleFavorite}
          onDeleteTrack={handleDeleteTrack}
          onOpenShareModal={(t) => {
            setActiveShareTrack(t);
            setIsShareModalOpen(true);
          }}
          onOpenTimestampsModal={(t) => {
            setActiveTimestampsTrack(t);
            setIsTimestampsModalOpen(true);
          }}
          onOpenAddModal={() => setIsAddModalOpen(true)}
        />
      </main>

      {/* AUDIO PLAYER BAR */}
      <AudioPlayer
        currentTrack={currentTrack}
        isPlaying={isPlaying}
        onPlayPause={() => setIsPlaying(!isPlaying)}
        onNextTrack={handleNextTrack}
        onPrevTrack={handlePrevTrack}
        onOpenShareModal={(t) => {
          setActiveShareTrack(t);
          setIsShareModalOpen(true);
        }}
        onOpenTimestampsModal={(t) => {
          setActiveTimestampsTrack(t);
          setIsTimestampsModalOpen(true);
        }}
      />

      {/* MODALS */}
      <UserBadge
        isOpen={isUserBadgeOpen}
        onClose={() => setIsUserBadgeOpen(false)}
        user={user}
        onGoogleLogin={handleGoogleLogin}
        onGoogleLogout={handleGoogleLogout}
        onTriggerSyncNow={handleSyncToCloud}
        onTriggerRestore={handleRestoreFromCloud}
        isSyncing={isSyncing}
        isRestoring={isRestoring}
        lastSyncTime={lastSyncTime}
        totalTracksCount={tracks.length}
        onShowToast={showToast}
      />

      <ShareTrackModal
        track={activeShareTrack}
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        onShowToast={showToast}
      />

      <TimestampsModal
        track={activeTimestampsTrack}
        isOpen={isTimestampsModalOpen}
        onClose={() => setIsTimestampsModalOpen(false)}
        onSaveTimestamps={handleSaveTimestamps}
        onJumpToTime={(t) => {
          if (currentTrack) {
            setIsPlaying(true);
          }
        }}
      />

      <AddTrackModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onAddTrack={handleAddTrack}
        onShowToast={showToast}
      />

      <GoogleDriveBackupModal
        isOpen={isDriveBackupModalOpen}
        onClose={() => setIsDriveBackupModalOpen(false)}
        user={user}
        onGoogleLogin={handleGoogleLogin}
        onTriggerSyncNow={handleSyncToCloud}
        onTriggerRestore={handleRestoreFromCloud}
        isSyncing={isSyncing}
        isRestoring={isRestoring}
        syncProgress={syncProgress}
        syncStatusText={syncStatusText}
      />
    </div>
  );
}
