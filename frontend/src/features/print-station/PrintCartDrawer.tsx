import { useEffect, useState } from "react";
import { AlertTriangle, ClipboardList, Minus, Plus, Trash2 } from "lucide-react";
import CageOpDrawer from "@/components/cage/CageOpDrawer";
import { AdminButton } from "@/components/admin/AdminButton";
import { appConfirm } from "@/lib/appDialog";
import {
  templateKeyOf,
  type Cart,
  type CartState,
  type LocalFileItem,
  type PrintItem,
} from "./printCart";
import { PrintDispatchDialog } from "./PrintDispatchDialog";

/** 加急复选框：全站无 checkbox 原语，都用裸 input + 这个常量（同 RecordsTable）。 */
const CHECKBOX = "size-3.5 shrink-0 cursor-pointer align-middle accent-[var(--app-color-accent)]";

const templateBadge =
  "inline-flex items-center rounded-full border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-hover)] px-2 py-0.5 text-[11px] font-medium text-[var(--app-color-text-secondary)]";
const localBadge =
  "inline-flex items-center rounded-full border border-[color-mix(in_srgb,var(--app-color-feedback-warning)_30%,transparent)] bg-[color-mix(in_srgb,var(--app-color-feedback-warning)_15%,transparent)] px-2 py-0.5 text-[11px] font-medium text-[var(--app-color-feedback-warning)]";

type Entry = { key: string; name: string; local: boolean };

type Props = {
  cart: Cart;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** 清单被改动后回调，页面据此刷新「待打清单 N」角标。 */
  onChanged: () => void;
  /** 上一次派发失败条目的原因（key → 原因）。只对那次失败后仍留在清单里的条目有意义。 */
  failReasons: Record<string, string>;
  setFailReasons: (next: Record<string, string>) => void;
};

/**
 * 「待打清单」抽屉：列条目、改份数/加急、移除、清空、派发。
 * cart 由页面传入（页面只建一次），抽屉不自己建 —— 否则本地文件会丢。
 */
