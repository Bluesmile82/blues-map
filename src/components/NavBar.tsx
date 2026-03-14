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
}

export default function NavBar({ view, onViewChange, editMode, onEditModeChange, onCreateNew, editModeEnabled, onRandom, onCredits, autoplay, onAutoplayChange }: NavBarProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  return (
    <header className="fixed top-0 left-0 right-0 h-14 z-[100] flex items-center gap-2 sm:gap-4 px-3 sm:px-6 bg-[#0a0805]/98 backdrop-blur-lg border-b border-[#2a1e0e]">
      {/* Brand */}
      <h1 className="block text-ink text-base font-bold tracking-wide">The Blues Map</h1>

      {/* View tabs - hide on mobile, show on sm+ */}
      <nav className="hidden sm:flex gap-1 sm:gap-1.5 shrink-0">
        {([
          { id: 'influence', label: 'Timeline' },
          { id: 'map', label: 'Map' },
        ] as const).map(({ id, label }) => (
          <button
            key={id}
            onClick={() => onViewChange(id)}
            className={[
              'flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-2 rounded-lg text-[0.8rem] font-medium tracking-wide border transition-all duration-200',
              view === id
                ? 'bg-[#1a1208] border-accent text-accent shadow-sm'
                : 'bg-transparent border-[#3a2a15] text-ink3 hover:bg-[#1a1208] hover:border-[#4a3a25] hover:text-ink',
            ].join(' ')}
          >
            {label}
          </button>
        ))}
      </nav>

      {/* Mobile view tabs */}
      <div className="sm:hidden flex gap-1 ml-auto">
        {([
          { id: 'influence', label: 'Timeline' },
          { id: 'map', label: 'Map' },
        ] as const).map(({ id, label }) => (
          <button
            key={id}
            onClick={() => onViewChange(id)}
            className={[
              'px-3 py-1.5 rounded-lg text-[0.75rem] font-medium tracking-wide border transition-all duration-200',
              view === id
                ? 'bg-[#1a1208] border-accent text-accent shadow-sm'
                : 'bg-transparent border-[#3a2a15] text-ink3 hover:bg-[#1a1208] hover:border-[#4a3a25] hover:text-ink',
            ].join(' ')}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Desktop controls */}
      <div className="hidden sm:flex ml-auto items-center gap-2 sm:gap-3">
        <button
          onClick={() => onAutoplayChange(!autoplay)}
          className={[
            'flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-2 rounded-lg text-[0.8rem] font-medium tracking-wide border transition-all duration-200',
            autoplay
              ? 'bg-accent/20 border-accent text-accent shadow-sm'
              : 'bg-transparent border-[#3a2a15] text-ink3 hover:bg-[#1a1208] hover:border-[#4a3a25] hover:text-ink',
          ].join(' ')}
          title={autoplay ? 'Autoplay enabled' : 'Autoplay disabled'}
        >
          <span className="text-[0.85rem]">{autoplay ? '⏸' : '▶'}</span>
          <span className="hidden sm:inline">{autoplay ? 'Disable Autoplay' : 'Enable Autoplay'}</span>
        </button>
        <button
          onClick={onRandom}
          className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-2 rounded-lg text-[0.8rem] font-medium tracking-wide border border-border text-ink3 hover:bg-[#1a1208] hover:border-[#4a3a25] hover:text-ink transition-all duration-200"
          title="Random musician"
        >
          <span className="text-[0.85rem]">⚄</span>
          <span className="hidden sm:inline">Random</span>
        </button>
        <button
          onClick={onCredits}
          className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-2 rounded-lg text-[0.8rem] font-medium tracking-wide border border-border text-ink3 hover:bg-[#1a1208] hover:border-[#4a3a25] hover:text-ink transition-all duration-200"
          title="Credits & Legal"
        >
          <span className="text-[0.85rem]">©</span>
          <span className="hidden sm:inline">Credits</span>
        </button>
        {editModeEnabled && editMode && (
          <button
            onClick={onCreateNew}
            className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-2 rounded-lg text-[0.8rem] font-medium tracking-wide border bg-accent/20 border-accent text-accent shadow-sm"
          >
            <span className="text-[0.85rem]">+</span>
            <span className="hidden sm:inline">New Musician</span>
          </button>
        )}
        {editModeEnabled && (
          <button
            onClick={() => onEditModeChange(!editMode)}
            className={[
              'flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-2 rounded-lg text-[0.8rem] font-medium tracking-wide border transition-all duration-200',
              editMode
                ? 'bg-accent/20 border-accent text-accent shadow-sm'
                : 'bg-transparent border-[#3a2a15] text-ink3 hover:bg-[#1a1208] hover:border-[#4a3a25] hover:text-ink',
            ].join(' ')}
          >
            <span className="text-[0.85rem]">{editMode ? '✓' : '✎'}</span>
            <span className="hidden sm:inline">{editMode ? 'Done' : 'Edit'}</span>
          </button>
        )}
        <p className="hidden md:block text-[0.7rem] text-ink3 font-medium">
          {editModeEnabled && editMode ? 'Click to edit' : 'Click a musician'}
        </p>
        <AuthButton />
      </div>

      {/* Mobile menu button */}
      <div className="sm:hidden flex items-center gap-2">
        <AuthButton />
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="p-2 rounded-lg border border-[#3a2a15] text-ink3 hover:bg-[#1a1208] hover:border-[#4a3a25] hover:text-ink transition-all"
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
          <div
            className="fixed inset-0 z-40 bg-black/50"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="fixed top-14 right-0 sm:right-4 w-64 max-w-[calc(100vw-1rem)] bg-[#0a0805] border border-[#2a1e0e] rounded-b-lg shadow-xl z-50 flex flex-col">
            <div className="p-2 flex flex-col gap-1">
              <button
                onClick={() => {
                  onRandom()
                  setMobileMenuOpen(false)
                }}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-ink hover:bg-[#1a1208] transition-colors text-left"
              >
                <span className="text-lg">⚄</span>
                <span className="text-sm">Random Musician</span>
              </button>
              <button
                onClick={() => {
                  onAutoplayChange(!autoplay)
                  setMobileMenuOpen(false)
                }}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-ink hover:bg-[#1a1208] transition-colors text-left"
              >
                <span className="text-lg">{autoplay ? '⏸' : '▶'}</span>
                <span className="text-sm">{autoplay ? 'Disable Autoplay' : 'Enable Autoplay'}</span>
              </button>
              <button
                onClick={() => {
                  onCredits()
                  setMobileMenuOpen(false)
                }}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-ink hover:bg-[#1a1208] transition-colors text-left"
              >
                <span className="text-lg">©</span>
                <span className="text-sm">Credits</span>
              </button>
              {editModeEnabled && editMode && (
                <button
                  onClick={() => {
                    onCreateNew()
                    setMobileMenuOpen(false)
                  }}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-accent hover:bg-[#1a1208] transition-colors text-left"
                >
                  <span className="text-lg">+</span>
                  <span className="text-sm">New Musician</span>
                </button>
              )}
              {editModeEnabled && (
                <button
                  onClick={() => {
                    onEditModeChange(!editMode)
                    setMobileMenuOpen(false)
                  }}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-ink hover:bg-[#1a1208] transition-colors text-left"
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
