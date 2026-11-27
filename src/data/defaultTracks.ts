import { Track } from '../types';

export const INITIAL_TRACKS: Track[] = [
  {
    id: 'track-1',
    title: 'طلع البدر علينا',
    reciter: 'مجموعة منشدين',
    category: 'مديح نبوي',
    audioUrl: 'https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3?filename=arabic-oriental-113063.mp3',
    coverUrl: 'https://images.unsplash.com/photo-1542816417-0983cbe82752?auto=format&fit=crop&q=80&w=600',
    duration: 184,
    isFavorite: true,
    createdAt: Date.now() - 1000000,
    timestamps: [
      { id: 'ts-1-1', time: 0, title: 'المقدمة', note: 'مقدمة إيقاعية هادئة' },
      { id: 'ts-1-2', time: 35, title: 'طلع البدر علينا', note: 'المقطع الأول الرئيسي' },
      { id: 'ts-1-3', time: 90, title: 'من ثنيات الوداع', note: 'الختام والدعاء' },
    ],
    lyrics: `طلع البدر علينا .. من ثنيات الوداع
وجب الشكر علينا .. ما دعا لله داع
أيها المبعوث فينا .. جئت بالأمر المطاع
جئت شرفت المدينة .. مرحباً يا خير داع`,
  },
  {
    id: 'track-2',
    title: 'مولاي إني ببابك',
    reciter: 'الشيخ سيد النقشبندي',
    category: 'ابتهالات',
    audioUrl: 'https://cdn.pixabay.com/download/audio/2022/03/10/audio_c8c8a7322d.mp3?filename=oriental-ambient-10657.mp3',
    coverUrl: 'https://images.unsplash.com/photo-1564769625905-50e93615e769?auto=format&fit=crop&q=80&w=600',
    duration: 240,
    isFavorite: true,
    createdAt: Date.now() - 500000,
    timestamps: [
      { id: 'ts-2-1', time: 0, title: 'الاستهلال', note: 'افتتاحية خاشعة' },
      { id: 'ts-2-2', time: 60, title: 'مولاي إني ببابك قد خضعت', note: 'الابتهال الأول' },
      { id: 'ts-2-3', time: 140, title: 'وتولني بعفوك', note: 'دعاء ورجاء' },
    ],
    lyrics: `مولاي إني ببابك قد خضعت أعتابك
أرجو رضاك وأخشى في الهوى عقابك
يا غافر الذنب العظيم وتائباً
على عبيدٍ تضرعوا لبابك`,
  },
  {
    id: 'track-3',
    title: 'سوف أرحل',
    reciter: 'نشيد إسلامي روحاني',
    category: 'روحانيات',
    audioUrl: 'https://cdn.pixabay.com/download/audio/2022/10/14/audio_993f35c24e.mp3?filename=arabic-style-music-122847.mp3',
    coverUrl: 'https://images.unsplash.com/photo-1584551246679-0daf3d275d0f?auto=format&fit=crop&q=80&w=600',
    duration: 210,
    isFavorite: false,
    createdAt: Date.now() - 200000,
    timestamps: [
      { id: 'ts-3-1', time: 0, title: 'البداية', note: 'لحن هادئ' },
      { id: 'ts-3-2', time: 45, title: 'التفكر والتدبر', note: 'المقطع التفكري' },
    ],
    lyrics: `سوف أرحل والمنى في خاطري
أن أرى دار السلام بالسرور
يا إلهي اهدِ قلبي للمنى
واجعل التقوى سبيلي والنور`,
  },
];
