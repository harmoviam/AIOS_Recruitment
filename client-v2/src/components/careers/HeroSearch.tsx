import { useEffect, useMemo, useRef, useState } from 'react';
import { normalizeSearch } from './careers';
import { IconArrowRight, IconSearch } from './icons';

interface HeroSearchProps {
  tenantName: string;
  roleCount: number;
  cityCount: number;
  suggestions: string[];
  popularChips: string[];
  onSearch: (query: string) => void;
}

/** Hero banner with an autocompleting role/query search bar. */
export default function HeroSearch({ tenantName, roleCount, cityCount, suggestions, popularChips, onSearch }: HeroSearchProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  const matches = useMemo(() => {
    const q = normalizeSearch(query);
    if (!q) return [];
    return suggestions.filter((s) => normalizeSearch(s).includes(q)).slice(0, 6);
  }, [suggestions, query]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        setActive(-1);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const submit = (value: string) => {
    if (!value.trim()) return;
    onSearch(value.trim());
    setOpen(false);
    setActive(-1);
    inputRef.current?.blur();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open || matches.length === 0) {
      if (e.key === 'Enter') {
        e.preventDefault();
        submit(query);
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => (a + 1) % matches.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => (a <= 0 ? matches.length - 1 : a - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const value = active >= 0 ? matches[active] : query;
      submit(value);
    } else if (e.key === 'Escape') {
      setOpen(false);
      setActive(-1);
    }
  };

  return (
    <section className="careers-hero">
      <div className="careers-container">
        <span className="careers-hero-badge">
          <span className="careers-hero-badge-dot" />
          Trusted by verified recruiters · Fast, no-spam applications
        </span>

        <h1 className="careers-hero-title">
          Your next big role, <em>closer than you think</em>
        </h1>

        <p className="careers-hero-sub">
          {tenantName} works with thousands of verified businesses to place talent in roles that fit your
          skills, location and ambition. Find an opportunity, apply in minutes, and hear back fast.
        </p>

        <div className="careers-hero-actions">
          <div className="careers-search">
            <form
              className="careers-search-form"
              role="search"
              onSubmit={(e) => {
                e.preventDefault();
                submit(query);
              }}
            >
              <span className="careers-search-icon">
                <IconSearch width={20} height={20} />
              </span>
              <input
                ref={inputRef}
                className="careers-search-input"
                type="text"
                value={query}
                placeholder="Try “Full Stack Engineer”, “React”, “B2B Sales”…"
                aria-label="Search open roles"
                autoComplete="off"
                onChange={(e) => {
                  setQuery(e.target.value);
                  setOpen(true);
                  setActive(-1);
                }}
                onFocus={() => setOpen(true)}
                onKeyDown={onKeyDown}
              />
              <button type="submit" className="careers-btn careers-btn-primary careers-search-go">
                Search
              </button>
            </form>

            {open && matches.length > 0 && (
              <div className="careers-search-pop" role="listbox" aria-label="Suggestions">
                {matches.map((s, i) => (
                  <button
                    key={s}
                    type="button"
                    role="option"
                    aria-selected={i === active}
                    className="careers-search-suggest"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => submit(s)}
                    onMouseEnter={() => setActive(i)}
                  >
                    <IconSearch width={15} height={15} style={{ flex: 'none', opacity: 0.55 }} />
                    {highlight(s, query)}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            className="careers-btn careers-btn-gold"
            onClick={() => onSearch('')}
            data-action="view-all-roles"
          >
            View all roles <IconArrowRight width={16} height={16} />
          </button>
        </div>

        {popularChips.length > 0 && (
          <div className="careers-search-hint">
            <span className="careers-search-hint-label">Popular:</span>
            {popularChips.slice(0, 5).map((chip) => (
              <button key={chip} type="button" className="careers-chip" onClick={() => submit(chip)}>
                {chip}
              </button>
            ))}
          </div>
        )}

        <div className="careers-hero-meta">
          <span>
            <strong>{roleCount}</strong> open role{roleCount === 1 ? '' : 's'}
          </span>
          <span className="sep">•</span>
          <span>
            <strong>{cityCount}</strong> cit{cityCount === 1 ? 'y' : 'ies'} to explore
          </span>
          <span className="sep">•</span>
          <span>
            <strong>Zero</strong> cost to you — ever
          </span>
        </div>
      </div>
    </section>
  );
}

function highlight(text: string, query: string) {
  const q = normalizeSearch(query);
  if (!q) return text;
  const i = text.toLowerCase().indexOf(q);
  if (i === -1) return text;
  return (
    <>
      {text.slice(0, i)}
      <mark>{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}