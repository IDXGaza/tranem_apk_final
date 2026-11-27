import React, { useState } from 'react';
import { 
  Play, Pause, Heart, Bookmark, Share2, Search, Trash2, Plus, 
  Music, Sparkles, Filter, Check, Clock
} from 'lucide-react';
import { Track } from '../types';

interface TrackListProps {
  tracks: Track[];
  currentTrack: Track | null;
  isPlaying: boolean;
  onSelectTrack: (track: Track) => void;
  onToggleFavorite: (trackId: string) => void;
  onDeleteTrack: (trackId: string) => void;
  onOpenShareModal: (track: Track) => void;
  onOpenTimestampsModal: (track: Track) => void;
  onOpenAddModal: () => void;
}

export const TrackList: React.FC<TrackListProps> = ({
  tracks,
  currentTrack,
  isPlaying,
  onSelectTrack,
  onToggleFavorite,
  onDeleteTrack,
  onOpenShareModal,
  onOpenTimestampsModal,
  onOpenAddModal,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('الكل');

  // Categories list
  const categories = ['الكل', 'المفضلة', 'مديح نبوي', 'ابتهالات', 'أناشيد روحانية', 'تلاوات خاشعة'];

  const filteredTracks = tracks.filter((track) => {
    const matchesSearch = 
      track.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      track.reciter.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    if (selectedCategory === 'الكل') return true;
    if (selectedCategory === 'المفضلة') return track.isFavorite;
    return track.category === selectedCategory;
  });

  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs <= 0) return '03:15';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-6 pb-28">
      {/* SEARCH BAR & ADD BUTTON */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <input
            type="text"
            placeholder="بحث عن أنشودة أو منشد..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-4 pr-10 py-3 bg-slate-900/90 border border-slate-800 rounded-2xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 shadow-inner"
          />
          <Search className="w-4 h-4 text-slate-500 absolute right-3.5 top-3.5" />
        </div>

        <button
          onClick={onOpenAddModal}
          className="w-full sm:w-auto px-5 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-bold rounded-2xl shadow-lg shadow-emerald-500/20 transition flex items-center justify-center space-x-2 space-x-reverse"
        >
          <Plus className="w-5 h-5 ml-1" />
          <span>إضافة أنشودة جديدة</span>
        </button>
      </div>

      {/* CATEGORY CHIPS */}
      <div className="flex items-center space-x-2 space-x-reverse overflow-x-auto pb-2 no-scrollbar">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition shrink-0 ${
              selectedCategory === cat
                ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                : 'bg-slate-900/80 hover:bg-slate-800 text-slate-400 border border-slate-800'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* TRACKS LIST */}
      <div className="grid grid-cols-1 gap-3">
        {filteredTracks.length === 0 ? (
          <div className="text-center py-16 bg-slate-900/40 border border-slate-800/80 rounded-3xl p-8 space-y-3">
            <Music className="w-12 h-12 text-slate-600 mx-auto" />
            <h4 className="text-base font-bold text-slate-300">لم يتم العثور على أناشيد</h4>
            <p className="text-xs text-slate-500">جرب البحث بكلمات أخرى أو إضافة أناشيد جديدة لمكتبتك</p>
          </div>
        ) : (
          filteredTracks.map((track, idx) => {
            const isSelected = currentTrack?.id === track.id;
            const isTrackPlaying = isSelected && isPlaying;

            return (
              <div
                key={track.id}
                className={`group flex items-center justify-between p-3 md:p-4 rounded-2xl border transition duration-200 ${
                  isSelected
                    ? 'bg-slate-800/90 border-emerald-500/50 shadow-lg shadow-emerald-950/40'
                    : 'bg-slate-900/60 hover:bg-slate-800/60 border-slate-800/80'
                }`}
              >
                {/* LEFT: COVER & TITLE */}
                <div 
                  onClick={() => onSelectTrack(track)}
                  className="flex items-center space-x-3.5 space-x-reverse flex-1 min-w-0 cursor-pointer"
                >
                  <div className="relative w-12 h-12 md:w-14 md:h-14 rounded-xl overflow-hidden shrink-0 border border-slate-700/60">
                    <img
                      src={track.coverUrl || 'https://images.unsplash.com/photo-1542816417-0983cbe82752?auto=format&fit=crop&q=80&w=600'}
                      alt={track.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition"
                    />
                    <div className={`absolute inset-0 flex items-center justify-center transition ${isSelected ? 'bg-black/40' : 'bg-black/20 group-hover:bg-black/40'}`}>
                      {isTrackPlaying ? (
                        <div className="flex items-end space-x-0.5 space-x-reverse h-4">
                          <span className="w-1 bg-emerald-400 animate-bounce h-full rounded-full"></span>
                          <span className="w-1 bg-emerald-400 animate-bounce h-2/3 rounded-full delay-75"></span>
                          <span className="w-1 bg-emerald-400 animate-bounce h-4/5 rounded-full delay-150"></span>
                        </div>
                      ) : (
                        <Play className="w-5 h-5 text-white fill-white opacity-80 group-hover:opacity-100 transition" />
                      )}
                    </div>
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center space-x-2 space-x-reverse">
                      <h4 className={`font-bold text-sm md:text-base truncate ${isSelected ? 'text-emerald-400' : 'text-white'}`}>
                        {track.title}
                      </h4>
                      {track.category && (
                        <span className="hidden sm:inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700/60">
                          {track.category}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 truncate mt-0.5">{track.reciter}</p>
                    
                    {/* TIMESTAMPS COUNTER BADGE */}
                    {track.timestamps && track.timestamps.length > 0 && (
                      <div className="mt-1 flex items-center space-x-1 space-x-reverse text-[11px] text-amber-400">
                        <Bookmark className="w-3 h-3 fill-amber-400/20" />
                        <span>{track.timestamps.length} علامات زمنية</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* RIGHT: DURATION & ACTIONS */}
                <div className="flex items-center space-x-1 md:space-x-2 space-x-reverse shrink-0 mr-2">
                  <span className="hidden md:inline-block text-xs font-mono text-slate-500 pl-2">
                    {formatTime(track.duration)}
                  </span>

                  <button
                    onClick={() => onToggleFavorite(track.id)}
                    className={`p-2 rounded-xl transition ${
                      track.isFavorite
                        ? 'text-rose-500 hover:bg-rose-950/40'
                        : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'
                    }`}
                    title="إضافة للمفضلة"
                  >
                    <Heart className={`w-4 h-4 ${track.isFavorite ? 'fill-rose-500' : ''}`} />
                  </button>

                  <button
                    onClick={() => onOpenTimestampsModal(track)}
                    className="p-2 text-slate-400 hover:text-amber-400 hover:bg-slate-800 rounded-xl transition"
                    title="العلامات الزمنية"
                  >
                    <Bookmark className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => onOpenShareModal(track)}
                    className="p-2 text-slate-400 hover:text-emerald-400 hover:bg-slate-800 rounded-xl transition"
                    title="مشاركة الأنشودة مباشرة"
                  >
                    <Share2 className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => onDeleteTrack(track.id)}
                    className="p-2 text-slate-500 hover:text-red-400 hover:bg-slate-800 rounded-xl transition opacity-0 group-hover:opacity-100"
                    title="حذف"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
