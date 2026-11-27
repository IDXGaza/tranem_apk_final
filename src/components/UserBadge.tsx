import React, { useState, useEffect } from 'react';
import { 
  Cloud, CloudLightning, RefreshCw, DownloadCloud, UploadCloud, 
  CheckCircle2, LogOut, User, ShieldCheck, HardDrive, Database, Sparkles, X, ChevronLeft
} from 'lucide-react';
import { GoogleDriveUser, CloudBackupMetadata } from '../types';
import { googleDriveService } from '../services/googleDrive';

interface UserBadgeProps {
  isOpen: boolean;
  onClose: () => void;
  user: GoogleDriveUser | null;
  onGoogleLogin: () => Promise<void>;
  onGoogleLogout: () => Promise<void>;
  onTriggerSyncNow: () => Promise<void>;
  onTriggerRestore: () => Promise<void>;
  isSyncing: boolean;
  isRestoring: boolean;
  lastSyncTime: number | null;
  totalTracksCount: number;
  onShowToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
}

export const UserBadge: React.FC<UserBadgeProps> = ({
  isOpen,
  onClose,
  user,
  onGoogleLogin,
  onGoogleLogout,
  onTriggerSyncNow,
  onTriggerRestore,
  isSyncing,
  isRestoring,
  lastSyncTime,
  totalTracksCount,
  onShowToast,
}) => {
  const [cloudMetadata, setCloudMetadata] = useState<CloudBackupMetadata | null>(null);
  const [isLoadingMeta, setIsLoadingMeta] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  useEffect(() => {
    if (user && isOpen) {
      loadCloudMetadata();
    }
  }, [user, isOpen]);

  const loadCloudMetadata = async () => {
    setIsLoadingMeta(true);
    try {
      const meta = await googleDriveService.getBackupMetadata();
      setCloudMetadata(meta);
    } catch (e) {
      console.warn('Failed to fetch backup metadata', e);
    } finally {
      setIsLoadingMeta(false);
    }
  };

  const handleLoginClick = async () => {
    setIsLoggingIn(true);
    try {
      await onGoogleLogin();
    } catch (err: any) {
      onShowToast(err.message || 'فشل تسجيل الدخول بـ Google', 'error');
    } finally {
      setIsLoggingIn(false);
    }
  };

  if (!isOpen) return null;

  const isConnected = !!user;

  return (
    <div className="fixed inset-0 z-50 flex justify-start bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border-l border-slate-800 w-full max-w-md h-full flex flex-col p-6 shadow-2xl overflow-y-auto">
        
        {/* HEADER */}
        <div className="flex items-center justify-between pb-6 border-b border-slate-800">
          <div className="flex items-center space-x-3 space-x-reverse">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Cloud className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-white text-lg">الربط والمزامنة السحابية</h3>
              <p className="text-xs text-slate-400">Google Drive Cloud Storage</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-full hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ACCOUNT STATUS BOX */}
        <div className="mt-6 bg-slate-800/80 border border-slate-700/60 rounded-3xl p-5 space-y-4 shadow-inner">
          {isConnected ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3 space-x-reverse min-w-0">
                {user?.picture ? (
                  <img
                    src={user.picture}
                    alt={user.name}
                    className="w-12 h-12 rounded-full border-2 border-emerald-500/50 object-cover"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 font-bold">
                    <User className="w-6 h-6" />
                  </div>
                )}
                <div className="min-w-0">
                  <h4 className="font-bold text-white text-sm truncate">{user?.name}</h4>
                  <p className="text-xs text-slate-400 truncate">{user?.email}</p>
                  <span className="inline-flex items-center mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-500/30">
                    <CheckCircle2 className="w-3 h-3 ml-1" /> متصل بـ Google Drive
                  </span>
                </div>
              </div>

              <button
                onClick={onGoogleLogout}
                className="p-2 text-slate-400 hover:text-red-400 hover:bg-slate-700/50 rounded-xl transition"
                title="فصل الحساب"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          ) : (
            <div className="text-center py-2 space-y-3">
              <div className="w-14 h-14 rounded-full bg-slate-700/50 border border-slate-600 flex items-center justify-center mx-auto text-slate-400">
                <CloudLightning className="w-7 h-7" />
              </div>
              <div>
                <h4 className="font-bold text-white text-base">غير مرتبط بالسحابة</h4>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  ربط حسابك بـ Google Drive يحفظ جميع الأناشيد والتسجيلات والعلامات الزمنية تلقائياً وبشكل آمن في سحابتك الخاصة.
                </p>
              </div>

              <button
                onClick={handleLoginClick}
                disabled={isLoggingIn}
                className="w-full py-3 px-4 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-bold rounded-2xl shadow-lg shadow-emerald-500/20 transition flex items-center justify-center space-x-2 space-x-reverse disabled:opacity-50"
              >
                {isLoggingIn ? (
                  <div className="w-5 h-5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <>
                    <Cloud className="w-5 h-5" />
                    <span>ربط حساب Google Drive الآن</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {/* CLOUD METRICS & ACTIONS */}
        {isConnected && (
          <div className="mt-6 space-y-4">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">حالة المزامنة السحابية</h4>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-3.5">
                <div className="text-slate-400 text-xs mb-1 flex items-center">
                  <Database className="w-3.5 h-3.5 ml-1 text-emerald-400" /> عدد الأناشيد
                </div>
                <div className="text-lg font-extrabold text-white">{totalTracksCount} أنشودة</div>
              </div>

              <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-3.5">
                <div className="text-slate-400 text-xs mb-1 flex items-center">
                  <HardDrive className="w-3.5 h-3.5 ml-1 text-teal-400" /> حجم النسخة
                </div>
                <div className="text-lg font-extrabold text-white">
                  {cloudMetadata ? `${(cloudMetadata.sizeBytes / (1024 * 1024)).toFixed(1)} ميجابايت` : '---'}
                </div>
              </div>
            </div>

            {lastSyncTime && (
              <p className="text-xs text-slate-400 text-center">
                آخر مزامنة ناجحة: {new Date(lastSyncTime).toLocaleString('ar-SA')}
              </p>
            )}

            {/* SYNC & RESTORE BUTTONS */}
            <div className="space-y-2.5 pt-2">
              <button
                onClick={onTriggerSyncNow}
                disabled={isSyncing || isRestoring}
                className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-2xl shadow-md transition flex items-center justify-center space-x-2 space-x-reverse disabled:opacity-50"
              >
                {isSyncing ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <>
                    <UploadCloud className="w-5 h-5 ml-1" />
                    <span>مزامنة وحفظ الكل في السحابة الآن</span>
                  </>
                )}
              </button>

              <button
                onClick={onTriggerRestore}
                disabled={isSyncing || isRestoring}
                className="w-full py-3 px-4 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold rounded-2xl transition flex items-center justify-center space-x-2 space-x-reverse disabled:opacity-50"
              >
                {isRestoring ? (
                  <div className="w-5 h-5 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <>
                    <DownloadCloud className="w-5 h-5 ml-1 text-teal-400" />
                    <span>استعادة البيانات من Google Drive</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* FOOTER */}
        <div className="mt-auto pt-6 border-t border-slate-800 text-center text-xs text-slate-500 space-y-1">
          <p>تطبيق ترانيم الإصدار 2.5</p>
          <p>يحفظ جميع الملفات والعلامات الزمنية مباشرة في حسابك</p>
        </div>
      </div>
    </div>
  );
};
