
import React from 'react';
import { 
  Heart, 
  Repeat, 
  RotateCcw, 
  RotateCw, 
  Play, 
  Pause, 
  Flag,
  Headphones
} from 'lucide-react';
import { Track, PlayerState } from '../types';

interface PlayerProps {
  track: Track | null;
  state: PlayerState;
  onPlayPause: () => void;
  onSeek: (time: number) => void;
  onSkip: (seconds: number) => void;
  onRateChange: (rate: number) => void;
  onToggleFavorite: () => void;
  onToggleLoop: () => void;
  onAddTimestamp: () => void;
  onOpenHeadphones?: () => void;
  isHeadsetConnected?: boolean;
  hasError?: boolean;
}

const formatTime = (time: number) => {
  if (isNaN(time) || !isFinite(time)) return "0:00";
  const min = Math.floor(time / 60);
  const sec = Math.floor(time % 60);
  return `${min}:${sec.toString().padStart(2, '0')}`;
};

const Player: React.FC<PlayerProps> = ({ 
  track, state, onPlayPause, onSeek, onSkip, onToggleFavorite, onToggleLoop, onAddTimestamp, onOpenHeadphones, isHeadsetConnected, hasError 
}) => {
  if (!track) return null;

  const safeDuration = track.duration && isFinite(track.duration) && !isNaN(track.duration) ? track.duration : Math.max(state.currentTime, 100);
  
  return (
    <div className={`w-full flex flex-col py-4 px-5 md:px-10 transition-all duration-500 ${hasError ? 'opacity-30 pointer-events-none' : 'opacity-100'}`}>
      
      <div className="w-full flex items-center gap-3 mb-3">
        <span className="text-[9px] md:text-[10px] font-black text-slate-400 dark:text-slate-500 tabular-nums w-8 text-right">
          {formatTime(state.currentTime)}
        </span>
        <div className="flex-1 relative h-6 flex items-center touch-none group">
          <input 
            type="range" min={0} max={safeDuration} value={state.currentTime} 
            onChange={(e) => onSeek(Number(e.target.value))}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
            style={{ direction: 'rtl' }}
            disabled={hasError || state.isLoading}
          />
          <div className="w-full h-1.5 bg-slate-100/50 dark:bg-slate-800/50 rounded-full relative overflow-hidden">
            <div 
              className={`absolute right-0 top-0 h-full bg-[#4da8ab] rounded-full transition-all duration-200 ${state.isLoading ? 'animate-pulse' : ''}`} 
              style={{ width: `${(state.currentTime / safeDuration) * 100}%` }} 
            />
          </div>
          <div 
            className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-white dark:bg-slate-100 border-2 border-[#4da8ab] rounded-full shadow-md pointer-events-none transition-all group-hover:scale-125"
            style={{ right: `calc(${(state.currentTime / safeDuration) * 100}% - 7px)` }}
          />
        </div>
        <span className="text-[9px] md:text-[10px] font-black text-slate-400 dark:text-slate-500 tabular-nums w-8 text-left">
          {track.duration && isFinite(track.duration) ? formatTime(track.duration) : "0:00"}
        </span>
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 md:gap-2 flex-1 justify-start">
          <button onClick={onToggleFavorite} className={`p-2 transition-all active:scale-90 ${track.isFavorite ? 'text-rose-500' : 'text-slate-300 dark:text-slate-600 hover:text-rose-400'}`}>
            <Heart className="w-5 h-5 md:w-6 md:h-6" fill={track.isFavorite ? "currentColor" : "none"} strokeWidth={2.5} />
          </button>

          <button onClick={onToggleLoop} className={`p-2 transition-all active:scale-90 ${state.isLooping ? 'text-[#4da8ab]' : 'text-slate-300 dark:text-slate-600 hover:text-[#4da8ab]/50'}`} title="تكرار النشيد">
            <Repeat className="w-5 h-5 md:w-6 md:h-6" strokeWidth={2.5} />
          </button>
        </div>

        <div className="flex items-center justify-center gap-3 md:gap-8">
          <button onClick={() => onSkip(-10)} className="text-slate-300 dark:text-slate-600 hover:text-slate-600 dark:hover:text-slate-300 p-2 active:scale-90 transition-all flex flex-col items-center justify-center" disabled={hasError || state.isLoading}>
            <RotateCw className="w-5 h-5 md:w-7 md:h-7" strokeWidth={2.5} />
            <span className="text-[8px] font-black mt-0.5">10</span>
          </button>

          <button onClick={onPlayPause} className={`w-12 h-12 md:w-16 md:h-16 rounded-2xl md:rounded-[24px] flex items-center justify-center shadow-xl md:shadow-2xl active:scale-95 transition-all ${hasError ? 'bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-600' : 'bg-[#4da8ab] text-white'}`} disabled={hasError}>
            {state.isLoading ? (
              <div className="w-5 h-5 md:w-6 md:h-6 border-2 md:border-3 border-white/30 border-t-white rounded-full animate-spin" />
            ) : state.isPlaying ? (
              <Pause className="w-6 h-6 md:w-8 md:h-8 fill-current" />
            ) : (
              <Play className="w-6 h-6 md:w-8 md:h-8 fill-current translate-x-[1px]" />
            )}
          </button>

          <button onClick={() => onSkip(10)} className="text-slate-300 dark:text-slate-600 hover:text-slate-600 dark:hover:text-slate-300 p-2 active:scale-90 transition-all flex flex-col items-center justify-center" disabled={hasError || state.isLoading}>
            <RotateCcw className="w-5 h-5 md:w-7 md:h-7" strokeWidth={2.5} />
            <span className="text-[8px] font-black mt-0.5">10</span>
          </button>
        </div>

        <div className="flex items-center justify-end gap-1 md:gap-2 flex-1">
          {onOpenHeadphones && (
            <button 
              onClick={onOpenHeadphones} 
              className={`p-2.5 md:p-3 rounded-xl md:rounded-2xl active:scale-90 transition-all ${
                isHeadsetConnected 
                  ? 'text-[#4da8ab] bg-[#4da8ab]/10 hover:bg-[#4da8ab]/20' 
                  : 'text-slate-300 dark:text-slate-600 hover:text-[#4da8ab]'
              }`} 
              title="التحكم بالسماعات والأزرار"
            >
              <Headphones className="w-5 h-5 md:w-6 md:h-6" strokeWidth={2.2} />
            </button>
          )}

          <button onClick={onAddTimestamp} className="p-2.5 md:p-3 text-[#4da8ab] bg-[#4da8ab]/5 dark:bg-[#4da8ab]/10 hover:bg-[#4da8ab]/10 dark:hover:bg-[#4da8ab]/20 rounded-xl md:rounded-2xl active:scale-90 transition-all" disabled={hasError || state.isLoading}>
            <Flag className="w-5 h-5 md:w-6 md:h-6" strokeWidth={2.5} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default Player;
