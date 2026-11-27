import React, { useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { RefreshCw, HardDrive, FileArchive, Zap, Upload, X } from 'lucide-react';

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
}

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

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

  // Full Ultra-Compressed ZIP Backup (Audio + Images + Timestamps)
  const handleCreateFullBackup = async () => {
    if (isBackupProcessing) return;
    setIsBackupProcessing(true);
    setBackupStatusMessage('جاري تجميع وضغط الأناشيد والصور والعلامات بأقصى درجة... 📦');
    try {
      const zipBlob = await createBackupZip(false, [], true);
      const sizeText = formatFileSize(zipBlob.size);

      const now = new Date();
      const datePart = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`;
      const timePart = `${now.getHours().toString().padStart(2, '0')}-${now.getMinutes().toString().padStart(2, '0')}-${now.getSeconds().toString().padStart(2, '0')}`;
      const exportName = `نسخة_ترانيم_المضغوطة_${datePart}_${timePart}.zip`;

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

          setBackupStatusMessage(`جاري حفظ الملف المضغوط (${sizeText})... (${i + 1} / ${numChunks})`);

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
            title: 'نسخة ترانيم الاحتياطية المضغوطة',
            text: `ملف النسخة الاحتياطية (${sizeText})`,
            url: firstChunkUri,
            dialogTitle: 'حفظ أو مشاركة ملف النسخة الاحتياطية'
          });
        } catch (shareErr) {
          console.warn('Native share dialog dismissed, file written to Documents:', shareErr);
        }
        setBackupStatusMessage(`تم حفظ النسخة المضغوطة بنجاح (${sizeText}) في المستندات! 🎉`);
      } else {
        const url = URL.createObjectURL(zipBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = exportName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 2000);
        setBackupStatusMessage(`تم تنزيل النسخة المضغوطة بنجاح (${sizeText})! ✅`);
      }
      onBackupSuccess();
    } catch (err: any) {
      console.error("Local backup failed", err);
      if (err?.message === 'CANCELLED') {
        setBackupStatusMessage('تم إلغاء إنشاء النسخة الاحتياطية.');
      } else {
        setBackupStatusMessage(`❌ فشل الحفظ: ${err?.message || 'خطأ غير معروف'}`);
      }
    } finally {
      setIsBackupProcessing(false);
      setTimeout(() => setBackupStatusMessage(null), 6000);
    }
  };

  // Lightweight Metadata + Timestamps Backup
  const handleCreateMetadataBackup = async () => {
    if (isBackupProcessing) return;
    setIsBackupProcessing(true);
    setBackupStatusMessage('جاري تصدير البيانات والعلامات الزمنية بأقصى ضغط... ⚡');
    try {
      const zipBlob = await createBackupZip(true, [], true);
      const sizeText = formatFileSize(zipBlob.size);
      const now = new Date();
      const datePart = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;
      const exportName = `علامات_وبيانات_ترانيم_${datePart}.zip`;

      if (Capacitor.isNativePlatform()) {
        const { Filesystem, Directory } = await import('@capacitor/filesystem');
        const base64Data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onerror = reject;
          reader.onloadend = () => {
            const res = reader.result as string;
            resolve(res.substring(res.indexOf(',') + 1));
          };
          reader.readAsDataURL(zipBlob);
        });
        const written = await Filesystem.writeFile({
          path: exportName,
          data: base64Data,
          directory: Directory.Documents,
          recursive: true
        });
        try {
          const { Share } = await import('@capacitor/share');
          await Share.share({
            title: 'علامات وبيانات ترانيم',
            url: written.uri,
            dialogTitle: 'حفظ أو مشاركة ملف البيانات'
          });
        } catch {}
        setBackupStatusMessage(`تم حفظ نسخة البيانات والعلامات (${sizeText}) بنجاح في المستندات! ⚡`);
      } else {
        const url = URL.createObjectURL(zipBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = exportName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 2000);
        setBackupStatusMessage(`تم تنزيل نسخة البيانات والعلامات (${sizeText}) بنجاح! ⚡`);
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

  return (
    <div className="fixed inset-0 z-[260] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-fade-in font-sans">
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
              <h3 className="text-base font-black text-slate-900 dark:text-slate-100">النسخ الاحتياطي والاستعادة</h3>
              <p className="text-[10px] text-slate-400 font-bold">ضغط أقصى لحفظ الأناشيد والصور والعلامات الزمنية</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-1.5 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto max-h-[80vh] space-y-5">
          {/* Status Message */}
          {backupStatusMessage && (
            <div className={`p-3.5 text-xs text-center font-bold rounded-2xl flex items-center justify-between gap-2 border transition-all duration-300 ${
              backupStatusMessage.includes('✅') || backupStatusMessage.includes('🎉') || backupStatusMessage.includes('نجاح')
              ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
              : backupStatusMessage.includes('❌') || backupStatusMessage.includes('فشل')
              ? 'bg-rose-500/10 text-rose-600 border-rose-500/20'
              : 'bg-[#4da8ab]/5 dark:bg-[#4da8ab]/10 text-[#4da8ab] border-[#4da8ab]/10'
            }`}>
              <div className="flex items-center gap-2 mx-auto">
                {isBackupProcessing && (
                  <RefreshCw className="w-4 h-4 animate-spin text-[#4da8ab] shrink-0" />
                )}
                <span className={isBackupProcessing ? 'animate-pulse' : ''}>{backupStatusMessage}</span>
              </div>
              {isBackupProcessing && onCancelBackup && (
                <button
                  onClick={onCancelBackup}
                  className="text-[10px] px-2 py-1 rounded-lg bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 font-black shrink-0"
                >
                  إلغاء
                </button>
              )}
            </div>
          )}

          {/* Option 1: Ultra-Compressed Full ZIP & Restore */}
          <div className="bg-gradient-to-br from-[#4da8ab]/10 via-slate-50 to-white dark:from-[#4da8ab]/15 dark:via-slate-950/30 dark:to-slate-900 border border-[#4da8ab]/30 p-4 rounded-2xl space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-[#4da8ab]">
                <FileArchive className="w-5 h-5" />
                <span className="text-xs font-black">نسخة كاملة بأقصى ضغط (ZIP)</span>
              </div>
              <span className="bg-[#4da8ab]/15 text-[#4da8ab] border border-[#4da8ab]/25 text-[9px] font-black px-2 py-0.5 rounded-full">
                ضغط أقصى + إزالة التكرار
              </span>
            </div>

            <p className="text-[11px] text-slate-600 dark:text-slate-300 font-bold leading-relaxed">
              يحفظ جميع الأناشيد والتسجيلات، صور الأغلفة، والعلامات الزمنية مع ضغط الملفات لأقصى حد وإلغاء التكرار لتقليص الحجم قدر الإمكان.
            </p>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <button
                onClick={handleCreateFullBackup}
                disabled={isBackupProcessing}
                className="flex flex-col items-center justify-center gap-2 bg-[#4da8ab] hover:bg-[#3d9093] text-white disabled:opacity-50 font-black text-xs py-3.5 px-3 rounded-xl shadow-md shadow-[#4da8ab]/20 cursor-pointer active:scale-95 transition-all"
              >
                <FileArchive className="w-5 h-5" />
                <span>تصدير ZIP مضغوط</span>
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
          </div>

          {/* Option 2: Lightweight Data & Timestamps Backup */}
          <div className="bg-slate-50 dark:bg-slate-950/40 border border-slate-200/60 dark:border-slate-800/80 p-4 rounded-2xl space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-slate-800 dark:text-slate-100">
                <Zap className="w-4 h-4 text-amber-500" />
                <span className="text-xs font-black">تصدير العلامات الزمنية والبيانات فقط</span>
              </div>
              <span className="bg-amber-500/10 text-amber-600 border border-amber-500/20 text-[9px] font-black px-2 py-0.5 rounded-full">
                حجم صغير جداً ⚡
              </span>
            </div>

            <p className="text-[10px] text-slate-500 dark:text-slate-400 font-bold leading-relaxed">
              يحفظ جميع العناوين والمنشدين والعلامات الزمنية والمفضلة في ملف خفيف جداً وفائق السرعة.
            </p>

            <button
              onClick={handleCreateMetadataBackup}
              disabled={isBackupProcessing}
              className="w-full flex items-center justify-center gap-2 bg-slate-800 dark:bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white font-black text-xs py-2.5 px-3 rounded-xl transition-all active:scale-98 cursor-pointer border border-slate-700"
            >
              <Zap className="w-4 h-4 text-amber-400" />
              <span>تصدير نسخة العلامات والبيانات</span>
            </button>
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
