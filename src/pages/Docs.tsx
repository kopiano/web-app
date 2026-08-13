import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Clock3, FileText, Grid2X2, Library, List, ListVideo, LoaderCircle, Plus, Search } from 'lucide-react';
import { useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import type { RootState } from '@/store/store';
import { listDocuments, listPublicDocuments, resolveDocumentAsset, type RemoteDocument } from '@/api/docs';
import NewDocEditor from './NewDocEditor';
import bg0 from '@/assets/images/bg-0.webp';
import bg1 from '@/assets/images/bg-1.webp';
import bg2 from '@/assets/images/bg-2.webp';
import bg3 from '@/assets/images/bg-3.webp';
import bg4 from '@/assets/images/bg-4.webp';
import bg5 from '@/assets/images/bg-5.webp';
import '@/styles/docs.scss';

type ViewMode = 'grid' | 'timeline';

export const documents = [
  { id: 'quiet-system', title: 'A quiet system for brighter days', category: 'Design', date: 'Aug 08, 2026', image: bg0, accent: 'violet', content: 'Notes on shaping interfaces that feel calm, clear, and quietly alive.' },
  { id: 'next-horizon', title: 'Building for the next horizon', category: 'Product', date: 'Aug 02, 2026', image: bg1, accent: 'blue', content: 'A field guide to turning a strong idea into a useful, enduring product.' },
  { id: 'small-details', title: 'The language of small details', category: 'Research', date: 'Jul 26, 2026', image: bg2, accent: 'gold', content: 'Observations on motion, rhythm, and the moments that make a tool memorable.' },
  { id: 'unfinished-worlds', title: 'A map of unfinished worlds', category: 'Engineering', date: 'Jul 18, 2026', image: bg3, accent: 'rose', content: 'Practical patterns for making complex systems easier to explore and change.' },
  { id: 'readable-space', title: 'Light, depth, and readable space', category: 'Design', date: 'Jul 09, 2026', image: bg4, accent: 'mint', content: 'A visual study of contrast, atmosphere, and the discipline of restraint.' },
  { id: 'beyond-interface', title: 'Notes from beyond the interface', category: 'Product', date: 'Jun 28, 2026', image: bg5, accent: 'peach', content: 'What product teams can learn from stories, games, and imagined futures.' },
];

export default function Docs() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const isLibraryView = searchParams.get('view') === 'library';
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('All documents');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const searchRef = useRef<HTMLInputElement>(null);
  const currentUser = useSelector((state: RootState) => state.auth.user);
  const [remoteDocuments, setRemoteDocuments] = useState<RemoteDocument[]>([]);
  const [remoteLoaded, setRemoteLoaded] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [coverVersion, setCoverVersion] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    if (!currentUser && !isLibraryView) {
      setRemoteDocuments([]);
      setRemoteLoaded(true);
      return () => { cancelled = true; };
    }
    setRemoteLoaded(false);
    setCoverVersion(Date.now());
    (isLibraryView ? listPublicDocuments() : listDocuments())
      .then((items) => { if (!cancelled) setRemoteDocuments(items); })
      .catch(() => { if (!cancelled) setRemoteDocuments([]); })
      .finally(() => { if (!cancelled) setRemoteLoaded(true); });
    return () => { cancelled = true; };
  }, [currentUser?.id, isLibraryView]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === '/' && document.activeElement !== searchRef.current) {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const libraryDocuments = isLibraryView
    ? (remoteLoaded ? remoteDocuments.filter((item) => item.public === true) : [])
    : currentUser
    ? (remoteLoaded ? remoteDocuments : [])
    : documents;
  const categories = useMemo(() => [
    'All documents',
    ...Array.from(new Set(libraryDocuments.map((document) => document.category.trim()).filter(Boolean))),
  ], [libraryDocuments]);
  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>([['All documents', libraryDocuments.length]]);
    libraryDocuments.forEach((document) => {
      const category = document.category.trim();
      if (category) counts.set(category, (counts.get(category) ?? 0) + 1);
    });
    return counts;
  }, [libraryDocuments]);

  useEffect(() => {
    if (activeCategory !== 'All documents' && !categories.includes(activeCategory)) {
      setActiveCategory('All documents');
    }
  }, [activeCategory, categories]);

  const filteredDocuments = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return libraryDocuments.filter((document) => {
      const matchesCategory = activeCategory === 'All documents' || document.category === activeCategory;
      const matchesQuery = !normalizedQuery
        || `${document.title} ${document.category} ${document.content}`.toLowerCase().includes(normalizedQuery);
      return matchesCategory && matchesQuery;
    });
  }, [activeCategory, libraryDocuments, query]);

  return (
    <main className="docs-page">
      <section className={`docs-hero${isLibraryView ? ' is-library-view' : ''}`}>
        <div className="docs-hero-copy">
          <span className="docs-kicker"><FileText size={14} aria-hidden="true" />{t('docs.kicker')}</span>
          <h1>{isLibraryView ? t('docs.libraryTitle') : t('docs.subtitle')}</h1>
        </div>
        <div className="docs-search-wrap">
          <Search size={20} aria-hidden="true" />
          <input
            ref={searchRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('docs.searchPlaceholder')}
            aria-label={t('docs.searchLabel')}
          />
          <kbd>⌘ K</kbd>
        </div>
      </section>

        <div className="docs-library" aria-label={t('docs.documentView')}>
        <div className="docs-toolbar">
          <div className="docs-categories" role="tablist" aria-label="Document categories">
            {categories.map((category) => (
            <button
                key={category}
                type="button"
                role="tab"
                aria-selected={activeCategory === category}
                className={activeCategory === category ? 'is-active' : ''}
                onClick={() => setActiveCategory(category)}
              >
                {category === 'All documents' ? t('docs.allDocuments') : category} <span className="docs-category-count">{categoryCounts.get(category) ?? 0}</span>
              </button>
            ))}
          </div>
          <div className="docs-view-toggle" aria-label={t('docs.documentView')}>
            <span className={`docs-view-toggle-thumb is-${viewMode}`} aria-hidden="true" />
            <button type="button" className={viewMode === 'grid' ? 'is-active' : ''} onClick={() => setViewMode('grid')} aria-label={t('docs.cardView')}>
              <Grid2X2 size={16} />
            </button>
            <button type="button" className={viewMode === 'timeline' ? 'is-active' : ''} onClick={() => setViewMode('timeline')} aria-label={t('docs.timelineView')}>
              <List size={18} />
            </button>
          </div>
        </div>

        {!remoteLoaded && currentUser ? (
          <div className="docs-empty docs-loading" aria-live="polite">
            <LoaderCircle className="docs-loading-icon" size={32} aria-hidden="true" />
          </div>
        ) : filteredDocuments.length ? (
          <div key={viewMode} className={`docs-results is-${viewMode}`}>
            {filteredDocuments.map((document) => (
            <article className="doc-card" key={document.id} data-accent={document.accent} onClick={() => navigate(`/docs/${document.id}${isLibraryView ? '?from=library' : ''}`)}>
                <button type="button" className="doc-card-image" aria-label={`Open ${document.title}`} onClick={() => navigate(`/docs/${document.id}${isLibraryView ? '?from=library' : ''}`)}>
                  <img src={resolveDocumentAsset(document.image, coverVersion)} alt="" />
                </button>
                <div className="doc-card-body">
                  <h2>{document.title}</h2>
                  <div className="doc-card-meta">
                    <span className="doc-category">{document.category}</span>
                    <span className="doc-date"><Clock3 size={9} aria-hidden="true" /><time>{document.date}</time></span>
                  </div>
                  <p>{document.content}</p>
                  <button type="button" className="doc-read-button" onClick={() => navigate(`/docs/${document.id}${isLibraryView ? '?from=library' : ''}`)}>{t('docs.readDocument')} <span aria-hidden="true">↗</span></button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="docs-empty">
            <FileText size={30} />
            <strong>{t('docs.noDocuments')}</strong>
            <span>{t('docs.tryAnotherSearch')}</span>
          </div>
        )}
      </div>
      <button type="button" className="docs-create-button" onClick={() => setIsCreateOpen(true)} aria-label={t('docs.createDocument')} title={t('docs.createDocument')}>
        <Plus size={24} />
      </button>
      <nav className="docs-dock" aria-label="Docs navigation">
        <button type="button" className={isLibraryView ? 'is-active' : ''} onClick={() => setSearchParams({ view: 'library' })} aria-label="Library" aria-current={isLibraryView ? 'page' : undefined}>
          <Library size={17} strokeWidth={2} />
          <span>Library</span>
        </button>
        <button type="button" className={!isLibraryView ? 'is-active' : ''} onClick={() => setSearchParams({})} aria-current={!isLibraryView ? 'page' : undefined} aria-label="List">
          <ListVideo size={17} strokeWidth={2} />
          <span>List</span>
        </button>
      </nav>
      {isCreateOpen && <NewDocEditor onClose={() => setIsCreateOpen(false)} />}
    </main>
  );
}
