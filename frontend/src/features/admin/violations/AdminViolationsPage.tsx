import { useEffect, useState } from "react";
import type { JSX } from "react";
import { useSearchParams } from "react-router-dom";
import { AdminPageShell } from "@/components/admin/AdminPageShell";
import { RecordsTab } from "@/features/admin/violations/records/RecordsTab";
import { AdminConfigModal } from "@/features/admin/violations/ConfigModal/AdminConfigModal";
import {
  configPageFromTab,
  parseTabFromSearch,
  type ConfigModalView,
} from "@/features/admin/violations/violationsTabs";

type CfgState = { open: boolean; page: ConfigModalView; fromUrl: boolean };

/** 首帧由 URL 解析：旧书签（?tab=rules 等）直达对应配置弹窗页，不白屏。 */
function initialStateFromUrl(): CfgState {
  const { tab, sub } = parseTabFromSearch(window.location.search);
  const page = configPageFromTab(tab, sub);
  return page ? { open: true, page, fromUrl: true } : { open: false, page: "menu", fromUrl: false };
}

/** 记录即页面唯一主体：工具栏 + 列表 + 钻入编辑器；配置折叠进 ⚙ 弹窗。 */
export function AdminViolationsPage(): JSX.Element {
  const [searchParams, setSearchParams] = useSearchParams();
  const { tab, sub } = parseTabFromSearch(searchParams.toString());
  const [cfg, setCfg] = useState<CfgState>(initialStateFromUrl);

  // URL 变化跟随：非 records tab → 打开对应配置页；回 records → 关闭 URL 驱动的弹窗。
  useEffect(() => {
    const page = configPageFromTab(tab, sub);
    setCfg((prev) => {
      if (page) return { open: true, page, fromUrl: true };
      if (prev.fromUrl && prev.open) return { open: false, page: "menu", fromUrl: false };
      return prev;
    });
  }, [tab, sub]);

  const openConfig = () => setCfg({ open: true, page: "menu", fromUrl: false });

  const closeConfig = () => {
    setCfg((prev) => ({ ...prev, open: false }));
    // 弹窗由书签打开时，关闭后把 URL 归一回 records，避免刷新重新弹开。
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (p.get("tab") !== "records") {
          p.set("tab", "records");
          p.delete("sub");
        }
        return p;
      },
      { replace: true }
    );
  };

  return (
    <AdminPageShell>
      <div className="flex h-[calc(100dvh-var(--admin-chrome-offset))] flex-col">
        <RecordsTab onOpenConfig={openConfig} />
      </div>
      <AdminConfigModal open={cfg.open} page={cfg.page} onClose={closeConfig} />
    </AdminPageShell>
  );
}
