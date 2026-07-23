import { AdminFormCard } from "@/components/admin/AdminPageShell";
import { ClientReloadOpsPanel } from "@/features/admin/settings/ClientReloadOpsPanel";

/**
 * DangerZoneSettings sub-page for AdminSettingsLayout.
 * Minimal page — wraps ClientReloadOpsPanel with a warning-styled card.
 */
export default function DangerZoneSettings() {
  return (
    <div className="space-y-6">
      <AdminFormCard
        title="⚠️ 客户端广播操作"
        description="以下操作会影响所有在线用户，请确认后再执行。"
        className="border-[var(--app-color-feedback-danger-soft)]"
      >
        <ClientReloadOpsPanel />
      </AdminFormCard>
    </div>
  );
}
