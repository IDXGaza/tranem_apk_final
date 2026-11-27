import React, { useRef, useEffect, useState } from 'react';
import { 
  Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, 
  Repeat, Shuffle, Bookmark, Share2, ListMusic, Maximize2, Minimize2, FileText
} from 'lucide-react';
import { Track, TimestampMarker } from '../types';

interface AudioPlayerProps {
  currentTrack: Track | null;
  isPlaying: boolean;
  onPlayPause: () => void;
  onNextTrack: () => void;
  onPrevTrack: () => void;
  onOpenShareModal: (track: Track) => void;
  onOpenTimestampsModal: (track: Track) => void;
  onOpenPlaylistModal?: () => void;
}

export const AudioPlayer: React.FC<AudioPlayerProps> = ({
  currentTrack,
  isPlaying,
  onPlayPause,
  onNextTrack,
  onPrevTrack,
  onOpenShareModal,
  onOpenTimestampsModal,
  onOpenPlaylistModal,
}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isLooping, setIsLooping] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showLyrics, setShowLyrics] = useState(false);

  // Sync HTML5 audio playback
  useEffect(() => {
    if (!audioRef.current || !currentTrack) return;

    if (isPlaying) {
      audioRef.current.play().catch((err) => console.warn('Audio play error', err));
    } else {
      audioRef.current.pause();
    }
  }, [isPlaying, currentTrack]);

  // Sync playback rate
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration || currentTrack?.duration || 0);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    setCurrentTime(time);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (audioRef.current) {
      audioRef.current.volume = val;
      setIsMuted(val === 0);
    }
  };

  const toggleMute = () => {
    if (audioRef.current) {
      const next = !isMuted;
      setIsMuted(next);
      audioRef.current.muted = next;
    }
  };

  const jumpToTimestamp = (time: number) => {
    setCurrentTime(time);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      if (!isPlaying) onPlayPause();
    }
  };

  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs < 0) return '00:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  if (!currentTrack) return null;

  return (
    <div className={`fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 backdrop-blur-md border-t border-emerald-900/50 shadow-2xl transition-all duration-300 ${isExpanded ? 'h-full flex flex-col justify-between p-6' : 'p-3 md:p-4'}`}>
      <audio
        ref={audioRef}
        src={currentTrack.audioUrl}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={onNextTrack}
        loop={isLooping}
      />

      {/* EXPANDED FULLSCREEN PLAYER VIEW */}
      {isExpanded ? (
        <div className="max-w-2xl mx-auto w-full flex-1 flex flex-col justify-between py-4">
          <div className="flex items-center justify-between text-slate-400">
            <button 
              onClick={() => setIsExpanded(false)} 
              className="p-2 hover:bg-slate-800 rounded-full text-slate-300 transition"
              title="تصغير المشغل"
            >
              <Minimize2 className="w-6 h-6" />
            </button>
            <span className="text-sm font-semibold tracking-wider text-emerald-400">مشغل الأناشيد</span>
            <button 
              onClick={() => setShowLyrics(!showLyrics)}
              className={`p-2 rounded-full transition ${showLyrics ? 'bg-emerald-600 text-white' : 'hover:bg-slate-800 text-slate-300'}`}
              title="الكلمات"
            >
              <FileText className="w-6 h-6" />
            </button>
          </div>

          {/* COVER & LYRICS VIEW */}
          <div className="my-6 flex-1 flex flex-col items-center justify-center relative min-h-[220px]">
            {showLyrics && currentTrack.lyrics ? (
              <div className="w-full h-64 overflow-y-auto p-4 bg-slate-800/80 rounded-2xl border border-slate-700/60 text-center text-slate-200 leading-relaxed font-['Tajawal'] text-lg whitespace-pre-line">
                {currentTrack.lyrics}
              </div>
            ) : (
              <div className="relative group w-48 h-48 md:w-64 md:h-64 rounded-3xl overflow-hidden shadow-2xl border-2 border-emerald-500/30">
                <img
                  src={currentTrack.coverUrl || 'https://images.unsplash.com/photo-1542816417-0983cbe82752?auto=format&fit=crop&q=80&w=600'}
                  alt={currentTrack.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent"></div>
              </div>
            )}
            
            <h2 className="mt-4 text-2xl font-bold text-white text-center">{currentTrack.title}</h2>
            <p className="text-emerald-400 font-medium text-center mt-1">{currentTrack.reciter}</p>
          </div>

          {/* TIMESTAMPS BAR IF ANY */}
          {currentTrack.timestamps && currentTrack.timestamps.length > 0 && (
            <div className="mb-4 overflow-x-auto py-2 flex items-center space-x-2 space-x-reverse no-scrollbar">
              <span className="text-xs text-slate-400 flex items-center shrink-0">
                <Bookmark className="w-3.5 h-3.5 ml-1 text-emerald-400" /> العلامات:
              </span>
              {currentTrack.timestamps.map((ts) => (
                <button
                  key={ts.id}
                  onClick={() => jumpToTimestamp(ts.time)}
                  className="px-3 py-1 bg-slate-800/80 hover:bg-emerald-900/60 border border-emerald-500/30 rounded-full text-xs text-emerald-300 transition shrink-0"
                >
                  {ts.title} ({formatTime(ts.time)})
                </button>
              ))}
            </div>
          )}

          {/* PROGRESS SLIDER */}
          <div className="w-full space-y-1">
            <input
              type="range"
              min={0}
              max={duration || 100}
              value={currentTime}
              onChange={handleSeek}
              className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
            />
            <div className="flex justify-between text-xs text-slate-400 font-mono">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          {/* CONTROLS */}
          <div className="mt-6 flex items-center justify-between">
            <button
              onClick={() => setIsLooping(!isLooping)}
              className={`p-2 rounded-full transition ${isLooping ? 'text-emerald-400 bg-emerald-950/60' : 'text-slate-400 hover:text-white'}`}
              title="تكرار"
            >
              <Repeat className="w-5 h-5" />
            </button>

            <div className="flex items-center space-x-4 space-x-reverse">
              <button onClick={onPrevTrack} className="p-3 text-slate-300 hover:text-white transition">
                <SkipForward className="w-7 h-7" />
              </button>

              <button
                onClick={onPlayPause}
                className="w-16 h-16 rounded-full bg-gradient-to-r from-emerald-500 to-teal-600 flex items-center justify-center text-slate-950 font-bold shadow-lg shadow-emerald-500/30 hover:scale-105 transition"
              >
                {isPlaying ? <Pause className="w-8 h-8 fill-slate-950" /> : <Play className="w-8 h-8 fill-slate-950 mr-1" />}
              </button>

              <button onClick={onNextTrack} className="p-3 text-slate-300 hover:text-white transition">
                <SkipBack className="w-7 h-7" />
              </button>
            </div>

            <button
              onClick={() => setPlaybackRate(playbackRate === 1 ? 1.25 : playbackRate === 1.25 ? 1.5 : 1)}
              className="px-2.5 py-1 text-xs font-bold bg-slate-800 text-emerald-400 rounded-md hover:bg-slate-700 transition"
              title="سرعة التشغيل"
            >
              {playbackRate}x
            </button>
          </div>
        </div>
      ) : (
        /* COMPACT BOTTOM PLAYER BAR */
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-2 md:gap-4">
          {/* TRACK INFO & COVER */}
          <div className="flex items-center space-x-3 space-x-reverse min-w-0 flex-1 md:flex-initial">
            <div 
              onClick={() => setIsExpanded(true)}
              className="relative w-12 h-12 md:w-14 md:h-14 rounded-xl overflow-hidden cursor-pointer shrink-0 border border-emerald-500/30 group"
            >
              <img
                src={currentTrack.coverUrl || 'https://images.unsplash.com/photo-1542816417-0983cbe82752?auto=format&fit=crop&q=80&w=600'}
                alt={currentTrack.title}
                className="w-full h-full object-cover group-hover:scale-110 transition"
              />
              <div className="absolute inset-0 bg-black/20 group-hover:bg-black/0 transition"></div>
            </div>

            <div className="min-w-0 flex-1">
              <h4 
                onClick={() => setIsExpanded(true)}
                className="text-sm md:text-base font-bold text-white truncate cursor-pointer hover:text-emerald-400 transition"
              >
                {currentTrack.title}
              </h4>
              <p className="text-xs text-slate-400 truncate">{currentTrack.reciter}</p>
            </div>
          </div>

          {/* MINI CONTROLS & SEEK BAR */}
          <div className="hidden md:flex flex-col items-center flex-1 max-w-md px-4 space-y-1">
            <div className="flex items-center space-x-4 space-x-reverse">
              <button onClick={onPrevTrack} className="text-slate-400 hover:text-white transition">
                <SkipForward className="w-5 h-5" />
              </button>

              <button
                onClick={onPlayPause}
                className="w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center text-slate-950 font-bold shadow-md hover:scale-105 transition"
              >
                {isPlaying ? <Pause className="w-5 h-5 fill-slate-950" /> : <Play className="w-5 h-5 fill-slate-950 mr-0.5" />}
              </button>

              <button onClick={onNextTrack} className="text-slate-400 hover:text-white transition">
                <SkipBack className="w-5 h-5" />
              </button>
            </div>

            <div className="w-full flex items-center space-x-2 space-x-reverse text-xs text-slate-400">
              <span>{formatTime(currentTime)}</span>
              <input
                type="range"
                min={0}
                max={duration || 100}
                value={currentTime}
                onChange={handleSeek}
                className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
              />
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          {/* ACTION BUTTONS & SHARE */}
          <div className="flex items-center space-x-1.5 md:space-x-3 space-x-reverse">
            <button
              onClick={onPlayPause}
              className="md:hidden w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center text-slate-950 font-bold shadow-md"
            >
              {isPlaying ? <Pause className="w-5 h-5 fill-slate-950" /> : <Play className="w-5 h-5 fill-slate-950 mr-0.5" />}
            </button>

            <button
              onClick={() => onOpenTimestampsModal(currentTrack)}
              className="p-2 text-slate-300 hover:text-emerald-400 hover:bg-slate-800 rounded-lg transition"
              title="العلامات الزمنية"
            >
              <Bookmark className="w-5 h-5" />
            </button>

            <button
              onClick={() => onOpenShareModal(currentTrack)}
              className="p-2 text-slate-300 hover:text-emerald-400 hover:bg-slate-800 rounded-lg transition"
              title="مشاركة الأنشودة مباشرة"
            >
              <Share2 className="w-5 h-5" />
            </button>

            <button
              onClick={() => setIsExpanded(true)}
              className="hidden md:flex p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition"
              title="توسيع"
            >
              <Maximize2 className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
