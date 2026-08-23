import { useNavigate } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import NhpFieldDictWorkbench from "@/features/nhp/components/NhpFieldDictWorkbench";

/**
 * CageFieldDictListPage — 笼位字段字典套列表（后台控制台壳）。
 *
 * 复用 NHP 字段字典套列表工作台（NhpFieldDictWorkbench），挂到控制台页壳下，
 * 返回行为回跳到表单管理页，而非内容管理后台。
 */
export default function CageFieldDictListPage() {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* 顶栏：返回 + 标题 */}
      <div className="shrink-0 flex items-center gap-2">
        <button
          type="button"
          onClick={() => navigate("/console/admin/cage-shelves/forms")}
          className="inline-flex items-center gap-0.5 text-xs text-[var(--twin-mute)] hover:text-[var(--twin-ink)] transition"
        >
          <ChevronLeft className="h-3.5 w-3.5" />表单管理
        </button>
        <span className="text-[var(--twin-hairline)]">|</span>
        <h2 className="text-base font-bold text-[var(--twin-ink)]">字段字典套</h2>
      </div>

      {/* 工作台（自包含工作区外壳） */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <NhpFieldDictWorkbench onBack={() => navigate("/console/admin/cage-shelves/forms")} />
      </div>
    </div>
  );
}
