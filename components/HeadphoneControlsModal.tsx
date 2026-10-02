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
  RotateCcw,
  VolumeX,
  Volume1,
  FastForward,
  Rewind,
  Shuffle,
  Settings2,
  Activity
} from 'lucide-react';

export type SoundProfile = 'balanced' | 'vocal' | 'bass' | 'boost' | 'custom';

export interface CustomEqSettings {
  bass: number; // -12 to +18 dB
  mid: number;  // -12 to +18 dB
  treble: number; // -12 to +18 dB
  gain: number; // 0.8 to 2.0 (factor)
}

export type HeadphoneActionType = 
  | 'toggle'
  | 'next'
  | 'previous'
  | 'seek_forward_10'
  | 'seek_forward_30'
  | 'seek_backward_10'
  | 'seek_backward_30'
  | 'restart'
  | 'shuffle'
  | 'volume_up'
  | 'volume_down'
  | 'none';

export interface HeadphoneGestureSettings {
  singleTap: HeadphoneActionType;
  doubleTap: HeadphoneActionType;
  tripleTap: HeadphoneActionType;
  nextButton: HeadphoneActionType;
  prevButton: HeadphoneActionType;
}

export const DEFAULT_HEADPHONE_GESTURES: HeadphoneGestureSettings = {
  singleTap: 'toggle',
  doubleTap: 'next',
  tripleTap: 'previous',
  nextButton: 'next',
  prevButton: 'previous'
};

