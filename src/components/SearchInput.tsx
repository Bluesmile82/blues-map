import { forwardRef } from 'react';

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  className?: string;
}

const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(
  ({ value, onChange, placeholder, onKeyDown, className = '' }, ref) => {
    return (
      <div className={`relative ${className}`}>
        <input
          ref={ref}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          className="w-full bg-bg/50 border border-accent/50 rounded-lg px-2.5 py-1.5 text-xs text-ink placeholder-ink3 outline-none focus:border-accent transition-colors"
        />
        {value && (
          <button
            onClick={() => onChange('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-ink3 hover:text-ink text-xs"
          >
            ✕
          </button>
        )}
      </div>
    );
  }
);

SearchInput.displayName = 'SearchInput';
export default SearchInput;
