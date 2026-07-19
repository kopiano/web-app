import type {
  VideoApiCollection,
  VideoApiComment,
  VideoApiItem,
  VideoCategory,
} from '@/api/video';

const VIDEO_SOURCES = {
  sintel: 'https://media.w3.org/2010/05/sintel/trailer.mp4',
  bunny: 'https://media.w3.org/2010/05/bunny/trailer.mp4',
  flower: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
};

const poster = (id: string) => (
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=1600&q=88`
);

const avatar = (id: string) => (
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=160&q=88`
);

export const MOCK_VIDEO_CATEGORIES: VideoCategory[] = [
  { id: 'mock-category-movies', slug: 'movies', nameZh: '电影', nameEn: 'Movies' },
  { id: 'mock-category-genshin', slug: 'genshin-impact', nameZh: '原神', nameEn: 'Genshin Impact' },
  { id: 'mock-category-travel', slug: 'travel', nameZh: '旅行', nameEn: 'Travel' },
  { id: 'mock-category-nature', slug: 'nature', nameZh: '自然', nameEn: 'Nature' },
  { id: 'mock-category-design', slug: 'design', nameZh: '设计', nameEn: 'Design' },
  { id: 'mock-category-music', slug: 'music', nameZh: '音乐', nameEn: 'Music' },
];

type MockVideoSeed = {
  id: string;
  title: string;
  description: string;
  creator: string;
  avatar: string;
  duration: number;
  width: number;
  height: number;
  category: string;
  poster: string;
  src: string;
  views: number;
};

