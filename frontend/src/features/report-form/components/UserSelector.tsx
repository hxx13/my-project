// components/UserSelector.tsx — 人员搜索选择器（昵称映射，支持单选/多选）
import { useState, useRef, useEffect, useCallback } from 'react';
import { adminHttp } from '@/api/core/adminHttp';
import { Search, X, User } from 'lucide-react';

interface UserOption {
  id: number;
  username: string;
  displayNickname?: string;
  realName?: string;
  role?: string;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  multi?: boolean;
}

/** 显示名优先级：昵称 > 真名 > 用户名 */
const nick = (u: UserOption) => u.displayNickname || u.realName || u.username;

export default function UserSelector({ value, onChange, placeholder = '搜索用户...', multi }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // 已选用户列表
  const selectedNames = value ? value.split(',').map(s => s.trim()).filter(Boolean) : [];

  const addUser = (name: string) => {
    if (multi) {
      const set = new Set(selectedNames);
      set.add(name);
      onChange([...set].join(','));
    } else {
      onChange(name);
      setOpen(false);
    }
    setSearch('');
  };

  const removeUser = (name: string) => {
    onChange(selectedNames.filter(n => n !== name).join(','));
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  const doSearch = useCallback(async (q: string) => {
    if (q.length < 1) { setResults([]); return; }
    setLoading(true);
    try {
      const { data } = await adminHttp.get('/report-fill/users/search', {
        params: { keyword: q },
      });
      const list = data?.data || [];
      setResults(Array.isArray(list) ? list : []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => doSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search, doSearch]);

  const inputClass = "w-full rounded-[4px] border border-[var(--app-color-border)] bg-[var(--app-color-surface-page)] px-2 py-1 text-[11px] text-[var(--app-color-text-primary)] outline-none focus:border-[var(--app-color-accent)]";

  return (
    <div ref={containerRef} className="relative w-full min-w-0 max-w-full">
      {/* 多选标签 */}
      {multi && selectedNames.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-1">
          {selectedNames.map(name => (
            <span key={name} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-[3px] bg-[var(--app-color-accent-soft)] text-[10px] text-[var(--app-color-accent)]">
              {name}
              <button onClick={() => removeUser(name)} className="hover:text-[var(--app-color-feedback-danger)]">
                <X className="w-2.5 h-2.5" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-[var(--app-color-text-tertiary)]" />
        <input
          type="text"
          value={open ? search : (multi ? '' : (value || ''))}
          placeholder={multi && selectedNames.length > 0 ? `已选${selectedNames.length}人 · 继续添加` : placeholder}
          className={`${inputClass} pl-6 ${!multi && value ? 'pr-6' : ''}`}
          onFocus={() => { setOpen(true); setSearch(''); }}
          onChange={e => {
            setSearch(e.target.value);
            setOpen(true);
            if (!e.target.value && !multi) onChange('');
          }}
        />
        {!multi && value && (
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
            <div className="px-3 py-2 text-[11px] text-[var(--app-color-text-tertiary)]">{search.length > 0 ? '无匹配用户' : '输入关键字搜索'}</div>
          ) : (
            results.map(u => {
              const n = nick(u);
              const alreadySelected = multi && selectedNames.includes(n);
              return (
                <button
                  key={u.id}
                  onClick={() => { if (!alreadySelected) addUser(n); }}
                  className={`w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-left transition-colors ${
                    alreadySelected ? 'bg-[var(--app-color-accent-soft)] text-[var(--app-color-accent)] cursor-default' : 'hover:bg-[var(--app-color-surface-hover)]'
                  }`}
                >
                  <User className="w-3 h-3 text-[var(--app-color-text-tertiary)] shrink-0" />
                  <span className="text-[var(--app-color-text-primary)] font-medium">{n}</span>
                  {n !== u.username && <span className="text-[var(--app-color-text-tertiary)] text-[10px]">@{u.username}</span>}
                  {alreadySelected && <span className="ml-auto text-[9px]">已选</span>}
                  {u.role && !alreadySelected && (
                    <span className="ml-auto text-[9px] px-1 py-0 rounded bg-[var(--app-color-surface-container)] text-[var(--app-color-text-tertiary)]">{u.role}</span>
                  )}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
