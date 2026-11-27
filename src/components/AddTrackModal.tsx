import React, { useState } from 'react';
import { X, Upload, Music, Image as ImageIcon, Plus } from 'lucide-react';
import { Track } from '../types';
import { dbService } from '../services/db';

interface AddTrackModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddTrack: (track: Track) => void;
  onShowToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
}

export const AddTrackModal: React.FC<AddTrackModalProps> = ({
  isOpen,
  onClose,
  onAddTrack,
  onShowToast,
}) => {
  const [title, setTitle] = useState('');
  const [reciter, setReciter] = useState('');
  const [category, setCategory] = useState('أناشيد روحانية');
  const [lyrics, setLyrics] = useState('');
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [coverUrl, setCoverUrl] = useState('');
  const [isUploading, setIsUploading] = useState(false);

  if (!isOpen) return null;

  const handleAudioFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setAudioFile(e.target.files[0]);
    }
  };

  const handleCoverFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = () => {
        setCoverUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !audioFile) {
      onShowToast('يرجى تحديد عنوان الأنشودة واختيار الملف الصوتي', 'error');
      return;
    }

    setIsUploading(true);

    try {
      const audioBlobKey = `audio_blob_${Date.now()}`;
      await dbService.saveAudioBlob(audioBlobKey, audioFile);

      // Create blob URL for instant audio playback
      const audioUrl = URL.createObjectURL(audioFile);

      // Estimate audio duration or use default 180s until metadata loads
      const newTrack: Track = {
        id: `track-${Date.now()}`,
        title: title.trim(),
        reciter: reciter.trim() || 'منشد غير معروف',
        category: category || 'أناشيد روحانية',
        audioUrl,
        audioBlobKey,
        coverUrl: coverUrl || 'https://images.unsplash.com/photo-1542816417-0983cbe82752?auto=format&fit=crop&q=80&w=600',
        duration: 180,
        isFavorite: false,
        timestamps: [],
        lyrics: lyrics.trim() || undefined,
        createdAt: Date.now(),
        fileSize: audioFile.size,
      };

      onAddTrack(newTrack);
      onShowToast('تمت إضافة الأنشودة وحفظ الملف بنجاح', 'success');

      // Reset form
      setTitle('');
      setReciter('');
      setLyrics('');
      setAudioFile(null);
      setCoverUrl('');
      onClose();
    } catch (err: any) {
      onShowToast('حدث خطأ أثناء حفظ الملف الصوتي', 'error');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute left-4 top-4 p-2 text-slate-400 hover:text-white rounded-full hover:bg-slate-800 transition"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center space-x-3 space-x-reverse mb-6">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <Plus className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">إضافة أنشودة جديدة</h3>
            <p className="text-xs text-slate-400">رفع ملف MP3 وحفظه محلياً وفي السحابة</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">الملف الصوتي (MP3/WAV/M4A) *</label>
            <div className="relative border-2 border-dashed border-slate-700 hover:border-emerald-500/60 rounded-2xl p-4 text-center cursor-pointer transition bg-slate-800/40">
              <input
                type="file"
                accept="audio/*"
                onChange={handleAudioFileChange}
                required
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
              <Music className="w-8 h-8 mx-auto text-emerald-400 mb-2" />
              <p className="text-sm font-semibold text-white">
                {audioFile ? audioFile.name : 'اضغط لاختيار ملف الصوت'}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                {audioFile ? `${(audioFile.size / (1024 * 1024)).toFixed(2)} ميجابايت` : 'يدعم MP3, M4A, WAV'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">عنوان الأنشودة *</label>
              <input
                type="text"
                placeholder="عنوان الأنشودة"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">المنشد / القارئ</label>
              <input
                type="text"
                placeholder="اسم المنشد"
                value={reciter}
                onChange={(e) => setReciter(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">التصنيف</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:border-emerald-500"
              >
                <option value="أناشيد روحانية">أناشيد روحانية</option>
                <option value="مديح نبوي">مديح نبوي</option>
                <option value="ابتهالات">ابتهالات</option>
                <option value="تلاوات خاشعة">تلاوات خاشعة</option>
                <option value="أخرى">أخرى</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">صورة الغلاف (اختياري)</label>
              <div className="relative border border-slate-700 rounded-xl p-2 bg-slate-800 flex items-center space-x-2 space-x-reverse">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleCoverFileChange}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
                <ImageIcon className="w-5 h-5 text-slate-400 shrink-0" />
                <span className="text-xs text-slate-300 truncate">
                  {coverUrl ? 'تم اختيار صورة' : 'اختر صورة للأنشودة'}
                </span>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">كلمات الأنشودة (اختياري)</label>
            <textarea
              rows={3}
              placeholder="أدخل كلمات الأنشودة هنا..."
              value={lyrics}
              onChange={(e) => setLyrics(e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 resize-none"
            ></textarea>
          </div>

          <button
            type="submit"
            disabled={isUploading}
            className="w-full py-3 px-4 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-bold rounded-2xl shadow-lg shadow-emerald-500/20 transition disabled:opacity-50 flex items-center justify-center space-x-2 space-x-reverse"
          >
            {isUploading ? (
              <div className="w-5 h-5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <>
                <Upload className="w-5 h-5" />
                <span>حفظ الأنشودة في المكتبة</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
