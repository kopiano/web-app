import { useState, useRef, useEffect, useCallback } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/context/ThemeContext';
import AuthModal from '@/components/ui/AuthModal';
import nav_logo from '@/assets/images/z-logo.png';
import '@/styles/header.scss';
import '@/styles/header-extras.scss';

export default function Header() {
  const { t, i18n } = useTranslation();
  const { theme, toggleTheme } = useTheme();
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [authPortal, setAuthPortal] = useState<HTMLElement | null>(null);
  const bellRef = useRef<HTMLButtonElement>(null);
  const avatarRef = useRef<HTMLButtonElement>(null);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, right: 0 });
  const [profileDropdownPos, setProfileDropdownPos] = useState({ top: 0, right: 0 });

  const [currentLang, setCurrentLang] = useState(i18n.language);

  useEffect(() => {
    const handleLangChange = (lng: string) => setCurrentLang(lng);
    i18n.on('languageChanged', handleLangChange);
    return () => { i18n.off('languageChanged', handleLangChange); };
  }, [i18n]);

  const toggleLang = () => {
    const next = currentLang === 'en' ? 'zh' : 'en';
    i18n.changeLanguage(next);
    localStorage.setItem('lang', next);
  };

  useEffect(() => {
    setAuthPortal(document.body);
  }, []);

  const initials = 'G';


  const updateProfilePos = useCallback(() => {
    if (avatarRef.current) {
      const rect = avatarRef.current.getBoundingClientRect();
      setProfileDropdownPos({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
    }
  }, []);

  useEffect(() => {
    if (profileOpen) {
      updateProfilePos();
      window.addEventListener('scroll', updateProfilePos, true);
      window.addEventListener('resize', updateProfilePos);
    }
    return () => {
      window.removeEventListener('scroll', updateProfilePos, true);
      window.removeEventListener('resize', updateProfilePos);
    };
  }, [profileOpen, updateProfilePos]);

  const updateNotifPos = useCallback(() => {
    if (bellRef.current) {
      const rect = bellRef.current.getBoundingClientRect();
      setDropdownPos({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
    }
  }, []);

  useEffect(() => {
    if (notifOpen) {
      updateNotifPos();
      window.addEventListener('scroll', updateNotifPos, true);
      window.addEventListener('resize', updateNotifPos);
    }
    return () => {
      window.removeEventListener('scroll', updateNotifPos, true);
      window.removeEventListener('resize', updateNotifPos);
    };
  }, [notifOpen, updateNotifPos]);


  return (
    <header className="header" id="header">
      <nav className="nav">
        <Link to="/" className="logo">
          <img src={nav_logo} alt="Z" className="nav_logo" />
          <span>Coulson Zero</span>
        </Link>

        <ul className="navbar">
          <li><NavLink to="/" end className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>{t('header.overview')}</NavLink></li>
          <li><NavLink to="/chat" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>{t('header.chat')}</NavLink></li>
          <li><NavLink to="/music" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>{t('header.music')}</NavLink></li>
          <li><NavLink to="/video" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>{t('header.video')}</NavLink></li>
        </ul>

        <div className="header-actions">
          {/* Language Toggle */}
          <button className="lang-toggle" onClick={toggleLang} aria-label="Language">
            <span className={`lang-slider ${currentLang === 'zh' ? 'right' : ''}`} />
            <span className={`lang-option ${currentLang === 'en' ? 'active' : ''}`}>{t('header.en')}</span>
            <span className={`lang-option ${currentLang === 'zh' ? 'active' : ''}`}>{t('header.zh')}</span>
          </button>

          <span className="header-actions-divider" />

          {/* Theme Toggle */}
          <button className="action-btn theme-btn" onClick={toggleTheme}>
            {theme === 'light' ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#000' }}>
                <circle cx="12" cy="12" r="5" />
                <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#000' }}>
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )}
          </button>

          {/* Notification Bell */}
          <button ref={bellRef} className="action-btn notification-btn" onClick={() => setNotifOpen(o => !o)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.7, color: '#000' }}>
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            <span className="notif-dot" />
          </button>

          {/* User Profile Pill */}
          <button ref={avatarRef} className="user-pill" onClick={() => setProfileOpen(o => !o)}>
            <div className="user-avatar-box">
              <span className="user-avatar-initials">{initials}</span>
            </div>
            <span className="user-pill-name">{t('header.guest')}</span>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="user-pill-chevron"
              style={{ opacity: 0, transition: 'transform 0.3s ease', transform: profileOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        </div>

        {/* Profile Dropdown */}
        {profileOpen && createPortal(
          <div className="dropdown-overlay" onClick={() => setProfileOpen(false)}>
            <div className="user-dropdown-panel glass" style={{ position: 'absolute', top: `${profileDropdownPos.top}px`, right: `${profileDropdownPos.right}px` }} onClick={e => e.stopPropagation()}>
              <button className="dropdown-action-item" onClick={() => { setProfileOpen(false); setAuthMode('login'); setAuthOpen(true); }}
                style={{ color: '#000', fontWeight: 500 }}>
                {t('header.signIn')}
              </button>
              <button className="dropdown-action-item" onClick={() => { setProfileOpen(false); setAuthMode('signup'); setAuthOpen(true); }}
                style={{ color: '#000' }}>
                {t('header.signUp')}
              </button>
            </div>
          </div>,
          document.body
        )}

        {/* Notification Panel */}
        {notifOpen && createPortal(
          <div className="dropdown-overlay" onClick={() => setNotifOpen(false)}>
            <div className="notif-dropdown-panel glass" style={{ position: 'absolute', top: `${dropdownPos.top}px`, right: `${dropdownPos.right}px` }} onClick={e => e.stopPropagation()}>
              <div className="notif-header-bar" style={{ borderBottom: theme === 'light' ? '1px solid rgba(0,0,0,0.04)' : '1px solid rgba(255,255,255,0.04)' }}>
                <span className="notif-header-title">{t('header.notifications')}</span>
                <button className="notif-header-close" onClick={() => setNotifOpen(false)}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
              <div className="notif-empty-state">{t('header.noNotifications')}</div>
            </div>
          </div>,
          document.body
        )}
      </nav>
      {authOpen && authPortal && createPortal(
        <AuthModal onClose={() => setAuthOpen(false)} initialMode={authMode} />,
        authPortal
      )}
    </header>
  );
}