const MOCK_VIDEO_SEEDS: MockVideoSeed[] = [
  {
    id: 'northbound',
    title: 'Northbound: Above the Quiet Valleys',
    description: 'A slow journey through glacial light, empty ridgelines, and the people who call the far north home.',
    creator: 'Elena Rowe',
    avatar: avatar('photo-1494790108377-be9c29b29330'),
    duration: 768,
    width: 3840,
    height: 2160,
    category: 'travel',
    poster: poster('photo-1501785888041-af3ef285b470'),
    src: VIDEO_SOURCES.sintel,
    views: 2_800_000,
  },
  {
    id: 'paper-cities',
    title: 'Paper Cities',
    description: 'Architecture, memory, and the lines that shape a city after dark.',
    creator: 'Noah Ellis',
    avatar: avatar('photo-1500648767791-00dcc994a43e'),
    duration: 496,
    width: 2560,
    height: 1440,
    category: 'design',
    poster: poster('photo-1480714378408-67cf0d13bc1b'),
    src: VIDEO_SOURCES.bunny,
    views: 846_000,
  },
  {
    id: 'sea-of-clouds',
    title: 'A Sea of Clouds',
    description: 'One morning above the cloud line, captured in a single continuous ascent.',
    creator: 'Mira Chen',
    avatar: avatar('photo-1534528741775-53994a69daeb'),
    duration: 384,
    width: 3840,
    height: 2160,
    category: 'travel',
    poster: poster('photo-1519681393784-d120267933ba'),
    src: VIDEO_SOURCES.flower,
    views: 1_400_000,
  },
  {
    id: 'teyvat-after-rain',
    title: 'Teyvat After Rain',
    description: 'A cinematic route through luminous forests and forgotten ruins.',
    creator: 'Aster Studio',
    avatar: avatar('photo-1506794778202-cad84cf45f1d'),
    duration: 1083,
    width: 3840,
    height: 2160,
    category: 'genshin-impact',
    poster: poster('photo-1441974231531-c6227db76b6e'),
    src: VIDEO_SOURCES.sintel,
    views: 3_100_000,
  },
  {
    id: 'midnight-express',
    title: 'Midnight Express',
    description: 'A nocturnal portrait of railway workers and the cities they connect.',
    creator: 'Theo Miles',
    avatar: avatar('photo-1506794778202-cad84cf45f1d'),
    duration: 652,
    width: 1920,
    height: 1080,
    category: 'movies',
    poster: poster('photo-1519608487953-e999c86e7455'),
    src: VIDEO_SOURCES.bunny,
    views: 592_000,
  },
  {
    id: 'soft-focus',
    title: 'Soft Focus',
    description: 'A practical study of daylight, texture, and intimate portrait direction.',
    creator: 'Iris Vale',
    avatar: avatar('photo-1517841905240-472988babdf9'),
    duration: 451,
    width: 2560,
    height: 1440,
    category: 'design',
    poster: poster('photo-1524504388940-b1c1722653e1'),
    src: VIDEO_SOURCES.flower,
    views: 320_000,
  },
  {
    id: 'last-light',
    title: 'Last Light in Patagonia',
    description: 'Chasing the final warm light across wind-shaped peaks.',
    creator: 'Elena Rowe',
    avatar: avatar('photo-1494790108377-be9c29b29330'),
    duration: 849,
    width: 3840,
    height: 2160,
    category: 'travel',
    poster: poster('photo-1464822759023-fed622ff2c3b'),
    src: VIDEO_SOURCES.sintel,
    views: 1_900_000,
  },
  {
    id: 'every-frame',
    title: 'Every Frame Has Weight',
    description: 'How framing and silence create tension before a single word is spoken.',
    creator: 'Noah Ellis',
    avatar: avatar('photo-1500648767791-00dcc994a43e'),
    duration: 584,
    width: 1920,
    height: 1080,
    category: 'movies',
    poster: poster('photo-1485846234645-a62644f84728'),
    src: VIDEO_SOURCES.bunny,
    views: 714_000,
  },
  {
    id: 'alpine-water',
    title: 'Alpine Water',
    description: 'Following a mountain river from first thaw to the valley floor.',
    creator: 'Mira Chen',
    avatar: avatar('photo-1534528741775-53994a69daeb'),
    duration: 680,
    width: 3840,
    height: 2160,
    category: 'nature',
    poster: poster('photo-1433086966358-54859d0ed716'),
    src: VIDEO_SOURCES.flower,
    views: 968_000,
  },
  {
    id: 'windrise',
    title: 'Windrise at Dawn',
    description: 'A peaceful exploration route with an original ambient score.',
    creator: 'Aster Studio',
    avatar: avatar('photo-1506794778202-cad84cf45f1d'),
    duration: 1278,
    width: 3840,
    height: 2160,
    category: 'genshin-impact',
    poster: poster('photo-1500530855697-b586d89ba3ee'),
    src: VIDEO_SOURCES.sintel,
    views: 2_200_000,
  },
  {
    id: 'analog-rooms',
    title: 'Analog Rooms',
    description: 'Inside the studios keeping tape, valves, and patient listening alive.',
    creator: 'June Park',
    avatar: avatar('photo-1531123897727-8f129e1688ce'),
    duration: 817,
    width: 2560,
    height: 1440,
    category: 'music',
    poster: poster('photo-1493225457124-a3eb161ffa5f'),
    src: VIDEO_SOURCES.bunny,
    views: 438_000,
  },
  {
    id: 'coastal-lines',
    title: 'Coastal Lines',
    description: 'Five days tracing the quiet roads at the edge of the Atlantic.',
    creator: 'Theo Miles',
    avatar: avatar('photo-1506794778202-cad84cf45f1d'),
    duration: 962,
    width: 3840,
    height: 2160,
    category: 'travel',
    poster: poster('photo-1507525428034-b723cf961d3e'),
    src: VIDEO_SOURCES.flower,
    views: 805_000,
  },
  {
    id: 'type-in-motion',
    title: 'Type in Motion',
    description: 'A compact masterclass in kinetic typography and restrained transitions.',
    creator: 'Iris Vale',
    avatar: avatar('photo-1517841905240-472988babdf9'),
    duration: 356,
    width: 1920,
    height: 1080,
    category: 'design',
    poster: poster('photo-1494438639946-1ebd1d20bf85'),
    src: VIDEO_SOURCES.sintel,
    views: 281_000,
  },
  {
    id: 'winter-cabin',
    title: 'The Winter Cabin',
    description: 'Three quiet days of snow, firewood, and cooking far from the road.',
    creator: 'June Park',
    avatar: avatar('photo-1531123897727-8f129e1688ce'),
    duration: 1180,
    width: 3840,
    height: 2160,
    category: 'nature',
    poster: poster('photo-1482192505345-5655af888cc4'),
    src: VIDEO_SOURCES.bunny,
    views: 1_100_000,
  },
  {
    id: 'desert-signal',
    title: 'Desert Signal',
    description: 'A science-fiction short about a message buried beneath an empty horizon.',
    creator: 'Noah Ellis',
    avatar: avatar('photo-1500648767791-00dcc994a43e'),
    duration: 1031,
    width: 2560,
    height: 1440,
    category: 'movies',
    poster: poster('photo-1500534314209-a25ddb2bd429'),
    src: VIDEO_SOURCES.sintel,
    views: 1_700_000,
  },
  {
    id: 'forest-frequency',
    title: 'Forest Frequency',
    description: 'Field recordings and minimal composition from deep inside a cedar forest.',
    creator: 'June Park',
    avatar: avatar('photo-1531123897727-8f129e1688ce'),
    duration: 1325,
    width: 2560,
    height: 1440,
    category: 'music',
    poster: poster('photo-1473448912268-2022ce9509d8'),
    src: VIDEO_SOURCES.flower,
    views: 366_000,
  },
];

