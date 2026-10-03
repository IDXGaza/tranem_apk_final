import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import MarqueeText from './MarqueeText';
import { Capacitor } from '@capacitor/core';
import { 
  Plus, 
  Mic, 
  Search, 
  Music, 
  Trash2, 
  Check, 
  Heart, 
  X, 
  Shuffle, 
  AlertCircle,
  GripVertical
} from 'lucide-react';
import { Track } from '../types';
import { normalizeArabic } from '../utils/arabicNormalization';

interface SidebarProps {
  onImport: (file: File, durationOverride?: number, sourceType?: 'record' | 'import') => void;
  onRemove: (id: string) => void;
  onMove: (fromIndex: number, toIndex: number) => void;
  onReorderEnd?: () => void;
  onToggleSourceType: (id: string, explicitType?: 'record' | 'import') => void;
  defaultView: 'all' | 'record' | 'import';
  setDefaultView: (view: 'all' | 'record' | 'import') => void;
  tracks: Track[];
  currentId: string | null;
  onSelect: (index: number) => void;
  onPlayRandom: () => void;
  isOpen?: boolean;
  onClose?: () => void;
  className?: string;
  // new recording props
  isRecording?: boolean;
  onStartRecording?: () => void;
  showBackupReminder?: boolean;
  onOpenBackup?: () => void;
  onEditTrack?: (track: Track) => void;
  isLoading?: boolean;
}

const DropPlaceholder = () => (
  <motion.div 
    initial={{ opacity: 0, height: 0 }}
    animate={{ opacity: 1, height: 6 }}
    exit={{ opacity: 0, height: 0 }}
    className="bg-[#4da8ab] rounded-full w-full my-1.5 shadow-[0_0_12px_rgba(77,168,171,0.5)]" 
  />
);

