import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fetchRegionCapabilities, saveRegionCapabilities } from "@/api/domains/cageShelf.api";

/**
 * 区域学生功能配置 —— 饲养组长决定**本区域**的学生能用哪些功能。
 *
 * 四层里的第三层（设计 §7）：区域归属 → 身份矩阵（上限）→ **区域能力** → 成员勾选。
 * 这里只渲染矩阵允许的学生侧能力（`view_group = STUDENT` 且已被某个学生身份命中），
 * 所以「矩阵改一格，区域可选项跟着变」，前端不硬编码任何能力名。
 *
 * ⚠ 语义坑：**全部取消 = 本人不贡献 = 若其他组长也没开，本区回到从未配置 = 学生按身份默认（全部开放）**。
 * 也就是说这里**关不掉全部**。界面必须写出来，否则组长会以为全取消 = 全禁用。
 *
 * 多人共管（2026-09-13）：一个区域可以同时分给**多个**饲养组长，生效取**并集** ——
 * 谁开的都算开，我在这里**只增不减**，所以别人开的项要单独只读展示（否则我取消却毫无作用，
 * 会以为界面坏了）。要收窄只能走超管改矩阵、或撤掉某人的区域。
 *
 * 可见性取并集、操作按笼位收口：某学生的课题组笼位横跨 A/B 两区时，模式入口按两区并集给，
 * 但对 B 区的笼位实际动手时，B 区的配置说了算。
 */