export const MOCK_VIDEO_ITEMS: VideoApiItem[] = MOCK_VIDEO_SEEDS.map((seed, index) => {
  const category = MOCK_VIDEO_CATEGORIES.find((item) => item.slug === seed.category);
  const likeCount = Math.max(1, Math.round(seed.views * 0.082));
  const favoriteCount = Math.max(1, Math.round(seed.views * 0.021));
  const createdAt = new Date(Date.UTC(2026, 5, 30 - index, 10, 0, 0)).toISOString();

  return {
    id: `mock-video-${seed.id}`,
    userId: `mock-user-${seed.creator.toLowerCase().replace(/\s+/g, '-')}`,
    username: seed.creator,
    avatar: seed.avatar,
    title: seed.title,
    description: seed.description,
    coverUrl: seed.poster,
    duration: seed.duration,
    width: seed.width,
    height: seed.height,
    fps: 24,
    size: null,
    originFileUrl: seed.src,
    hlsMasterUrl: seed.src,
    status: 'ready',
    visibility: 'public',
    processingProgress: 100,
    processingError: null,
    viewCount: seed.views,
    likeCount,
    commentCount: index === 0 ? 3 : 0,
    favoriteCount,
    liked: false,
    favorited: false,
    owned: false,
    categories: category ? [category] : [],
    createdAt,
    updatedAt: createdAt,
  };
});

const mockVideoId = (id: string) => `mock-video-${id}`;

export const MOCK_COLLECTION_VIDEO_IDS: Record<string, string[]> = {
  'mock-collection-cinema-room': [
    mockVideoId('paper-cities'),
    mockVideoId('midnight-express'),
    mockVideoId('every-frame'),
    mockVideoId('desert-signal'),
  ],
  'mock-collection-wild-earth': [
    mockVideoId('northbound'),
    mockVideoId('sea-of-clouds'),
    mockVideoId('alpine-water'),
    mockVideoId('winter-cabin'),
  ],
  'mock-collection-teyvat-journal': [
    mockVideoId('teyvat-after-rain'),
    mockVideoId('windrise'),
  ],
  'mock-collection-visual-notes': [
    mockVideoId('soft-focus'),
    mockVideoId('type-in-motion'),
    mockVideoId('paper-cities'),
  ],
  'mock-collection-slow-travel': [
    mockVideoId('northbound'),
    mockVideoId('last-light'),
    mockVideoId('coastal-lines'),
    mockVideoId('sea-of-clouds'),
  ],
  'mock-collection-listening-room': [
    mockVideoId('analog-rooms'),
    mockVideoId('forest-frequency'),
    mockVideoId('winter-cabin'),
  ],
};

type MockCollectionSeed = {
  id: string;
  title: string;
  description: string;
  creator: string;
  avatar: string;
  coverVideoId: string;
};

