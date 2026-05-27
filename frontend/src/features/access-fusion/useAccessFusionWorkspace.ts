import { useState } from "react";

/** 门禁统计清洗页顶层 Tab：概览 / 试算 / 清洗总库 / 运行批次 */
export type AccessFusionWorkspaceTab = "overview" | "preview" | "library" | "runs";

export function useAccessFusionWorkspace(initial: AccessFusionWorkspaceTab = "overview") {
  const [workspaceTab, setWorkspaceTab] = useState<AccessFusionWorkspaceTab>(initial);
  return { workspaceTab, setWorkspaceTab };
}
