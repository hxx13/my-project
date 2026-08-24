import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AdminButton } from "@/components/admin/AdminButton";
import { toAdminRoutePath } from "@/features/admin/buildAdminNavModel";
import CageFieldDictWorkbench from "../components/CageFieldDictWorkbench";
import { CageFormPageShell, CageFormSearchInput } from "../components/CageFormPageShell";

/**
 * 笼位字段/码表管理 HUB — 对齐 NHP「管理字段」入口（NhpFieldDictListPage）。
 * 已发布表单列表见 CageFormListPage（/forms）。
 */
export default function CageShelfFormManagePage() {
  const navigate = useNavigate();
  const [keyword, setKeyword] = useState("");

  const toolbar = (
    <>
      <CageFormSearchInput
        value={keyword}
        onChange={setKeyword}
        placeholder="搜索 dictKey / 名称…"
      />
      {keyword.trim() ? (
        <AdminButton type="button" tone="ghost" size="sm" onClick={() => setKeyword("")}>
          清除
        </AdminButton>
      ) : null}
      <AdminButton
        type="button"
        tone="ghost"
        size="sm"
        onClick={() => navigate(toAdminRoutePath("/admin/cage-shelves/forms/codelists"))}
      >
        码表
      </AdminButton>
      <span className="ml-auto text-xs text-[var(--app-color-text-tertiary)]">共 1 套数据域</span>
    </>
  );

  return (
    <CageFormPageShell backTo="/admin/cage-shelves/forms" toolbar={toolbar}>
      <CageFieldDictWorkbench keyword={keyword} />
    </CageFormPageShell>
  );
}
