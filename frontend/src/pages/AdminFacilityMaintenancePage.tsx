import { useSearchParams } from "react-router-dom";
import ConsumablesTab from "@/features/facility-maintenance/ConsumablesTab";
import InspectionTab from "@/features/facility-maintenance/InspectionTab";
import ReplacementsTab from "@/features/facility-maintenance/ReplacementsTab";
import SettingsTab from "@/features/facility-maintenance/SettingsTab";
import { AdminPageShell } from "@/components/admin/AdminPageShell";
import { AdminTabPanel } from "@/components/admin/AdminPageTabs";

type TabKey = "inspection" | "consumables" | "replacements" | "settings";

const LEDGER_TABS: { id: TabKey; label: string }[] = [
  { id: "inspection", label: "巡查" },
  { id: "consumables", label: "耗材" },
  { id: "replacements", label: "更换" },
  { id: "settings", label: "设置" },
];

function parseTabKey(raw: string | null): TabKey {
  return LEDGER_TABS.find((t) => t.id === raw)?.id ?? "inspection";
}

export default function AdminFacilityMaintenancePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = parseTabKey(searchParams.get("tab"));
  const setTab = (next: string) => {
    const p = new URLSearchParams(searchParams);
    p.set("tab", next);
    setSearchParams(p, { replace: true });
  };

  return (
    <AdminPageShell fillHeight className="gap-2">
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-twin-xl border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] shadow-twin-level-2">
      {/* 页面级 tab 由各 tab 组件自己的 FmToolbar 渲染（?tab= 同步逻辑不变） */}
      <AdminTabPanel id="fm-panel-settings" tabId="settings" activeTab={tab} className="flex min-h-0 flex-1 flex-col">
        <SettingsTab tabs={LEDGER_TABS} activeTab={tab} onTabChange={setTab} />
      </AdminTabPanel>

      <AdminTabPanel id="fm-panel-inspection" tabId="inspection" activeTab={tab} className="flex min-h-0 flex-1 flex-col">
        <InspectionTab tabs={LEDGER_TABS} activeTab={tab} onTabChange={setTab} />
      </AdminTabPanel>

      <AdminTabPanel id="fm-panel-consumables" tabId="consumables" activeTab={tab} className="flex min-h-0 flex-1 flex-col">
        <ConsumablesTab tabs={LEDGER_TABS} activeTab={tab} onTabChange={setTab} />
      </AdminTabPanel>

      <AdminTabPanel id="fm-panel-replacements" tabId="replacements" activeTab={tab} className="flex min-h-0 flex-1 flex-col">
        <ReplacementsTab tabs={LEDGER_TABS} activeTab={tab} onTabChange={setTab} />
      </AdminTabPanel>
      </div>
    </AdminPageShell>
  );
}
