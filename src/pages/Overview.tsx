import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BriefcaseBusiness, Code2, Globe2, Palette, Search, Sparkles, type LucideIcon } from 'lucide-react';
import TabNavbar from '@/components/tabNavbar';
import websiteConfig from '@/config/website.json';
import '@/styles/overview.scss';
import codepen_img from '@/assets/images/overview/codepen.svg';
import awwwards_img from '@/assets/images/overview/awwwards.webp';

type SiteCategory = string;
type SearchEngine = 'bing' | 'google';
type Site = { name: string; url: string; icon: string; category: string; mark: string; accent: string };

const categoryIcons: Partial<Record<SiteCategory, LucideIcon>> = {
  all: Globe2,
  design: Palette,
  development: Code2,
  ai: Sparkles,
  productivity: BriefcaseBusiness,
};
const sites: Site[] = Object.entries(websiteConfig).flatMap(([group, entries]) =>
  entries.map(site => ({
    ...site,
    category: group,
    mark: site.name.slice(0, 2).toUpperCase(),
    accent: '#397b77',
  })),
);
const availableCategories: SiteCategory[] = ['all', ...Object.keys(websiteConfig)];
const categoryLabels: Record<string, { en: string; zh: string }> = {
  all: { en: 'All sites', zh: '全部' },
  design: { en: 'Design', zh: '设计灵感' },
  development: { en: 'Development', zh: '开发资源' },
  ai: { en: 'AI tools', zh: 'AI 工具' },
  productivity: { en: 'Productivity', zh: '效率工具' },
  ui: { en: 'UI', zh: 'UI' },
};

