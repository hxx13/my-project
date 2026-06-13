// components/UserSelector.tsx — 人员搜索选择器
import { useState, useRef, useEffect, useCallback } from 'react';
import { adminHttp } from '@/api/core/adminHttp';
import { Search, X, User } from 'lucide-react';

interface UserOption {
  id: number;
  username: string;
  realName?: string;
  role?: string;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export default function UserSelector({ value, onChange, placeholder = '搜索用户...' }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  const doSearch = useCallback(async (q: string) => {
    if (q.length < 1) { setResults([]); return; }
    setLoading(true);
    try {
      const { data } = await adminHttp.get('/user/page', {
        params: { page: 1, size: 20, username: q },
      });
      const list = data?.data?.list || data?.data || [];
      setResults(Array.isArray(list) ? list : []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => doSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search, doSearch]);

  const selectedUser = value ? results.find(u => String(u.username) === value || String(u.id) === value) : null;

  const inputClass = "w-full rounded-[4px] border border-[var(--app-color-border)] bg-[var(--app-color-surface-page)] px-2 py-1 text-[11px] text-[var(--app-color-text-primary)] outline-none focus:border-[var(--app-color-accent)]";

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-[var(--app-color-text-tertiary)]" />
        <input
          type="text"
          value={open ? search : (value || '')}
          placeholder={placeholder}
          className={`${inputClass} pl-6 pr-6`}
          onFocus={() => { setOpen(true); setSearch(value || ''); if (value) doSearch(value); }}
          onChange={e => {
            setSearch(e.target.value);
            setOpen(true);
            if (!e.target.value) onChange('');
          }}
        />
        {value && (
          <button
            onClick={() => { onChange(''); setSearch(''); }}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded-[2px] hover:bg-[var(--app-color-surface-hover)]"
          >
            <X className="w-3 h-3 text-[var(--app-color-text-tertiary)]" />
          </button>
        )}
      </div>

      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 max-h-[200px] overflow-y-auto rounded-[var(--app-radius-container)] border border-[var(--app-color-border)] bg-[var(--app-color-surface-elevated)] shadow-lg z-[var(--z-dropdown)]">
          {loading ? (
            <div className="px-3 py-2 text-[11px] text-[var(--app-color-text-tertiary)]">搜索中...</div>
          ) : results.length === 0 ? (
            <div className="px-3 py-2 text-[11px] text-[var(--app-color-text-tertiary)]">
              {search.length > 0 ? '无匹配用户' : '输入关键字搜索'}
            </div>
          ) : (
            results.map(u => (
              <button
                key={u.id}
                onClick={() => {
                  onChange(u.username || String(u.id));
                  setSearch('');
                  setOpen(false);
                }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-left hover:bg-[var(--app-color-surface-hover)] transition-colors"
              >
                <User className="w-3 h-3 text-[var(--app-color-text-tertiary)] shrink-0" />
                <span className="text-[var(--app-color-text-primary)]">{u.username}</span>
                {u.realName && (
                  <span className="text-[var(--app-color-text-tertiary)] truncate">{u.realName}</span>
                )}
                {u.role && (
                  <span className="ml-auto text-[9px] px-1 py-0 rounded bg-[var(--app-color-surface-container)] text-[var(--app-color-text-tertiary)]">
                    {u.role}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