export const ACTION_LABELS: Record<HeadphoneActionType, { label: string; desc: string; icon: any }> = {
  toggle: { label: 'تشغيل / إيقاف مؤقت', desc: 'تبديل حالة التشغيل', icon: Play },
  next: { label: 'النشيد التالي', desc: 'الانتقال للنشيد اللاحق', icon: SkipForward },
  previous: { label: 'النشيد السابق', desc: 'الرجوع للنشيد السابق', icon: SkipBack },
  seek_forward_10: { label: 'تقديم 10 ثوانٍ', desc: 'تخطي للأمام +10 ث', icon: FastForward },
  seek_forward_30: { label: 'تقديم 30 ثانية', desc: 'تخطي للأمام +30 ث', icon: FastForward },
  seek_backward_10: { label: 'ترجيع 10 ثوانٍ', desc: 'الرجوع للخلف -10 ث', icon: Rewind },
  seek_backward_30: { label: 'ترجيع 30 ثانية', desc: 'الرجوع للخلف -30 ث', icon: Rewind },
  restart: { label: 'إعادة النشيد من البداية', desc: 'بدء النشيد من الثانية 0', icon: RotateCcw },
  shuffle: { label: 'نشيد عشوائي', desc: 'اختيار نشيد عشوائي من المكتبة', icon: Shuffle },
  volume_up: { label: 'رفع مستوى الصوت (+15%)', desc: 'زيادة مستوى الصوت', icon: Volume2 },
  volume_down: { label: 'خفض مستوى الصوت (-15%)', desc: 'تقليل مستوى الصوت', icon: Volume1 },
  none: { label: 'تعطيل هذا الأمر (بدون إجراء)', desc: 'تجاهل الضغطة', icon: X }
};

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
  onSeekForward?: (seconds: number) => void;
  onSeekBackward?: (seconds: number) => void;
  onRestart?: () => void;
  onShuffle?: () => void;
  soundProfile: SoundProfile;
  onSoundProfileChange: (profile: SoundProfile) => void;
  customEq: CustomEqSettings;
  onCustomEqChange: (eq: CustomEqSettings) => void;
  gestureSettings: HeadphoneGestureSettings;
  onGestureSettingsChange: (settings: HeadphoneGestureSettings) => void;
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
  onSeekForward,
  onSeekBackward,
  onRestart,
  onShuffle,
  soundProfile,
  onSoundProfileChange,
  customEq,
  onCustomEqChange,
  gestureSettings,
  onGestureSettingsChange
}) => {
  const [activeTab, setActiveTab] = useState<'equalizer' | 'gestures'>('equalizer');
  const [outputDevices, setOutputDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('default');
  const [autoPauseOnUnplug, setAutoPauseOnUnplug] = useState<boolean>(() => {
    return localStorage.getItem('traneem_auto_pause_unplug') !== 'false';
  });
  const [activeTestFeedback, setActiveTestFeedback] = useState<string | null>(null);

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

  const handleUpdateGesture = (key: keyof HeadphoneGestureSettings, value: HeadphoneActionType) => {
    const next = { ...gestureSettings, [key]: value };
    onGestureSettingsChange(next);
  };

  const handleResetGestures = () => {
    onGestureSettingsChange(DEFAULT_HEADPHONE_GESTURES);
    setActiveTestFeedback('تمت إعادة ضبط الأوامر إلى الإعدادات الافتراضية');
    setTimeout(() => setActiveTestFeedback(null), 2500);
  };

  const handleTestGesture = (action: HeadphoneActionType) => {
    setActiveTestFeedback(`تم تنفيذ أمر: ${ACTION_LABELS[action]?.label || action}`);
    setTimeout(() => setActiveTestFeedback(null), 2500);

    switch (action) {
      case 'toggle':
        onPlayPause?.();
        break;
      case 'next':
        onNext?.();
        break;
      case 'previous':
        onPrevious?.();
        break;
      case 'seek_forward_10':
        onSeekForward?.(10);
        break;
      case 'seek_forward_30':
        onSeekForward?.(30);
        break;
      case 'seek_backward_10':
        onSeekBackward?.(10);
        break;
      case 'seek_backward_30':
        onSeekBackward?.(30);
        break;
      case 'restart':
        onRestart?.();
        break;
      case 'shuffle':
        onShuffle?.();
        break;
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
      dir="rtl"
    >
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* رأس النافذة */}
        <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#4da8ab]/10 text-[#4da8ab] flex items-center justify-center shadow-inner">
              <Headphones className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-slate-800 dark:text-slate-100 text-base">إعدادات السماعات والصوت المتقدمة</h2>
              <p className="text-xs text-slate-400">موازن الصوت، وتخصيص أوامر أزرار ولمسات السماعات</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* شريط التبويبات */}
        <div className="flex border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 p-1.5 gap-1.5 px-4">
          <button
            onClick={() => setActiveTab('equalizer')}
            className={`flex-1 py-2.5 px-3 rounded-2xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'equalizer'
                ? 'bg-white dark:bg-slate-800 text-[#4da8ab] shadow-sm'
                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>موازن الصوت (Equalizer)</span>
          </button>
          <button
            onClick={() => setActiveTab('gestures')}
            className={`flex-1 py-2.5 px-3 rounded-2xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'gestures'
                ? 'bg-white dark:bg-slate-800 text-[#4da8ab] shadow-sm'
                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <Settings2 className="w-3.5 h-3.5" />
            <span>تخصيص أوامر السماعة</span>
          </button>
        </div>

        {/* محتوى التبويبات */}
        <div className="p-5 space-y-5 overflow-y-auto flex-1">
          {/* حالة الاتصال السريع */}
          <div className="p-3.5 rounded-2xl bg-gradient-to-r from-[#4da8ab]/10 via-[#4da8ab]/5 to-transparent border border-[#4da8ab]/20 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div
                className={`w-3 h-3 rounded-full ${
                  isHeadsetConnected ? 'bg-emerald-500 animate-pulse ring-4 ring-emerald-500/20' : 'bg-slate-400'
                }`}
              />
              <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                {headsetDeviceName || (isHeadsetConnected ? 'سماعة رأس متصلة' : 'مكبر الصوت الافتراضي')}
              </span>
            </div>
            <span
              className={`text-[10px] font-bold px-2.5 py-0.5 rounded-xl ${
                isHeadsetConnected
                  ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
              }`}
            >
              {isHeadsetConnected ? 'سماعات نشطة 🎧' : 'مكبر مدمج 🔊'}
            </span>
          </div>

          {/* تبويب 1: موازن الصوت */}
          {activeTab === 'equalizer' && (
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 text-[#4da8ab]" />
                    <span>أوضاع المعادل الصوتي المحسنة (High-Impact Presets)</span>
                  </h3>
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full font-bold">
                    معالجة صوتية حية 🎵
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">
                  تأثيرات صوتية معززة بقوة مع مانع تشويش ديناميكي (Limiter) لتجربة صوتية نقية وعميقة.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2.5 text-xs">
                <button
                  onClick={() => onSoundProfileChange('balanced')}
                  className={`p-3.5 rounded-2xl border text-right transition-all flex flex-col gap-1.5 ${
                    soundProfile === 'balanced'
                      ? 'bg-[#4da8ab]/15 border-[#4da8ab] text-[#4da8ab] font-bold shadow-md ring-1 ring-[#4da8ab]'
                      : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="font-bold text-sm">متوازن (Balanced)</span>
                    {soundProfile === 'balanced' && <Check className="w-4 h-4 text-[#4da8ab]" />}
                  </div>
                  <span className="text-[11px] text-slate-400 font-normal leading-relaxed">
                    الصوت الأصلي المتناسق بدون تضخيم إضافي
                  </span>
                </button>

                <button
                  onClick={() => onSoundProfileChange('vocal')}
                  className={`p-3.5 rounded-2xl border text-right transition-all flex flex-col gap-1.5 ${
                    soundProfile === 'vocal'
                      ? 'bg-[#4da8ab]/15 border-[#4da8ab] text-[#4da8ab] font-bold shadow-md ring-1 ring-[#4da8ab]'
                      : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="font-bold text-sm flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-[#4da8ab]" />
                      <span>نقاء الصوت (Vocal Clarity)</span>
                    </span>
                    {soundProfile === 'vocal' && <Check className="w-4 h-4 text-[#4da8ab]" />}
                  </div>
                  <span className="text-[11px] text-slate-400 font-normal leading-relaxed">
                    إبراز صوت المنشد والكلمات بوضوح فائق (+12dB) وتصفية الصدى
                  </span>
                </button>

                <button
                  onClick={() => onSoundProfileChange('bass')}
                  className={`p-3.5 rounded-2xl border text-right transition-all flex flex-col gap-1.5 ${
                    soundProfile === 'bass'
                      ? 'bg-[#4da8ab]/15 border-[#4da8ab] text-[#4da8ab] font-bold shadow-md ring-1 ring-[#4da8ab]'
                      : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="font-bold text-sm">تضخيم البيس الفائق (Ultra Bass)</span>
                    {soundProfile === 'bass' && <Check className="w-4 h-4 text-[#4da8ab]" />}
                  </div>
                  <span className="text-[11px] text-slate-400 font-normal leading-relaxed">
                    جهير قوي وعميق (+15dB) في ترددات 80Hz مع إيقاعات ملموسة
                  </span>
                </button>

                <button
                  onClick={() => onSoundProfileChange('boost')}
                  className={`p-3.5 rounded-2xl border text-right transition-all flex flex-col gap-1.5 ${
                    soundProfile === 'boost'
                      ? 'bg-[#4da8ab]/15 border-[#4da8ab] text-[#4da8ab] font-bold shadow-md ring-1 ring-[#4da8ab]'
                      : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="font-bold text-sm flex items-center gap-1.5">
                      <Zap className="w-4 h-4 text-amber-500 fill-amber-500" />
                      <span>مضخم الصوت العالي (+70%)</span>
                    </span>
                    {soundProfile === 'boost' && <Check className="w-4 h-4 text-[#4da8ab]" />}
                  </div>
                  <span className="text-[11px] text-slate-400 font-normal leading-relaxed">
                    رفع مستوى الصوت للسماعات الضعيفة مع حماية من التشويه
                  </span>
                </button>
              </div>

              {/* وضع التخصيص اليدوي */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-3.5">
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => onSoundProfileChange('custom')}
                    className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-200 hover:text-[#4da8ab]"
                  >
                    <Sliders className="w-4 h-4 text-[#4da8ab]" />
                    <span>تخصيص يدوي حر (Custom Equalizer Sliders)</span>
                  </button>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-lg ${
                      soundProfile === 'custom'
                        ? 'bg-[#4da8ab] text-white'
                        : 'bg-slate-200 dark:bg-slate-700 text-slate-500'
                    }`}
                  >
                    {soundProfile === 'custom' ? 'مفعل حالياً ✅' : 'اضغط للتفعيل'}
                  </span>
                </div>

                <div className="space-y-3 pt-1">
                  {/* Bass slider */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px]">
                      <span className="font-semibold text-slate-600 dark:text-slate-300">البيس والجهير (Bass):</span>
                      <span className="font-mono text-[#4da8ab] font-bold">
                        {customEq.bass > 0 ? `+${customEq.bass}` : customEq.bass} dB
                      </span>
                    </div>
                    <input
                      type="range"
                      min="-10"
                      max="18"
                      step="1"
                      value={customEq.bass}
                      onChange={(e) => {
                        onSoundProfileChange('custom');
                        onCustomEqChange({ ...customEq, bass: parseFloat(e.target.value) });
                      }}
                      className="w-full accent-[#4da8ab] cursor-pointer"
                    />
                  </div>

                  {/* Mid/Vocal slider */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px]">
                      <span className="font-semibold text-slate-600 dark:text-slate-300">وضوح المنشد والكلمات (Vocals):</span>
                      <span className="font-mono text-[#4da8ab] font-bold">
                        {customEq.mid > 0 ? `+${customEq.mid}` : customEq.mid} dB
                      </span>
                    </div>
                    <input
                      type="range"
                      min="-10"
                      max="18"
                      step="1"
                      value={customEq.mid}
                      onChange={(e) => {
                        onSoundProfileChange('custom');
                        onCustomEqChange({ ...customEq, mid: parseFloat(e.target.value) });
                      }}
                      className="w-full accent-[#4da8ab] cursor-pointer"
                    />
                  </div>

                  {/* Treble slider */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px]">
                      <span className="font-semibold text-slate-600 dark:text-slate-300">نقاء الترددات العالية (Treble):</span>
                      <span className="font-mono text-[#4da8ab] font-bold">
                        {customEq.treble > 0 ? `+${customEq.treble}` : customEq.treble} dB
                      </span>
                    </div>
                    <input
                      type="range"
                      min="-10"
                      max="18"
                      step="1"
                      value={customEq.treble}
                      onChange={(e) => {
                        onSoundProfileChange('custom');
                        onCustomEqChange({ ...customEq, treble: parseFloat(e.target.value) });
                      }}
                      className="w-full accent-[#4da8ab] cursor-pointer"
                    />
                  </div>

                  {/* Gain boost slider */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px]">
                      <span className="font-semibold text-slate-600 dark:text-slate-300">مضخم الطاقة الكلي (Master Gain):</span>
                      <span className="font-mono text-amber-500 font-bold">
                        {Math.round(customEq.gain * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0.8"
                      max="1.9"
                      step="0.05"
                      value={customEq.gain}
                      onChange={(e) => {
                        onSoundProfileChange('custom');
                        onCustomEqChange({ ...customEq, gain: parseFloat(e.target.value) });
                      }}
                      className="w-full accent-amber-500 cursor-pointer"
                    />
                  </div>
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
                    <p className="text-[11px] text-slate-400">إيقاف النشيد فور فصل سماعة الرأس أو انقطاع البلوتوث</p>
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
          )}

          {/* تبويب 2: تخصيص أوامر السماعة */}
          {activeTab === 'gestures' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                    <Radio className="w-3.5 h-3.5 text-[#4da8ab]" />
                    <span>تخصيص وظائف إيماءات اللمس وأزرار السماعات</span>
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    حدد ماذا ينفذ كل أمر على سماعات البلوتوث وسماعات اللمس (TWS Earbuds)
                  </p>
                </div>
                <button
                  onClick={handleResetGestures}
                  className="text-[10px] font-bold text-[#4da8ab] bg-[#4da8ab]/10 hover:bg-[#4da8ab]/20 px-2.5 py-1 rounded-xl transition-all flex items-center gap-1"
                  title="استعادة الضبط الافتراضي"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>استعادة الافتراضي</span>
                </button>
              </div>

              {activeTestFeedback && (
                <div className="p-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs font-bold text-center animate-in fade-in">
                  {activeTestFeedback}
                </div>
              )}

              <div className="space-y-2.5 text-xs">
                {/* 1. لمسة واحدة / Single Tap */}
                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-7 h-7 rounded-xl bg-[#4da8ab]/15 text-[#4da8ab] flex items-center justify-center font-bold text-xs">
                        1×
                      </span>
                      <div>
                        <p className="font-bold text-slate-800 dark:text-slate-100">لمسة واحدة (Single Tap / Click)</p>
                        <p className="text-[10px] text-slate-400">الضغطة الفردية على حساس اللمس أو الزر الرئيسي</p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleTestGesture(gestureSettings.singleTap)}
                      className="text-[10px] px-2 py-1 bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg border border-slate-200 dark:border-slate-600 hover:text-[#4da8ab] active:scale-95 font-semibold"
                    >
                      تجربة
                    </button>
                  </div>
                  <select
                    value={gestureSettings.singleTap}
                    onChange={(e) => handleUpdateGesture('singleTap', e.target.value as HeadphoneActionType)}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-700 dark:text-slate-200 font-bold focus:outline-none focus:border-[#4da8ab]"
                  >
                    {Object.entries(ACTION_LABELS).map(([actionKey, actionData]) => (
                      <option key={actionKey} value={actionKey}>
                        {actionData.label} - ({actionData.desc})
                      </option>
                    ))}
                  </select>
                </div>

                {/* 2. لمستان متتاليتان / Double Tap */}
                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-7 h-7 rounded-xl bg-[#4da8ab]/15 text-[#4da8ab] flex items-center justify-center font-bold text-xs">
                        2×
                      </span>
                      <div>
                        <p className="font-bold text-slate-800 dark:text-slate-100">لمستان متتاليتان (Double Tap)</p>
                        <p className="text-[10px] text-slate-400">الضغط المزدوج السريع على السماعة</p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleTestGesture(gestureSettings.doubleTap)}
                      className="text-[10px] px-2 py-1 bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg border border-slate-200 dark:border-slate-600 hover:text-[#4da8ab] active:scale-95 font-semibold"
                    >
                      تجربة
                    </button>
                  </div>
                  <select
                    value={gestureSettings.doubleTap}
                    onChange={(e) => handleUpdateGesture('doubleTap', e.target.value as HeadphoneActionType)}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-700 dark:text-slate-200 font-bold focus:outline-none focus:border-[#4da8ab]"
                  >
                    {Object.entries(ACTION_LABELS).map(([actionKey, actionData]) => (
                      <option key={actionKey} value={actionKey}>
                        {actionData.label} - ({actionData.desc})
                      </option>
                    ))}
                  </select>
                </div>

                {/* 3. ثلاث لمسات متتالية / Triple Tap */}
                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-7 h-7 rounded-xl bg-[#4da8ab]/15 text-[#4da8ab] flex items-center justify-center font-bold text-xs">
                        3×
                      </span>
                      <div>
                        <p className="font-bold text-slate-800 dark:text-slate-100">3 لمسات متتالية (Triple Tap)</p>
                        <p className="text-[10px] text-slate-400">الضغط الثلاثي المتتالي على السماعة</p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleTestGesture(gestureSettings.tripleTap)}
                      className="text-[10px] px-2 py-1 bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg border border-slate-200 dark:border-slate-600 hover:text-[#4da8ab] active:scale-95 font-semibold"
                    >
                      تجربة
                    </button>
                  </div>
                  <select
                    value={gestureSettings.tripleTap}
                    onChange={(e) => handleUpdateGesture('tripleTap', e.target.value as HeadphoneActionType)}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-700 dark:text-slate-200 font-bold focus:outline-none focus:border-[#4da8ab]"
                  >
                    {Object.entries(ACTION_LABELS).map(([actionKey, actionData]) => (
                      <option key={actionKey} value={actionKey}>
                        {actionData.label} - ({actionData.desc})
                      </option>
                    ))}
                  </select>
                </div>

                {/* 4. زر التالي في أجهزة البلوتوث / Next Button */}
                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center justify-center">
                        <SkipForward className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <p className="font-bold text-slate-800 dark:text-slate-100">زر التالي (Next Key / Fast-Forward)</p>
                        <p className="text-[10px] text-slate-400">الزر المخصص للتالي في سماعات الرأس والسيارات</p>
                      </div>
                    </div>
                  </div>
                  <select
                    value={gestureSettings.nextButton}
                    onChange={(e) => handleUpdateGesture('nextButton', e.target.value as HeadphoneActionType)}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-700 dark:text-slate-200 font-bold focus:outline-none focus:border-[#4da8ab]"
                  >
                    {Object.entries(ACTION_LABELS).map(([actionKey, actionData]) => (
                      <option key={actionKey} value={actionKey}>
                        {actionData.label} - ({actionData.desc})
                      </option>
                    ))}
                  </select>
                </div>

                {/* 5. زر السابق في أجهزة البلوتوث / Prev Button */}
                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center justify-center">
                        <SkipBack className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <p className="font-bold text-slate-800 dark:text-slate-100">زر السابق (Previous Key / Rewind)</p>
                        <p className="text-[10px] text-slate-400">الزر المخصص للرجوع في سماعات الرأس والسيارات</p>
                      </div>
                    </div>
                  </div>
                  <select
                    value={gestureSettings.prevButton}
                    onChange={(e) => handleUpdateGesture('prevButton', e.target.value as HeadphoneActionType)}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-700 dark:text-slate-200 font-bold focus:outline-none focus:border-[#4da8ab]"
                  >
                    {Object.entries(ACTION_LABELS).map(([actionKey, actionData]) => (
                      <option key={actionKey} value={actionKey}>
                        {actionData.label} - ({actionData.desc})
                      </option>
                    ))}
                  </select>
                </div>
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
            تم وحفظ الإعدادات
          </button>
        </div>
      </div>
    </div>
  );
};
