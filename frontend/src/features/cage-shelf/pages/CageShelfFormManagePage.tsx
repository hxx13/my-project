import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { Loader2, Database, SlidersHorizontal, PencilRuler, ChevronLeft } from "lucide-react";
import { fetchCageInfoFields, type CageInfoField } from "../api/cageForm.api";

const DATA_TYPE_LABELS: Record<string, string> = {
  number: "数字",
  text: "文本",
  boolean: "布尔",
};

/**
 * CageShelfFormManagePage — 笼位详情表单管理入口（已发布表单列表 + 角落按钮）
 *
 * - 已发布表单卡片：字段数量 + 字段列表（label + dataType）
 * - 右上角按钮：码表管理 → codelists，字段配置 → fields
 * - 主按钮：编辑并发布 → editor
 */
export default function CageShelfFormManagePage() {
  const navigate = useNavigate();
  const [allFields, setAllFields] = useState<CageInfoField[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCageInfoFields()
      .then((list) => setAllFields(list ?? []))
      .catch((e) => toast.error(e?.message || "加载字段失败"))
      .finally(() => setLoading(false));
  }, []);

  const published = allFields.filter((f) => f.published === true);
  const totalFields = allFields.length;

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* 顶栏：返回 + 标题 + 角落按钮 */}
      <div className="shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate("/console/admin/cage-shelves")}
            className="inline-flex items-center gap-0.5 text-xs text-[var(--twin-mute)] hover:text-[var(--twin-ink)] transition"
          >
            <ChevronLeft className="h-3.5 w-3.5" />笼架管理
          </button>
          <span className="text-[var(--twin-hairline)]">|</span>
          <h2 className="text-base font-bold text-[var(--twin-ink)]">笼位详情表单</h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate("codelists")}
            className="inline-flex items-center gap-1.5 rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--twin-ink)] hover:bg-[var(--twin-canvas-soft)] transition"
          >
            <Database className="h-3.5 w-3.5" />码表管理
          </button>
          <button
            type="button"
            onClick={() => navigate("fields")}
            className="inline-flex items-center gap-1.5 rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--twin-ink)] hover:bg-[var(--twin-canvas-soft)] transition"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />字段配置
          </button>
        </div>
      </div>

      {/* 主操作区：编辑并发布 */}
      <div className="shrink-0 rounded-twin-xl border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-4 flex items-center justify-between">
        <div>
          <div className="text-sm font-bold text-[var(--twin-ink)]">当前表单</div>
          <div className="text-xs text-[var(--twin-mute)] mt-0.5">
            已发布 <span className="font-semibold text-[var(--twin-ink)]">{published.length}</span> 个字段
            （共 {totalFields} 个字段）
          </div>
        </div>
        <button
          type="button"
          onClick={() => navigate("editor")}
          className="inline-flex items-center gap-1.5 rounded-twin-md px-4 py-2 text-xs font-semibold bg-[var(--twin-primary)] text-white hover:brightness-95 transition"
        >
          <PencilRuler className="h-4 w-4" />编辑并发布
        </button>
      </div>

      {/* 已发布表单卡片 */}
      <div className="flex-1 min-h-0 flex flex-col rounded-twin-xl border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] overflow-hidden">
        <div className="shrink-0 flex items-center justify-between px-4 py-2 border-b border-[var(--twin-hairline)]">
          <span className="text-sm font-semibold text-[var(--twin-ink)]">已发布表单</span>
          <span className="text-[11px] text-[var(--twin-mute)]">{published.length} 个字段</span>
        </div>
        <div className="flex-1 min-h-0 overflow-auto">
          {loading ? (
            <div className="flex min-h-[120px] items-center justify-center text-sm text-[var(--twin-mute)]">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />加载中…
            </div>
          ) : published.length === 0 ? (
            <div className="flex min-h-[120px] flex-col items-center justify-center text-sm text-[var(--twin-mute)]">
              <p>暂无已发布字段</p>
              <p className="text-[11px] mt-1">点击「编辑并发布」配置表单字段</p>
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead className="sticky top-0 z-[2] bg-[var(--twin-canvas-soft)] border-b border-[var(--twin-hairline)]">
                <tr className="text-[var(--twin-mute)] font-semibold">
                  <th className="px-3 py-2">字段名</th>
                  <th className="px-3 py-2">类型</th>
                  <th className="px-3 py-2">码表</th>
                  <th className="px-3 py-2 w-16">必填</th>
                </tr>
              </thead>
              <tbody>
                {published.map((f) => (
                  <tr key={f.id} className="border-b border-[var(--twin-hairline)] hover:bg-[var(--twin-canvas-soft)] transition-colors">
                    <td className="px-3 py-2">
                      <div className="font-medium text-[var(--twin-ink)]">{f.label || f.canonical}</div>
                      <div className="text-[10px] text-[var(--twin-mute)] font-mono">{f.canonical}</div>
                    </td>
                    <td className="px-3 py-2 text-[var(--twin-mute)]">{DATA_TYPE_LABELS[f.dataType] ?? f.dataType}</td>
                    <td className="px-3 py-2 text-[var(--twin-mute)] font-mono text-[11px]">{f.dictKey || "—"}</td>
                    <td className="px-3 py-2">{f.required ? <span className="text-emerald-600 font-semibold">是</span> : <span className="text-[var(--twin-mute)]">否</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
