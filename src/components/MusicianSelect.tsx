import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { Musician } from '../types';

interface MusicianSelectProps {
  selected: string[];
  onChange: (ids: string[]) => void;
  musicians: Musician[];
  placeholder?: string;
  label?: string;
  disabled?: boolean;
}

export default function MusicianSelect({ selected, onChange, musicians, placeholder, label, disabled = false }: MusicianSelectProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Filter musicians based on search and exclude already selected
  const filteredMusicians = musicians.filter((m: Musician) => {
    const matchesSearch = m.name.toLowerCase().includes(search.toLowerCase());
    const notSelected = !selected.includes(m.id);
    return matchesSearch && notSelected;
  });

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleRemove = (id: string) => {
    onChange(selected.filter((s) => s !== id));
  };

  const handleAdd = (id: string) => {
    onChange([...selected, id]);
    setSearch('');
  };

  const selectedMusicians = musicians.filter((m: Musician) => selected.includes(m.id));

  return (
    <div className="relative">
      <label className="block text-ink3 text-sm mb-1">{label || t('musicianSelect.selectMusicians')}</label>
      
      {/* Selected items display */}
      <div
        onClick={() => !disabled && setIsOpen(true)}
        className={`min-h-[60px] p-2 bg-bg border ${disabled ? 'border-border-subtle opacity-50' : 'border-border-subtle hover:border-border cursor-pointer'} rounded-lg flex flex-wrap gap-2 focus-within:ring-2 focus-within:ring-accent/20`}
      >
        {selectedMusicians.length === 0 && !isOpen && (
          <span className="text-ink3/50 text-sm">{placeholder || t('musicianSelect.selectMusiciansPlaceholder')}</span>
        )}
        
        {selectedMusicians.map((musician) => (
          <span
            key={musician.id}
            className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium border border-border-subtle bg-bg-elevated text-ink"
            style={{
              color: getStyleHex(musician.bluesStyle),
              borderColor: `rgba(${getStyleColor(musician.bluesStyle).join(',')},0.3)`,
            }}
          >
            {musician.name}
            {!disabled && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemove(musician.id);
                }}
                className="hover:text-red-400 transition-colors"
              >
                ✕
              </button>
            )}
          </span>
        ))}

        {!disabled && (
          <button
            type="button"
            className="text-accent text-xs font-medium hover:text-accent2"
            onClick={(e) => {
              e.stopPropagation();
              setIsOpen(true);
              setTimeout(() => inputRef.current?.focus(), 0);
            }}
          >
            {t('musicianSelect.add')}
          </button>
        )}
      </div>

      {/* Dropdown */}
      {isOpen && !disabled && (
        <div
          ref={dropdownRef}
          className="absolute z-50 w-full mt-1 bg-bg border border-border-subtle rounded-lg shadow-xl max-h-64 overflow-hidden flex flex-col"
        >
          {/* Search input */}
          <div className="p-2 border-b border-border-subtle">
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('musicianSelect.searchMusicians')}
              className="w-full px-3 py-2 bg-bg2 border border-border-subtle rounded text-ink text-sm focus:border-accent focus:outline-none"
              autoFocus
            />
          </div>

          {/* Dropdown list */}
          <div className="overflow-y-auto flex-1 p-1">
            {filteredMusicians.length === 0 ? (
              <div className="text-ink3/50 text-sm text-center py-4">
                {search ? t('musicianSelect.noMusiciansFound') : t('musicianSelect.allSelected')}
              </div>
            ) : (
              filteredMusicians.slice(0, 50).map((musician) => (
                <button
                  key={musician.id}
                  type="button"
                  onClick={() => {
                    handleAdd(musician.id);
                    setIsOpen(false);
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded hover:bg-bg-hover transition-colors text-left"
                >
                  <img
                    src={musician.image || `https://ui-avatars.com/api/?name=${encodeURIComponent(musician.name)}&background=251a0d&color=c8872a&size=32`}
                    alt={musician.name}
                    className="w-8 h-8 rounded-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src =
                        `https://ui-avatars.com/api/?name=${encodeURIComponent(musician.name)}&background=251a0d&color=c8872a&size=32`;
                    }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-ink truncate">{musician.name}</div>
                    <div className="text-xs text-ink3 truncate">{t(`styles.${musician.bluesStyle}`, musician.bluesStyle)}</div>
                  </div>
                  <span
                    className="text-xs px-2 py-0.5 rounded font-medium"
                    style={{
                      color: getStyleHex(musician.bluesStyle),
                      background: `rgba(${getStyleColor(musician.bluesStyle).join(',')},0.15)`,
                    }}
                  >
                    {t(`styles.${musician.bluesStyle}`, musician.bluesStyle).replace(' Blues', '')}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Helper functions for colors
function getStyleHex(style: string): string {
  const colors: Record<string, string> = {
    'Delta Blues': '#c8872a',
    'Chicago Blues': '#4a90d9',
    'Texas Blues': '#e84545',
    'Jump Blues': '#f1c40f',
    'Country Blues': '#65a30d',
    'Classic Blues': '#d4af37',
    'Memphis Blues': '#c84680',
    'New Orleans Blues': '#dc6e3a',
    'Rythm and Blues': '#2ecc71',
    'Soul Blues': '#e91e63',
    'West Coast Blues': '#3498db',
    'British Blues': '#5a82db',
    'Piedmont Blues': '#8e44ad',
    'St. Louis Blues': '#b989b3',
    'Georgia Blues': '#d28c45',
    'Hill Country Blues': '#82c99a',
    'Swamp Blues': '#50a07a',
    'Kansas City Blues': '#785ada',
    'Detroit Blues': '#9b9b9b',
    'Vaudeville Blues': '#b48c5d',
    'Boogie Woogie': '#1abc9c',
    'Jazz': '#1abc9c',
    'Gospel': '#e74c3c',
  };
  return colors[style] || '#969696';
}

function getStyleColor(style: string): [number, number, number] {
  const colors: Record<string, [number, number, number]> = {
    'Delta Blues': [200, 135, 42],
    'Chicago Blues': [74, 144, 217],
    'Texas Blues': [232, 69, 69],
    'Jump Blues': [200, 150, 20],
    'Country Blues': [101, 163, 13],
    'Classic Blues': [212, 175, 55],
    'Memphis Blues': [200, 70, 120],
    'New Orleans Blues': [220, 110, 50],
    'Rythm and Blues': [46, 204, 113],
    'Soul Blues': [233, 30, 99],
    'West Coast Blues': [52, 152, 219],
    'British Blues': [90, 130, 200],
    'Piedmont Blues': [142, 68, 173],
    'St. Louis Blues': [185, 110, 160],
    'Georgia Blues': [210, 140, 50],
    'Hill Country Blues': [130, 200, 90],
    'Swamp Blues': [80, 160, 90],
    'Kansas City Blues': [120, 90, 210],
    'Detroit Blues': [155, 155, 155],
    'Vaudeville Blues': [180, 140, 80],
    'Boogie Woogie': [26, 188, 156],
    'Jazz': [26, 188, 156],
    'Gospel': [231, 76, 60],
  };
  return colors[style] || [150, 150, 150];
}
