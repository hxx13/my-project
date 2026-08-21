import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useAnimalOrderTimePolicyAdmin } from "@/api/hooks/useAnimalOrderTime";
import type { AnimalOrderTimePolicyAdmin } from "@/api/domains/animalOrderTime.api";
import TimeWindowRuleEditor from "./TimeWindowRuleEditor";
import EtaPolicyEditor from "./EtaPolicyEditor";
import HolidayImportPanel from "./HolidayImportPanel";

interface OrderTimeManagerProps {
  onClose: () => void;
}

type TabKey = "window" | "eta" | "holiday";

const TABS: { key: TabKey; label: string }[] = [
  { key: "window", label: "可购窗口" },
  { key: "eta", label: "预计送达" },
  { key: "holiday", label: "节假日" },
];

export default function OrderTimeManager({ onClose }: OrderTimeManagerProps) {
  const { data: admin, isLoading } = useAnimalOrderTimePolicyAdmin();
  const [activeTab, setActiveTab] = useState<TabKey>("window");
  const [draft, setDraft] = useState<AnimalOrderTimePolicyAdmin | null>(null);

  useEffect(() => {
    if (admin) {
      setDraft({
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
          <h3 className="text-base font-semibold text-[var(--twin-ink)]">动物订购时间管理</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[var(--twin-hairline)] px-3 py-1.5 text-sm text-[var(--twin-body)] hover:bg-[var(--twin-canvas-soft)]"
          >
            关闭
          </button>
        </div>

        <div className="mb-3 flex shrink-0 gap-1 border-b border-[var(--twin-hairline)] pb-2">
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

        <div className="min-h-0 flex-1 overflow-y-auto">
          {isLoading || !draft ? (
            <div className="py-8 text-center text-xs text-[var(--twin-mute)]">加载中…</div>
          ) : activeTab === "window" ? (
            <TimeWindowRuleEditor draft={draft} onChange={setDraft} />
          ) : activeTab === "eta" ? (
            <EtaPolicyEditor draft={draft} onChange={setDraft} />
          ) : (
            <HolidayImportPanel />
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
