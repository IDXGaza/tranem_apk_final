import React, { useState, useEffect } from 'react';
import {
  Headphones,
  Volume2,
  Radio,
  Check,
  X,
  ShieldCheck,
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Sliders,
  Sparkles,
  Zap,
  VolumeX,
  Volume1
} from 'lucide-react';

export type SoundProfile = 'balanced' | 'vocal' | 'bass' | 'boost';

interface HeadphoneControlsModalProps {
  isOpen: boolean;
  onClose: () => void;
  audioRef: React.RefObject<HTMLAudioElement | null>;
  isHeadsetConnected: boolean;
  headsetDeviceName: string;
  isPlaying?: boolean;
  onPlayPause?: () => void;
  onNext?: () => void;
  onPrevious?: () => void;
  soundProfile: SoundProfile;
  onSoundProfileChange: (profile: SoundProfile) => void;
  storagePersisted?: boolean;
  onRestoreVault?: () => Promise<void>;
}

export const HeadphoneControlsModal: React.FC<HeadphoneControlsModalProps> = ({
  isOpen,
  onClose,
  audioRef,
  isHeadsetConnected,
  headsetDeviceName,
  isPlaying = false,
  onPlayPause,
  onNext,
  onPrevious,
  soundProfile,
  onSoundProfileChange,
  storagePersisted = false,
  onRestoreVault
}) => {
  const [outputDevices, setOutputDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('default');
  const [autoPauseOnUnplug, setAutoPauseOnUnplug] = useState<boolean>(() => {
    return localStorage.getItem('traneem_auto_pause_unplug') !== 'false';
  });
  const [vaultRestoring, setVaultRestoring] = useState(false);
  const [vaultStatus, setVaultStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    if (typeof navigator !== 'undefined' && navigator.mediaDevices?.enumerateDevices) {
      navigator.mediaDevices
        .enumerateDevices()
        .then((devices) => {
          const audioOutputs = devices.filter((d) => d.kind === 'audiooutput');
          setOutputDevices(audioOutputs);
        })
        .catch((err) => {
          console.warn('Enumerate audio devices error:', err);
        });
    }
  }, [isOpen]);

  const handleDeviceChange = async (deviceId: string) => {
    setSelectedDeviceId(deviceId);
    const audio = audioRef.current;
    if (audio && (audio as any).setSinkId) {
      try {
        await (audio as any).setSinkId(deviceId);
        console.log('Audio output device switched to:', deviceId);
      } catch (err) {
        console.warn('Failed to set audio sink ID:', err);
      }
    }
  };

  const handleToggleAutoPause = () => {
    const nextVal = !autoPauseOnUnplug;
    setAutoPauseOnUnplug(nextVal);
    localStorage.setItem('traneem_auto_pause_unplug', nextVal.toString());
  };

  const handleTriggerRestoreVault = async () => {
    if (!onRestoreVault) return;
    setVaultRestoring(true);
    setVaultStatus('جاري استرجاع الأناشيد من مستودع الأمان...');
    try {
      await onRestoreVault();
      setVaultStatus('تمت استعادة الأناشيد بنجاح! ✅');
    } catch (e: any) {
      setVaultStatus(e?.message || 'لا توجد أناشيد لاستعادتها');
    } finally {
      setVaultRestoring(false);
      setTimeout(() => setVaultStatus(null), 4000);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
      dir="rtl"
    >
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
        {/* رأس النافذة */}
        <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#4da8ab]/10 text-[#4da8ab] flex items-center justify-center">
              <Headphones className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-slate-800 dark:text-slate-100 text-base">التحكم بالسماعات ومخارج الصوت</h2>
              <p className="text-xs text-slate-400">إدارة أزرار السماعات، المعادل، والحماية</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-5 overflow-y-auto flex-1">
          {/* حالة الاتصال الحالية */}
          <div className="p-4 rounded-2xl bg-gradient-to-r from-[#4da8ab]/10 via-[#4da8ab]/5 to-transparent border border-[#4da8ab]/20 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className={`w-3.5 h-3.5 rounded-full ${
                  isHeadsetConnected ? 'bg-emerald-500 animate-pulse ring-4 ring-emerald-500/20' : 'bg-slate-400'
                }`}
              />
              <div>
                <span className="text-[11px] font-semibold text-slate-400">جهاز الإخراج النشط:</span>
                <p className="text-sm font-bold text-slate-800 dark:text-slate-100">
                  {headsetDeviceName || (isHeadsetConnected ? 'سماعة رأس متصلة' : 'مكبر الصوت الافتراضي')}
                </p>
              </div>
            </div>
            <span
              className={`text-[11px] font-bold px-3 py-1 rounded-xl ${
                isHeadsetConnected
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
              }`}
            >
              {isHeadsetConnected ? 'سماعات نشطة 🎧' : 'مكبر مدمج 🔊'}
            </span>
          </div>

          {/* دليل أزرار السماعات وسماعات اللمس */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5 text-[#4da8ab]" />
                <span>سماعات اللمس اللاسلكية والبلوتوث (Touch Earbuds / TWS)</span>
              </h3>
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full font-bold">
                متوافق مع جميع سماعات اللمس ✅
              </span>
            </div>

            <div className="grid grid-cols-1 gap-2 text-xs">
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-lg bg-[#4da8ab]/15 text-[#4da8ab] flex items-center justify-center font-bold text-xs">
                    1×
                  </span>
                  <div>
                    <p className="text-slate-700 dark:text-slate-200 font-bold">لمسة واحدة (أو ضغطة زر)</p>
                    <p className="text-[10px] text-slate-400">Single Tap / Click</p>
                  </div>
                </div>
                <span className="font-bold text-[#4da8ab] bg-[#4da8ab]/10 px-2.5 py-1 rounded-lg">
                  تشغيل / إيقاف مؤقت
                </span>
              </div>

              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-lg bg-[#4da8ab]/15 text-[#4da8ab] flex items-center justify-center font-bold text-xs">
                    2×
                  </span>
                  <div>
                    <p className="text-slate-700 dark:text-slate-200 font-bold">لمستان متتاليتان (Double Tap)</p>
                    <p className="text-[10px] text-slate-400">Next Track Gesture</p>
                  </div>
                </div>
                <span className="font-bold text-[#4da8ab] bg-[#4da8ab]/10 px-2.5 py-1 rounded-lg">النشيد التالي</span>
              </div>

              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-lg bg-[#4da8ab]/15 text-[#4da8ab] flex items-center justify-center font-bold text-xs">
                    3×
                  </span>
                  <div>
                    <p className="text-slate-700 dark:text-slate-200 font-bold">3 لمسات متتالية (Triple Tap)</p>
                    <p className="text-[10px] text-slate-400">Previous Track Gesture</p>
                  </div>
                </div>
                <span className="font-bold text-[#4da8ab] bg-[#4da8ab]/10 px-2.5 py-1 rounded-lg">النشيد السابق</span>
              </div>
            </div>

            {/* أزرار التجربة المباشرة */}
            <div className="p-3 rounded-2xl bg-slate-100 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800 flex items-center justify-between">
              <span className="text-[11px] font-semibold text-slate-500">تجربة استجابة التحكم الآن:</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={onPrevious}
                  className="p-2 rounded-xl bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:text-[#4da8ab] shadow-sm active:scale-95"
                  title="السابق"
                >
                  <SkipBack className="w-4 h-4" />
                </button>
                <button
                  onClick={onPlayPause}
                  className="p-2 rounded-xl bg-[#4da8ab] text-white shadow-sm active:scale-95 flex items-center justify-center"
                  title="تشغيل/إيقاف"
                >
                  {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
                </button>
                <button
                  onClick={onNext}
                  className="p-2 rounded-xl bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:text-[#4da8ab] shadow-sm active:scale-95"
                  title="التالي"
                >
                  <SkipForward className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* معادل الصوت وملفات الصوت المخصصة للسماعات */}
          <div className="space-y-2.5">
            <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-[#4da8ab]" />
              <span>موازن الصوت ومضخم السماعات (Equalizer Profiles)</span>
            </h3>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                onClick={() => onSoundProfileChange('balanced')}
                className={`p-3 rounded-2xl border text-right transition-all flex flex-col gap-1 ${
                  soundProfile === 'balanced'
                    ? 'bg-[#4da8ab]/10 border-[#4da8ab] text-[#4da8ab] font-bold shadow-sm'
                    : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <span className="font-bold">متوازن (Balanced)</span>
                  {soundProfile === 'balanced' && <Check className="w-4 h-4 text-[#4da8ab]" />}
                </div>
                <span className="text-[10px] text-slate-400 font-normal">صوت طبيعي وأصلي للنشيد</span>
              </button>

              <button
                onClick={() => onSoundProfileChange('vocal')}
                className={`p-3 rounded-2xl border text-right transition-all flex flex-col gap-1 ${
                  soundProfile === 'vocal'
                    ? 'bg-[#4da8ab]/10 border-[#4da8ab] text-[#4da8ab] font-bold shadow-sm'
                    : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <span className="font-bold flex items-center gap-1">
                    <Sparkles className="w-3 h-3" />
                    <span>نقاء الصوت (Vocal)</span>
                  </span>
                  {soundProfile === 'vocal' && <Check className="w-4 h-4 text-[#4da8ab]" />}
                </div>
                <span className="text-[10px] text-slate-400 font-normal">إبراز نبرة المنشد والكلمات بوضوح</span>
              </button>

              <button
                onClick={() => onSoundProfileChange('bass')}
                className={`p-3 rounded-2xl border text-right transition-all flex flex-col gap-1 ${
                  soundProfile === 'bass'
                    ? 'bg-[#4da8ab]/10 border-[#4da8ab] text-[#4da8ab] font-bold shadow-sm'
                    : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <span className="font-bold">تضخيم البيس (Deep Bass)</span>
                  {soundProfile === 'bass' && <Check className="w-4 h-4 text-[#4da8ab]" />}
                </div>
                <span className="text-[10px] text-slate-400 font-normal">إيقاعات وأصوات خلفية عميقة</span>
              </button>

              <button
                onClick={() => onSoundProfileChange('boost')}
                className={`p-3 rounded-2xl border text-right transition-all flex flex-col gap-1 ${
                  soundProfile === 'boost'
                    ? 'bg-[#4da8ab]/10 border-[#4da8ab] text-[#4da8ab] font-bold shadow-sm'
                    : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <span className="font-bold flex items-center gap-1">
                    <Zap className="w-3 h-3 text-amber-500 fill-amber-500" />
                    <span>مضخم الصوت (+30%)</span>
                  </span>
                  {soundProfile === 'boost' && <Check className="w-4 h-4 text-[#4da8ab]" />}
                </div>
                <span className="text-[10px] text-slate-400 font-normal">رفع الصوت للسماعات ذات الإخراج الضعيف</span>
              </button>
            </div>
          </div>

          {/* خيار الإيقاف التلقائي عند نزع السماعة */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <ShieldCheck className="w-5 h-5 text-[#4da8ab]" />
              <div>
                <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  إيقاف مؤقت تلقائي عند نزع السماعة
                </h4>
                <p className="text-[11px] text-slate-400">إيقاف الصوت فور فصل سماعات الرأس أو انقطاع البلوتوث لحماية خصوصيتك</p>
              </div>
            </div>
            <button
              onClick={handleToggleAutoPause}
              className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors ${
                autoPauseOnUnplug ? 'bg-[#4da8ab]' : 'bg-slate-300 dark:bg-slate-700'
              }`}
            >
              <div
                className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                  autoPauseOnUnplug ? '-translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* درع الحماية ومستودع الأمان للأناشيد */}
          <div className="p-4 rounded-2xl bg-emerald-500/5 dark:bg-emerald-500/10 border border-emerald-500/20 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">درع حفظ الأناشيد التلقائي</span>
              </div>
              <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/15 px-2 py-0.5 rounded-lg">
                {storagePersisted ? 'تخزين دائم محمي ✅' : 'حماية التخزين مفعلة 🛡️'}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
              تطبيق ترانيم يحفظ مكتبتك ومستودع الأمان التلقائي لمنع حذف الأناشيد العشوائي من قِبل نظام التشغيل أو متصفح الجهاز.
            </p>
            {onRestoreVault && (
              <div className="pt-1 flex items-center justify-between">
                <button
                  onClick={handleTriggerRestoreVault}
                  disabled={vaultRestoring}
                  className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs font-bold hover:bg-emerald-500/10 active:scale-95 transition-all"
                >
                  {vaultRestoring ? 'جاري الاسترجاع...' : 'استرجاع من مستودع الأمان الاحتياطي'}
                </button>
                {vaultStatus && <span className="text-[11px] font-bold text-emerald-600">{vaultStatus}</span>}
              </div>
            )}
          </div>

          {/* قائمة أجهزة الإخراج إذا توفرت عبر المتصفح */}
          {outputDevices.length > 1 && (
            <div className="space-y-2.5">
              <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <Volume2 className="w-3.5 h-3.5 text-[#4da8ab]" />
                <span>تبديل مخرج الصوت يدوياً</span>
              </h3>
              <div className="space-y-1.5">
                {outputDevices.map((dev) => (
                  <button
                    key={dev.deviceId}
                    onClick={() => handleDeviceChange(dev.deviceId)}
                    className={`w-full p-3 rounded-2xl border text-xs flex items-center justify-between transition-all ${
                      selectedDeviceId === dev.deviceId
                        ? 'bg-[#4da8ab]/10 border-[#4da8ab] text-[#4da8ab] font-bold'
                        : 'bg-slate-50 dark:bg-slate-800/40 border-slate-100 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <span className="truncate">{dev.label || `مخرج صوت (${dev.deviceId.slice(0, 5)})`}</span>
                    {selectedDeviceId === dev.deviceId && <Check className="w-4 h-4 text-[#4da8ab] shrink-0" />}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* تذييل */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="w-full py-2.5 bg-[#4da8ab] hover:bg-[#3d9194] text-white font-bold rounded-2xl text-xs active:scale-95 transition-all shadow-md"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};
