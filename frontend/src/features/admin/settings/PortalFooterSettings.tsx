import { useState, useEffect, useCallback } from "react";
import { toast } from "react-hot-toast";
import {
  fetchAdminPortalFooter,
  putAdminPortalFooter,
  type PortalFooterConfig,
  type PortalFooterGroup,
  type PortalFooterLink,
} from "@/api/domains/siteAdmin.api";
import { AdminFormCard } from "@/components/admin/AdminPageShell";
import { AdminButton } from "@/components/admin/AdminButton";
import { AdminToggle } from "@/components/admin/AdminToggle";
import { Plus, Trash2, GripVertical, ChevronUp, ChevronDown } from "lucide-react";

/* ── helpers ── */

let _linkIdCounter = 0;
function nextLinkId(): string {
  _linkIdCounter++;
  return `link_${Date.now()}_${_linkIdCounter}`;
}

function newLink(): PortalFooterLink & { _tempId: string } {
  return { label: "", url: "", requiresAuth: false, sortOrder: 0, _tempId: nextLinkId() };
}

function newGroup(sortOrder: number): PortalFooterGroup {
  return { id: `grp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, group: "", sortOrder, items: [] };
}

/* ═══════════════════════════════════════════════════════════
   PortalFooterSettings — default export
   ═══════════════════════════════════════════════════════════ */

export default function PortalFooterSettings() {
  const [contact, setContact] = useState({ phone: "", email: "", address: "", workHours: "" });
  const [groups, setGroups] = useState<PortalFooterGroup[]>([]);
  const [copyright, setCopyright] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  /* ── load ── */

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cfg = await fetchAdminPortalFooter();
        if (cancelled) return;
        setContact(cfg.contact ?? { phone: "", email: "", address: "", workHours: "" });
        setGroups(cfg.groups?.length ? cfg.groups : getDefaultGroups());
        setCopyright(cfg.copyright ?? "");
      } catch (e) {
        if (!cancelled) toast.error(e instanceof Error ? e.message : "读取页脚配置失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  /* ── save ── */

  const save = useCallback(async () => {
    const body: PortalFooterConfig = {
      contact,
      groups: groups.map((g, gi) => ({
        ...g,
        sortOrder: gi,
        items: g.items.map((it, ii) => ({ ...it, sortOrder: ii })),
      })),
      copyright,
    };
    setSaving(true);
    try {
      const result = await putAdminPortalFooter(body);
      setContact(result.contact);
      setGroups(result.groups?.length ? result.groups : getDefaultGroups());
      setCopyright(result.copyright ?? "");
      toast.success("页脚配置已保存");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }, [contact, groups, copyright]);

  /* ── contact field handlers ── */

  const updateContact = (field: keyof typeof contact, value: string) => {
    setContact((prev) => ({ ...prev, [field]: value }));
  };

  /* ── group handlers ── */

  const addGroup = () => setGroups((prev) => [...prev, newGroup(prev.length)]);
  const removeGroup = (idx: number) => setGroups((prev) => prev.filter((_, i) => i !== idx));
  const updateGroup = (idx: number, patch: Partial<PortalFooterGroup>) =>
    setGroups((prev) => prev.map((g, i) => (i === idx ? { ...g, ...patch } : g)));
  const moveGroup = (idx: number, dir: -1 | 1) => {
    setGroups((prev) => {
      const next = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };

  /* ── link handlers ── */

  const addLink = (groupIdx: number) =>
    setGroups((prev) =>
      prev.map((g, i) => (i === groupIdx ? { ...g, items: [...g.items, newLink()] } : g)),
    );
  const removeLink = (groupIdx: number, linkIdx: number) =>
    setGroups((prev) =>
      prev.map((g, i) =>
        i === groupIdx ? { ...g, items: g.items.filter((_, j) => j !== linkIdx) } : g,
      ),
    );
  const updateLink = (groupIdx: number, linkIdx: number, patch: Partial<PortalFooterLink>) =>
    setGroups((prev) =>
      prev.map((g, i) =>
        i === groupIdx
          ? { ...g, items: g.items.map((it, j) => (j === linkIdx ? { ...it, ...patch } : it)) }
          : g,
      ),
    );
  const moveLink = (groupIdx: number, linkIdx: number, dir: -1 | 1) =>
    setGroups((prev) =>
      prev.map((g, i) => {
        if (i !== groupIdx) return g;
        const items = [...g.items];
        const target = linkIdx + dir;
        if (target < 0 || target >= items.length) return g;
        [items[linkIdx], items[target]] = [items[target], items[linkIdx]];
        return { ...g, items };
      }),
    );

  /* ── loading ── */

  if (loading) {
    return (
      <div className="py-8 text-center text-sm text-[var(--app-color-text-tertiary)]">加载中…</div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Contact Info ── */}
      <AdminFormCard title="联系信息" description="门户页脚的联系方式，留空则不显示对应项">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="block">
            <span className="text-sm font-medium text-[var(--app-color-text-secondary)]">电话</span>
            <input
              type="text" value={contact.phone}
              onChange={(e) => updateContact("phone", e.target.value)}
              placeholder="021-xxxxxxxx"
              className="mt-1 w-full rounded-lg border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-3 py-2 text-sm text-[var(--app-color-text-primary)] placeholder:text-[var(--app-color-text-tertiary)] focus:border-[var(--app-color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--app-color-accent)]/30"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-[var(--app-color-text-secondary)]">邮箱</span>
            <input
              type="text" value={contact.email}
              onChange={(e) => updateContact("email", e.target.value)}
              placeholder="aro@shsmu.edu.cn"
              className="mt-1 w-full rounded-lg border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-3 py-2 text-sm text-[var(--app-color-text-primary)] placeholder:text-[var(--app-color-text-tertiary)] focus:border-[var(--app-color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--app-color-accent)]/30"
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="text-sm font-medium text-[var(--app-color-text-secondary)]">地址（支持换行）</span>
            <textarea
              value={contact.address}
              onChange={(e) => updateContact("address", e.target.value)}
              placeholder="上海市黄浦区重庆南路227号"
              rows={3}
              className="mt-1 w-full rounded-lg border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-3 py-2 text-sm text-[var(--app-color-text-primary)] placeholder:text-[var(--app-color-text-tertiary)] focus:border-[var(--app-color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--app-color-accent)]/30 resize-y"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-[var(--app-color-text-secondary)]">工作时间</span>
            <input
              type="text" value={contact.workHours}
              onChange={(e) => updateContact("workHours", e.target.value)}
              placeholder="周一至周五 8:00-17:00"
              className="mt-1 w-full rounded-lg border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-3 py-2 text-sm text-[var(--app-color-text-primary)] placeholder:text-[var(--app-color-text-tertiary)] focus:border-[var(--app-color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--app-color-accent)]/30"
            />
          </label>
        </div>
      </AdminFormCard>

      {/* ── Copyright ── */}
      <AdminFormCard title="版权文案" description="自定义页脚底部版权文字，留空则使用默认文案">
        <input
          type="text" value={copyright}
          onChange={(e) => setCopyright(e.target.value)}
          placeholder="© 2026 上海交通大学医学院 · 实验动物科学部"
          className="w-full rounded-lg border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-3 py-2 text-sm text-[var(--app-color-text-primary)] placeholder:text-[var(--app-color-text-tertiary)] focus:border-[var(--app-color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--app-color-accent)]/30"
        />
      </AdminFormCard>

      {/* ── Footer Link Groups ── */}
      <AdminFormCard
        title="链接分组"
        description="自定义门户页脚的链接分组。拖动或使用上下箭头调整顺序。"
        actions={
          <AdminButton tone="primary" size="sm" onClick={addGroup}>
            <Plus className="h-3.5 w-3.5 mr-1" />添加分组
          </AdminButton>
        }
      >
        {groups.length === 0 ? (
          <p className="text-sm text-[var(--app-color-text-tertiary)] py-4 text-center">
            暂无分组，点击「添加分组」创建
          </p>
        ) : (
          <div className="space-y-4">
            {groups.map((group, gi) => (
              <div
                key={group.id || gi}
                className="rounded-lg border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] p-4"
              >
                {/* Group header */}
                <div className="flex items-center gap-2 mb-3">
                  <button
                    type="button"
                    onClick={() => moveGroup(gi, -1)}
                    disabled={gi === 0}
                    className="p-0.5 text-[var(--app-color-text-tertiary)] hover:text-[var(--app-color-text-primary)] disabled:opacity-30"
                    title="上移分组"
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveGroup(gi, 1)}
                    disabled={gi === groups.length - 1}
                    className="p-0.5 text-[var(--app-color-text-tertiary)] hover:text-[var(--app-color-text-primary)] disabled:opacity-30"
                    title="下移分组"
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                  <input
                    type="text"
                    value={group.group}
                    onChange={(e) => updateGroup(gi, { group: e.target.value })}
                    placeholder="分组名称"
                    className="flex-1 rounded-lg border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-hover)] px-3 py-1.5 text-sm font-medium text-[var(--app-color-text-primary)] placeholder:text-[var(--app-color-text-tertiary)] focus:border-[var(--app-color-accent)] focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => removeGroup(gi)}
                    className="p-1.5 text-[var(--app-color-text-danger)]/70 hover:text-[var(--app-color-text-danger)] transition-colors"
                    title="删除分组"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                {/* Links in group */}
                <div className="space-y-2 ml-5 pl-4 border-l-2 border-[var(--app-color-border-default)]">
                  {group.items.length === 0 ? (
                    <p className="text-xs text-[var(--app-color-text-tertiary)] py-2">暂无链接</p>
                  ) : (
                    group.items.map((link, li) => (
                      <div key={(link as any)._tempId ?? li} className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => moveLink(gi, li, -1)}
                          disabled={li === 0}
                          className="p-0.5 text-[var(--app-color-text-tertiary)] hover:text-[var(--app-color-text-primary)] disabled:opacity-30"
                          title="上移"
                        >
                          <ChevronUp className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveLink(gi, li, 1)}
                          disabled={li === group.items.length - 1}
                          className="p-0.5 text-[var(--app-color-text-tertiary)] hover:text-[var(--app-color-text-primary)] disabled:opacity-30"
                          title="下移"
                        >
                          <ChevronDown className="h-3 w-3" />
                        </button>
                        <input
                          type="text"
                          value={link.label}
                          onChange={(e) => updateLink(gi, li, { label: e.target.value })}
                          placeholder="链接名称"
                          className="flex-1 rounded-lg border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-hover)] px-2.5 py-1.5 text-sm text-[var(--app-color-text-primary)] placeholder:text-[var(--app-color-text-tertiary)] focus:border-[var(--app-color-accent)] focus:outline-none"
                        />
                        <input
                          type="text"
                          value={link.url}
                          onChange={(e) => updateLink(gi, li, { url: e.target.value })}
                          placeholder="/#/path 或 https://..."
                          className="flex-1 rounded-lg border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-hover)] px-2.5 py-1.5 text-sm font-mono text-[var(--app-color-text-primary)] placeholder:text-[var(--app-color-text-tertiary)] focus:border-[var(--app-color-accent)] focus:outline-none"
                        />
                        <div className="flex items-center gap-1 shrink-0">
                          <AdminToggle
                            checked={link.requiresAuth}
                            onChange={(v) => updateLink(gi, li, { requiresAuth: v })}
                            label=""
                          />
                          <span className="text-xs text-[var(--app-color-text-tertiary)] whitespace-nowrap">需登录</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeLink(gi, li)}
                          className="p-1 text-[var(--app-color-text-danger)]/60 hover:text-[var(--app-color-text-danger)]"
                          title="删除链接"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))
                  )}
                  <button
                    type="button"
                    onClick={() => addLink(gi)}
                    className="inline-flex items-center gap-1 text-xs text-[var(--app-color-accent)] hover:underline"
                  >
                    <Plus className="h-3 w-3" />添加链接
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </AdminFormCard>

      {/* ── Save ── */}
      <div className="flex items-center gap-3">
        <AdminButton tone="primary" loading={saving} onClick={() => void save()}>
          保存页脚配置
        </AdminButton>
        <span className="text-xs text-[var(--app-color-text-tertiary)]">
          修改实时生效，门户页刷新后可见
        </span>
      </div>
    </div>
  );
}

function getDefaultGroups(): PortalFooterGroup[] {
  return [
    {
      id: "grp_default_student",
      group: "学生服务",
      sortOrder: 0,
      items: [
        { label: "学生中心", url: "/#/student/home", requiresAuth: true, sortOrder: 0 },
        { label: "笼架信息", url: "/#/student/cage-shelf", requiresAuth: true, sortOrder: 1 },
      ],
    },
    {
      id: "grp_default_help",
      group: "帮助支持",
      sortOrder: 1,
      items: [
        { label: "帮助反馈", url: "/#/student/feedback", requiresAuth: true, sortOrder: 0 },
        { label: "联系我们", url: "mailto:aro@shsmu.edu.cn", requiresAuth: false, sortOrder: 1 },
      ],
    },
  ];
}
