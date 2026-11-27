import React, { useState } from 'react';
import { X, Bookmark, Plus, Trash2, Clock, Check } from 'lucide-react';
import { Track, TimestampMarker } from '../types';

interface TimestampsModalProps {
  track: Track | null;
  isOpen: boolean;
  onClose: () => void;
  onSaveTimestamps: (trackId: string, timestamps: TimestampMarker[]) => void;
  onJumpToTime: (time: number) => void;
}

export const TimestampsModal: React.FC<TimestampsModalProps> = ({
  track,
  isOpen,
  onClose,
  onSaveTimestamps,
  onJumpToTime,
}) => {
  const [newTitle, setNewTitle] = useState('');
  const [newMinutes, setNewMinutes] = useState('');
  const [newSeconds, setNewSeconds] = useState('');
  const [newNote, setNewNote] = useState('');

  if (!isOpen || !track) return null;

  const handleAddMarker = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    const mins = parseInt(newMinutes || '0', 10);
    const secs = parseInt(newSeconds || '0', 10);
    const totalTime = mins * 60 + secs;

    const newMarker: TimestampMarker = {
      id: `ts-${Date.now()}`,
      time: totalTime,
      title: newTitle.trim(),
      note: newNote.trim() || undefined,
    };

    const updated = [...(track.timestamps || []), newMarker].sort((a, b) => a.time - b.time);
    onSaveTimestamps(track.id, updated);

    // Reset inputs
    setNewTitle('');
    setNewMinutes('');
    setNewSeconds('');
    setNewNote('');
  };

  const handleDeleteMarker = (markerId: string) => {
    const updated = (track.timestamps || []).filter((m) => m.id !== markerId);
    onSaveTimestamps(track.id, updated);
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg p-6 shadow-2xl relative max-h-[90vh] flex flex-col">
        <button
          onClick={onClose}
          className="absolute left-4 top-4 p-2 text-slate-400 hover:text-white rounded-full hover:bg-slate-800 transition"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center space-x-3 space-x-reverse mb-6 shrink-0">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <Bookmark className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">العلامات الزمنية</h3>
            <p className="text-xs text-slate-400">{track.title} - {track.reciter}</p>
          </div>
        </div>

        {/* ADD NEW MARKER FORM */}
        <form onSubmit={handleAddMarker} className="bg-slate-800/80 border border-slate-700/60 rounded-2xl p-4 mb-6 shrink-0 space-y-3">
          <h4 className="text-xs font-bold text-amber-400 tracking-wider">إضافة علامة جديدة</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input
              type="text"
              placeholder="عنوان العلامة (مثال: المقطع الثاني)"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              required
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
            />
            <div className="flex items-center space-x-2 space-x-reverse">
              <input
                type="number"
                placeholder="دقيقة"
                min="0"
                value={newMinutes}
                onChange={(e) => setNewMinutes(e.target.value)}
                className="w-1/2 px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 text-center"
              />
              <span className="text-slate-400 font-bold">:</span>
              <input
                type="number"
                placeholder="ثانية"
                min="0"
                max="59"
                value={newSeconds}
                onChange={(e) => setNewSeconds(e.target.value)}
                className="w-1/2 px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 text-center"
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-sm transition flex items-center justify-center space-x-2 space-x-reverse"
          >
            <Plus className="w-4 h-4" />
            <span>حفظ العلامة الزمنية</span>
          </button>
        </form>

        {/* LIST OF TIMESTAMPS */}
        <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
          {(!track.timestamps || track.timestamps.length === 0) ? (
            <div className="text-center py-8 text-slate-500 text-sm">
              لا توجد علامات زمنية مضافة لهذه الأنشودة بعد.
            </div>
          ) : (
            track.timestamps.map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between bg-slate-800/40 hover:bg-slate-800 border border-slate-700/40 rounded-xl p-3 transition group"
              >
                <div
                  onClick={() => {
                    onJumpToTime(m.time);
                    onClose();
                  }}
                  className="flex items-center space-x-3 space-x-reverse cursor-pointer flex-1 min-w-0"
                >
                  <span className="px-2.5 py-1 bg-amber-950/80 border border-amber-500/40 text-amber-300 rounded-lg font-mono text-xs font-bold">
                    {formatTime(m.time)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h5 className="font-semibold text-white text-sm truncate">{m.title}</h5>
                    {m.note && <p className="text-xs text-slate-400 truncate">{m.note}</p>}
                  </div>
                </div>

                <button
                  onClick={() => handleDeleteMarker(m.id)}
                  className="p-1.5 text-slate-500 hover:text-red-400 rounded-lg hover:bg-slate-700 transition opacity-80 group-hover:opacity-100"
                  title="حذف"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
