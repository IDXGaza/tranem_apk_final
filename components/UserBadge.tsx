import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Settings, ShieldCheck, Zap, Share2 } from 'lucide-react';
import { Track } from '../types';
import StatsWidget from './StatsWidget';
import { motion, AnimatePresence } from 'framer-motion';

interface UserBadgeProps {
  tracks: Track[];
  onOpenBackup: (mode?: 'backup' | 'import') => void;
  onShareApp?: () => void;
  storagePersisted?: boolean;
  isBackgroundOptimized?: boolean;
  onRequestBackgroundPermission?: () => void;
  onOpenBatterySettings?: () => void;
}

export const UserBadge: React.FC<UserBadgeProps> = ({ 
  tracks,
  onOpenBackup,
  onShareApp,
  isBackgroundOptimized = false,
  onRequestBackgroundPermission,
  onOpenBatterySettings
}) => {
  const [isOpen, setIsOpen] = useState(false);

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

  return (
    <>
      {/* Top Header Settings Icon Button */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="p-2 rounded-xl text-slate-500 dark:text-slate-400 hover:text-[#4da8ab] hover:bg-slate-100 dark:hover:bg-slate-800 transition-all active:scale-95 flex items-center justify-center relative cursor-pointer"
        title="الإعدادات"
        aria-label="الإعدادات"
      >
        <Settings className="w-5 h-5" />
      </button>

      {/* Settings Drawer via React Portal */}
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
                className="fixed inset-y-0 left-0 h-full w-[85%] sm:w-[440px] bg-slate-50 dark:bg-slate-950 border-r border-slate-150 dark:border-slate-900 shadow-2xl flex flex-col text-right z-[250] font-sans"
                dir="rtl"
              >
              {/* Drawer Header */}
              <div className="flex items-center justify-between px-6 pt-[calc(env(safe-area-inset-top,0px)+1.25rem)] pb-5 border-b border-slate-100 dark:border-slate-900 bg-white dark:bg-slate-950/80 backdrop-blur shrink-0">
                <div className="flex items-center gap-2.5">
                  <Settings className="w-5 h-5 text-[#4da8ab]" />
                  <h2 className="text-base font-black text-slate-900 dark:text-slate-100">
                    الإعدادات
                  </h2>
                </div>
                <button 
                  onClick={() => setIsOpen(false)} 
                  className="p-1.5 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors cursor-pointer"
                  title="إغلاق"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Scrollable Content Body */}
              <div className="flex-1 p-6 overflow-y-auto space-y-6 custom-scrollbar">

                {/* 1. LISTENING STATS WIDGET */}
                <div className="space-y-2">
                  <h3 className="text-xs font-black text-slate-450 dark:text-slate-500 uppercase tracking-wider mr-1">إحصائيات النشاط والمكتبة</h3>
                  <StatsWidget tracks={tracks} />
                </div>

                {/* 2. BACKGROUND PERMISSION & BATTERY SHIELD (CRITICAL FOR HONOR/MAGIC OS) */}
                <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-150 dark:border-slate-800/80 shadow-sm space-y-3.5 text-right">
                  <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/60 pb-3">
                    <div className="flex items-center gap-2 text-slate-800 dark:text-slate-100">
                      <Zap className="w-5 h-5 text-amber-500" />
                      <div>
                        <span className="text-xs font-black">استمرار التشغيل في الخلفية</span>
                        <p className="text-[10px] text-slate-400">منع توقف الصوت في أجهزة هونر وأندرويد</p>
                      </div>
                    </div>
                    <span className={`text-[10px] font-bold px-2.5 py-1 rounded-xl border ${
                      isBackgroundOptimized
                        ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                        : 'text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/20'
                    }`}>
                      {isBackgroundOptimized ? 'مفعل ✅' : 'مطلوب ⚡'}
                    </span>
                  </div>

                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    لضمان عدم توقف الأناشيد عند قفل الشاشة أو التنقل للنشيد التالي في الخلفية (خصوصاً على أجهزة Honor)، اسمح للتطبيق بالعمل في الخلفية واجعل إدارة التشغيل يدوياً بدون قيود بطارية.
                  </p>

                  <div className="space-y-2">
                    {onRequestBackgroundPermission && !isBackgroundOptimized && (
                      <button
                        onClick={onRequestBackgroundPermission}
                        className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 text-slate-950 py-2.5 px-4 rounded-xl text-xs font-black transition-all duration-200 active:scale-95 cursor-pointer shadow-sm shadow-amber-500/20"
                      >
                        <Zap className="w-3.5 h-3.5 fill-current" />
                        <span>استثناء التطبيق من توفير البطارية</span>
                      </button>
                    )}

                    {onOpenBatterySettings && (
                      <button
                        onClick={onOpenBatterySettings}
                        className="w-full flex items-center justify-center gap-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 py-2.5 px-4 rounded-xl text-xs font-black transition-all active:scale-95 cursor-pointer"
                      >
                        <Settings className="w-3.5 h-3.5 text-[#4da8ab]" />
                        <span>فتح إعدادات تشغيل التطبيقات بالخلفية</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* 3. LOCAL BACKUP (ULTRA-COMPRESSED ZIP) */}
                <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-150 dark:border-slate-800/80 shadow-sm space-y-3 text-right">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-slate-800 dark:text-slate-100">
                      <ShieldCheck className="w-5 h-5 text-[#4da8ab]" />
                      <span className="text-xs font-black">النسخ الاحتياطي المضغوط (ZIP)</span>
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    تصدير واستعادة نسخة مضغوطة بأقصى حد ممكن تحتوي على جميع الأناشيد والأغلفة والعلامات الزمنية.
                  </p>
                  <button
                    onClick={() => {
                      setIsOpen(false);
                      onOpenBackup();
                    }}
                    className="w-full flex items-center justify-center gap-2 bg-[#4da8ab] hover:bg-[#3d9093] text-white py-2.5 px-4 rounded-xl text-xs font-black transition-all active:scale-95 cursor-pointer shadow-sm"
                  >
                    <span>فتح مركز النسخ الاحتياطي والاستعادة</span>
                  </button>
                </div>

                {/* 4. SHARE APP */}
                {onShareApp && (
                  <button
                    onClick={onShareApp}
                    className="w-full flex items-center justify-center gap-2 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 py-3 px-4 rounded-2xl border border-slate-150 dark:border-slate-800/80 text-xs font-black transition-all active:scale-95 cursor-pointer shadow-sm"
                  >
                    <Share2 className="w-4 h-4 text-[#4da8ab]" />
                    <span>مشاركة تطبيق ترانيم</span>
                  </button>
                )}

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
