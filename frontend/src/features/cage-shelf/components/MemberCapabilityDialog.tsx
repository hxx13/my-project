import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fetchMemberCapabilities, saveMemberCapabilities } from "@/api/domains/cageShelf.api";

/**
 * 组员能力配置 —— 饲养组长给本组组员逐人勾「能用哪些模式」，以及把**授权类**能力下放给他。
 *
 * 两层关系（设计 6.2 / 8）：**矩阵是上限，组长只能在组员身份允许的范围里收窄**。
 * 超出上限的选项直接不渲染（后端也会再拒一次，前端不显示只是少一次失败往返）。
 *
 * ⚠ 语义坑：**全部取消 = 没有行 = 恢复为「按身份矩阵」**，不是「什么都不能用」。
 * 所以界面必须把这句话写出来，否则组长会以为取消勾选等于禁用。
 */
const MODE_PREFIX = "cage.mode.";
/**
 * 除模式外，组长还能逐人授予的**授权类**能力（非模式类，逐项列出来而不是放开整个前缀）。
 * 这类能力**不受组员身份上限约束**，否则永远授不出去（身份本来有的不需要授、没有的授不了）：
 *   - 代认领：把笼位再次分配给某人
 *   - 区域审核：审核本组区域内的笼位申请（作用域仍是组长的区域，越不出去）
 */
const EXTRA_GRANTABLE = ["cage.op.claim_on_behalf", "cage.review.region"];

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
        const visible = v.ceiling.filter((c) => c.startsWith(MODE_PREFIX) || EXTRA_GRANTABLE.includes(c));
        setCeiling(visible);
        setLabels(v.labels ?? {});
        // 没配过（granted 空）→ 按**身份默认**默认勾上，而不是一片空白。
        // 空白是在撒谎：没配过时系统仍在按矩阵给这个组员权限，界面却显示「什么都没开」，
        // 组长会以为人不能用、然后手动全勾一遍（等于什么都没改）。
        //
        // 勾的必须是 identityDefaults 而不是整个 ceiling：ceiling 里还含 LEADER_GRANTABLE
        // （代认领 / 区域审核），一起勾上等于白送区域审核权 —— 那两项要组长自己决定。
        //
        // granted 非空时原样用（含可见范围外的项，不能顺手滤掉——滤掉再保存就等于静默删配置）。
        const defaults = (v.identityDefaults ?? []).filter((c) => visible.includes(c));
        const g = new Set(v.granted.length ? v.granted : defaults);
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
            已按他的身份默认勾好（勾上的就是他现在能用的）；改动后以这里为准，只能在他身份允许的范围内收窄。
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
                取消勾选 = 收窄。全部取消 = 不配 = 恢复为上面这版身份默认（不是「什么都不能用」）。
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
