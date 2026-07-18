'use client';

/**
 * SearchBar Component — Reusable search bar with autocomplete
 *
 * PART 1: Types and constants
 * PART 2: Suggestion item renderer
 * PART 3: Main SearchBar component with keyboard navigation
 */

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type KeyboardEvent,
  type ChangeEvent,
} from 'react';
import { useRouter } from 'next/navigation';
import { Search, X, Zap, Calculator, BookOpen, Clock } from 'lucide-react';
import type { Suggestion, SuggestionType } from '@/search/types';

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — Types & Constants
// ═══════════════════════════════════════════════════════════════════════════════

interface SearchBarProps {
  defaultValue?: string;
  placeholder?: string;
  autoFocus?: boolean;
  onSearch?: (query: string) => void;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

const DEBOUNCE_MS = 300;

const ICON_MAP: Record<SuggestionType, typeof Zap> = {
  term: Zap,
  calculator: Calculator,
  standard: BookOpen,
  recent: Clock,
};

const TYPE_LABEL: Record<SuggestionType, string> = {
  term: '용어',
  calculator: '계산기',
  standard: '기준',
  recent: '최근',
};

const SIZE_CLASSES = {
  sm: 'h-10 text-sm',
  md: 'h-12 text-base',
  lg: 'h-14 text-lg',
} as const;

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — Suggestion Item
// ═══════════════════════════════════════════════════════════════════════════════

function SuggestionItem({
  suggestion,
  isActive,
  onClick,
}: {
  suggestion: Suggestion;
  isActive: boolean;
  onClick: () => void;
}) {
  const Icon = ICON_MAP[suggestion.type] ?? Zap;

  return (
    <button
      type="button"
      role="option"
      aria-selected={isActive}
      className={`
        flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors
        ${isActive ? 'bg-[var(--bg-tertiary)]' : 'hover:bg-[var(--bg-secondary)]'}
      `}
      onClick={onClick}
      onMouseDown={(e) => e.preventDefault()}
    >
      <Icon
        size={16}
        className="shrink-0 text-[var(--text-tertiary)]"
      />
      <div className="min-w-0 flex-1">
        <span className="block truncate text-[var(--text-primary)]">
          {suggestion.text}
        </span>
        {suggestion.subtitle && (
          <span className="block truncate text-xs text-[var(--text-tertiary)]">
            {suggestion.subtitle}
          </span>
        )}
      </div>
      <span className="shrink-0 rounded bg-[var(--bg-tertiary)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-tertiary)]">
        {TYPE_LABEL[suggestion.type]}
      </span>
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 3 — Main SearchBar
// ═══════════════════════════════════════════════════════════════════════════════

export default function SearchBar({
  defaultValue = '',
  placeholder = '전기 공학 검색 — 계산기, 기준, 용어...',
  autoFocus = false,
  onSearch,
  className = '',
  size = 'md',
}: SearchBarProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [query, setQuery] = useState(defaultValue);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [isOpen, setIsOpen] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch suggestions with debounce — calls /api/autocomplete
  const fetchSuggestions = useCallback((partial: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      try {
        const limit = partial.trim().length === 0 ? 8 : 10;
        const params = new URLSearchParams({ q: partial, lang: 'ko', limit: String(limit) });
        const res = await fetch(`/api/autocomplete?${params.toString()}`);
        if (!res.ok) throw new Error(`Autocomplete failed (${res.status})`);
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          setSuggestions(json.data);
        } else {
          setSuggestions([]);
        }
      } catch {
        setSuggestions([]);
      }
    }, DEBOUNCE_MS);
  }, []);

  // Handle input change
  const handleChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setQuery(value);
      setActiveIndex(-1);
      setIsOpen(true);
      fetchSuggestions(value);
    },
    [fetchSuggestions],
  );

  // Submit search
  const submitSearch = useCallback(
    (searchQuery: string) => {
      const trimmed = searchQuery.trim();
      if (!trimmed) return;

      setIsOpen(false);

      // Record to recent searches
      import('@/search/autocomplete')
        .then(({ recordRecentSearch }) => recordRecentSearch(trimmed))
        .catch((err) => {
          console.warn('[SearchBar] Failed to record recent search:', err);
          setSearchError('최근 검색 기록 저장에 실패했습니다.');
          setTimeout(() => setSearchError(null), 3000);
        });

      if (onSearch) {
        onSearch(trimmed);
      } else {
        router.push(`/search?q=${encodeURIComponent(trimmed)}`);
      }
    },
    [onSearch, router],
  );

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (!isOpen || suggestions.length === 0) {
        if (e.key === 'Enter') {
          submitSearch(query);
        }
        return;
      }

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setActiveIndex((prev) =>
            prev < suggestions.length - 1 ? prev + 1 : 0,
          );
          break;
        case 'ArrowUp':
          e.preventDefault();
          setActiveIndex((prev) =>
            prev > 0 ? prev - 1 : suggestions.length - 1,
          );
          break;
        case 'Enter':
          e.preventDefault();
          if (activeIndex >= 0 && activeIndex < suggestions.length) {
            const selected = suggestions[activeIndex];
            setQuery(selected.text);
            submitSearch(selected.text);
          } else {
            submitSearch(query);
          }
          break;
        case 'Escape':
          setIsOpen(false);
          setActiveIndex(-1);
          break;
      }
    },
    [isOpen, suggestions, activeIndex, query, submitSearch],
  );

  // Clear input
  const handleClear = useCallback(() => {
    setQuery('');
    setSuggestions([]);
    setIsOpen(false);
    inputRef.current?.focus();
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Input field */}
      <div
        className={`
          flex items-center gap-2 rounded-xl border border-[var(--border-default)]
          bg-[var(--bg-primary)] px-4 shadow-sm transition-shadow
          focus-within:border-[var(--color-primary)] focus-within:shadow-md
          ${SIZE_CLASSES[size]}
        `}
      >
        <Search size={18} className="shrink-0 text-[var(--text-tertiary)]" />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={isOpen && suggestions.length > 0}
          aria-haspopup="listbox"
          aria-autocomplete="list"
          value={query}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            setIsOpen(true);
            fetchSuggestions(query);
          }}
          placeholder={placeholder}
          autoFocus={autoFocus}
          className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-[var(--text-tertiary)]"
        />
        {query.length > 0 && (
          <button
            type="button"
            onClick={handleClear}
            className="shrink-0 rounded-full p-1 text-[var(--text-tertiary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-secondary)]"
            aria-label="검색어 지우기"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* Search error toast */}
      {searchError && (
        <div className="absolute left-0 right-0 top-full z-[var(--z-dropdown)] mt-1 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-[var(--color-error)]">
          {searchError}
        </div>
      )}

      {/* Suggestions dropdown */}
      {isOpen && suggestions.length > 0 && !searchError && (
        <div
          role="listbox"
          className="absolute left-0 right-0 top-full z-[var(--z-dropdown)] mt-1 overflow-hidden rounded-xl border border-[var(--border-default)] bg-[var(--bg-primary)] py-1 shadow-lg"
        >
          {suggestions.map((suggestion, i) => (
            <SuggestionItem
              key={`${suggestion.type}-${suggestion.text}`}
              suggestion={suggestion}
              isActive={i === activeIndex}
              onClick={() => {
                setQuery(suggestion.text);
                submitSearch(suggestion.text);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
