import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useAnimalOrderTimePolicyAdmin } from "@/api/hooks/useAnimalOrderTime";
import type { AnimalOrderTimePolicyAdmin } from "@/api/domains/animalOrderTime.api";
import TimeWindowRuleEditor from "./TimeWindowRuleEditor";
import EtaPolicyEditor from "./EtaPolicyEditor";
import HolidayImportPanel from "./HolidayImportPanel";
import { ANIMAL_ORDER_CAMPUSES, type AnimalOrderCampus } from "./campus";

interface OrderTimeManagerProps {
  /** 打开时的校区，弹窗内可切换到另一校区分别维护 */
  campus: AnimalOrderCampus;
  onClose: () => void;
}

type TabKey = "window" | "eta" | "holiday";

const TABS: { key: TabKey; label: string }[] = [
  { key: "window", label: "可购窗口" },
  { key: "eta", label: "预计送达" },
  { key: "holiday", label: "节假日" },
];

export default function OrderTimeManager({ campus: initialCampus, onClose }: OrderTimeManagerProps) {
  const [campus, setCampus] = useState<AnimalOrderCampus>(initialCampus);
  const { data: admin, isLoading } = useAnimalOrderTimePolicyAdmin(campus);
  const [activeTab, setActiveTab] = useState<TabKey>("window");
  const [draft, setDraft] = useState<AnimalOrderTimePolicyAdmin | null>(null);

  useEffect(() => {
    if (admin) {
      setDraft({
        campus: admin.campus,
        defaultMode: admin.defaultMode,
        etaMode: admin.etaMode,
        etaWorkdayOffset: admin.etaWorkdayOffset,
        etaWeekday: admin.etaWeekday,
        rules: admin.rules ?? [],
      });
    }
  }, [admin]);

  return createPortal(
    <div
      className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-4xl flex-col rounded-twin-xl bg-[var(--twin-canvas)] p-4 shadow-twin-level-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex shrink-0 items-center justify-between">
          <h3 className="text-base font-semibold text-[var(--twin-ink)]">动物订购时间管理 · {campus}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[var(--twin-hairline)] px-3 py-1.5 text-sm text-[var(--twin-body)] hover:bg-[var(--twin-canvas-soft)]"
          >
            关闭
          </button>
        </div>

        <div className="mb-3 flex shrink-0 items-center gap-2 border-b border-[var(--twin-hairline)] pb-2">
          <div className="flex gap-1">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  activeTab === tab.key
                    ? "bg-sky-600 text-white"
                    : "text-[var(--twin-body)] hover:bg-[var(--twin-canvas-soft)]"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="min-w-0 flex-1" />
          {activeTab === "holiday" ? (
            <span className="shrink-0 text-[11px] text-[var(--twin-mute)]">节假日为全国口径，两校区共用</span>
          ) : (
            <div className="flex shrink-0 items-center gap-1">
              {ANIMAL_ORDER_CAMPUSES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCampus(c)}
                  className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                    campus === c
                      ? "bg-emerald-600 text-white"
                      : "border border-[var(--twin-hairline)] text-[var(--twin-body)] hover:bg-[var(--twin-canvas-soft)]"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {isLoading || !draft ? (
            <div className="py-8 text-center text-xs text-[var(--twin-mute)]">加载中…</div>
          ) : activeTab === "window" ? (
            <TimeWindowRuleEditor draft={draft} onChange={setDraft} />
          ) : activeTab === "eta" ? (
            <EtaPolicyEditor draft={draft} onChange={setDraft} />
          ) : (
            <HolidayImportPanel campus={campus} />
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
