import React from 'react';
import { X, Cloud, RefreshCw, UploadCloud, DownloadCloud, CheckCircle2, AlertCircle } from 'lucide-react';
import { GoogleDriveUser } from '../types';

interface GoogleDriveBackupModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: GoogleDriveUser | null;
  onGoogleLogin: () => Promise<void>;
  onTriggerSyncNow: () => Promise<void>;
  onTriggerRestore: () => Promise<void>;
  isSyncing: boolean;
  isRestoring: boolean;
  syncProgress: number;
  syncStatusText: string;
}

export const GoogleDriveBackupModal: React.FC<GoogleDriveBackupModalProps> = ({
  isOpen,
  onClose,
  user,
  onGoogleLogin,
  onTriggerSyncNow,
  onTriggerRestore,
  isSyncing,
  isRestoring,
  syncProgress,
  syncStatusText,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg p-6 shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute left-4 top-4 p-2 text-slate-400 hover:text-white rounded-full hover:bg-slate-800 transition"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center space-x-3 space-x-reverse mb-6">
          <div className="w-12 h-12 rounded-2xl bg-teal-500/20 border border-teal-500/30 flex items-center justify-center text-teal-400">
            <Cloud className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">المزامنة مع Google Drive</h3>
            <p className="text-xs text-slate-400">مزامنة تلقائية وآمنة للأناشيد والعلامات الزمنية</p>
          </div>
        </div>

        {/* PROGRESS BAR IF SYNCING OR RESTORING */}
        {(isSyncing || isRestoring) && (
          <div className="bg-slate-800/80 border border-emerald-500/30 rounded-2xl p-5 mb-6 space-y-3">
            <div className="flex justify-between text-xs font-bold text-emerald-400">
              <span>{syncStatusText || 'جاري معالجة البيانات...'}</span>
              <span>{syncProgress}%</span>
            </div>
            <div className="w-full h-3 bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-300"
                style={{ width: `${syncProgress}%` }}
              ></div>
            </div>
          </div>
        )}

        {/* STATUS CONTENT */}
        {user ? (
          <div className="space-y-4">
            <div className="bg-slate-800/50 border border-slate-700/60 rounded-2xl p-4 flex items-center space-x-3 space-x-reverse">
              <div className="w-10 h-10 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 font-bold shrink-0">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div className="min-w-0">
                <h4 className="font-bold text-white text-sm">الحساب مرتبط</h4>
                <p className="text-xs text-slate-400 truncate">{user.email}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
              <button
                onClick={onTriggerSyncNow}
                disabled={isSyncing || isRestoring}
                className="py-3 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-md transition flex items-center justify-center space-x-2 space-x-reverse disabled:opacity-50"
              >
                <UploadCloud className="w-5 h-5 ml-1" />
                <span>رفع البيانات إلى السحابة</span>
              </button>

              <button
                onClick={onTriggerRestore}
                disabled={isSyncing || isRestoring}
                className="py-3 px-4 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold rounded-xl transition flex items-center justify-center space-x-2 space-x-reverse disabled:opacity-50"
              >
                <DownloadCloud className="w-5 h-5 ml-1 text-teal-400" />
                <span>تنزيل واستعادة البيانات</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="text-center py-6 space-y-4">
            <p className="text-sm text-slate-300 leading-relaxed">
              قم بربط حسابك في Google لمزامنة جميع أناشيدك، تسجيلاتك، وعلاماتك الزمنية بين جميع أجهزتك.
            </p>
            <button
              onClick={onGoogleLogin}
              className="w-full py-3 px-4 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-bold rounded-2xl shadow-lg shadow-emerald-500/20 transition flex items-center justify-center space-x-2 space-x-reverse"
            >
              <Cloud className="w-5 h-5" />
              <span>تسجيل الدخول بـ Google</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
