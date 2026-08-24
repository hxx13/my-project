import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AdminButton } from "@/components/admin/AdminButton";
import { toAdminRoutePath } from "@/features/admin/buildAdminNavModel";
import CageFieldWorkbench, { type CageFieldWorkbenchHandle } from "../components/CageFieldWorkbench";
import { CAGE_DICT_KEY } from "../components/CageFieldDictWorkbench";
import { CageFormPageShell, CageFormSearchInput } from "../components/CageFormPageShell";

/**
 * 笼位字段字典管理页（薄壳）。
 * 工作台逻辑在 CageFieldWorkbench；数据来自 cage_info_field。
 */
export default function CageFieldPage() {
  const navigate = useNavigate();
  const { dictKey } = useParams<{ dictKey: string }>();
  const [keyword, setKeyword] = useState("");
  const [stats, setStats] = useState({ filteredCount: 0, publishedCount: 0, folderCount: 0, publishPending: false });
  const workbenchRef = useRef<CageFieldWorkbenchHandle>(null);

  useEffect(() => {
    const key = (dictKey || "").trim();
    if (!key) {
      navigate(toAdminRoutePath(`/admin/cage-shelves/forms/fields/${CAGE_DICT_KEY}`), { replace: true });
      return;
    }
    if (key !== CAGE_DICT_KEY) {
      navigate(toAdminRoutePath(`/admin/cage-shelves/forms/fields/${CAGE_DICT_KEY}`), { replace: true });
    }
  }, [dictKey, navigate]);

  const toolbar = (
    <>
      <CageFormSearchInput
        value={keyword}
        onChange={setKeyword}
        placeholder="搜索规范名 / 显示名 / 码表键 / 文件夹…"
      />
      {keyword.trim() ? (
        <AdminButton type="button" tone="ghost" size="sm" onClick={() => setKeyword("")}>
          清除
        </AdminButton>
      ) : null}
      <AdminButton type="button" tone="ghost" size="sm" onClick={() => workbenchRef.current?.openCreateDomain()}>
        ＋ 新建数据域
      </AdminButton>
      <AdminButton type="button" tone="ghost" size="sm" onClick={() => workbenchRef.current?.openCreate()}>
        ＋ 新建字段
      </AdminButton>
      <AdminButton
        type="button"
        tone="ghost"
        size="sm"
        disabled={stats.publishPending}
        onClick={() => void workbenchRef.current?.publish()}
      >
        {stats.publishPending ? "发布中…" : "发布"}
      </AdminButton>
      <AdminButton
        type="button"
        tone="ghost"
        size="sm"
        title="打开码表管理"
        onClick={() => workbenchRef.current?.openCodelist()}
      >
        码表
      </AdminButton>
      <span className="ml-auto shrink-0 text-xs text-[var(--app-color-text-tertiary)]">
        共 {stats.filteredCount} 字段 · 已发布 {stats.publishedCount} · {stats.folderCount} 个文件夹
        {keyword.trim() ? ` · 筛选「${keyword.trim()}」` : ""}
      </span>
    </>
  );

  return (
    <CageFormPageShell backTo="/admin/cage-shelves/forms/manage" toolbar={toolbar}>
      <CageFieldWorkbench
        ref={workbenchRef}
        dictKey={dictKey}
        keyword={keyword}
        onKeywordChange={setKeyword}
        onStatsChange={setStats}
      />
    </CageFormPageShell>
  );
}
