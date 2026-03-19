import { useState } from 'react'
import AuthButton from './auth/AuthButton'

interface NavBarProps {
  view: 'influence' | 'map';
  onViewChange: (view: 'influence' | 'map') => void;
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

  const tabClass = (active: boolean) => [
    'flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-2 rounded-lg text-ui font-medium tracking-wide border transition-all duration-200',
    active
      ? 'bg-bg-hover border-accent text-accent shadow-sm'
      : 'bg-transparent border-border text-ink3 hover:bg-bg-hover hover:border-border-hover hover:text-ink',
  ].join(' ')

  const btnClass = 'flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-2 rounded-lg text-ui font-medium tracking-wide border border-border text-ink3 hover:bg-bg-hover hover:border-border-hover hover:text-ink transition-all duration-200'

  return (
    <header className="fixed top-0 left-0 right-0 h-14 z-[100] flex items-center gap-2 sm:gap-4 px-3 sm:px-6 bg-bg/98 backdrop-blur-sm border-b border-border-subtle">
      {/* Brand */}
      <h1 className="block text-ink text-base font-bold tracking-wide">The Blues Map</h1>

      {/* View tabs - desktop */}
      <nav className="hidden sm:flex gap-1 sm:gap-1.5 shrink-0">
        {([
          { id: 'influence', label: 'Timeline' },
          { id: 'map', label: 'Map' },
        ] as const).map(({ id, label }) => (
          <button key={id} onClick={() => onViewChange(id)} className={tabClass(view === id)}>
            {label}
          </button>
        ))}
      </nav>

      {/* View tabs - mobile */}
      <div className="sm:hidden flex gap-1 ml-auto">
        {([
          { id: 'influence', label: 'Timeline' },
          { id: 'map', label: 'Map' },
        ] as const).map(({ id, label }) => (
          <button
            key={id}
            onClick={() => onViewChange(id)}
            className={[
              'px-3 py-1.5 rounded-lg text-xs font-medium tracking-wide border transition-all duration-200',
              view === id
                ? 'bg-bg-hover border-accent text-accent shadow-sm'
                : 'bg-transparent border-border text-ink3 hover:bg-bg-hover hover:border-border-hover hover:text-ink',
            ].join(' ')}
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
            'flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-2 rounded-lg text-ui font-medium tracking-wide border transition-all duration-200',
            theme === 'dark'
              ? 'bg-accent/20 border-accent text-accent shadow-sm'
              : 'bg-transparent border-border text-ink3 hover:bg-bg-hover hover:border-border-hover hover:text-ink',
          ].join(' ')}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          <span className="text-ui">{theme === 'dark' ? '☀️' : '🌙'}</span>
          <span className="hidden sm:inline">{theme === 'dark' ? 'Light' : 'Dark'}</span>
        </button>
        <button
          onClick={() => onAutoplayChange(!autoplay)}
          className={[
            'flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-2 rounded-lg text-ui font-medium tracking-wide border transition-all duration-200',
            autoplay
              ? 'bg-accent/20 border-accent text-accent shadow-sm'
              : 'bg-transparent border-border text-ink3 hover:bg-bg-hover hover:border-border-hover hover:text-ink',
          ].join(' ')}
          title={autoplay ? 'Autoplay enabled' : 'Autoplay disabled'}
        >
          <span className="text-ui">{autoplay ? '⏸' : '▶'}</span>
          <span className="hidden sm:inline">{autoplay ? 'Disable Autoplay' : 'Enable Autoplay'}</span>
        </button>
        <button onClick={onRandom} className={btnClass} title="Random musician">
          <span className="text-ui">⚄</span>
          <span className="hidden sm:inline">Random</span>
        </button>
        <button onClick={onCredits} className={btnClass} title="Credits & Legal">
          <span className="text-ui">©</span>
          <span className="hidden sm:inline">Credits</span>
        </button>
        {editModeEnabled && editMode && (
          <button
            onClick={onCreateNew}
            className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-2 rounded-lg text-ui font-medium tracking-wide border bg-accent/20 border-accent text-accent shadow-sm"
          >
            <span className="text-ui">+</span>
            <span className="hidden sm:inline">New Musician</span>
          </button>
        )}
        {editModeEnabled && (
          <button
            onClick={() => onEditModeChange(!editMode)}
            className={[
              'flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-2 rounded-lg text-ui font-medium tracking-wide border transition-all duration-200',
              editMode
                ? 'bg-accent/20 border-accent text-accent shadow-sm'
                : 'bg-transparent border-border text-ink3 hover:bg-bg-hover hover:border-border-hover hover:text-ink',
            ].join(' ')}
          >
            <span className="text-ui">{editMode ? '✓' : '✎'}</span>
            <span className="hidden sm:inline">{editMode ? 'Done' : 'Edit'}</span>
          </button>
        )}
        <p className="hidden md:block text-label text-ink3 font-medium">
          {editModeEnabled && editMode ? 'Click to edit' : 'Click a musician'}
        </p>
        <AuthButton />
      </div>

      {/* Mobile menu button */}
      <div className="sm:hidden flex items-center gap-2">
        <AuthButton />
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="p-2 rounded-lg border border-border text-ink3 hover:bg-bg-hover hover:border-border-hover hover:text-ink transition-all"
          aria-label="Menu"
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
                 className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-ink hover:bg-bg-hover transition-colors text-left"
               >
                 <span className="text-lg">⚄</span>
                 <span className="text-sm">Random Musician</span>
               </button>
               <button
                 onClick={() => { onThemeChange(theme === 'light' ? 'dark' : 'light'); setMobileMenuOpen(false) }}
                 className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-ink hover:bg-bg-hover transition-colors text-left"
               >
                 <span className="text-lg">{theme === 'dark' ? '☀️' : '🌙'}</span>
                 <span className="text-sm">{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
               </button>
               <button
                 onClick={() => { onAutoplayChange(!autoplay); setMobileMenuOpen(false) }}
                 className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-ink hover:bg-bg-hover transition-colors text-left"
               >
                 <span className="text-lg">{autoplay ? '⏸' : '▶'}</span>
                 <span className="text-sm">{autoplay ? 'Disable Autoplay' : 'Enable Autoplay'}</span>
               </button>
              <button
                onClick={() => { onCredits(); setMobileMenuOpen(false) }}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-ink hover:bg-bg-hover transition-colors text-left"
              >
                <span className="text-lg">©</span>
                <span className="text-sm">Credits</span>
              </button>
              {editModeEnabled && editMode && (
                <button
                  onClick={() => { onCreateNew(); setMobileMenuOpen(false) }}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-accent hover:bg-bg-hover transition-colors text-left"
                >
                  <span className="text-lg">+</span>
                  <span className="text-sm">New Musician</span>
                </button>
              )}
              {editModeEnabled && (
                <button
                  onClick={() => { onEditModeChange(!editMode); setMobileMenuOpen(false) }}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-ink hover:bg-bg-hover transition-colors text-left"
                >
                  <span className="text-lg">{editMode ? '✓' : '✎'}</span>
                  <span className="text-sm">{editMode ? 'Done Editing' : 'Edit Mode'}</span>
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </header>
  );
}