const MOCK_COLLECTION_SEEDS: MockCollectionSeed[] = [
  {
    id: 'cinema-room',
    title: 'Cinema Room',
    description: 'Visual storytelling, framing, and memorable cinematic sequences.',
    creator: 'Noah Ellis',
    avatar: avatar('photo-1500648767791-00dcc994a43e'),
    coverVideoId: 'every-frame',
  },
  {
    id: 'wild-earth',
    title: 'Wild Earth',
    description: 'Mountains, water, weather, and quiet places beyond the road.',
    creator: 'Mira Chen',
    avatar: avatar('photo-1534528741775-53994a69daeb'),
    coverVideoId: 'alpine-water',
  },
  {
    id: 'teyvat-journal',
    title: 'Teyvat Journal',
    description: 'Cinematic routes and ambient journeys through Teyvat.',
    creator: 'Aster Studio',
    avatar: avatar('photo-1506794778202-cad84cf45f1d'),
    coverVideoId: 'teyvat-after-rain',
  },
  {
    id: 'visual-notes',
    title: 'Visual Notes',
    description: 'Design studies covering light, typography, and architecture.',
    creator: 'Iris Vale',
    avatar: avatar('photo-1517841905240-472988babdf9'),
    coverVideoId: 'soft-focus',
  },
  {
    id: 'slow-travel',
    title: 'Slow Travel',
    description: 'Long routes, natural light, and stories found between destinations.',
    creator: 'Elena Rowe',
    avatar: avatar('photo-1494790108377-be9c29b29330'),
    coverVideoId: 'last-light',
  },
  {
    id: 'listening-room',
    title: 'Listening Room',
    description: 'Field recordings, analog studios, and patient composition.',
    creator: 'June Park',
    avatar: avatar('photo-1531123897727-8f129e1688ce'),
    coverVideoId: 'analog-rooms',
  },
];

export const MOCK_VIDEO_COLLECTIONS: VideoApiCollection[] = MOCK_COLLECTION_SEEDS.map((seed, index) => {
  const id = `mock-collection-${seed.id}`;
  const videoIds = MOCK_COLLECTION_VIDEO_IDS[id] ?? [];
  const videos = videoIds
    .map((videoId) => MOCK_VIDEO_ITEMS.find((video) => video.id === videoId))
    .filter((video): video is VideoApiItem => Boolean(video));
  const createdAt = new Date(Date.UTC(2026, 5, 14 - index, 10, 0, 0)).toISOString();

  return {
    id,
    userId: `mock-user-${seed.creator.toLowerCase().replace(/\s+/g, '-')}`,
    username: seed.creator,
    avatar: seed.avatar,
    title: seed.title,
    description: seed.description,
    visibility: 'public',
    videoCount: videos.length,
    totalViews: videos.reduce((total, video) => total + video.viewCount, 0),
    coverUrl: MOCK_VIDEO_ITEMS.find((video) => video.id === mockVideoId(seed.coverVideoId))?.coverUrl ?? '',
    createdAt,
    updatedAt: createdAt,
  };
});

export const MOCK_VIDEO_COMMENTS: VideoApiComment[] = [
  {
    id: 'mock-comment-1',
    videoId: mockVideoId('northbound'),
    userId: 'mock-user-sora-kim',
    username: 'Sora Kim',
    avatar: avatar('photo-1524504388940-b1c1722653e1'),
    parentId: null,
    replyToUserId: null,
    replyToUsername: null,
    content: 'The quiet pacing and the way the light changes across the valley are incredible.',
    likeCount: 248,
    liked: false,
    createdAt: '2026-07-18T09:30:00.000Z',
    updatedAt: '2026-07-18T09:30:00.000Z',
  },
  {
    id: 'mock-comment-2',
    videoId: mockVideoId('northbound'),
    userId: 'mock-user-milan-ortega',
    username: 'Milan Ortega',
    avatar: avatar('photo-1534528741775-53994a69daeb'),
    parentId: null,
    replyToUserId: null,
    replyToUsername: null,
    content: 'This deserves to be watched on the biggest screen available. Beautiful work.',
    likeCount: 96,
    liked: false,
    createdAt: '2026-07-17T14:12:00.000Z',
    updatedAt: '2026-07-17T14:12:00.000Z',
  },
  {
    id: 'mock-comment-3',
    videoId: mockVideoId('northbound'),
    userId: 'mock-user-noah-ellis',
    username: 'Noah Ellis',
    avatar: avatar('photo-1500648767791-00dcc994a43e'),
    parentId: 'mock-comment-1',
    replyToUserId: 'mock-user-sora-kim',
    replyToUsername: 'Sora Kim',
    content: '@Sora Kim That opening light was the reason I saved this one.',
    likeCount: 42,
    liked: false,
    createdAt: '2026-07-18T10:05:00.000Z',
    updatedAt: '2026-07-18T10:05:00.000Z',
  },
];

export function isMockVideoId(id: string | null | undefined) {
  return Boolean(id?.startsWith('mock-video-'));
}

export function isMockCollectionId(id: string | null | undefined) {
  return Boolean(id?.startsWith('mock-collection-'));
}