function Overview() {
  const [category, setCategory] = useState<SiteCategory>('all');
  const [searchEngine, setSearchEngine] = useState<SearchEngine>('bing');
  const [searchQuery, setSearchQuery] = useState('');
  const [isNavigationVisible, setIsNavigationVisible] = useState(false);
  const navigationRef = useRef<HTMLElement>(null);
  const { i18n } = useTranslation();
  const zh = (i18n.resolvedLanguage || i18n.language).startsWith('zh');
  const visibleSites = category === 'all' ? sites : sites.filter(site => site.category === category);
  const searchUrl = searchEngine === 'bing' ? 'https://www.bing.com/search' : 'https://www.google.com/search';

  useEffect(() => {
    const section = navigationRef.current;
    if (!section) return;
    const observer = new IntersectionObserver(
      ([entry]) => setIsNavigationVisible(entry.isIntersecting),
      { threshold: 0.01 },
    );
    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = searchQuery.trim();
    if (query) window.location.assign(`${searchUrl}?q=${encodeURIComponent(query)}`);
  };

  return (
    <main className="overview-page">
      <section className="home" id="home">
        <div className="content">
          <div className="content-name">
            <span>C</span>oulson <span>Z</span>ero
          </div>
          <p>front-end developer</p>
          <NavLink to="http://kopiano.cc/video" className="content-btn">
            <span>Get Started</span>
            <div className="arrow">
              <div className="bar"></div>
              <div className="triangle"></div>
            </div>
          </NavLink>
        </div>

        <ul className="social">
          <li className="social-item">
              <NavLink to="https://github.com/kopiano" target="_blank">
                  <svg data-component="Octicon" aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="32" height="32" fill="#000" overflow="visible" style={{ verticalAlign: 'text-bottom' }}><path d="M10.226 17.284c-2.965-.36-5.054-2.493-5.054-5.256 0-1.123.404-2.336 1.078-3.144-.292-.741-.247-2.314.09-2.965.898-.112 2.111.36 2.83 1.01.853-.269 1.752-.404 2.853-.404 1.1 0 1.999.135 2.807.382.696-.629 1.932-1.1 2.83-.988.315.606.36 2.179.067 2.942.72.854 1.101 2 1.101 3.167 0 2.763-2.089 4.852-5.098 5.234.763.494 1.28 1.572 1.28 2.807v2.336c0 .674.561 1.056 1.235.786 4.066-1.55 7.255-5.615 7.255-10.646C23.5 6.188 18.334 1 11.978 1 5.62 1 .5 6.188.5 12.545c0 4.986 3.167 9.12 7.435 10.669.606.225 1.19-.18 1.19-.786V20.63a2.9 2.9 0 0 1-1.078.224c-1.483 0-2.359-.808-2.987-2.313-.247-.607-.517-.966-1.034-1.033-.27-.023-.359-.135-.359-.27 0-.27.45-.471.898-.471.652 0 1.213.404 1.797 1.235.45.651.921.943 1.483.943.561 0 .92-.202 1.437-.719.382-.381.674-.718.944-.943"></path></svg>
              </NavLink>
              <div className="box-tooltip" data-name="github">
                  <div className="tooltip-text" data-color="github">Github</div>
              </div>
          </li>
          <li className="social-item">
              <NavLink to="https://codepen.io/coulsonzero" target="_blank" rel="noopener">
                  <img src={codepen_img} alt="codepen" />
              </NavLink>
              <div className="box-tooltip" data-name="codepen">
                  <div className="tooltip-text" data-color="codepen">CodePen</div>
              </div>
          </li>
          <li>
              <div className="icon-line"></div>
          </li>
        </ul>
        <div id="awwwards" className="awwwards">
          <a href="http://www.awwwards.com" target="_blank">
            <img src={awwwards_img} alt="awwwards" />
          </a>
        </div>
      </section>

      <section ref={navigationRef} className="overview-sites" aria-label={zh ? '网站导航' : 'Website navigation'}>
        <div className="overview-sites-inner">
          <form className="overview-search" role="search" onSubmit={handleSearch}>
            <div className="overview-search-engines" role="group" aria-label={zh ? '搜索引擎' : 'Search engine'}>
              <button
                type="button"
                className={searchEngine === 'bing' ? 'is-active' : ''}
                aria-pressed={searchEngine === 'bing'}
                aria-label="Bing"
                title="Bing"
                onClick={() => setSearchEngine('bing')}
              >
                <svg className="overview-engine-icon overview-engine-icon-bing" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M5 2.5 12.4 5v5.2l5.8 2.3 1.3 4.2-9.2 5.3-5.3-2v-4.1l4.7 1.7 4.2-2.5-8.9-3.5V2.5Z" />
                </svg>
              </button>
              <button
                type="button"
                className={searchEngine === 'google' ? 'is-active' : ''}
                aria-pressed={searchEngine === 'google'}
                aria-label="Google"
                title="Google"
                onClick={() => setSearchEngine('google')}
              >
                <span className="overview-engine-icon overview-engine-icon-google" aria-hidden="true">G</span>
              </button>
            </div>
            <div className="overview-search-input">
              <Search size={18} aria-hidden="true" />
              <input
                type="search"
                value={searchQuery}
                onChange={event => setSearchQuery(event.target.value)}
                placeholder={zh ? '搜索网页' : 'Search the web'}
                aria-label={zh ? '搜索网页' : 'Search the web'}
              />
              <button type="submit" aria-label={zh ? '搜索' : 'Search'}>
                <Search size={17} aria-hidden="true" />
              </button>
            </div>
          </form>
          <div className="overview-sites-grid">
            {visibleSites.map(site => (
              <a
                className="overview-site-card"
                href={site.url}
                target="_blank"
                rel="noopener noreferrer"
                key={site.name}
                style={{ '--site-accent': site.accent } as CSSProperties}
              >
                <span className="overview-site-logo" aria-hidden="true">
                  <img
                    className="overview-site-icon"
                    src={site.icon}
                    alt=""
                    loading="lazy"
                    onError={event => {
                      event.currentTarget.closest('.overview-site-logo')?.classList.add('has-fallback');
                    }}
                  />
                  <span className="overview-site-mark">{site.mark}</span>
                </span>
                <span className="overview-site-copy">
                  <span className="overview-site-name">{site.name}</span>
                  <span className="overview-site-domain">{new URL(site.url).hostname.replace(/^www\./, '')}</span>
                </span>
              </a>
            ))}
          </div>
        </div>
      </section>
      {isNavigationVisible && createPortal(
        <TabNavbar
          active={category}
          options={availableCategories.map(value => {
            const Icon = categoryIcons[value] ?? Globe2;
            const categoryLabel = categoryLabels[value]?.[zh ? 'zh' : 'en']
              ?? value.replace(/[-_]/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());
            return { value, label: categoryLabel, icon: <Icon size={17} strokeWidth={2} aria-hidden="true" /> };
          })}
          onChange={setCategory}
          ariaLabel={zh ? '网站分类' : 'Website categories'}
          className="overview-sites-tabs video-category-nav is-dock-style"
        />,
        document.body,
      )}
    </main>
  );
}

export default Overview;