export function PrintCartDrawer({ cart, open, onOpenChange, onChanged, failReasons, setFailReasons }: Props) {
  const [snap, setSnap] = useState<CartState>(() => cart.getState());
  const [dispatchOpen, setDispatchOpen] = useState(false);

  // 抽屉关闭期间页面可能又加了一批，打开时重新同步一次
  useEffect(() => {
    if (open) setSnap(cart.getState());
  }, [open, cart]);

  const sync = (next: CartState) => {
    setSnap(next);
    onChanged();
  };

  const entries: Entry[] = [
    ...snap.templateItems.map((it) => ({ key: templateKeyOf(it), name: it.fileName, local: false })),
    ...snap.localFiles.map((f) => ({ key: f.key, name: f.name, local: true })),
  ];
  const count = entries.length;
  const hasLocal = snap.localFiles.length > 0;

  /** 改份数/加急/移除某一条，就把它的旧失败原因摘掉 —— 那条原因只对上一次派发有效。 */
  const clearReason = (key: string) => {
    if (!(key in failReasons)) return;
    const next = { ...failReasons };
    delete next[key];
    setFailReasons(next);
  };

  const remove = (key: string) => {
    sync(cart.remove(key));
    clearReason(key);
  };
  const setCopies = (key: string, v: number) => {
    sync(cart.setOverride(key, { copies: v }));
    clearReason(key);
  };
  const toggleUrgent = (key: string, v: boolean) => {
    sync(cart.setOverride(key, { urgent: v }));
    clearReason(key);
  };

  const onClear = async () => {
    if (!(await appConfirm("清空待打清单？本地文件需重新选择。"))) return;
    sync(cart.clear());
    setFailReasons({});
  };

  // 成功的从清单摘掉、失败的留下。派发弹窗（部分失败时）仍开着，它会跟着 items 收缩。
  // 失败原因同步存起来（覆盖上一次的），抽屉里逐条展示。
  const onBatchDone = (r: { succeededKeys: string[]; failed: { key: string; reason: string }[] }) => {
    for (const key of r.succeededKeys) cart.remove(key);
    setSnap(cart.getState());
    onChanged();
    setFailReasons(Object.fromEntries(r.failed.map((f) => [f.key, f.reason])));
  };

  const dispatchItems: (PrintItem | LocalFileItem)[] = [...snap.templateItems, ...snap.localFiles];

  if (!open) return null;

  return (
    <>
      <CageOpDrawer
        title="待打清单"
        countText={`共 ${count} 项`}
        hint={hasLocal ? "本地文件离开或刷新本页会丢失，请尽快派发" : "勾选的文件都在这里，派发前可改份数 / 标加急"}
        collapseLabel="待打清单"
        onClose={() => onOpenChange(false)}
        footer={
          <div className="flex items-center gap-2">
            <AdminButton type="button" tone="ghost" size="sm" disabled={count === 0} onClick={() => void onClear()}>
              清空
            </AdminButton>
            <div className="ml-auto" />
            <AdminButton type="button" size="sm" disabled={count === 0} onClick={() => setDispatchOpen(true)}>
              派发 {count} 项
            </AdminButton>
          </div>
        }
      >
        {count === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-center text-sm text-[var(--app-color-text-tertiary)]">
            <ClipboardList className="size-8 opacity-30" />
            待打清单是空的。在文件模板库勾选文件，或点「临时打印」选本地文件。
          </div>
        ) : (
          <ul className="space-y-2">
            {entries.map((e) => {
              const ov = snap.overrides[e.key] ?? {};
              const copies = ov.copies ?? 1;
              const urgent = !!ov.urgent;
              const reason = failReasons[e.key];
              return (
                <li
                  key={e.key}
                  className="rounded-md border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] p-2.5"
                >
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium text-[var(--app-color-text-primary)]" title={e.name}>
                        {e.name}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <span className={e.local ? localBadge : templateBadge}>{e.local ? "本地" : "模板库"}</span>
                        {e.local ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-[var(--app-color-feedback-warning)]">
                            <AlertTriangle className="size-3" />
                            离开/刷新本页会丢失，请尽快派发
                          </span>
                        ) : null}
                      </div>
                      {reason ? (
                        <div className="mt-1 text-[12px] leading-relaxed text-[var(--app-color-feedback-error)]">{reason}</div>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      aria-label={`移除 ${e.name}`}
                      title="移除"
                      onClick={() => remove(e.key)}
                      className="rounded-md p-1 text-[var(--app-color-text-tertiary)] transition-colors hover:bg-[var(--app-color-surface-hover)] hover:text-[var(--app-color-feedback-danger)]"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                  <div className="mt-2 flex items-center gap-4">
                    <div className="flex items-center gap-1">
                      <span className="text-[11px] text-[var(--app-color-text-tertiary)]">份数</span>
                      <button
                        type="button"
                        disabled={copies <= 1}
                        onClick={() => setCopies(e.key, Math.max(1, copies - 1))}
                        className="flex size-6 items-center justify-center rounded border border-[var(--app-color-border-default)] text-[var(--app-color-text-secondary)] transition-colors hover:bg-[var(--app-color-surface-hover)] disabled:opacity-40"
                      >
                        <Minus className="size-3" />
                      </button>
                      <span className="w-6 text-center text-[13px] tabular-nums text-[var(--app-color-text-primary)]">{copies}</span>
                      <button
                        type="button"
                        disabled={copies >= 99}
                        onClick={() => setCopies(e.key, Math.min(99, copies + 1))}
                        className="flex size-6 items-center justify-center rounded border border-[var(--app-color-border-default)] text-[var(--app-color-text-secondary)] transition-colors hover:bg-[var(--app-color-surface-hover)] disabled:opacity-40"
                      >
                        <Plus className="size-3" />
                      </button>
                    </div>
                    <label className="flex items-center gap-1.5 text-[13px] text-[var(--app-color-text-primary)]">
                      <input
                        type="checkbox"
                        checked={urgent}
                        onChange={(ev) => toggleUrgent(e.key, ev.target.checked)}
                        className={CHECKBOX}
                      />
                      加急
                    </label>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CageOpDrawer>

      <PrintDispatchDialog
        open={dispatchOpen}
        onOpenChange={setDispatchOpen}
        sourceType="ADMIN_FILE"
        sourceId=""
        fileName=""
        items={dispatchItems}
        overrides={snap.overrides}
        onBatchDone={onBatchDone}
      />
    </>
  );
}

export default PrintCartDrawer;
