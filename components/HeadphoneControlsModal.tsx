import React, { useState, useEffect } from 'react';
import {
  Headphones,
  Volume2,
  Radio,
  Check,
  X,
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Sliders,
  Sparkles,
  Zap,
  RotateCcw,
  Volume1,
  FastForward,
  Rewind,
  Shuffle,
  Settings2,
  Activity,
  SlidersHorizontal
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

export interface EarbudActions {
  singleTap: HeadphoneActionType;
  doubleTap: HeadphoneActionType;
  tripleTap: HeadphoneActionType;
  longPress: HeadphoneActionType;
}

export interface HeadphoneGestureSettings {
  leftEarbud: EarbudActions;
  rightEarbud: EarbudActions;
  singleTap: HeadphoneActionType;
  doubleTap: HeadphoneActionType;
  tripleTap: HeadphoneActionType;
  nextButton: HeadphoneActionType;
  prevButton: HeadphoneActionType;
}

export const DEFAULT_HEADPHONE_GESTURES: HeadphoneGestureSettings = {
  leftEarbud: {
    singleTap: 'toggle',
    doubleTap: 'previous',
    tripleTap: 'seek_backward_10',
    longPress: 'volume_down'
  },
  rightEarbud: {
    singleTap: 'toggle',
    doubleTap: 'next',
    tripleTap: 'seek_forward_10',
    longPress: 'volume_up'
  },
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
  const [activeTab, setActiveTab] = useState<'presets' | 'custom_eq' | 'gestures'>('presets');
  const [activeEarbudSide, setActiveEarbudSide] = useState<'right' | 'left'>('right');
  const [outputDevices, setOutputDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('default');
  const [autoPauseOnUnplug, setAutoPauseOnUnplug] = useState<boolean>(() => {
    return localStorage.getItem('traneem_auto_pause_unplug') !== 'false';
  });
  const [activeTestFeedback, setActiveTestFeedback] = useState<string | null>(null);

  // Fallback migration for existing saved settings
  const currentSettings: HeadphoneGestureSettings = {
    ...DEFAULT_HEADPHONE_GESTURES,
    ...gestureSettings,
    leftEarbud: { ...DEFAULT_HEADPHONE_GESTURES.leftEarbud, ...(gestureSettings?.leftEarbud || {}) },
    rightEarbud: { ...DEFAULT_HEADPHONE_GESTURES.rightEarbud, ...(gestureSettings?.rightEarbud || {}) }
  };

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

  const handleUpdateEarbudAction = (side: 'left' | 'right', gesture: keyof EarbudActions, value: HeadphoneActionType) => {
    const sideKey = side === 'left' ? 'leftEarbud' : 'rightEarbud';
    const next: HeadphoneGestureSettings = {
      ...currentSettings,
      [sideKey]: {
        ...currentSettings[sideKey],
        [gesture]: value
      }
    };
    // Sync unified single/double/triple tap if right side modified
    if (side === 'right') {
      if (gesture === 'singleTap') next.singleTap = value;
      if (gesture === 'doubleTap') next.doubleTap = value;
      if (gesture === 'tripleTap') next.tripleTap = value;
    }
    onGestureSettingsChange(next);
  };

  const handleUpdateHardwareButton = (buttonKey: 'nextButton' | 'prevButton', value: HeadphoneActionType) => {
    const next: HeadphoneGestureSettings = {
      ...currentSettings,
      [buttonKey]: value
    };
    onGestureSettingsChange(next);
  };

  const handleResetGestures = () => {
    onGestureSettingsChange(DEFAULT_HEADPHONE_GESTURES);
    setActiveTestFeedback('تمت استعادة الإعدادات الافتراضية للسماعتين بنجاح');
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

  const currentEarbudConfig = activeEarbudSide === 'right' ? currentSettings.rightEarbud : currentSettings.leftEarbud;

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
              <h2 className="font-bold text-slate-800 dark:text-slate-100 text-base">إعدادات السماعات والصوت</h2>
              <p className="text-xs text-slate-400">موازن الصوت، المعادل اليدوي، وتخصيص السماعتين (يمين / يسار)</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* شريط التبويبات الثلاثة المنسقة */}
        <div className="flex border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 p-1.5 gap-1.5 px-4">
          <button
            onClick={() => setActiveTab('presets')}
            className={`flex-1 py-2 px-2.5 rounded-2xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'presets'
                ? 'bg-white dark:bg-slate-800 text-[#4da8ab] shadow-sm'
                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>أوضاع الصوت</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('custom_eq');
              onSoundProfileChange('custom');
            }}
            className={`flex-1 py-2 px-2.5 rounded-2xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'custom_eq'
                ? 'bg-white dark:bg-slate-800 text-[#4da8ab] shadow-sm'
                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>المعادل اليدوي</span>
          </button>

          <button
            onClick={() => setActiveTab('gestures')}
            className={`flex-1 py-2 px-2.5 rounded-2xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'gestures'
                ? 'bg-white dark:bg-slate-800 text-[#4da8ab] shadow-sm'
                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <Settings2 className="w-3.5 h-3.5" />
            <span>تخصيص السماعات (L/R)</span>
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

          {/* تبويب 1: أوضاع الصوت الجاهزة */}
          {activeTab === 'presets' && (
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 text-[#4da8ab]" />
                    <span>أوضاع المعادل الصوتي المحسنة (Equalizer Presets)</span>
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

              {/* خيار الإيقاف التلقائي عند نزع السماعة */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Headphones className="w-5 h-5 text-[#4da8ab]" />
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
            </div>
          )}

          {/* تبويب 2: المعادل اليدوي المتقدم المخصص */}
          {activeTab === 'custom_eq' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                    <SlidersHorizontal className="w-4 h-4 text-[#4da8ab]" />
                    <span>المعادل الصوتي اليدوي (Custom Equalizer)</span>
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    تحكم دقيق وفوري في ترددات البيس، الكلمات، والترددات الحادة
                  </p>
                </div>
                <button
                  onClick={() => {
                    const defaultEq = { bass: 0, mid: 0, treble: 0, gain: 1.0 };
                    onCustomEqChange(defaultEq);
                    onSoundProfileChange('custom');
                  }}
                  className="text-[10px] font-bold text-[#4da8ab] bg-[#4da8ab]/10 hover:bg-[#4da8ab]/20 px-2.5 py-1 rounded-xl transition-all flex items-center gap-1"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>تصفير</span>
                </button>
              </div>

              <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-4">
                {/* Bass slider */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="font-bold text-slate-700 dark:text-slate-200">البيس والجهير العميق (Sub-Bass 80Hz):</span>
                    <span className="font-mono text-[#4da8ab] font-bold">
                      {customEq.bass > 0 ? `+${customEq.bass}` : customEq.bass} dB
                    </span>
                  </div>
                  <input
                    type="range"
                    min="-12"
                    max="18"
                    step="1"
                    value={customEq.bass}
                    onChange={(e) => {
                      onSoundProfileChange('custom');
                      onCustomEqChange({ ...customEq, bass: parseFloat(e.target.value) });
                    }}
                    className="w-full accent-[#4da8ab] cursor-pointer"
                  />
                  <div className="flex justify-between text-[9px] text-slate-400 font-mono">
                    <span>-12 dB (خافت)</span>
                    <span>0 dB (طبيعي)</span>
                    <span>+18 dB (أقصى بيس)</span>
                  </div>
                </div>

                {/* Mid/Vocal slider */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="font-bold text-slate-700 dark:text-slate-200">وضوح المنشد والكلمات (Vocals 2.8kHz):</span>
                    <span className="font-mono text-[#4da8ab] font-bold">
                      {customEq.mid > 0 ? `+${customEq.mid}` : customEq.mid} dB
                    </span>
                  </div>
                  <input
                    type="range"
                    min="-12"
                    max="18"
                    step="1"
                    value={customEq.mid}
                    onChange={(e) => {
                      onSoundProfileChange('custom');
                      onCustomEqChange({ ...customEq, mid: parseFloat(e.target.value) });
                    }}
                    className="w-full accent-[#4da8ab] cursor-pointer"
                  />
                  <div className="flex justify-between text-[9px] text-slate-400 font-mono">
                    <span>-12 dB</span>
                    <span>0 dB</span>
                    <span>+18 dB (فائق الوضوح)</span>
                  </div>
                </div>

                {/* Treble slider */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="font-bold text-slate-700 dark:text-slate-200">نقاء الترددات العالية (Treble 8kHz):</span>
                    <span className="font-mono text-[#4da8ab] font-bold">
                      {customEq.treble > 0 ? `+${customEq.treble}` : customEq.treble} dB
                    </span>
                  </div>
                  <input
                    type="range"
                    min="-12"
                    max="18"
                    step="1"
                    value={customEq.treble}
                    onChange={(e) => {
                      onSoundProfileChange('custom');
                      onCustomEqChange({ ...customEq, treble: parseFloat(e.target.value) });
                    }}
                    className="w-full accent-[#4da8ab] cursor-pointer"
                  />
                  <div className="flex justify-between text-[9px] text-slate-400 font-mono">
                    <span>-12 dB</span>
                    <span>0 dB</span>
                    <span>+18 dB (نقاء بلوري)</span>
                  </div>
                </div>

                {/* Gain boost slider */}
                <div className="space-y-1.5 pt-2 border-t border-slate-200/60 dark:border-slate-700/60">
                  <div className="flex justify-between text-xs">
                    <span className="font-bold text-slate-700 dark:text-slate-200">مضخم الطاقة الرئيسي (Master Amplification):</span>
                    <span className="font-mono text-amber-500 font-bold text-sm">
                      {Math.round(customEq.gain * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0.8"
                    max="2.0"
                    step="0.05"
                    value={customEq.gain}
                    onChange={(e) => {
                      onSoundProfileChange('custom');
                      onCustomEqChange({ ...customEq, gain: parseFloat(e.target.value) });
                    }}
                    className="w-full accent-amber-500 cursor-pointer"
                  />
                  <div className="flex justify-between text-[9px] text-slate-400 font-mono">
                    <span>80%</span>
                    <span>100% (طبيعي)</span>
                    <span>200% (مضاعف)</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* تبويب 3: تخصيص السماعات (يمين / يسار بشكل منفصل) */}
          {activeTab === 'gestures' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                    <Radio className="w-3.5 h-3.5 text-[#4da8ab]" />
                    <span>تخصيص السماعة اليمنى واليسرى بشكل منفصل</span>
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    خصص أوامر اللمس لسماعة الأذن اليمين واليسار (TWS Earbuds)
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

              {/* أزرار اختيار السماعة: يمين / يسار */}
              <div className="grid grid-cols-2 gap-2 p-1.5 bg-slate-100 dark:bg-slate-800/80 rounded-2xl">
                <button
                  onClick={() => setActiveEarbudSide('right')}
                  className={`py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                    activeEarbudSide === 'right'
                      ? 'bg-white dark:bg-slate-900 text-[#4da8ab] shadow-md ring-1 ring-[#4da8ab]/30'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  }`}
                >
                  <span className="w-5 h-5 rounded-full bg-[#4da8ab]/15 text-[#4da8ab] flex items-center justify-center font-bold text-[10px]">
                    R
                  </span>
                  <span>السماعة اليمنى (Right)</span>
                </button>

                <button
                  onClick={() => setActiveEarbudSide('left')}
                  className={`py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                    activeEarbudSide === 'left'
                      ? 'bg-white dark:bg-slate-900 text-[#4da8ab] shadow-md ring-1 ring-[#4da8ab]/30'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  }`}
                >
                  <span className="w-5 h-5 rounded-full bg-[#4da8ab]/15 text-[#4da8ab] flex items-center justify-center font-bold text-[10px]">
                    L
                  </span>
                  <span>السماعة اليسرى (Left)</span>
                </button>
              </div>

              {/* بطاقات أوامر السماعة المحددة */}
              <div className="space-y-2.5 text-xs">
                {/* 1. لمسة واحدة / Single Tap */}
                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-7 h-7 rounded-xl bg-[#4da8ab]/15 text-[#4da8ab] flex items-center justify-center font-bold text-xs">
                        1×
                      </span>
                      <div>
                        <p className="font-bold text-slate-800 dark:text-slate-100">
                          لمسة واحدة ({activeEarbudSide === 'right' ? 'السماعة اليمنى R' : 'السماعة اليسرى L'})
                        </p>
                        <p className="text-[10px] text-slate-400">Single Tap</p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleTestGesture(currentEarbudConfig.singleTap)}
                      className="text-[10px] px-2 py-1 bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg border border-slate-200 dark:border-slate-600 hover:text-[#4da8ab] active:scale-95 font-semibold"
                    >
                      تجربة
                    </button>
                  </div>
                  <select
                    value={currentEarbudConfig.singleTap}
                    onChange={(e) => handleUpdateEarbudAction(activeEarbudSide, 'singleTap', e.target.value as HeadphoneActionType)}
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
                        <p className="font-bold text-slate-800 dark:text-slate-100">
                          لمستان متتاليتان ({activeEarbudSide === 'right' ? 'السماعة اليمنى R' : 'السماعة اليسرى L'})
                        </p>
                        <p className="text-[10px] text-slate-400">Double Tap</p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleTestGesture(currentEarbudConfig.doubleTap)}
                      className="text-[10px] px-2 py-1 bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg border border-slate-200 dark:border-slate-600 hover:text-[#4da8ab] active:scale-95 font-semibold"
                    >
                      تجربة
                    </button>
                  </div>
                  <select
                    value={currentEarbudConfig.doubleTap}
                    onChange={(e) => handleUpdateEarbudAction(activeEarbudSide, 'doubleTap', e.target.value as HeadphoneActionType)}
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
                        <p className="font-bold text-slate-800 dark:text-slate-100">
                          3 لمسات متتالية ({activeEarbudSide === 'right' ? 'السماعة اليمنى R' : 'السماعة اليسرى L'})
                        </p>
                        <p className="text-[10px] text-slate-400">Triple Tap</p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleTestGesture(currentEarbudConfig.tripleTap)}
                      className="text-[10px] px-2 py-1 bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg border border-slate-200 dark:border-slate-600 hover:text-[#4da8ab] active:scale-95 font-semibold"
                    >
                      تجربة
                    </button>
                  </div>
                  <select
                    value={currentEarbudConfig.tripleTap}
                    onChange={(e) => handleUpdateEarbudAction(activeEarbudSide, 'tripleTap', e.target.value as HeadphoneActionType)}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-700 dark:text-slate-200 font-bold focus:outline-none focus:border-[#4da8ab]"
                  >
                    {Object.entries(ACTION_LABELS).map(([actionKey, actionData]) => (
                      <option key={actionKey} value={actionKey}>
                        {actionData.label} - ({actionData.desc})
                      </option>
                    ))}
                  </select>
                </div>

                {/* 4. لمسة مطولة / Long Press */}
                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-7 h-7 rounded-xl bg-amber-500/15 text-amber-600 flex items-center justify-center font-bold text-xs">
                        ⏱️
                      </span>
                      <div>
                        <p className="font-bold text-slate-800 dark:text-slate-100">
                          لمسة مطولة ({activeEarbudSide === 'right' ? 'السماعة اليمنى R' : 'السماعة اليسرى L'})
                        </p>
                        <p className="text-[10px] text-slate-400">Long Press / Hold</p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleTestGesture(currentEarbudConfig.longPress)}
                      className="text-[10px] px-2 py-1 bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg border border-slate-200 dark:border-slate-600 hover:text-[#4da8ab] active:scale-95 font-semibold"
                    >
                      تجربة
                    </button>
                  </div>
                  <select
                    value={currentEarbudConfig.longPress}
                    onChange={(e) => handleUpdateEarbudAction(activeEarbudSide, 'longPress', e.target.value as HeadphoneActionType)}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-700 dark:text-slate-200 font-bold focus:outline-none focus:border-[#4da8ab]"
                  >
                    {Object.entries(ACTION_LABELS).map(([actionKey, actionData]) => (
                      <option key={actionKey} value={actionKey}>
                        {actionData.label} - ({actionData.desc})
                      </option>
                    ))}
                  </select>
                </div>

                {/* أزرار الهاردوير الخارجية (Next / Prev Key) */}
                <div className="pt-2">
                  <h4 className="text-[11px] font-bold text-slate-500 mb-2">أزرار البلوتوث الخارجية وسماعات الرأس:</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 space-y-1.5">
                      <span className="text-[10px] font-bold text-slate-600 dark:text-slate-300">زر التالي (Next Key):</span>
                      <select
                        value={currentSettings.nextButton}
                        onChange={(e) => handleUpdateHardwareButton('nextButton', e.target.value as HeadphoneActionType)}
                        className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-1.5 text-xs text-slate-700 dark:text-slate-200 font-bold"
                      >
                        {Object.entries(ACTION_LABELS).map(([k, v]) => (
                          <option key={k} value={k}>{v.label}</option>
                        ))}
                      </select>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 space-y-1.5">
                      <span className="text-[10px] font-bold text-slate-600 dark:text-slate-300">زر السابق (Previous Key):</span>
                      <select
                        value={currentSettings.prevButton}
                        onChange={(e) => handleUpdateHardwareButton('prevButton', e.target.value as HeadphoneActionType)}
                        className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-1.5 text-xs text-slate-700 dark:text-slate-200 font-bold"
                      >
                        {Object.entries(ACTION_LABELS).map(([k, v]) => (
                          <option key={k} value={k}>{v.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
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
