interface NavBarProps {
  view: 'influence' | 'map';
  onViewChange: (view: 'influence' | 'map') => void;
  editMode: boolean;
  onEditModeChange: (editMode: boolean) => void;
  onCreateNew: () => void;
}

export default function NavBar({ view, onViewChange, editMode, onEditModeChange, onCreateNew }: NavBarProps) {
  return (
    <header className="fixed top-0 left-0 right-0 h-14 z-[100] flex items-center gap-4 px-6 bg-[#0a0805]/98 backdrop-blur-lg border-b border-[#2a1e0e]">
      {/* Brand */}
      <div className="flex items-baseline gap-2.5 shrink-0">
        <span className="text-accent text-xl">♬</span>
        <div className="flex flex-col">
          <span className="text-ink text-base font-bold tracking-wide">Blues Genealogy</span>
        </div>
      </div>

      {/* View tabs */}
      <nav className="flex gap-1.5 shrink-0">
        {([
          { id: 'influence', icon: '⬡', label: 'Influence' },
          { id: 'map', icon: '◉', label: 'Map' },
        ] as const).map(({ id, icon, label }) => (
          <button
            key={id}
            onClick={() => onViewChange(id)}
            className={[
              'flex items-center gap-2 px-4 py-2 rounded-lg text-[0.8rem] font-medium tracking-wide border transition-all duration-200',
              view === id
                ? 'bg-[#1a1208] border-accent text-accent shadow-sm'
                : 'bg-transparent border-[#3a2a15] text-ink3 hover:bg-[#1a1208] hover:border-[#4a3a25] hover:text-ink',
            ].join(' ')}
          >
            <span className="text-[0.85rem]">{icon}</span>
            {label}
          </button>
        ))}
      </nav>

      <div className="ml-auto flex items-center gap-3">
        {editMode && (
          <button
            onClick={onCreateNew}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-[0.8rem] font-medium tracking-wide border bg-accent/20 border-accent text-accent shadow-sm"
          >
            <span className="text-[0.85rem]">+</span>
            New Musician
          </button>
        )}
        <button
          onClick={() => onEditModeChange(!editMode)}
          className={[
            'flex items-center gap-2 px-4 py-2 rounded-lg text-[0.8rem] font-medium tracking-wide border transition-all duration-200',
            editMode
              ? 'bg-accent/20 border-accent text-accent shadow-sm'
              : 'bg-transparent border-[#3a2a15] text-ink3 hover:bg-[#1a1208] hover:border-[#4a3a25] hover:text-ink',
          ].join(' ')}
        >
          <span className="text-[0.85rem]">{editMode ? '✓' : '✎'}</span>
          {editMode ? 'Done' : 'Edit'}
        </button>
        <p className="text-[0.7rem] text-ink3 font-medium">
          {editMode ? 'Click to edit' : 'Click a musician'}
        </p>
      </div>
    </header>
  );
}
