import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock3, FileText, Grid2X2, List, Search, Sparkles } from 'lucide-react';
import bg0 from '@/assets/images/bg-0.webp';
import bg1 from '@/assets/images/bg-1.webp';
import bg2 from '@/assets/images/bg-2.webp';
import bg3 from '@/assets/images/bg-3.webp';
import bg4 from '@/assets/images/bg-4.webp';
import bg5 from '@/assets/images/bg-5.webp';
import '@/styles/docs.scss';

type ViewMode = 'grid' | 'timeline';

const categories = ['All documents', 'Product', 'Design', 'Engineering', 'Research'];

export const documents = [
  { id: 'quiet-system', title: 'A quiet system for brighter days', category: 'Design', date: 'Aug 08, 2026', image: bg0, accent: 'violet', excerpt: 'Notes on shaping interfaces that feel calm, clear, and quietly alive.' },
  { id: 'next-horizon', title: 'Building for the next horizon', category: 'Product', date: 'Aug 02, 2026', image: bg1, accent: 'blue', excerpt: 'A field guide to turning a strong idea into a useful, enduring product.' },
  { id: 'small-details', title: 'The language of small details', category: 'Research', date: 'Jul 26, 2026', image: bg2, accent: 'gold', excerpt: 'Observations on motion, rhythm, and the moments that make a tool memorable.' },
  { id: 'unfinished-worlds', title: 'A map of unfinished worlds', category: 'Engineering', date: 'Jul 18, 2026', image: bg3, accent: 'rose', excerpt: 'Practical patterns for making complex systems easier to explore and change.' },
  { id: 'readable-space', title: 'Light, depth, and readable space', category: 'Design', date: 'Jul 09, 2026', image: bg4, accent: 'mint', excerpt: 'A visual study of contrast, atmosphere, and the discipline of restraint.' },
  { id: 'beyond-interface', title: 'Notes from beyond the interface', category: 'Product', date: 'Jun 28, 2026', image: bg5, accent: 'peach', excerpt: 'What product teams can learn from stories, games, and imagined futures.' },
];

export default function Docs() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('All documents');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const searchRef = useRef<HTMLInputElement>(null);

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

  const filteredDocuments = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return documents.filter((document) => {
      const matchesCategory = activeCategory === 'All documents' || document.category === activeCategory;
      const matchesQuery = !normalizedQuery
        || `${document.title} ${document.category} ${document.excerpt}`.toLowerCase().includes(normalizedQuery);
      return matchesCategory && matchesQuery;
    });
  }, [activeCategory, query]);

  return (
    <main className="docs-page">
      <section className="docs-hero">
        <div className="docs-hero-copy">
          <span className="docs-kicker"><Sparkles size={14} /> A living archive</span>
          <h1>追寻未来</h1>
          <p>Chasing the future, one idea at a time.</p>
        </div>
        <div className="docs-search-wrap">
          <Search size={20} aria-hidden="true" />
          <input
            ref={searchRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search the archive..."
            aria-label="Search documents"
          />
          <kbd>⌘ K</kbd>
        </div>
      </section>

      <div className="docs-library" aria-label="Document library">
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
                {category}
              </button>
            ))}
          </div>
          <div className="docs-view-toggle" aria-label="Document view">
            <span className={`docs-view-toggle-thumb is-${viewMode}`} aria-hidden="true" />
            <button type="button" className={viewMode === 'grid' ? 'is-active' : ''} onClick={() => setViewMode('grid')} aria-label="Card view">
              <Grid2X2 size={16} />
            </button>
            <button type="button" className={viewMode === 'timeline' ? 'is-active' : ''} onClick={() => setViewMode('timeline')} aria-label="Timeline view">
              <List size={18} />
            </button>
          </div>
        </div>

        {filteredDocuments.length ? (
          <div key={viewMode} className={`docs-results is-${viewMode}`}>
            {filteredDocuments.map((document) => (
              <article className="doc-card" key={document.id} data-accent={document.accent} onClick={() => navigate(`/docs/${document.id}`)}>
                <button type="button" className="doc-card-image" aria-label={`Open ${document.title}`} onClick={() => navigate(`/docs/${document.id}`)}>
                  <img src={document.image} alt="" />
                </button>
                <div className="doc-card-body">
                  <h2>{document.title}</h2>
                  <div className="doc-card-meta">
                    <span className="doc-category">{document.category}</span>
                    <span><Clock3 size={13} /> {document.date}</span>
                  </div>
                  <p>{document.excerpt}</p>
                  <button type="button" className="doc-read-button" onClick={() => navigate(`/docs/${document.id}`)}>Read document <span aria-hidden="true">↗</span></button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="docs-empty">
            <FileText size={30} />
            <strong>No documents found</strong>
            <span>Try another search or category.</span>
          </div>
        )}
      </div>
    </main>
  );
}
