import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { LogOut, RefreshCw, X, User, Cloud, ShieldCheck, Zap, CheckCircle2, AlertCircle } from 'lucide-react';
import { SyncProgress } from '../services/cloudSync';
import { Track } from '../types';
import StatsWidget from './StatsWidget';
import { motion, AnimatePresence } from 'framer-motion';

interface UserBadgeProps {
  user: {
    displayName?: string | null;
    email?: string | null;
    photoURL?: string | null;
  } | null;
  onLogout: () => void;
  syncProgress: SyncProgress;
  onSyncNow: () => void;
  tracks: Track[];
  onOpenBackup: (mode?: 'backup' | 'import') => void;
  onGoogleLogin: () => void;
  isLoggingIn: boolean;
  loginError?: string | null;
  onShareApp?: () => void;
  storagePersisted?: boolean;
  isBackgroundOptimized?: boolean;
  onRequestBackgroundPermission?: () => void;
}

export const UserBadge: React.FC<UserBadgeProps> = ({ 
  user, 
  onLogout, 
  syncProgress, 
  onSyncNow,
  tracks,
  onOpenBackup,
  onGoogleLogin,
  isLoggingIn,
  loginError,
  onShareApp,
  storagePersisted = false,
  isBackgroundOptimized = false,
  onRequestBackgroundPermission
}) => {
  const [isOpen, setIsOpen] = useState(false);

  // Disable body scroll when full-screen profile page is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const getSyncIcon = () => {
    if (!user) return null;
    switch (syncProgress.status) {
      case 'checking':
      case 'pulling':
      case 'pushing':
        return <RefreshCw className="w-4 h-4 text-amber-500 animate-spin" />;
      case 'completed':
        return <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50" />;
      case 'error':
        return <div className="w-2.5 h-2.5 rounded-full bg-rose-500 shadow-sm shadow-rose-500/50" />;
      default:
        return <div className="w-2.5 h-2.5 rounded-full bg-slate-400" />;
    }
  };

  const getSyncText = () => {
    if (!user) return 'غير مرتبط بالسحاب';
    switch (syncProgress.status) {
      case 'checking':
        return 'جاري التحقق...';
      case 'pulling':
        return 'جاري المزامنة...';
      case 'pushing':
        return 'جاري الرفع السحابي...';
      case 'completed':
        return 'مربوط ومزامن بـ Google';
      case 'error':
        return 'خطأ في المزامنة';
      default:
        return 'مربوط بـ Google Drive';
    }
  };

  return (
    <>
      {/* Top Header Floating Badge */}
      <div 
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md px-3 py-1.5 rounded-2xl border border-slate-200/50 dark:border-slate-800 shadow-sm cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-all active:scale-95 text-right font-sans"
      >
        <div className="relative">
          {user?.photoURL ? (
            <img 
              src={user.photoURL} 
              alt="" 
              referrerPolicy="no-referrer" 
              className="w-7 h-7 rounded-xl object-cover border border-[#4da8ab]/30" 
            />
          ) : (
            <div className="w-7 h-7 rounded-xl bg-gradient-to-tr from-[#4da8ab] to-teal-600 text-white flex items-center justify-center font-black text-xs shadow-sm">
              {user ? (user.displayName || user.email || 'ت').charAt(0).toUpperCase() : <Cloud className="w-4 h-4" />}
            </div>
          )}
          {user && (
            <div className="absolute -bottom-0.5 -right-0.5">
              {getSyncIcon()}
            </div>
          )}
        </div>

        <div className="flex flex-col text-right">
          <span className="text-xs font-black text-slate-800 dark:text-slate-100 leading-tight">
            {user ? (user.displayName || 'مستمع ترانيم') : 'الربط بالسحاب'}
          </span>
          <span className="text-[10px] text-slate-500 dark:text-slate-400 leading-none">
            {getSyncText()}
          </span>
        </div>
      </div>

      {/* Account & Cloud Linking Drawer via React Portal */}
      {createPortal(
        <AnimatePresence>
          {isOpen && (
            <>
              {/* Backdrop Overlay */}
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                onClick={() => setIsOpen(false)}
                className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[240] cursor-pointer"
              />

              {/* Drawer Container */}
              <motion.div 
                initial={{ x: "-100%" }}
                animate={{ x: 0 }}
                exit={{ x: "-100%" }}
                transition={{ type: "spring", damping: 28, stiffness: 260 }}
                className="fixed inset-y-0 left-0 h-full w-[85%] sm:w-[480px] bg-slate-50 dark:bg-slate-950 border-r border-slate-150 dark:border-slate-900 shadow-2xl flex flex-col text-right z-[250] font-sans"
                dir="rtl"
              >
              {/* Drawer Header */}
              <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 dark:border-slate-900 bg-white dark:bg-slate-950/80 backdrop-blur shrink-0">
                <div className="flex items-center gap-2">
                  <User className="w-5.5 h-5.5 text-[#4da8ab]" />
                  <h2 className="text-base font-black text-slate-900 dark:text-slate-100">
                    الحساب والربط السحابي
                  </h2>
                </div>
                <button 
                  onClick={() => setIsOpen(false)} 
                  className="p-1.5 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors cursor-pointer"
                  title="إغلاق"
                >
                  <X className="w-5.5 h-5.5" />
                </button>
              </div>

              {/* Scrollable Content Body */}
              <div className="flex-1 p-6 overflow-y-auto space-y-6 custom-scrollbar">
                
                {/* 1. PRIMARY CLOUD LINKING CARD */}
                <div className="bg-gradient-to-br from-[#4da8ab]/10 via-white to-slate-50 dark:from-[#4da8ab]/15 dark:via-slate-900 dark:to-slate-900 p-6 rounded-3xl border border-[#4da8ab]/30 shadow-md space-y-4 text-right">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5 text-[#4da8ab]">
                      <Cloud className="w-6 h-6" />
                      <div>
                        <h3 className="font-black text-sm text-slate-900 dark:text-slate-100">الربط والمزامنة السحابية (Google Drive)</h3>
                        <p className="text-[10px] text-slate-400 font-bold">حفظ تلقائي لجميع الأناشيد والصور والعلامات</p>
                      </div>
                    </div>
                    {user && (
                      <span className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-black px-2.5 py-1 rounded-full border border-emerald-500/20 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>مربوط بالسحاب</span>
                      </span>
                    )}
                  </div>

                  {user ? (
                    <div className="space-y-3 pt-2">
                      <div className="flex items-center gap-3.5 bg-white dark:bg-slate-950/60 p-3.5 rounded-2xl border border-slate-200/60 dark:border-slate-800">
                        {user.photoURL ? (
                          <img
                            src={user.photoURL}
                            alt=""
                            referrerPolicy="no-referrer"
                            className="w-12 h-12 rounded-xl object-cover border border-[#4da8ab]/30 shrink-0"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-xl bg-[#4da8ab] text-white flex items-center justify-center font-black text-lg shrink-0">
                            {(user.displayName || user.email || 'ت').charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="font-black text-xs text-slate-900 dark:text-slate-100 truncate">
                            {user.displayName || 'مستمع ترانيم'}
                          </p>
                          <p className="text-[11px] text-slate-450 dark:text-slate-500 font-bold truncate mt-0.5">
                            {user.email}
                          </p>
                        </div>
                      </div>

                      {/* Sync progress indicator */}
                      {syncProgress.message && (
                        <div className="p-3 bg-slate-50 dark:bg-slate-950/40 rounded-xl border border-slate-200/50 dark:border-slate-800 text-[11px] font-bold text-slate-600 dark:text-slate-300">
                          <div className="flex items-center justify-between mb-1.5">
                            <span>حالة السحابة:</span>
                            <span className="text-[#4da8ab]">{syncProgress.message}</span>
                          </div>
                          {(syncProgress.status === 'pulling' || syncProgress.status === 'pushing' || syncProgress.status === 'checking') && (
                            <div className="w-full bg-slate-200 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                              <div
                                className="bg-[#4da8ab] h-full transition-all duration-300 ease-out"
                                style={{ width: `${syncProgress.progress}%` }}
                              />
                            </div>
                          )}
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-2.5 pt-1">
                        <button
                          onClick={onSyncNow}
                          disabled={syncProgress.status === 'checking' || syncProgress.status === 'pulling' || syncProgress.status === 'pushing'}
                          className="flex items-center justify-center gap-2 bg-[#4da8ab] hover:bg-[#3d9093] text-white py-2.5 px-3 rounded-xl text-xs font-black transition-all active:scale-95 disabled:opacity-50 cursor-pointer shadow-sm"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${syncProgress.status === 'pulling' || syncProgress.status === 'pushing' ? 'animate-spin' : ''}`} />
                          <span>مزامنة سحابية الآن</span>
                        </button>

                        <button
                          onClick={onLogout}
                          className="flex items-center justify-center gap-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 py-2.5 px-3 rounded-xl text-xs font-black transition-all active:scale-95 cursor-pointer border border-rose-500/20"
                        >
                          <LogOut className="w-3.5 h-3.5" />
                          <span>فك الربط</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3 pt-1">
                      <p className="text-xs text-slate-600 dark:text-slate-300 font-bold leading-relaxed">
                        عند ربط تطبيق ترانيم بحساب Google، يتم مزامنة ورفع جميع الأناشيد التسجيلية والمستوردة، الأغلفة، العلامات الزمنية، وسجل الاستماع مباشرة وسرياً لسحابتك لتستعيدها بلمسة زر بأي وقت.
                      </p>

                      {loginError && (
                        <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-600 dark:text-rose-400 text-xs leading-relaxed flex items-center gap-2 font-bold">
                          <AlertCircle className="w-4 h-4 shrink-0" />
                          <span>{loginError}</span>
                        </div>
                      )}

                      <button
                        onClick={onGoogleLogin}
                        disabled={isLoggingIn}
                        className="w-full flex items-center justify-center gap-2.5 bg-[#4da8ab] hover:bg-[#3d9194] text-white py-3.5 px-4 rounded-xl text-xs font-black transition-all active:scale-95 cursor-pointer shadow-md shadow-[#4da8ab]/20 disabled:opacity-50"
                      >
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M12.24 10.285V13.4h6.887C18.2 15.614 15.645 18 12.24 18c-3.86 0-7-3.14-7-7s3.14-7 7-7c1.7 0 3.25.61 4.46 1.615l2.427-2.427C17.155 1.54 14.86 1 12.24 1 6.58 1 2 5.58 2 11.24s4.58 10.24 10.24 10.24c5.9 0 9.81-4.15 9.81-10 0-.675-.06-1.335-.18-1.995H12.24z"/>
                        </svg>
                        <span>{isLoggingIn ? 'جاري الاتصال بالسحاب...' : 'ربط السحابة وحفظ المكتبة تلقائياً'}</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* 2. LISTENING STATS WIDGET */}
                <div className="space-y-2">
                  <h3 className="text-xs font-black text-slate-450 dark:text-slate-500 uppercase tracking-wider mr-1">إحصائيات النشاط والمكتبة</h3>
                  <StatsWidget tracks={tracks} />
                </div>

                {/* 3. BACKGROUND PERMISSION & BATTERY SHIELD */}
                <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-150 dark:border-slate-800/80 shadow-sm space-y-3.5 text-right">
                  <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/60 pb-3">
                    <div className="flex items-center gap-2 text-slate-800 dark:text-slate-100">
                      <Zap className="w-5 h-5 text-amber-500" />
                      <div>
                        <span className="text-xs font-black">إذن التشغيل في الخلفية</span>
                        <p className="text-[10px] text-slate-400">منع انقطاع الصوت عند قفل الشاشة</p>
                      </div>
                    </div>
                    <span className={`text-[10px] font-bold px-2.5 py-1 rounded-xl border ${
                      isBackgroundOptimized
                        ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                        : 'text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/20'
                    }`}>
                      {isBackgroundOptimized ? 'بدون قيود بطارية ✅' : 'موصى به لتفادي التوقف ⚡'}
                    </span>
                  </div>

                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    يتطلب نظام أندرويد إذناً صريحاً لتجاوز توفير الطاقة وتثبيت قفل الاستيقاظ (WakeLock)، لضمان استمرار تشغيل الأناشيد في الخلفية بدون انقطاع مفاجئ.
                  </p>

                  {onRequestBackgroundPermission && !isBackgroundOptimized && (
                    <button
                      onClick={onRequestBackgroundPermission}
                      className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 text-slate-950 py-2.5 px-4 rounded-xl text-xs font-black transition-all duration-200 active:scale-95 cursor-pointer shadow-sm shadow-amber-500/20"
                    >
                      <Zap className="w-3.5 h-3.5 fill-current" />
                      <span>منح إذن العمل في الخلفية وتجاوز تحسين البطارية</span>
                    </button>
                  )}
                </div>

                {/* 4. LOCAL BACKUP (ZIP) FAST LINK */}
                <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-150 dark:border-slate-800/80 shadow-sm space-y-3 text-right">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-slate-800 dark:text-slate-100">
                      <ShieldCheck className="w-5 h-5 text-[#4da8ab]" />
                      <span className="text-xs font-black">النسخ الاحتياطي المحلي (ZIP)</span>
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    يمكنك تصدير أو استعادة ملف ZIP محلي يحتوي على العلامات الزمنية والبيانات والأناشيد.
                  </p>
                  <button
                    onClick={() => {
                      setIsOpen(false);
                      onOpenBackup('backup');
                    }}
                    className="w-full flex items-center justify-center gap-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 py-2.5 px-4 rounded-xl text-xs font-black transition-all active:scale-95 cursor-pointer"
                  >
                    <span>فتح خيارات تصدير واستيراد ملفات ZIP</span>
                  </button>
                </div>

                {/* Footer Copyright */}
                <div className="text-center pt-2 pb-4 text-[10px] text-slate-400 dark:text-slate-600 font-semibold">
                  ترانيم © {new Date().getFullYear()} • تطبيق الاستماع للأناشيد والتسجيلات.
                </div>

              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>,
      document.body
    )}
    </>
  );
};

export default UserBadge;