const Sidebar: React.FC<SidebarProps> = ({ 
  onImport, onRemove, onMove, onReorderEnd, onToggleSourceType, defaultView, setDefaultView, tracks, currentId, onSelect, onPlayRandom, isOpen = false, onClose,
  isRecording, onStartRecording, showBackupReminder, onOpenBackup, onEditTrack, isLoading = false, className
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [view, setView] = useState<'all' | 'record' | 'import'>(defaultView);
  const [draggedItemIndex, setDraggedItemIndex] = useState<number | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null); 
  const lastTargetIndex = useRef<number | null>(null);
  const [openMenuTrackId, setOpenMenuTrackId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Touch reordering refs & states
  const touchStartY = useRef<number>(0);
  const touchStartIndex = useRef<number | null>(null);
  const longPressTimeout = useRef<number | null>(null);
  const [activeTouchDragIndex, setActiveTouchDragIndex] = useState<number | null>(null);
  const isLongPressed = useRef<boolean>(false);

  const navRef = useRef<HTMLElement>(null);
  const scrollIntervalId = useRef<number | null>(null);

  const startAutoScroll = useCallback((direction: 'up' | 'down') => {
    if (scrollIntervalId.current) return;
    scrollIntervalId.current = window.setInterval(() => {
      if (navRef.current) {
        navRef.current.scrollTop += direction === 'down' ? 15 : -15;
      }
    }, 20);
  }, []);

  const stopAutoScroll = useCallback(() => {
    if (scrollIntervalId.current) {
      clearInterval(scrollIntervalId.current);
      scrollIntervalId.current = null;
    }
  }, []);

  const filteredTracksWithIndices = React.useMemo(() => tracks
    .map((track, originalIndex) => ({ track, originalIndex }))
    .filter(item => {
      const normalizedSearch = normalizeArabic(searchTerm);
      const matchesType = view === 'all' || 
                         (view === 'record' && item.track.sourceType === 'record') ||
                         (view === 'import' && (item.track.sourceType === 'import' || !item.track.sourceType));

      if (!normalizedSearch) return matchesType;
                         
      const searchWords = normalizedSearch.split(/\s+/);
      const trackNameNormalized = normalizeArabic(item.track.name);
      const trackArtistNormalized = normalizeArabic(item.track.artist || "");
      
      const matchesSearch = searchWords.every(word => 
        trackNameNormalized.includes(word) || trackArtistNormalized.includes(word)
      );
      
      return matchesSearch && matchesType;
    })
    .sort((a, b) => {
      // Prioritize favorites at the top of the list
      const aFav = a.track.isFavorite ? 1 : 0;
      const bFav = b.track.isFavorite ? 1 : 0;
      if (aFav !== bFav) {
        return bFav - aFav;
      }
      // Respect literal user order within favorites / non-favorites
      return (a.track.order ?? 0) - (b.track.order ?? 0);
    }), [tracks, searchTerm, view]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach(file => {
      onImport(file, undefined, 'import');
    });

    if (onClose) onClose();
    
    e.target.value = '';
  };

  const onDragStart = (e: React.DragEvent, index: number) => {
    setDraggedItemIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleTouchStart = (e: React.TouchEvent, originalIndex: number) => {
    if (isRecording) return;
    
    const target = e.target as HTMLElement;
    const isHandle = target.closest('.reorder-handle');
    
    // Only drag if the touch starts on the handle
    if (!isHandle) return;
    
    touchStartY.current = e.touches[0].clientY;
    touchStartIndex.current = originalIndex;
    isLongPressed.current = true; // Make it immediate
    
    setDraggedItemIndex(originalIndex);
    setActiveTouchDragIndex(originalIndex);
    
    if (navigator.vibrate) {
      try {
        navigator.vibrate(40);
      } catch (_) {}
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (isRecording || touchStartIndex.current === null || !isLongPressed.current) return;
    
    if (e.cancelable) {
      e.preventDefault();
      e.stopPropagation();
    }

    const touch = e.touches[0];

    // Scroll logic
    if (navRef.current) {
      const { top, bottom } = navRef.current.getBoundingClientRect();
      const threshold = 60;
      if (touch.clientY < top + threshold) {
        startAutoScroll('up');
      } else if (touch.clientY > bottom - threshold) {
        startAutoScroll('down');
      } else {
        stopAutoScroll();
      }
    }

    // Drop target logic
    const targetEl = document.elementFromPoint(touch.clientX, touch.clientY);
    if (!targetEl) return;

    let element: HTMLElement | null = targetEl as HTMLElement;
    let targetIndexStr: string | null = null;
    while (element && element !== document.body) {
      targetIndexStr = element.getAttribute('data-index');
      if (targetIndexStr !== null) break;
      element = element.parentElement;
    }

    if (targetIndexStr !== null) {
      const targetIndex = parseInt(targetIndexStr, 10);
      if (!isNaN(targetIndex) && targetIndex !== touchStartIndex.current && targetIndex !== lastTargetIndex.current) {
        setDropTargetIndex(targetIndex);
        lastTargetIndex.current = targetIndex;
      }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    stopAutoScroll();
    if (longPressTimeout.current) {
      clearTimeout(longPressTimeout.current);
      longPressTimeout.current = null;
    }

    if (isLongPressed.current && touchStartIndex.current !== null && dropTargetIndex !== null) {
      onMove(touchStartIndex.current, dropTargetIndex);
    }
    
    touchStartIndex.current = null;
    lastTargetIndex.current = null;
    isLongPressed.current = false;
    setDraggedItemIndex(null);
    setActiveTouchDragIndex(null);
    setDropTargetIndex(null);
    if (onReorderEnd) onReorderEnd();
  };

  const onDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedItemIndex !== null && draggedItemIndex !== index) {
      setDropTargetIndex(index);
    }
    if (!navRef.current) return;

    const { top, bottom } = navRef.current.getBoundingClientRect();
    const threshold = 60;
    const y = e.clientY;

    if (y < top + threshold) {
       startAutoScroll('up');
    } else if (y > bottom - threshold) {
       startAutoScroll('down');
    } else {
       stopAutoScroll();
    }
  };

  const onDrop = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    stopAutoScroll();
    if (draggedItemIndex !== null && draggedItemIndex !== index) {
      onMove(draggedItemIndex, index);
    }
    setDraggedItemIndex(null);
    setDropTargetIndex(null);
  };

  const onDragEnd = () => {
    stopAutoScroll();
    setDraggedItemIndex(null);
    setDropTargetIndex(null);
    if (onReorderEnd) onReorderEnd();
  };

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[60] lg:hidden" 
            onClick={onClose} 
          />
        )}
      </AnimatePresence>
      
      <motion.aside 
        initial={false}
        animate={{ 
          x: isOpen ? 0 : '100%',
        }}
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.05}
        onDragEnd={(_, info) => {
          if (info.offset.x > 80 && isOpen) {
            onClose?.();
          }
        }}
        transition={{ 
          type: "spring", 
          damping: 25, 
          stiffness: 220,
        }}
        className={`${className || 'fixed inset-y-0 right-0 h-full w-[85%] sm:w-[400px] shadow-[0_0_50px_rgba(0,0,0,0.3)] dark:shadow-[0_0_60px_rgba(0,0,0,0.6)] z-[200]'} h-full bg-white dark:bg-slate-950 border-l border-slate-200 dark:border-slate-800 flex flex-col ${isOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'}`}
      >
        <div className="pt-6 px-6 pb-2 shrink-0 space-y-4">
          <div className="flex items-center justify-between pb-1">
            <h1 className="text-3xl font-black text-[#4da8ab] tracking-tight">ترانيم</h1>
            <button onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-all">
              <X className="w-6 h-6" />
            </button>
          </div>
          
          <div className="flex gap-3 w-full">
            <div className="flex-1 relative h-12">
              <div className={`w-full h-full bg-[#4da8ab] hover:bg-[#3d8c8e] text-white font-bold rounded-2xl transition-all shadow-lg flex items-center justify-center gap-2 text-sm ${isRecording ? 'opacity-50 pointer-events-none' : 'cursor-pointer active:scale-95'}`}>
                <Plus className="w-5 h-5" />
                <span>استيراد</span>
              </div>
              <input 
                type="file" 
                multiple
                className={`absolute inset-0 w-full h-full opacity-0 z-10 ${isRecording ? 'pointer-events-none' : 'cursor-pointer'}`} 
                accept="audio/*" 
                onChange={handleFileChange} 
                disabled={isRecording}
              />
            </div>

            <button 
              onClick={() => {
                if (onStartRecording) onStartRecording();
                if (onClose) onClose();
              }}
              disabled={isRecording}
              className={`flex-1 h-12 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-2xl transition-all shadow-lg flex items-center justify-center gap-2 text-sm active:scale-95 ${isRecording ? 'opacity-50 pointer-events-none' : ''}`}
            >
              <Mic className={`w-5 h-5 ${isRecording ? 'text-rose-500 animate-pulse' : ''}`} />
              <span>{isRecording ? 'يسجل...' : 'تسجيل'}</span>
            </button>
          </div>

          <button 
            onClick={() => { onPlayRandom(); if (onClose) onClose(); }}
            disabled={isRecording || tracks.length === 0}
            className="w-full h-10 bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold rounded-xl transition-all flex items-center justify-center gap-2 text-xs active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
          >
            <Shuffle className="w-4 h-4" />
            <span>تجربة عشوائية</span>
          </button>

          <div className="relative group">
            <input 
              type="text"
              placeholder="بحث عن نشيد..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl py-2.5 pr-10 pl-10 text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#4da8ab]/20 transition-all placeholder:text-slate-400 dark:placeholder:text-slate-600"
            />
            <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300 group-focus-within:text-[#4da8ab] transition-colors" />
            
            {searchTerm && (
              <button 
                onClick={() => setSearchTerm('')}
                className="absolute left-3 top-1/2 -translate-y-1/2 p-1 text-slate-300 hover:text-slate-500 dark:text-slate-700 dark:hover:text-slate-500 transition-colors pointer-events-auto"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          
          <div className="flex gap-2 p-1 bg-slate-100 dark:bg-slate-900 rounded-xl">
             {[
               {id: 'all', label: 'الكل'}, 
               {id: 'record', label: 'تسجيلات'}, 
               {id: 'import', label: 'مستوردة'}
             ].map(v => (
               <button 
                 key={v.id} 
                 onClick={() => {
                   setView(v.id as any);
                   setDefaultView(v.id as any);
                 }}
                 className={`flex-1 text-[10px] font-bold py-1.5 rounded-lg transition-all ${
                   view === v.id 
                     ? 'bg-white dark:bg-slate-800 shadow-sm text-[#4da8ab]' 
                     : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                 }`}
               >
                 {v.label}
               </button>
             ))}
          </div>
        </div>

        <nav ref={navRef} className="flex-1 min-h-0 overflow-y-auto px-5 pb-36 space-y-4 pt-4 custom-scrollbar overscroll-contain">
          {showBackupReminder && (
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-4 p-4 rounded-3xl bg-gradient-to-br from-indigo-500 to-indigo-700 text-white shadow-lg overflow-hidden relative"
            >
              <div className="flex items-start gap-3 relative z-10">
                <div className="p-2 bg-white/20 rounded-xl">
                  <AlertCircle className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1 text-right">
                  <p className="text-sm font-black mb-1">تذكير بالنسخ الاحتياطي 🔄</p>
                  <p className="text-[10px] font-bold opacity-90 leading-relaxed">
                    لقد أضفت أكثر من 5 أناشيد جديدة منذ آخر نسخة. نوصيك بحفظ نسخة الآن.
                  </p>
                  <button 
                    onClick={onOpenBackup}
                    className="mt-3 w-full py-2.5 bg-white text-indigo-600 rounded-xl text-[11px] font-black hover:bg-white/90 active:scale-95 transition-all"
                  >
                    فتح مركز النسخ الاحتياطي
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          <div className="flex items-center gap-2 text-slate-300 dark:text-slate-700 px-2 opacity-50">
            <span className="text-[9px] font-black uppercase tracking-[0.2em]">مكتبتك</span>
            <div className="flex-1 h-px bg-slate-100 dark:bg-slate-900" />
          </div>
          
          <div className="space-y-3">
            {isLoading && tracks.length === 0 ? (
              <div className="space-y-2.5 animate-pulse py-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <div key={n} className="flex items-center gap-3 p-2.5 rounded-[22px] bg-slate-100/70 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800/60">
                    <div className="w-11 h-11 rounded-xl bg-slate-200 dark:bg-slate-800 shrink-0" />
                    <div className="flex-1 space-y-2 text-right">
                      <div className="h-3.5 bg-slate-200 dark:bg-slate-800 rounded-md w-3/4 mr-auto" />
                      <div className="h-2.5 bg-slate-200/70 dark:bg-slate-800/70 rounded-md w-1/2 mr-auto" />
                    </div>
                  </div>
                ))}
              </div>
            ) : tracks.length === 0 ? (
              <div className="px-6 py-12 text-center bg-slate-50 dark:bg-slate-900/50 rounded-3xl border-2 border-dashed border-slate-100 dark:border-slate-800">
                <Music className="w-8 h-8 text-slate-300 dark:text-slate-700 mx-auto mb-3 opacity-50" />
                <p className="text-[10px] text-slate-400 font-bold">لا توجد ملفات حالياً</p>
              </div>
            ) : (
              filteredTracksWithIndices.map((item) => (
                <React.Fragment key={item.track.id}>
                  {dropTargetIndex === item.originalIndex && draggedItemIndex !== null && draggedItemIndex > item.originalIndex && (
                    <DropPlaceholder />
                  )}
                  <div 
                    draggable
                    data-index={item.originalIndex}
                    onDragStart={(e) => onDragStart(e, item.originalIndex)}
                    onDragOver={(e) => onDragOver(e, item.originalIndex)}
                    onDrop={(e) => onDrop(e, item.originalIndex)}
                    onDragEnd={onDragEnd}
                    onTouchStart={(e) => handleTouchStart(e, item.originalIndex)}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleTouchEnd}
                    className={`group flex items-center gap-2 transition-all select-none rounded-3xl p-1 border ${
                      draggedItemIndex === item.originalIndex || activeTouchDragIndex === item.originalIndex
                        ? 'opacity-40 scale-[0.98] bg-[#4da8ab]/10 border-dashed border-[#4da8ab]' 
                        : 'border-transparent'
                    }`}
                  >
                  <div className="relative reorder-handle cursor-grab active:cursor-grabbing">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenMenuTrackId(openMenuTrackId === item.track.id ? null : item.track.id);
                      }}
                      className={`p-2 text-slate-300 dark:text-slate-800 hover:text-[#4da8ab] rounded-full transition-colors ${openMenuTrackId === item.track.id ? 'text-[#4da8ab] bg-[#4da8ab]/10' : ''}`}
                    >
                      <GripVertical className="w-5 h-5" />
                    </button>

                    <AnimatePresence>
                      {openMenuTrackId === item.track.id && (
                        <>
                          <div 
                            className="fixed inset-0 z-[190]" 
                            onClick={(e) => { e.stopPropagation(); setOpenMenuTrackId(null); }} 
                          />
                          <motion.div 
                            initial={{ opacity: 0, scale: 0.95, y: -10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: -10 }}
                            className="absolute right-0 mt-3 w-48 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl shadow-2xl py-2 z-[200] text-right"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (onEditTrack) onEditTrack(item.track);
                                setOpenMenuTrackId(null);
                              }}
                              className="w-full flex items-center gap-2 px-4 py-2.5 text-[11px] font-black text-slate-700 dark:text-slate-200 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800 text-right border-b border-slate-50 dark:border-slate-800/40 mb-1"
                            >
                              <svg className="w-3.5 h-3.5 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                              </svg>
                              <span>تعديل الاسم</span>
                            </button>
                            <div className="px-4 py-2 text-[9px] font-black text-slate-400 border-b border-slate-50 dark:border-slate-800/40 mb-1">
                              تصنيف اللحن كـ:
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onToggleSourceType(item.track.id, 'import');
                                setOpenMenuTrackId(null);
                              }}
                              className={`w-full flex items-center justify-between px-4 py-2.5 text-[11px] font-bold transition-colors hover:bg-slate-50 dark:hover:bg-slate-800 ${item.track.sourceType !== 'record' ? 'text-[#4da8ab]' : 'text-slate-600 dark:text-slate-300'}`}
                            >
                               <span className="flex items-center gap-2">
                                <Music className="w-3.5 h-3.5" />
                                <span>مستورد</span>
                              </span>
                              {item.track.sourceType !== 'record' && <Check className="w-3 h-3" />}
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onToggleSourceType(item.track.id, 'record');
                                setOpenMenuTrackId(null);
                              }}
                              className={`w-full flex items-center justify-between px-4 py-2.5 text-[11px] font-bold transition-colors hover:bg-slate-50 dark:hover:bg-slate-800 ${item.track.sourceType === 'record' ? 'text-[#4da8ab]' : 'text-slate-600 dark:text-slate-300'}`}
                            >
                              <span className="flex items-center gap-2">
                                <Mic className="w-3.5 h-3.5" />
                                <span>تسجيل</span>
                              </span>
                              {item.track.sourceType === 'record' && <Check className="w-3 h-3" />}
                            </button>
                          </motion.div>
                        </>
                      )}
                    </AnimatePresence>
                  </div>

                  <div 
                    onClick={() => { if (!isRecording) { onSelect(item.originalIndex); if (onClose) onClose(); } }}
                    className={`flex-1 flex items-center gap-3 p-2.5 rounded-[22px] transition-all duration-300 min-w-0 cursor-pointer ${currentId === item.track.id ? 'bg-[#4da8ab]/10 shadow-sm' : 'hover:bg-slate-50 dark:hover:bg-slate-900'} ${isRecording ? 'opacity-40 grayscale pointer-events-none' : ''}`}
                  >
                    <div className="relative shrink-0">
                      <img src={item.track.coverUrl || undefined} className="w-11 h-11 rounded-xl object-cover shadow-md pointer-events-none" alt="" />
                      {item.track.isFavorite && (
                        <div className="absolute -top-1.5 -right-1.5 bg-white dark:bg-slate-900 rounded-full p-1 shadow-md border border-slate-50 dark:border-slate-800">
                          <Heart className="w-2.5 h-2.5 text-rose-500 fill-rose-500" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0 text-right overflow-hidden focus-within:ring-0">
                      <div className="w-full">
                        <MarqueeText 
                          text={item.track.name} 
                          className={`font-black text-[13px] leading-tight ${currentId === item.track.id ? 'text-[#4da8ab]' : 'text-slate-800 dark:text-slate-100'}`}
                          speed={30}
                        />
                      </div>
                      <div className="w-full mt-1 opacity-60">
                        <MarqueeText 
                          text={item.track.artist || "بدون فنان"} 
                          className="text-[10px] font-bold dark:text-slate-400"
                          speed={25}
                        />
                      </div>
                    </div>
                  </div>
                  
                  {confirmDeleteId === item.track.id ? (
                    <div className="flex items-center gap-1 bg-red-500/10 p-1 rounded-xl border border-red-500/20 shrink-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemove(item.track.id);
                          setConfirmDeleteId(null);
                        }}
                        className="px-2.5 py-1 bg-red-500 hover:bg-red-600 text-white font-bold text-[10px] rounded-lg shadow-sm"
                        title="تأكيد الحذف"
                      >
                        حذف
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmDeleteId(null);
                        }}
                        className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg text-xs"
                        title="إلغاء"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <button 
                      onClick={(e) => { 
                        e.stopPropagation();
                        setConfirmDeleteId(item.track.id);
                      }} 
                      className="p-3 text-slate-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-full transition-all active:scale-90"
                      title="حذف النشيد"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
                {dropTargetIndex === item.originalIndex && draggedItemIndex !== null && draggedItemIndex < item.originalIndex && (
                  <DropPlaceholder />
                )}
              </React.Fragment>
            ))
          )}
            <div className="h-24 shrink-0" />
          </div>
        </nav>
      </motion.aside>
    </>
  );
};

export default Sidebar;
