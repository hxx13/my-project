import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PersonnelPicker } from "@/components/admin/PersonnelPicker";
import {
  fetchFullTree,
  fetchMyRegion,
  saveMyRegionMembers,
  type CageShelfTreeNode,
  type MyRegionEntry,
} from "@/api/domains/cageShelf.api";

/**
 * 我的区域（弹窗）—— 饲养组长看自己负责的区域与组员。**只读**。
 *
 * 入口在笼架信息页的工具栏（仅当 `/api/cage-region/mine` 返回 isLeader=true 时才显示按钮），
 * 不做成独立页面：组长本来就要进笼架信息干活，多一个页面反而多一次跳转。
 *
 * 组员的纳入/移出与逐人勾权限属第四期 B，本期不放按钮——避免用户以为功能坏了。
 */

const TYPE_LABEL: Record<string, string> = { CAMPUS: "校区", FLOOR: "楼层", ROOM: "房间" };
const TYPE_ORDER = ["CAMPUS", "FLOOR", "ROOM"];

export default function MyRegionDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [regions, setRegions] = useState<MyRegionEntry[]>([]);
  // 组员是**可编辑的草稿**：加入/移除都改这里，点保存才整包 PUT（全量替换）。
  const [draft, setDraft] = useState<Array<{ accountId: string; name: string }>>([]);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([fetchMyRegion(), fetchFullTree().catch(() => [] as CageShelfTreeNode[])])
      .then(([mine, tree]) => {
        if (cancelled) return;
        setRegions(mine.regions);
        const list = mine.members.map((m) => ({ accountId: m.memberAccountId, name: m.memberName }));
        setDraft(list);
        setSavedIds(list.map((m) => m.accountId));
        // 区域名后端不下发（不为它多开 join），用已有的树在前端解析
        const map: Record<string, string> = {};
        for (const r of tree) {
          if (r.campusId) map[`CAMPUS:${r.campusId}`] = r.campusName;
          if (r.floorId) map[`FLOOR:${r.floorId}`] = `${r.campusName} / ${r.floorName}`;
          if (r.roomId) map[`ROOM:${r.roomId}`] = `${r.floorName} / ${r.roomName}`;
        }
        setNames(map);
      })
      .catch(() => {
        if (!cancelled) {
          setRegions([]);
          setDraft([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const dirty = useMemo(
    () => draft.map((m) => m.accountId).sort().join("|") !== [...savedIds].sort().join("|"),
    [draft, savedIds],
  );

  const saveMembers = async () => {
    setSaving(true);
    try {
      await saveMyRegionMembers(draft.map((m) => m.accountId));
      setSavedIds(draft.map((m) => m.accountId));
      toast.success("组员已保存");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const grouped = useMemo(() => {
    const byType = new Map<string, MyRegionEntry[]>();
    for (const r of regions) {
      if (!byType.has(r.regionType)) byType.set(r.regionType, []);
      byType.get(r.regionType)!.push(r);
    }
    return TYPE_ORDER.filter((t) => byType.has(t)).map((t) => [t, byType.get(t)!] as const);
  }, [regions]);

  const label = (r: MyRegionEntry) => names[`${r.regionType}:${r.regionId}`] || r.regionId;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="z-[var(--z-modal)] flex max-h-[82vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="shrink-0 border-b border-[var(--twin-hairline)] px-5 py-3.5 text-left">
          <DialogTitle className="text-[14px] text-[var(--twin-ink)]">我的区域</DialogTitle>
          <DialogDescription className="text-[11px] text-[var(--twin-mute)]">
            你作为饲养组长负责的区域与由你纳入的组员。区域由超级管理员分配；当前为只读视图。
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 py-4">
          {loading ? (
            <div className="rounded-twin-sm border border-dashed border-[var(--twin-hairline)] px-3 py-6 text-center text-[10px] text-[var(--twin-mute)]">
              加载中…
            </div>
          ) : (
            <>
              <section className="space-y-2">
                <h4 className="text-[12px] font-semibold text-[var(--twin-ink)]">我负责的区域（{regions.length}）</h4>
                {regions.length === 0 ? (
                  <div className="rounded-twin-sm border border-dashed border-[var(--twin-hairline)] px-3 py-4 text-center text-[10px] text-[var(--twin-mute)]">
                    你还没有被分配任何区域
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                    {grouped.map(([type, list]) => (
                      <div key={type} className="rounded-twin-sm border border-[var(--twin-hairline)] p-2.5">
                        <div className="mb-1.5 text-[10px] font-semibold text-[var(--twin-mute)]">
                          {TYPE_LABEL[type]}（{list.length}）
                        </div>
                        <ul className="space-y-0.5">
                          {list.map((r) => (
                            <li key={r.regionId} className="text-[11px] text-[var(--twin-ink)]">
                              {label(r)}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-[12px] font-semibold text-[var(--twin-ink)]">我的组员（{draft.length}）</h4>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setPickerOpen(true)}
                      className="rounded-twin-sm border border-[var(--twin-hairline)] px-2 py-0.5 text-[10px] font-semibold text-[var(--twin-ink)] transition hover:bg-[var(--twin-canvas-soft)]"
                    >
                      ＋ 添加组员
                    </button>
                    <button
                      type="button"
                      onClick={() => void saveMembers()}
                      disabled={!dirty || saving}
                      className="rounded-twin-sm bg-[var(--twin-primary)] px-2.5 py-0.5 text-[10px] font-semibold text-white transition hover:brightness-95 disabled:opacity-40"
                    >
                      {saving ? "保存中…" : "保存"}
                    </button>
                  </div>
                </div>
                {draft.length === 0 ? (
                  <div className="rounded-twin-sm border border-dashed border-[var(--twin-hairline)] px-3 py-4 text-center text-[10px] text-[var(--twin-mute)]">
                    还没有组员。组员会自动继承你负责的全部区域的可见范围。
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-twin-sm border border-[var(--twin-hairline)]">
                    <table className="twin-table">
                      <thead>
                        <tr>
                          <th>组员</th>
                          <th className="w-24" />
                        </tr>
                      </thead>
                      <tbody>
                        {draft.map((m) => (
                          <tr key={m.accountId}>
                            <td className="px-2.5 py-1 text-[11px] text-[var(--twin-ink)]">{m.name}</td>
                            <td className="px-2.5 py-1 text-right">
                              <button
                                type="button"
                                title="移出本组"
                                onClick={() => setDraft((d) => d.filter((x) => x.accountId !== m.accountId))}
                                className="rounded-md p-0.5 text-[var(--twin-mute)] transition hover:text-[var(--app-color-feedback-danger)]"
                              >
                                <X className="size-3" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <p className="text-[10px] leading-relaxed text-[var(--twin-mute)]">
                  组员自动继承你负责的全部区域的可见范围；逐人配置组员能用哪些模式将在后续版本开放。改动后记得点「保存」。
                </p>
              </section>
            </>
          )}
        </div>
      </DialogContent>

      {pickerOpen && (
        <PersonnelPicker
          onClose={() => setPickerOpen(false)}
          onConfirm={(ids, nameList) => {
            setDraft((d) => {
              const have = new Set(d.map((x) => x.accountId));
              const added = ids
                .map((id, i) => ({ accountId: id, name: nameList[i] || id }))
                .filter((x) => !have.has(x.accountId));
              return [...d, ...added];
            });
            setPickerOpen(false);
          }}
        />
      )}
    </Dialog>
  );
}
