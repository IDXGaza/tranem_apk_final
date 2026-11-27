import React, { useState } from 'react';
import { X, Share2, Download, Check, AlertCircle, Music } from 'lucide-react';
import { Track } from '../types';
import { shareTrackAudio } from '../services/shareService';

interface ShareTrackModalProps {
  track: Track | null;
  isOpen: boolean;
  onClose: () => void;
  onShowToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
}

export const ShareTrackModal: React.FC<ShareTrackModalProps> = ({
  track,
  isOpen,
  onClose,
  onShowToast,
}) => {
  const [isSharing, setIsSharing] = useState(false);

  if (!isOpen || !track) return null;

  const handleNativeOrDirectShare = async () => {
    setIsSharing(true);
    try {
      const result = await shareTrackAudio(track);
      if (result.success) {
        if (result.method === 'download') {
          onShowToast('تم تنزيل الملف الصوتي مباشرة لمشاركته', 'success');
        } else {
          onShowToast('تم تجهيز الملف الصوتي للمشاركة', 'success');
        }
        onClose();
      } else {
        onShowToast(result.message || 'حدث خطأ أثناء المشاركة', 'error');
      }
    } catch (err: any) {
      onShowToast('تعذرت المشاركة، جاري التنزيل المباشر للملف', 'info');
    } finally {
      setIsSharing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md p-6 shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute left-4 top-4 p-2 text-slate-400 hover:text-white rounded-full hover:bg-slate-800 transition"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center space-x-3 space-x-reverse mb-6">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <Share2 className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">مشاركة الأنشودة</h3>
            <p className="text-xs text-slate-400">مشاركة ملف صوتي مباشر أو تنزيل</p>
          </div>
        </div>

        {/* TRACK CARD PREVIEW */}
        <div className="bg-slate-800/80 border border-slate-700/60 rounded-2xl p-4 mb-6 flex items-center space-x-4 space-x-reverse">
          <div className="w-16 h-16 rounded-xl overflow-hidden shrink-0 border border-emerald-500/30">
            <img
              src={track.coverUrl || 'https://images.unsplash.com/photo-1542816417-0983cbe82752?auto=format&fit=crop&q=80&w=600'}
              alt={track.title}
              className="w-full h-full object-cover"
            />
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="font-bold text-white truncate">{track.title}</h4>
            <p className="text-xs text-emerald-400 mt-0.5">{track.reciter}</p>
            <p className="text-xs text-slate-400 mt-1">{track.category} • {track.timestamps?.length || 0} علامات زمنية</p>
          </div>
        </div>

        {/* SHARE OPTIONS */}
        <div className="space-y-3">
          <button
            onClick={handleNativeOrDirectShare}
            disabled={isSharing}
            className="w-full py-3.5 px-4 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-bold rounded-2xl shadow-lg shadow-emerald-500/20 flex items-center justify-center space-x-2 space-x-reverse transition disabled:opacity-50"
          >
            {isSharing ? (
              <div className="w-5 h-5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <>
                <Share2 className="w-5 h-5" />
                <span>مشاركة مباشرة كملف صوتي (واتساب، تليجرام...)</span>
              </>
            )}
          </button>

          <p className="text-xs text-slate-400 text-center leading-relaxed">
            يتم تجهيز الملف الصوتي لإرساله مباشرة كـ Audio File وليس مجرد رابط.
          </p>
        </div>
      </div>
    </div>
  );
};
