// SmartSheetListPage — WPS式表格列表（模板 + 已有列表 + ⋮操作菜单）
import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Table2, Plus, Pin, MoreVertical, FileDown, FileJson, Printer, Link2, Trash2, Copy, Pencil, Eraser, Eye, Upload } from 'lucide-react';
import { AdminPageShell } from '@/components/admin/AdminPageShell';
import { fetchSheetPage, createSheet, deleteSheet, bulkDeleteSheets, renameSheet, duplicateSheet, clearSheetData, togglePinSheet, getExportUrl, getExportJsonUrl, importJsonBackup } from '@/api/domains/smartsheet.api';
import { PRESET_TEMPLATES } from './types';
import type { SmartSheetDefinition } from './types';
import toast from 'react-hot-toast';

export default function SmartSheetListPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const { data, isLoading } = useQuery({
    queryKey: ['smartsheet-list'],
    queryFn: () => fetchSheetPage(1, 100),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['smartsheet-list'] });

  const createMut = useMutation({
    mutationFn: createSheet,
    onSuccess: (s) => { invalidate(); navigate(`/admin/smartsheet/${s.id}`); },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({ mutationFn: deleteSheet, onSuccess: () => { invalidate(); toast.success('已删除'); } });
  const bulkDeleteMut = useMutation({ mutationFn: bulkDeleteSheets, onSuccess: () => { invalidate(); setSelected(new Set()); toast.success('批量删除完成'); } });
  const renameMut = useMutation({ mutationFn: ({ id, name }: { id: string; name: string }) => renameSheet(id, name), onSuccess: () => invalidate() });
  const duplicateMut = useMutation({ mutationFn: ({ id, withData }: { id: string; withData: boolean }) => duplicateSheet(id, withData), onSuccess: () => { invalidate(); toast.success('已复制'); } });
  const clearMut = useMutation({ mutationFn: clearSheetData, onSuccess: () => { invalidate(); toast.success('数据已清空'); } });
  const pinMut = useMutation({ mutationFn: togglePinSheet, onSuccess: () => invalidate() });

  const filtered = data?.list?.filter(s => !search || s.name.toLowerCase().includes(search.toLowerCase())) ?? [];
  const pinned = filtered.filter(s => s.isPinned === 1);
  const unpinned = filtered.filter(s => s.isPinned !== 1);

  const handleImportJson = async (sheetId: string) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const backup = JSON.parse(text);
        await importJsonBackup(sheetId, backup);
        invalidate();
        toast.success('JSON 导入完成');
      } catch (e) { toast.error('导入失败: ' + (e as Error).message); }
    };
    input.click();
  };

  const exportJson = (sheetId: string, name: string) => {
    const a = document.createElement('a');
    a.href = getExportJsonUrl(sheetId);
    a.download = `${name}.json`;
    a.click();
  };

  return (
    <AdminPageShell title="智能表格">
      {/* ── 搜索 + 批量操作 ── */}
      <div className="flex items-center gap-3 mb-4">
        <input placeholder="🔍 搜索表格..." value={search} onChange={e => setSearch(e.target.value)}
          className="flex-1 max-w-[320px] px-3 py-1.5 rounded-[10px] border border-app-border bg-app-surface-container text-sm text-app-text-primary outline-none focus:border-app-accent transition-colors" />
        {selected.size > 0 && (
          <button onClick={() => { if (confirm(`确定删除 ${selected.size} 个表格？`)) bulkDeleteMut.mutate([...selected]); }}
            className="px-3 py-1.5 rounded-[10px] text-[12px] font-medium bg-app-feedback-danger text-white hover:opacity-90 transition-colors flex items-center gap-1">
            <Trash2 className="w-3.5 h-3.5" /> 删除选中 ({selected.size})
          </button>
        )}
      </div>

      {/* ── 快捷模板 ── */}
      <div className="mb-4">
        <h3 className="text-[11px] font-semibold text-app-text-secondary uppercase tracking-wider mb-2">快捷模板</h3>
        <div className="flex gap-3 flex-wrap">
          {PRESET_TEMPLATES.map((tpl) => (
            <button key={tpl.id}
              className="px-4 py-3 rounded-[14px] border border-app-border bg-app-surface-container hover:border-app-accent text-sm transition-all text-left shadow-app-card min-w-[160px]"
              onClick={() => createMut.mutate({ name: `${tpl.name} ${new Date().toLocaleDateString()}`, description: tpl.description, layoutMode: tpl.layoutMode, columnsConfig: tpl.defaultColumns })}>
              <div className="font-semibold text-app-text-primary text-[13px]">{tpl.name}</div>
              <div className="text-[11px] text-app-text-tertiary mt-1 leading-relaxed">{tpl.description}</div>
            </button>
          ))}
          <button
            className="px-4 py-3 rounded-[14px] border border-dashed border-app-border bg-transparent hover:border-app-accent hover:bg-app-surface-hover text-sm transition-all flex items-center gap-2 text-app-text-secondary min-w-[160px]"
            onClick={() => createMut.mutate({ name: `空白表格 ${new Date().toLocaleDateString()}`, layoutMode: 'table', columnsConfig: [{ key: 'col_1', label: '列1', type: 'text' }] })}>
            <Plus className="w-4 h-4" /> 空白表格
          </button>
        </div>
      </div>

      {/* ── 已有表格列表 ── */}
      {isLoading ? (
        <div className="text-sm text-app-text-tertiary py-4">加载中...</div>
      ) : (
        <>
          {pinned.length > 0 && (
            <div className="mb-3">
              <h3 className="text-[11px] font-semibold text-app-text-secondary uppercase tracking-wider mb-2">📌 已置顶</h3>
              <div className="flex flex-col gap-1.5">
                {pinned.map(s => (
                  <SheetRow key={s.id} sheet={s} selected={selected.has(s.id)}
                    onToggleSel={() => setSelected(p => { const n = new Set(p); n.has(s.id) ? n.delete(s.id) : n.add(s.id); return n; })}
                    onOpen={() => navigate(`/admin/smartsheet/${s.id}`)}
                    onDelete={() => deleteMut.mutate(s.id)}
                    onRename={(name) => renameMut.mutate({ id: s.id, name })}
                    onDuplicate={(wd) => duplicateMut.mutate({ id: s.id, withData: wd })}
                    onClear={() => clearMut.mutate(s.id)}
                    onPin={() => pinMut.mutate(s.id)}
                    onExportCsv={() => { const a = document.createElement('a'); a.href = getExportUrl(s.id); a.download = `${s.name}.csv`; a.click(); }}
                    onExportJson={() => exportJson(s.id, s.name)}
                    onImportJson={() => handleImportJson(s.id)}
                  />
                ))}
              </div>
            </div>
          )}
          <div>
            {pinned.length > 0 && <h3 className="text-[11px] font-semibold text-app-text-secondary uppercase tracking-wider mb-2">全部表格</h3>}
            {unpinned.length === 0 && pinned.length === 0 ? (
              <div className="text-sm text-app-text-tertiary py-4">暂无表格，从上方模板新建</div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {unpinned.map(s => (
                  <SheetRow key={s.id} sheet={s} selected={selected.has(s.id)}
                    onToggleSel={() => setSelected(p => { const n = new Set(p); n.has(s.id) ? n.delete(s.id) : n.add(s.id); return n; })}
                    onOpen={() => navigate(`/admin/smartsheet/${s.id}`)}
                    onDelete={() => deleteMut.mutate(s.id)}
                    onRename={(name) => renameMut.mutate({ id: s.id, name })}
                    onDuplicate={(wd) => duplicateMut.mutate({ id: s.id, withData: wd })}
                    onClear={() => clearMut.mutate(s.id)}
                    onPin={() => pinMut.mutate(s.id)}
                    onExportCsv={() => { const a = document.createElement('a'); a.href = getExportUrl(s.id); a.download = `${s.name}.csv`; a.click(); }}
                    onExportJson={() => exportJson(s.id, s.name)}
                    onImportJson={() => handleImportJson(s.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </AdminPageShell>
  );
}

// ═══════ SheetRow + DropdownMenu ═══════

function SheetRow({ sheet, selected, onToggleSel, onOpen, onDelete, onRename, onDuplicate, onClear, onPin, onExportCsv, onExportJson, onImportJson }: {
  sheet: SmartSheetDefinition;
  selected: boolean;
  onToggleSel: () => void;
  onOpen: () => void;
  onDelete: () => void;
  onRename: (name: string) => void;
  onDuplicate: (withData: boolean) => void;
  onClear: () => void;
  onPin: () => void;
  onExportCsv: () => void;
  onExportJson: () => void;
  onImportJson: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuDir, setMenuDir] = useState<'down' | 'up'>('down');
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState(sheet.name);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    // Measure available space below the button; flip up if < 340px
    if (menuBtnRef.current) {
      const rect = menuBtnRef.current.getBoundingClientRect();
      setMenuDir(window.innerHeight - rect.bottom < 340 ? 'up' : 'down');
    }
    const h = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false); };
    document.addEventListener('click', h);
    return () => document.removeEventListener('click', h);
  }, [menuOpen]);

  return (
    <div className={`flex items-center gap-3 px-4 py-2.5 rounded-[10px] border transition-all shadow-app-card group
      ${selected ? 'border-app-accent bg-app-accent-soft' : 'border-app-border bg-app-surface-container hover:border-app-accent'}`}>
      <input type="checkbox" checked={selected} onChange={onToggleSel} className="shrink-0 w-3.5 h-3.5 accent-app-accent cursor-pointer" />
      {sheet.isPinned === 1 && <Pin className="w-3 h-3 text-app-accent shrink-0" />}
      <Table2 className="w-4 h-4 text-app-text-tertiary shrink-0" />
      <div className="flex-1 min-w-0" onDoubleClick={() => { setRenaming(true); setNameDraft(sheet.name); }}>
        {renaming ? (
          <input autoFocus value={nameDraft} onChange={e => setNameDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { onRename(nameDraft); setRenaming(false); } if (e.key === 'Escape') setRenaming(false); }}
            onBlur={() => { onRename(nameDraft); setRenaming(false); }}
            className="w-full text-[13px] font-semibold bg-transparent border-b border-app-accent outline-none text-app-text-primary" />
        ) : (
          <button onClick={onOpen} className="text-left w-full">
            <div className="text-[13px] font-semibold text-app-text-primary truncate">{sheet.name}</div>
            <div className="text-[11px] text-app-text-tertiary flex gap-2 mt-0.5">
              <span>{sheet.layoutMode}</span><span>·</span>
              <span>{new Date(sheet.updatedAt).toLocaleDateString()}</span>
            </div>
          </button>
        )}
      </div>

      {/* ⋮ Dropdown */}
      <div className="relative shrink-0" ref={menuRef}>
        <button ref={menuBtnRef} onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
          className="p-1.5 rounded-[8px] hover:bg-app-surface-hover transition-colors opacity-0 group-hover:opacity-100">
          <MoreVertical className="w-4 h-4 text-app-text-secondary" />
        </button>
        {menuOpen && (
          <div className={`absolute right-0 w-[200px] rounded-[12px] border border-app-border bg-app-surface-elevated shadow-lg py-1.5 z-[var(--z-dropdown)] ${menuDir === 'down' ? 'top-full mt-1' : 'bottom-full mb-1'}`}>
            <MenuItem icon={Eye} label="打开" onClick={() => { onOpen(); setMenuOpen(false); }} />
            <MenuItem icon={Pencil} label="重命名" onClick={() => { setRenaming(true); setNameDraft(sheet.name); setMenuOpen(false); }} />
            <MenuItem icon={Copy} label="复制（空结构）" onClick={() => { onDuplicate(false); setMenuOpen(false); }} />
            <MenuItem icon={Copy} label="复制（含数据）" onClick={() => { onDuplicate(true); setMenuOpen(false); }} />
            <MenuDivider />
            <MenuItem icon={Pin} label={sheet.isPinned === 1 ? '取消置顶' : '📌 置顶'} onClick={() => { onPin(); setMenuOpen(false); }} />
            <MenuDivider />
            <MenuItem icon={FileDown} label="导出 CSV" onClick={() => { onExportCsv(); setMenuOpen(false); }} />
            <MenuItem icon={FileDown} label="导出 Excel" onClick={() => { toast('即将支持'); setMenuOpen(false); }} />
            <MenuItem icon={FileJson} label="导出 JSON" onClick={() => { onExportJson(); setMenuOpen(false); }} />
            <MenuItem icon={Upload} label="导入 JSON" onClick={() => { onImportJson(); setMenuOpen(false); }} />
            <MenuItem icon={Printer} label="打印" onClick={() => { onOpen(); setTimeout(() => window.print(), 500); setMenuOpen(false); }} />
            <MenuItem icon={Link2} label="复制链接" onClick={() => { navigator.clipboard.writeText(`${location.origin}/admin/smartsheet/${sheet.id}`); toast.success('链接已复制'); setMenuOpen(false); }} />
            <MenuDivider />
            <MenuItem icon={Eraser} label="清空数据" danger onClick={() => { if (confirm('确定清空所有行数据？列结构保留。')) { onClear(); setMenuOpen(false); } }} />
            <MenuItem icon={Trash2} label="删除" danger onClick={() => { if (confirm(`确定删除「${sheet.name}」？`)) { onDelete(); setMenuOpen(false); } }} />
          </div>
        )}
      </div>
    </div>
  );
}

function MenuItem({ icon: Icon, label, danger, onClick }: { icon: typeof Eye; label: string; danger?: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={`w-full flex items-center gap-2 px-3 py-1.5 text-[12px] transition-colors text-left
        ${danger ? 'text-app-feedback-danger hover:bg-app-feedback-danger-soft' : 'text-app-text-secondary hover:bg-app-surface-hover'}`}>
      <Icon className="w-3.5 h-3.5 shrink-0" /> {label}
    </button>
  );
}

function MenuDivider() {
  return <div className="h-px bg-app-border my-1" />;
}