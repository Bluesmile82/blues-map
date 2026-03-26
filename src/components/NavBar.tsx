import { useState } from 'react'
import { useTranslation } from 'react-i18next';
import AuthButton from './auth/AuthButton'
import type { ViewType } from '../App'

interface NavBarProps {
  view: ViewType;
  onViewChange: (view: ViewType) => void;
  editMode: boolean;
  onEditModeChange: (editMode: boolean) => void;
  onCreateNew: () => void;
  editModeEnabled: boolean;
  onRandom: () => void;
  onCredits: () => void;
  autoplay: boolean;
  onAutoplayChange: (autoplay: boolean) => void;
  theme: 'light' | 'dark';
  onThemeChange: (theme: 'light' | 'dark') => void;
}

export default function NavBar({ view, onViewChange, editMode, onEditModeChange, onCreateNew, editModeEnabled, onRandom, onCredits, autoplay, onAutoplayChange, theme, onThemeChange }: NavBarProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const { t, i18n } = useTranslation();


  return (
    <header className="fixed top-0 left-0 right-0 h-14 z-[100] flex items-center gap-2 sm:gap-4 px-3 sm:px-6 bg-bg/98 backdrop-blur-sm border-b border-border-subtle">
      {/* Brand */}
      <h1 className="block text-ink text-xl font-bold tracking-wide uppercase">{t('brand')}</h1>

      {/* View switch - desktop */}
      <div className="hidden sm:flex bg-bg/50 border border-border-subtle rounded-lg p-0.5 gap-0.5">
        {([
          { id: 'card', label: t('nav.card') },
          { id: 'map', label: t('nav.map') },
          { id: 'influence', label: t('nav.timeline') },
        ] as const).map(({ id, label }) => (
          <button
            key={id}
            onClick={() => onViewChange(id)}
            className={`px-3 py-1 rounded text-xs font-semibold tracking-wide uppercase transition-all ${view === id ? 'bg-accent text-bg' : 'text-ink3 hover:text-ink'}`}
          >
            {label}
          </button>
        ))}
      </div>
      {/* View switch - mobile (no map) */}
      <div className="sm:hidden flex bg-bg/50 border border-border-subtle rounded-lg p-0.5 gap-0.5 ml-auto">
        {([
          { id: 'card', label: t('nav.card') },
          { id: 'influence', label: t('nav.timeline') },
        ] as const).map(({ id, label }) => (
          <button
            key={id}
            onClick={() => onViewChange(id)}
            className={`px-2 py-1 rounded text-xs font-semibold tracking-wide uppercase transition-all ${view === id ? 'bg-accent text-bg' : 'text-ink3 hover:text-ink'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Desktop controls */}
      <div className="hidden sm:flex ml-auto items-center gap-2 sm:gap-3">
        <button
          onClick={() => onThemeChange(theme === 'light' ? 'dark' : 'light')}
          className={[
            'flex items-center gap-2 px-3 pt-1 pb-1.5 rounded-lg text-ui font-medium tracking-wide border transition-all duration-500 overflow-hidden w-10 hover:w-auto group',
            'bg-transparent border-border text-ink3 hover:bg-bg-hover hover:border-border-hover hover:text-ink',
          ].join(' ')}
          title={theme === 'dark' ? t('nav.switchToLight') : t('nav.switchToDark')}
        >
          <span className="text-ui text-accent shrink-0">☀</span>
          <span className="hidden sm:inline opacity-0 w-0 group-hover:opacity-100 group-hover:w-auto group-hover:ml-2 transition-all duration-500 whitespace-nowrap">
            {theme === 'dark' ? t('nav.lightMode') : t('nav.darkMode')}
          </span>
        </button>
        <button
          onClick={() => onAutoplayChange(!autoplay)}
          className={[
            'flex items-center gap-2 px-3 pt-1 pb-1.5 rounded-lg text-ui font-medium tracking-wide border transition-all duration-500 overflow-hidden w-10 hover:w-auto group',
            'bg-transparent border-border text-ink3 hover:bg-bg-hover hover:border-border-hover hover:text-ink',
          ].join(' ')}
          title={autoplay ? t('nav.autoplayEnabled') : t('nav.autoplayDisabled')}
        >
          <span className="text-ui text-accent shrink-0">{autoplay ? '⏸' : '▶'}</span>
          <span className="hidden sm:inline opacity-0 w-0 group-hover:opacity-100 group-hover:w-auto group-hover:ml-2 transition-all duration-500 whitespace-nowrap">
            {autoplay ? t('nav.noAutoplay') : t('nav.autoplay')}
          </span>
        </button>
        <button onClick={onRandom} className="flex items-center gap-2 px-3 pt-1 pb-1.5 rounded-lg text-ui font-medium tracking-wide border transition-all duration-500 overflow-hidden w-10 hover:w-auto bg-transparent border-border text-ink3 hover:bg-bg-hover hover:border-border-hover hover:text-ink group" title={t('nav.randomMusician')}>
          <span className="text-ui text-accent shrink-0">⚄</span>
          <span className="hidden sm:inline opacity-0 w-0 group-hover:opacity-100 group-hover:w-auto group-hover:ml-2 transition-all duration-500 whitespace-nowrap">{t('nav.random')}</span>
        </button>
        <button onClick={onCredits} className="flex items-center gap-2 px-3 pt-1 pb-1.5 text-ui font-medium tracking-wide text-ink3 hover:text-ink group" title={t('nav.creditsLegal')}>
          {t('nav.credits')}
        </button>
        {editModeEnabled && editMode && (
          <button
            onClick={onCreateNew}
            className="flex items-center gap-2 px-3 pt-1 pb-1.5 rounded-lg text-ui font-medium tracking-wide border transition-all duration-500 overflow-hidden w-10 hover:w-auto bg-transparent border-border text-ink3 hover:bg-bg-hover hover:border-border-hover hover:text-ink group"
          >
            <span className="text-ui text-accent shrink-0">+</span>
            <span className="hidden sm:inline opacity-0 w-0 group-hover:opacity-100 group-hover:w-auto group-hover:ml-2 transition-all duration-500 whitespace-nowrap">{t('nav.newMusician')}</span>
          </button>
        )}
        {editModeEnabled && (
          <button
            onClick={() => onEditModeChange(!editMode)}
            className={[
              'flex items-center gap-2 px-3 pt-1 pb-1.5 rounded-lg text-ui font-medium tracking-wide border transition-all duration-500 overflow-hidden w-10 hover:w-auto',
              'bg-transparent border-border text-ink3 hover:bg-bg-hover hover:border-border-hover hover:text-ink group',
            ].join(' ')}
          >
            <span className="text-ui text-accent shrink-0">{editMode ? '✓' : '✎'}</span>
            <span className="hidden sm:inline opacity-0 w-0 group-hover:opacity-100 group-hover:w-auto group-hover:ml-2 transition-all duration-500 whitespace-nowrap">{editMode ? t('nav.done') : t('nav.edit')}</span>
          </button>
        )}
        <div className="flex items-center bg-bg/50 border border-border-subtle rounded-lg p-0.5 gap-0.5">
          <button
            onClick={() => { i18n.changeLanguage('en'); localStorage.setItem('language', 'en'); }}
            className={`px-2 py-1 rounded text-xs font-semibold tracking-wide uppercase transition-all ${i18n.language === 'en' ? 'bg-accent text-bg' : 'text-ink3 hover:text-ink'}`}
          >
            EN
          </button>
          <button
            onClick={() => { i18n.changeLanguage('es'); localStorage.setItem('language', 'es'); }}
            className={`px-2 py-1 rounded text-xs font-semibold tracking-wide uppercase transition-all ${i18n.language === 'es' ? 'bg-accent text-bg' : 'text-ink3 hover:text-ink'}`}
          >
            ES
          </button>
        </div>
        <AuthButton />
      </div>

      {/* Mobile menu button */}
      <div className="sm:hidden flex items-center gap-2">
        <AuthButton />
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="p-2 rounded-lg border border-border text-ink3 hover:bg-bg-hover hover:border-border-hover hover:text-ink transition-all"
          aria-label={t('nav.menu')}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {mobileMenuOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </div>

      {/* Mobile menu dropdown */}
      {mobileMenuOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/50" onClick={() => setMobileMenuOpen(false)} />
          <div className="fixed top-14 right-0 sm:right-4 w-64 max-w-[calc(100vw-1rem)] bg-bg border border-border-subtle rounded-b-lg shadow-xl z-50 flex flex-col">
            <div className="p-2 flex flex-col gap-1">
              <button
                onClick={() => { onRandom(); setMobileMenuOpen(false) }}
                className="flex items-center gap-3 px-3 pt-1 pb-1.5.5 rounded-lg text-ink hover:bg-bg-hover transition-colors text-left"
              >
                <span className="text-lg text-accent">⚄</span>
                <span className="text-sm">{t('nav.randomMusician')}</span>
              </button>
              <button
                onClick={() => { onThemeChange(theme === 'light' ? 'dark' : 'light'); setMobileMenuOpen(false) }}
                className="flex items-center gap-3 px-3 pt-1 pb-1.5.5 rounded-lg text-ink hover:bg-bg-hover transition-colors text-left"
              >
                <span className="text-lg text-accent">☀</span>
                <span className="text-sm">{t('nav.lightDarkMode')}</span>
              </button>
              <button
                onClick={() => { onAutoplayChange(!autoplay); setMobileMenuOpen(false) }}
                className="flex items-center gap-3 px-3 pt-1 pb-1.5.5 rounded-lg text-ink hover:bg-bg-hover transition-colors text-left"
              >
                <span className="text-lg text-accent">{autoplay ? '⏸' : '▶'}</span>
                <span className="text-sm">{autoplay ? t('nav.disableAutoplay') : t('nav.enableAutoplay')}</span>
              </button>
              <button
                onClick={() => { onCredits(); setMobileMenuOpen(false) }}
                className="flex items-center gap-3 px-3 pt-1 pb-1.5.5 rounded-lg text-ink hover:bg-bg-hover transition-colors text-left"
              >
                <span className="text-lg text-accent">©</span>
                <span className="text-sm">{t('nav.credits')}</span>
              </button>
              {editModeEnabled && editMode && (
                <button
                  onClick={() => { onCreateNew(); setMobileMenuOpen(false) }}
                  className="flex items-center gap-3 px-3 pt-1 pb-1.5.5 rounded-lg text-accent hover:bg-bg-hover transition-colors text-left"
                >
                  <span className="text-lg">+</span>
                  <span className="text-sm">{t('nav.newMusician')}</span>
                </button>
              )}
              {editModeEnabled && (
                <button
                  onClick={() => { onEditModeChange(!editMode); setMobileMenuOpen(false) }}
                  className="flex items-center gap-3 px-3 pt-1 pb-1.5.5 rounded-lg text-ink hover:bg-bg-hover transition-colors text-left"
                >
                  <span className="text-lg text-accent">{editMode ? '✓' : '✎'}</span>
                  <span className="text-sm">{editMode ? t('nav.done') : t('nav.edit')}</span>
                </button>
              )}
              {editModeEnabled && (
                <button
                  onClick={() => { onEditModeChange(!editMode); setMobileMenuOpen(false) }}
                  className="flex items-center gap-3 px-3 pt-1 pb-1.5.5 rounded-lg text-ink hover:bg-bg-hover transition-colors text-left"
                >
                  <span className="text-lg">{editMode ? '✓' : '✎'}</span>
                  <span className="text-sm">{editMode ? t('nav.doneEditing') : t('nav.editMode')}</span>
                </button>
              )}
              <div className="flex items-center gap-3 px-3 py-1.5">
                <div className="flex items-center bg-bg/50 border border-border-subtle rounded-lg p-0.5 gap-0.5">
                  <button
                    onClick={() => { i18n.changeLanguage('en'); localStorage.setItem('language', 'en'); setMobileMenuOpen(false); }}
                    className={`px-2.5 py-1 rounded text-xs font-semibold tracking-wide uppercase transition-all ${i18n.language === 'en' ? 'bg-accent text-bg' : 'text-ink3 hover:text-ink'}`}
                  >
                    EN
                  </button>
                  <button
                    onClick={() => { i18n.changeLanguage('es'); localStorage.setItem('language', 'es'); setMobileMenuOpen(false); }}
                    className={`px-2.5 py-1 rounded text-xs font-semibold tracking-wide uppercase transition-all ${i18n.language === 'es' ? 'bg-accent text-bg' : 'text-ink3 hover:text-ink'}`}
                  >
                    ES
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </header>
  );
}
