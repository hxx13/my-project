/**
 * 笼位域码表管理页（薄壳）。
 * 工作台逻辑在 CageCodelistWorkbench；数据来自 cage_info_codelist，与 NHP 隔离。
 */
import { useState } from "react";
import { AdminButton } from "@/components/admin/AdminButton";
import CageCodelistWorkbench from "../components/CageCodelistWorkbench";
import { CageFormPageShell, CageFormSearchInput } from "../components/CageFormPageShell";

export default function CageCodelistPage() {
  const [keyword, setKeyword] = useState("");
  const [stats, setStats] = useState({ codelistCount: 0, folderCount: 0 });

  const toolbar = (
    <>
      <CageFormSearchInput
        value={keyword}
        onChange={setKeyword}
        placeholder="搜索码表中文名 / 编码 / 文件夹…"
      />
      {keyword.trim() ? (
        <AdminButton type="button" tone="ghost" size="sm" onClick={() => setKeyword("")}>
          清除
        </AdminButton>
      ) : null}
      <span className="ml-auto shrink-0 text-xs text-[var(--app-color-text-tertiary)]">
        共 {stats.codelistCount} 个码表 · {stats.folderCount} 个文件夹
      </span>
    </>
  );

  return (
    <CageFormPageShell backTo="/admin/cage-shelves/forms/manage" toolbar={toolbar}>
      <CageCodelistWorkbench keyword={keyword} onKeywordChange={setKeyword} onStatsChange={setStats} />
    </CageFormPageShell>
  );
}