export default function RegionCapabilityDialog({
  open,
  onOpenChange,
  regionType,
  regionId,
  regionName,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  regionType: string;
  regionId: string;
  regionName: string;
  onSaved?: () => void;
}) {
  const [ceiling, setCeiling] = useState<string[]>([]);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [initial, setInitial] = useState<Set<string>>(new Set());
  /** 其他组长在本区开放的能力（并集生效，我只能看、不能取消） */
  const [others, setOthers] = useState<string[]>([]);
  /** 超管：保存 = 重置本区域（清掉所有人的行再写他勾的），要显式提示 */
  const [asAdmin, setAsAdmin] = useState(false);
  const [untouched, setUntouched] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !regionId) return;
    let cancelled = false;
    setLoading(true);
    fetchRegionCapabilities(regionType, regionId)
      .then((v) => {
        if (cancelled) return;
        setCeiling(v.ceiling);
        setLabels(v.labels ?? {});
        const other = v.others ?? [];
        setOthers(other);
        setAsAdmin(!!v.asAdmin);
        // 「谁都没配过」才按默认全开渲染。判据是**本区有没有被配过**（regionConfigured），
        // 不是「勾选集合空不空」—— 全关的区域勾选也是空的，但那是「配过且全关」，
        // 显示成全开就等于告诉组长「你关不掉」，正是之前的 bug。
        const nobody = !v.regionConfigured;
        setUntouched(nobody);
        const eff = nobody ? v.ceiling : v.configured;
        setPicked(new Set(eff));
        setInitial(new Set(eff));
      })
      .catch(() => {
        if (!cancelled) {
          setCeiling([]);
          setOthers([]);
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
  }, [open, regionType, regionId]);

  const dirty = useMemo(
    () => [...picked].sort().join("|") !== [...initial].sort().join("|"),
    [picked, initial],
  );

  const save = async () => {
    setSaving(true);
    try {
      await saveRegionCapabilities(regionType, regionId, [...picked]);
      setInitial(new Set(picked));
      // 保存后本区一定是「配过」了 —— 没勾的项也会落成关闭行
      setUntouched(false);
      toast.success("区域学生功能已保存");
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
          <DialogTitle className="text-[14px] text-[var(--twin-ink)]">{regionName} · 学生功能</DialogTitle>
          <DialogDescription className="text-[11px] text-[var(--twin-mute)]">
            本区域的学生能用哪些功能，由本区域的饲养组长共同决定；多人共管时取
            <b className="text-[var(--twin-ink)]">并集</b>，你只能新增、不能取消别人开的。
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
          {loading ? (
            <div className="rounded-twin-sm border border-dashed border-[var(--twin-hairline)] px-3 py-6 text-center text-[10px] text-[var(--twin-mute)]">
              加载中…
            </div>
          ) : ceiling.length === 0 ? (
            <div className="rounded-twin-sm border border-dashed border-[var(--twin-hairline)] px-3 py-6 text-center text-[10px] text-[var(--twin-mute)]">
              矩阵里没有开放给学生侧的功能，没有可配置项。
            </div>
          ) : (
            <div className="space-y-2">
              {asAdmin && (
                <div className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] px-3 py-2 text-[10px] leading-relaxed text-[var(--twin-mute)]">
                  你是<b className="text-[var(--twin-ink)]">超级管理员</b>：下面显示的是本区域
                  <b className="text-[var(--twin-ink)]">所有人的</b>配置，保存即
                  <b className="text-[var(--twin-ink)]">重置本区域</b>（会清掉其他组长开的项）。
                </div>
              )}
              {untouched && (
                <div className="rounded-twin-sm border border-dashed border-[var(--twin-hairline)] px-3 py-2 text-[10px] leading-relaxed text-[var(--twin-mute)]">
                  本区还没人配过，下面按默认（全部开放）显示。保存后你勾的这些会与（如有）其他组长开放的
                  <b className="text-[var(--twin-ink)]">合并</b>生效。
                </div>
              )}
              {!untouched && picked.size === 0 && others.length === 0 && (
                <div className="rounded-twin-sm border border-dashed border-[var(--twin-hairline)] px-3 py-2 text-[10px] leading-relaxed text-[var(--twin-mute)]">
                  本区域当前<b className="text-[var(--twin-ink)]">全部关闭</b>：这里一项都没开，
                  学生在本区看不到这些功能入口。勾上任意一项并保存即可重新开放。
                </div>
              )}
              {others.length > 0 && <div className="text-[10px] text-[var(--twin-mute)]">我的配置</div>}
              {ceiling.map((code) => {
                const on = picked.has(code);
                return (
                  <label
                    key={code}
                    className="flex cursor-pointer items-center justify-between gap-3 rounded-twin-sm border border-[var(--twin-hairline)] px-3 py-2"
                  >
                    <span className="text-[11px] font-semibold text-[var(--twin-ink)]">
                      {labels[code] || code}
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
              {/* 其他组长开的：只读。并集生效，所以在这里取消是做不到的——必须让用户看见这一点，
                  否则他会反复点、以为界面坏了。 */}
              {others.length > 0 && (
                <>
                  <div className="pt-1 text-[10px] leading-relaxed text-[var(--twin-mute)]">
                    以下开关当前被<b className="text-[var(--twin-ink)]">其他饲养组长</b>开着。本区生效是
                    <b className="text-[var(--twin-ink)]">并集</b>：只要还有人开着就仍然开放，
                    <b className="text-[var(--twin-ink)]">必须所有组长都关掉才能彻底关闭</b>。
                    你在这里取消不了别人开的那一项：
                  </div>
                  {others.map((code) => (
                    <div
                      key={code}
                      className="flex items-center justify-between gap-3 rounded-twin-sm border border-dashed border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] px-3 py-2"
                    >
                      <span className="text-[11px] text-[var(--twin-body)]">{labels[code] || code}</span>
                      <input type="checkbox" checked disabled className="size-4 accent-[var(--twin-primary)] opacity-60" />
                    </div>
                  ))}
                </>
              )}
              <p className="pt-1 text-[10px] leading-relaxed text-[var(--twin-mute)]">
                权限矩阵是<b className="text-[var(--twin-ink)]">总开关</b>，这里只做
                <b className="text-[var(--twin-ink)]">本区独立关闭</b>：取消勾选并保存后，该项在本区即关闭
                （全不勾 = 本区全部关闭）。若还有其他组长开着同一项，取并集 → 那项仍然开放。
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
