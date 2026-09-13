import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fetchMemberCapabilities, saveMemberCapabilities } from "@/api/domains/cageShelf.api";

/**
 * 组员能力配置 —— 饲养组长给本组组员逐人勾「能用哪些模式」。
 *
 * 两层关系（设计 6.2 / 8）：**矩阵是上限，组长只能在组员身份允许的范围里收窄**。
 * 超出上限的选项直接不渲染（后端也会再拒一次，前端不显示只是少一次失败往返）。
 *
 * ⚠ 语义坑：**全部取消 = 没有行 = 恢复为「按身份矩阵」**，不是「什么都不能用」。
 * 所以界面必须把这句话写出来，否则组长会以为取消勾选等于禁用。
 */
const MODE_PREFIX = "cage.mode.";

export default function MemberCapabilityDialog({
  open,
  onOpenChange,
  memberAccountId,
  memberName,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  memberAccountId: string;
  memberName: string;
  onSaved?: () => void;
}) {
  const [ceiling, setCeiling] = useState<string[]>([]);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [initial, setInitial] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !memberAccountId) return;
    let cancelled = false;
    setLoading(true);
    fetchMemberCapabilities(memberAccountId)
      .then((v) => {
        if (cancelled) return;
        setCeiling(v.ceiling.filter((c) => c.startsWith(MODE_PREFIX)));
        setLabels(v.labels ?? {});
        const g = new Set(v.granted);
        setPicked(g);
        setInitial(new Set(g));
      })
      .catch(() => {
        if (!cancelled) {
          setCeiling([]);
          setPicked(new Set());
          setInitial(new Set());
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, memberAccountId]);

  const dirty = useMemo(() => {
    const a = [...picked].sort().join("|");
    const b = [...initial].sort().join("|");
    return a !== b;
  }, [picked, initial]);

  const save = async () => {
    setSaving(true);
    try {
      await saveMemberCapabilities(memberAccountId, [...picked]);
      setInitial(new Set(picked));
      toast.success("组员权限已保存");
      onSaved?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="z-[var(--z-modal)] flex max-h-[82vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="shrink-0 border-b border-[var(--twin-hairline)] px-5 py-3.5 text-left">
          <DialogTitle className="text-[14px] text-[var(--twin-ink)]">{memberName} 的模式权限</DialogTitle>
          <DialogDescription className="text-[11px] text-[var(--twin-mute)]">
            勾选后以这里为准（覆盖他按身份能用的模式）；只能在该组员身份允许的范围内收窄。
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
          {loading ? (
            <div className="rounded-twin-sm border border-dashed border-[var(--twin-hairline)] px-3 py-6 text-center text-[10px] text-[var(--twin-mute)]">
              加载中…
            </div>
          ) : ceiling.length === 0 ? (
            <div className="rounded-twin-sm border border-dashed border-[var(--twin-hairline)] px-3 py-6 text-center text-[10px] text-[var(--twin-mute)]">
              该组员的身份在矩阵里没有任何模式可用，没有可配置项。
            </div>
          ) : (
            <div className="space-y-2">
              {ceiling.map((code) => {
                const on = picked.has(code);
                return (
                  <label
                    key={code}
                    className="flex cursor-pointer items-center justify-between gap-3 rounded-twin-sm border border-[var(--twin-hairline)] px-3 py-2"
                  >
                    <span className="text-[11px] font-semibold text-[var(--twin-ink)]">
                      {labels[code] || code.replace(MODE_PREFIX, "")}
                    </span>
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() =>
                        setPicked((p) => {
                          const s = new Set(p);
                          if (on) s.delete(code);
                          else s.add(code);
                          return s;
                        })
                      }
                      className="size-4 accent-[var(--twin-primary)]"
                    />
                  </label>
                );
              })}
              <p className="pt-1 text-[10px] leading-relaxed text-[var(--twin-mute)]">
                全部取消勾选 = 不配 = 该组员恢复为按身份默认（不是「什么都不能用」）。
              </p>
            </div>
          )}
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-[var(--twin-hairline)] px-5 py-3">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-twin-sm border border-[var(--twin-hairline)] px-3 py-1 text-[11px] font-semibold text-[var(--twin-ink)] transition hover:bg-[var(--twin-canvas-soft)]"
          >
            关闭
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={!dirty || saving}
            className="rounded-twin-sm bg-[var(--twin-primary)] px-3 py-1 text-[11px] font-semibold text-white transition hover:brightness-95 disabled:opacity-40"
          >
            {saving ? "保存中…" : "保存"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
