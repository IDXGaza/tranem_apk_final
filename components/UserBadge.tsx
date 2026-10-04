import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { LogOut, RefreshCw, BarChart2, X, User, Cloud, Share2, Shield, FolderHeart, ShieldCheck, RotateCcw, Zap } from 'lucide-react';
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
  onRestoreSafetyVault?: () => Promise<void>;
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
  onRestoreSafetyVault,
  isBackgroundOptimized = false,
  onRequestBackgroundPermission
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [vaultRestoring, setVaultRestoring] = useState(false);
  const [vaultStatus, setVaultStatus] = useState<string | null>(null);

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

  const handleTriggerRestoreVault = async () => {
    if (!onRestoreSafetyVault) return;
    setVaultRestoring(true);
    setVaultStatus('جاري استرجاع الأناشيد من مستودع الأمان الاحتياطي...');
    try {
      await onRestoreSafetyVault();
      setVaultStatus('تمت استعادة الأناشيد بنجاح! ✅');
    } catch (e: any) {
      setVaultStatus(e?.message || 'لا توجد أناشيد لاستعادتها');
    } finally {
      setVaultRestoring(false);
      setTimeout(() => setVaultStatus(null), 4000);
    }
  };

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
    if (!user) return 'أوفلاين';
    switch (syncProgress.status) {
      case 'checking':
        return 'جاري التحقق...';
      case 'pulling':
        return 'جاري المزامنة...';
      case 'pushing':
        return 'جاري الرفع...';
      case 'completed':
        return 'مُتزامن مع السحاب';
      case 'error':
        return 'خطأ في المزامنة';
      default:
        return 'متصل بالسحابة';
    }
  };

  return (
    <div className="font-cairo select-none">
      {/* Primary Trigger Badge */}
      <div
        id="user_badge_trigger"
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 pl-3 pr-2 py-1.5 bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-full border border-slate-200/50 dark:border-slate-800/80 cursor-pointer transition-all duration-200 active:scale-95"
      >
        <div className="relative">
          {user && user.photoURL ? (
            <img
              src={user.photoURL || undefined}
              alt={user.displayName || 'مستخدم'}
              referrerPolicy="no-referrer"
              className="w-8 h-8 rounded-full border border-[#4da8ab]/40 object-cover"
            />
          ) : user ? (
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#4da8ab] to-teal-600 text-white flex items-center justify-center font-bold text-sm">
              {(user.displayName || user.email || 'ت').charAt(0).toUpperCase()}
            </div>
          ) : (
            <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-500 flex items-center justify-center font-bold text-sm border border-slate-300 dark:border-slate-700">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
          )}
          {/* Real-time Sync state indicator dot */}
          {user && (
            <div className="absolute bottom-[-1px] right-[-1px] bg-white dark:bg-slate-900 rounded-full p-[1.5px]">
              {getSyncIcon()}
            </div>
          )}
        </div>

        <div className="hidden sm:flex flex-col text-right pr-1">
          <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 line-clamp-1 max-w-[110px]">
            {user ? (user.displayName || 'مستمع ترانيم') : 'حساب محلي'}
          </span>
          <span className="text-[10px] text-slate-500 dark:text-slate-400 leading-none">
            {user ? getSyncText() : 'إحصائيات ونسخ احتياطي'}
          </span>
        </div>
      </div>

      {/* Left Side Account & Statistics Drawer via React Portal */}
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

              {/* Drawer Container (aligned and sliding from left) */}
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
                    الحساب والإعدادات
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
                
                {/* User Details / Cloud Connection Card */}
                {user ? (
                  <div className="bg-gradient-to-br from-white to-slate-50 dark:from-slate-900 dark:to-slate-900/60 p-6 rounded-2xl border border-slate-200/60 dark:border-slate-800/80 shadow-sm flex items-center gap-4 text-right">
                    {user.photoURL ? (
                      <img
                        src={user.photoURL || undefined}
                        alt={user.displayName || 'مستخدم'}
                        referrerPolicy="no-referrer"
                        className="w-16 h-16 rounded-xl border-2 border-[#4da8ab]/40 object-cover shadow-sm"
                      />
                    ) : (
                      <div className="w-16 h-16 rounded-xl bg-gradient-to-tr from-[#4da8ab] to-teal-600 text-white flex items-center justify-center font-black text-2xl shadow-sm">
                        {(user.displayName || user.email || 'ت').charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="font-black text-base text-slate-900 dark:text-slate-100">
                          {user.displayName || 'مستمع ترانيم'}
                        </span>
                        <span className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[9px] font-black px-2 py-0.5 rounded-full border border-emerald-500/20">
                          مُتصل بالسحاب
                        </span>
                      </div>
                      <p className="text-xs text-slate-450 dark:text-slate-500 font-medium truncate">
                        {user.email}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-150 dark:border-slate-800/80 shadow-sm space-y-4 text-right">
                    <div className="flex items-start gap-3.5">
                      <div className="p-3 bg-[#4da8ab]/10 rounded-xl text-[#4da8ab] shrink-0">
                        <Cloud className="w-6 h-6" />
                      </div>
                      <div className="space-y-1">
                        <h3 className="font-black text-sm text-slate-900 dark:text-slate-100">حساب محلي (غير متصل بالسحاب)</h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-semibold">
                          بياناتك وأناشيدك محفوظة حالياً على هذا الجهاز. يمكنك ربط حسابك في جوجل لتفعيل المزامنة السحابية وحفظ مكتبتك دائماً بأمان.
                        </p>
                      </div>
                    </div>

                    {loginError && (
                      <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-600 dark:text-rose-400 text-xs leading-relaxed flex items-start gap-2">
                        <span className="text-sm shrink-0">⚠️</span>
                        <span>{loginError}</span>
                      </div>
                    )}

                    <button
                      onClick={onGoogleLogin}
                      disabled={isLoggingIn}
                      className="w-full flex items-center justify-center gap-2.5 bg-[#4da8ab] hover:bg-[#3d9194] text-white py-3 px-4 rounded-xl text-xs font-black transition-all duration-200 active:scale-95 cursor-pointer shadow-sm shadow-[#4da8ab]/20 disabled:opacity-50"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12.24 10.285V13.4h6.887C18.2 15.614 15.645 18 12.24 18c-3.86 0-7-3.14-7-7s3.14-7 7-7c1.7 0 3.25.61 4.46 1.615l2.427-2.427C17.155 1.54 14.86 1 12.24 1 6.58 1 2 5.58 2 11.24s4.58 10.24 10.24 10.24c5.9 0 9.81-4.15 9.81-10 0-.675-.06-1.335-.18-1.995H12.24z"/>
                      </svg>
                      <span>{isLoggingIn ? 'جاري الاتصال بالسحاب...' : 'ربط السحابة وحفظ الأناشيد'}</span>
                    </button>
                  </div>
                )}

                {/* Listening Stats Full Widget */}
                <div className="space-y-2">
                  <h3 className="text-xs font-black text-slate-450 dark:text-slate-500 uppercase tracking-wider mr-1">إحصائيات النشاط</h3>
                  <StatsWidget tracks={tracks} />
                </div>

                {/* مستودع الأمان ودرع حفظ الأناشيد التلقائي */}
                <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-150 dark:border-slate-800/80 shadow-sm space-y-3.5 text-right">
                  <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/60 pb-3">
                    <div className="flex items-center gap-2 text-slate-800 dark:text-slate-100">
                      <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                      <div>
                        <span className="text-xs font-black">مستودع الأمان ودرع الحفظ</span>
                        <p className="text-[10px] text-slate-400">حماية الأناشيد من الحذف العشوائي</p>
                      </div>
                    </div>
                    <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-xl border border-emerald-500/20">
                      {storagePersisted ? 'تخزين دائم محمي ✅' : 'الحماية التلقائية نشطة 🛡️'}
                    </span>
                  </div>

                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    يحافظ درع الحفظ التلقائي على ملفاتك في التخزين الدائم لمنع نظام التشغيل من مسحها عند انخفاض الذاكرة، كما يوفر مستودع الأمان نسخة طوارئ إضافية.
                  </p>

                  {onRestoreSafetyVault && (
                    <div className="pt-1 flex flex-col gap-2">
                      <button
                        onClick={handleTriggerRestoreVault}
                        disabled={vaultRestoring}
                        className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 px-4 rounded-xl text-xs font-black transition-all duration-200 active:scale-95 disabled:opacity-50 cursor-pointer shadow-sm shadow-emerald-600/15"
                      >
                        <RotateCcw className={`w-3.5 h-3.5 ${vaultRestoring ? 'animate-spin' : ''}`} />
                        <span>{vaultRestoring ? 'جاري الاسترجاع...' : 'استرجاع الأناشيد من مستودع الأمان'}</span>
                      </button>
                      {vaultStatus && (
                        <span className="text-xs font-bold text-center text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 p-2 rounded-xl">
                          {vaultStatus}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* درع التشغيل في الخلفية وحماية البطارية */}
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

                {/* Cloud Sync Status and Manual Controls (If Logged-in) */}
                {user && (
                  <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-150 dark:border-slate-800/80 shadow-sm space-y-4 text-right">
                    <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/60 pb-3">
                      <div className="flex items-center gap-2 text-slate-800 dark:text-slate-100">
                        <Cloud className="w-4.5 h-4.5 text-[#4da8ab]" />
                        <span className="text-xs font-black">المزامنة والنسخ السحابي</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${syncProgress.status === 'completed' ? 'bg-emerald-500 shadow-sm shadow-emerald-500/50' : syncProgress.status === 'error' ? 'bg-rose-500' : 'bg-amber-500 animate-pulse'}`} />
                        <span className="text-[11px] font-black text-slate-600 dark:text-slate-400">
                          {syncProgress.status === 'completed' ? 'مكتملة ومؤمنة' : syncProgress.status === 'error' ? 'فشلت المزامنة' : 'جاري التحديث'}
                        </span>
                      </div>
                    </div>

                    {syncProgress.message && (
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed font-semibold">
                        • {syncProgress.message}
                      </p>
                    )}

                    {/* Progress bar */}
                    {(syncProgress.status === 'pulling' || syncProgress.status === 'pushing' || syncProgress.status === 'checking') && (
                      <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                        <div
                          className="bg-[#4da8ab] h-full transition-all duration-350 ease-out"
                          style={{ width: `${syncProgress.progress}%` }}
                        />
                      </div>
                    )}

                    <button
                      onClick={onSyncNow}
                      disabled={syncProgress.status === 'checking' || syncProgress.status === 'pulling' || syncProgress.status === 'pushing'}
                      className="w-full flex items-center justify-center gap-2 bg-[#4da8ab]/10 hover:bg-[#4da8ab]/15 text-[#4da8ab] py-2.5 px-4 rounded-xl text-xs font-black transition-all duration-200 active:scale-95 disabled:opacity-50 cursor-pointer"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${syncProgress.status === 'pulling' || syncProgress.status === 'pushing' ? 'animate-spin' : ''}`} />
                      <span>مزامنة يدوية الآن مع السحابة</span>
                    </button>
                  </div>
                )}

                {/* مركز تحديثات التطبيق والتلقائية */}
                <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-150 dark:border-slate-800/80 shadow-sm space-y-3.5 text-right">
                  <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/60 pb-3">
                    <div className="flex items-center gap-2 text-slate-800 dark:text-slate-100">
                      <RefreshCw className="w-4.5 h-4.5 text-[#4da8ab]" />
                      <div>
                        <span className="text-xs font-black">مركز التحديثات والتلقائية</span>
                        <p className="text-[10px] text-slate-400">تحديثات التطبيق بدون حاجة لحذف النسخة القديمة</p>
                      </div>
                    </div>
                    <span className="text-[10px] font-bold text-[#4da8ab] bg-[#4da8ab]/10 px-2.5 py-1 rounded-xl border border-[#4da8ab]/20">
                      إصدار v1.2.0 (أحدث نسخة)
                    </span>
                  </div>

                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    تستطيع الآن تثبيت أي تحديث جديد مباشرة عبر تنزيل ملف الـ APK وتثبيته فوق النسخة الحالية كترقية حية دون الحاجة لحذف التطبيق القديم أو فقدان مكتبتك وإعداداتك، كما يتم تحديث ميزات السحابة تلقائياً بشكل مباشر (Live Sync).
                  </p>

                  <div className="pt-1 flex flex-col gap-2">
                    <button
                      onClick={() => {
                        window.location.reload();
                      }}
                      className="w-full flex items-center justify-center gap-2 bg-[#4da8ab]/10 hover:bg-[#4da8ab]/20 text-[#4da8ab] py-2.5 px-4 rounded-xl text-xs font-black transition-all duration-200 active:scale-95 cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>تنشيط الميزات والتحقق من التحديثات الفورية</span>
                    </button>
                  </div>
                </div>

                {/* Quick Actions Panel */}
                <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-150 dark:border-slate-800/80 shadow-sm space-y-3.5 text-right">
                  <h3 className="text-xs font-black text-slate-800 dark:text-slate-100 flex items-center gap-2 border-b border-slate-100 dark:border-slate-800/60 pb-3">
                    <Shield className="w-4.5 h-4.5 text-[#4da8ab]" />
                    <span>إجراءات سريعة والنسخ الاحتياطي</span>
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* ZIP Backup */}
                    <button
                      onClick={() => {
                        onOpenBackup('backup');
                      }}
                      className="w-full flex items-center justify-center gap-2 bg-[#4da8ab] hover:bg-[#3d9194] text-white py-3 px-4 rounded-xl text-xs font-black transition-all duration-200 active:scale-95 cursor-pointer shadow-sm shadow-[#4da8ab]/15"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      <span>إنشاء نسخة احتياطية ZIP</span>
                    </button>

                    {/* Import Backup */}
                    <button
                      onClick={() => {
                        onOpenBackup('import');
                      }}
                      className="w-full flex items-center justify-center gap-2 bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 py-3 px-4 rounded-xl text-xs font-black transition-all duration-200 active:scale-95 cursor-pointer border border-slate-150 dark:border-slate-700/60"
                    >
                      <svg className="w-4 h-4 text-slate-500 dark:text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0l-4 4m4-4v12" />
                      </svg>
                      <span>استيراد نسخة احتياطية</span>
                    </button>
                  </div>
                </div>

                {/* Logout Trigger Card (For logged in users) */}
                {user && (
                  <div className="pt-4 border-t border-slate-200/60 dark:border-slate-800/60">
                    <button
                      onClick={() => {
                        onLogout();
                        setIsOpen(false);
                      }}
                      className="w-full bg-rose-500/5 hover:bg-rose-500/10 text-rose-600 dark:text-rose-400 py-3.5 px-4 rounded-xl text-xs font-black flex items-center justify-between transition-all duration-150 border border-rose-500/10 active:scale-95 cursor-pointer"
                    >
                      <span>تسجيل خروج الحساب</span>
                      <LogOut className="w-4 h-4" />
                    </button>
                  </div>
                )}

              </div>

              {/* Footer Label */}
              <div className="p-5 text-center border-t border-slate-100 dark:border-slate-900 bg-white dark:bg-slate-950 shrink-0">
                <p className="text-[10px] font-black text-slate-400 dark:text-slate-500">
                  ترانيم © {new Date().getFullYear()} • تطبيق الاستماع للأناشيد والتسجيلات
                </p>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>,
      document.body
    )}
    </div>
  );
};
