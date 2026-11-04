import React, { useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { SyncProgress } from '../services/cloudSync';
import { Cloud, RefreshCw, HardDrive, FileArchive, Zap, Upload, CheckCircle2 } from 'lucide-react';

interface GoogleDriveBackupModalProps {
  isOpen: boolean;
  onClose: () => void;
  createBackupZip: (metadataOnly?: boolean, excludedTrackIds?: string[], compressCovers?: boolean) => Promise<Blob>;
  restoreBackupZip: (blob: Blob) => Promise<void>;
  isBackupProcessing: boolean;
  setIsBackupProcessing: (val: boolean) => void;
  backupStatusMessage: string | null;
  setBackupStatusMessage: (msg: string | null) => void;
  onBackupSuccess: () => void;
  onCancelBackup?: () => void;
  initialMode?: 'backup' | 'import' | null;
  onGoogleSync?: () => void;
  user?: any;
  onGoogleLogin?: () => void;
  syncProgress?: SyncProgress;
}

export default function GoogleDriveBackupModal({
  isOpen,
  onClose,
  createBackupZip,
  restoreBackupZip,
  isBackupProcessing,
  setIsBackupProcessing,
  backupStatusMessage,
  setBackupStatusMessage,
  onBackupSuccess,
  onCancelBackup,
  initialMode,
  onGoogleSync,
  user,
  onGoogleLogin,
  syncProgress
}: GoogleDriveBackupModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  // Full ZIP Backup (Audio + Images + Timestamps)
  const handleCreateFullBackup = async () => {
    if (isBackupProcessing) return;
    setIsBackupProcessing(true);
    setBackupStatusMessage('جاري تجميع وضغط جميع الأناشيد والأغلفة والعلامات... 📦');
    try {
      const zipBlob = await createBackupZip(false, [], true);
      
      const now = new Date();
      const datePart = `${now.getFullYear()}-${(now.getMonth()+1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`;
      const timePart = `${now.getHours().toString().padStart(2, '0')}-${now.getMinutes().toString().padStart(2, '0')}-${now.getSeconds().toString().padStart(2, '0')}`;
      const exportName = `نسخة_احتياطية_كاملة_ترانيم_${datePart}_${timePart}.zip`;

      if (Capacitor.isNativePlatform()) {
        const { Filesystem, Directory } = await import('@capacitor/filesystem');
        const CHUNK_SIZE = 3145728;
        const totalSize = zipBlob.size;
        let numChunks = Math.ceil(totalSize / CHUNK_SIZE);
        if (numChunks === 0) numChunks = 1;

        const targetDirectory = Directory.Documents;

        try {
          await Filesystem.deleteFile({ path: exportName, directory: targetDirectory });
        } catch (e) {}

        let firstChunkUri = '';

        for (let i = 0; i < numChunks; i++) {
          const start = i * CHUNK_SIZE;
          const end = Math.min(start + CHUNK_SIZE, totalSize);
          const chunkBlob = zipBlob.slice(start, end);

          setBackupStatusMessage(`جاري حفظ ملف الـ ZIP... (${i + 1} / ${numChunks})`);

          const base64Chunk = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = reject;
            reader.onload = () => {
              const result = reader.result as string;
              const base64 = result.substring(result.indexOf(',') + 1);
              resolve(base64);
            };
            reader.readAsDataURL(chunkBlob);
          });

          if (i === 0) {
            const result = await Filesystem.writeFile({ path: exportName, data: base64Chunk, directory: targetDirectory });
            firstChunkUri = result.uri;
          } else {
            await Filesystem.appendFile({ path: exportName, data: base64Chunk, directory: targetDirectory });
          }
        }

        try {
          const { Share } = await import('@capacitor/share');
          setBackupStatusMessage('جاري فتح قائمة الحفظ والمشاركة...');
          await Share.share({
            title: 'نسخة ترانيم الاحتياطية الكاملة',
            text: 'ملف النسخة الاحتياطية للأناشيد والتسجيلات',
            url: firstChunkUri,
            dialogTitle: 'حفظ أو مشاركة ملف النسخة الاحتياطية'
          });
        } catch (shareErr) {
          console.warn('Native share dialog dismissed, file written to Documents:', shareErr);
        }
        setBackupStatusMessage('تم حفظ ملف النسخة الكاملة بنجاح في المستندات! 🎉');
      } else {
        const url = URL.createObjectURL(zipBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = exportName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 2000);
        setBackupStatusMessage('تم تنزيل النسخة الاحتياطية الكاملة بنجاح! ✅');
      }
      onBackupSuccess();
    } catch (err: any) {
      console.error("Local backup failed", err);
      setBackupStatusMessage(`❌ فشل الحفظ: ${err?.message || 'خطأ غير معروف'}`);
    } finally {
      setIsBackupProcessing(false);
      setTimeout(() => setBackupStatusMessage(null), 5000);
    }
  };

  // Lightweight Metadata + Timestamps + Covers Backup
  const handleCreateMetadataBackup = async () => {
    if (isBackupProcessing) return;
    setIsBackupProcessing(true);
    setBackupStatusMessage('جاري تصدير البيانات والأغلفة والعلامات الزمنية... ⚡');
    try {
      const zipBlob = await createBackupZip(true, [], true);
      const now = new Date();
      const datePart = `${now.getFullYear()}-${(now.getMonth()+1).toString().padStart(2, '0')}`;
      const exportName = `علامات_وبيانات_ترانيم_${datePart}.zip`;

      if (Capacitor.isNativePlatform()) {
        const { Filesystem, Directory } = await import('@capacitor/filesystem');
        const reader = new FileReader();
        reader.readAsDataURL(zipBlob);
        reader.onloadend = async () => {
          const base64Data = (reader.result as string).split(',')[1];
          await Filesystem.writeFile({
            path: exportName,
            data: base64Data,
            directory: Directory.Documents,
            recursive: true
          });
          setBackupStatusMessage('تم حفظ نسخة العلامات الزمنية والبيانات بنجاح في المستندات! ⚡');
        };
      } else {
        const url = URL.createObjectURL(zipBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = exportName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 2000);
        setBackupStatusMessage('تم تنزيل نسخة البيانات والعلامات الزمنية بنجاح! ⚡');
      }
      onBackupSuccess();
    } catch (err: any) {
      console.error("Metadata backup failed", err);
      setBackupStatusMessage(`❌ فشل تصدير البيانات: ${err?.message || 'خطأ غير معروف'}`);
    } finally {
      setIsBackupProcessing(false);
      setTimeout(() => setBackupStatusMessage(null), 5000);
    }
  };

  const handleLocalImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (isBackupProcessing) {
      setBackupStatusMessage('هناك عملية جارية بالفعل. يرجى الانتظار.');
      return;
    }

    setIsBackupProcessing(true);
    setBackupStatusMessage('جاري استيراد النسخة الاحتياطية وفك الملفات... ⚡');
    try {
      await restoreBackupZip(file);
      setBackupStatusMessage('اكتمل الاستيراد بنجاح! تم تحديث المكتبة... ✅');
    } catch (err: any) {
      console.error("Local restore failed", err);
      setBackupStatusMessage('❌ فشلت الاستعادة! تأكد من صحة ملف الـ ZIP.');
    } finally {
      setIsBackupProcessing(false);
      e.target.value = '';
      setTimeout(() => setBackupStatusMessage(null), 5000);
    }
  };

  useEffect(() => {
    if (isOpen && initialMode) {
      if (initialMode === 'backup') {
        handleCreateFullBackup();
      } else if (initialMode === 'import') {
        fileInputRef.current?.click();
      }
    }
  }, [isOpen, initialMode]);

  if (!isOpen) return null;

  const isSyncActive = syncProgress && ['checking', 'pulling', 'pushing'].includes(syncProgress.status);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-fade-in font-sans">
      <div 
        className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-[28px] shadow-2xl overflow-hidden flex flex-col text-right animate-in fade-in zoom-in-95 duration-200"
        dir="rtl"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-[#4da8ab]/10 dark:bg-[#4da8ab]/20 rounded-xl text-[#4da8ab]">
              <HardDrive className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900 dark:text-slate-100">خيارات النسخ الحفظ والمزامنة</h3>
              <p className="text-[10px] text-slate-400 font-bold">حلول متكاملة للمكتبات الضخمة (1GB+)</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-1.5 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto max-h-[80vh] space-y-5">
          {/* Status Message */}
          {backupStatusMessage && (
            <div className={`p-3.5 text-xs text-center font-bold rounded-2xl flex items-center justify-center gap-2 border transition-all duration-300 ${
              backupStatusMessage.includes('✅') || backupStatusMessage.includes('🎉') || backupStatusMessage.includes('نجاح')
              ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
              : backupStatusMessage.includes('❌') || backupStatusMessage.includes('فشل')
              ? 'bg-rose-500/10 text-rose-600 border-rose-500/20'
              : 'bg-[#4da8ab]/5 dark:bg-[#4da8ab]/10 text-[#4da8ab] border-[#4da8ab]/10'
            }`}>
              {isBackupProcessing && (
                <RefreshCw className="w-4 h-4 animate-spin text-[#4da8ab]" />
              )}
              <span className={isBackupProcessing ? 'animate-pulse' : ''}>{backupStatusMessage}</span>
            </div>
          )}

          {/* Solution 1: Google Drive Cloud Sync (BEST FOR 1GB+) */}
          <div className="bg-gradient-to-br from-[#4da8ab]/10 via-slate-50 to-white dark:from-[#4da8ab]/15 dark:via-slate-950/30 dark:to-slate-900 border border-[#4da8ab]/30 p-4 rounded-2xl relative space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-[#4da8ab]">
                <Cloud className="w-5 h-5" />
                <span className="text-xs font-black">المزامنة السحابية الذكية (Google Drive)</span>
              </div>
              <span className="bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 text-[9px] font-black px-2 py-0.5 rounded-full">
                الحل الذهبي لـ +1GB ⭐
              </span>
            </div>

            <p className="text-[11px] text-slate-600 dark:text-slate-300 font-bold leading-relaxed">
              تتم المزامنة تلقائياً ملفاً بملف وبشكل تراكمي مستمر. يتم رفع كل أنشودة وصورة وعلامة زمنية بشكل مستقل لسحابتك الخاصة دون إنتاج ملفات ZIP ضخمة تستهلك ذاكرة الهاتف.
            </p>

            {user ? (
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200/60 dark:border-slate-800 text-[11px]">
                  <span className="text-slate-500 font-bold">الحساب المتصل:</span>
                  <span className="font-black text-[#4da8ab] truncate max-w-[200px]">{user.email || user.displayName}</span>
                </div>

                <button
                  onClick={() => {
                    if (onGoogleSync) onGoogleSync();
                  }}
                  disabled={isSyncActive || isBackupProcessing}
                  className="w-full flex items-center justify-center gap-2 bg-[#4da8ab] hover:bg-[#3d9093] disabled:opacity-50 text-white font-black text-xs py-3 px-4 rounded-xl transition-all shadow-sm active:scale-98 cursor-pointer"
                >
                  <RefreshCw className={`w-4 h-4 ${isSyncActive ? 'animate-spin' : ''}`} />
                  <span>{isSyncActive ? 'جاري المزامنة السحابية الآن...' : 'بدء المزامنة السحابية التراكمية الآن'}</span>
                </button>
              </div>
            ) : (
              <button
                onClick={() => {
                  if (onGoogleLogin) onGoogleLogin();
                }}
                className="w-full flex items-center justify-center gap-2 bg-[#4da8ab] hover:bg-[#3d9093] text-white font-black text-xs py-3 px-4 rounded-xl transition-all shadow-sm active:scale-98 cursor-pointer"
              >
                <Cloud className="w-4 h-4" />
                <span>ربط حساب Google وتفعيل المزامنة الفورية</span>
              </button>
            )}
          </div>

          {/* Solution 2: Lightweight Data & Timestamps Backup */}
          <div className="bg-slate-50 dark:bg-slate-950/40 border border-slate-200/60 dark:border-slate-800/80 p-4 rounded-2xl space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-slate-800 dark:text-slate-100">
                <Zap className="w-4 h-4 text-amber-500" />
                <span className="text-xs font-black">تصدير العلامات الزمنية والبيانات فقط</span>
              </div>
              <span className="bg-amber-500/10 text-amber-600 border border-amber-500/20 text-[9px] font-black px-2 py-0.5 rounded-full">
                تنزيل سريع أقل من 5MB ⚡
              </span>
            </div>

            <p className="text-[10px] text-slate-500 dark:text-slate-400 font-bold leading-relaxed">
              تحفظ جميع العناوين والمنشدين والعلامات الزمنية والمفضلة والأغلفة في ملف صغير وسريع جداً، لاستعادتها أو حفظ علاماتك في ثوانٍ.
            </p>

            <button
              onClick={handleCreateMetadataBackup}
              disabled={isBackupProcessing}
              className="w-full flex items-center justify-center gap-2 bg-slate-800 dark:bg-slate-800 hover:bg-slate-900 text-white font-black text-xs py-2.5 px-3 rounded-xl transition-all active:scale-98 cursor-pointer border border-slate-700"
            >
              <Zap className="w-4 h-4 text-amber-400" />
              <span>تصدير نسخة العلامات الزمنية والبيانات</span>
            </button>
          </div>

          {/* Solution 3: Full ZIP & Import */}
          <div className="space-y-3 pt-1 border-t border-slate-100 dark:border-slate-800/80">
            <h4 className="text-xs font-black text-slate-700 dark:text-slate-300">نسخة ZIP واستعادة الملفات:</h4>
            
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={handleCreateFullBackup}
                disabled={isBackupProcessing}
                className="flex flex-col items-center justify-center gap-2 bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-100 disabled:opacity-50 font-black text-xs py-3.5 px-3 rounded-xl border border-slate-200 dark:border-slate-700 cursor-pointer active:scale-95 transition-all"
              >
                <FileArchive className="w-5 h-5 text-[#4da8ab]" />
                <span>تصدير ZIP كامل</span>
              </button>

              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isBackupProcessing}
                className="flex flex-col items-center justify-center gap-2 bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-100 disabled:opacity-50 font-black text-xs py-3.5 px-3 rounded-xl border border-slate-200 dark:border-slate-700 cursor-pointer active:scale-95 transition-all"
              >
                <Upload className="w-5 h-5 text-emerald-500" />
                <span>استعادة ملف ZIP</span>
              </button>
            </div>
            
            <p className="text-[9px] text-slate-400 dark:text-slate-500 font-bold leading-relaxed text-center px-2">
              * تنبيه: للمكتبات الضخمة التي تتجاوز 500 ميجابايت، يُفضل اعتماد المزامنة السحابية لتجنب بطء الذاكرة أو توقف الضغط.
            </p>
          </div>

          <input 
            type="file" 
            ref={fileInputRef} 
            accept=".zip" 
            onChange={handleLocalImport} 
            className="hidden" 
          />
        </div>
      </div>
    </div>
  );
}
