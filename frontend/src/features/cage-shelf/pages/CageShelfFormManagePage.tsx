import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { Loader2, Database, SlidersHorizontal, Layers, PencilRuler, ChevronLeft } from "lucide-react";
import { fetchNhpFieldDictionary, type NhpFieldDictionary } from "@/features/nhp/api/nhpFieldDictionary.api";
import { fetchNhpFields } from "@/features/nhp/api/nhpField.api";

/**
 * CageShelfFormManagePage — 笼位详情表单管理 HUB
 *
 * 复用 NHP 管理页，不再维护自定义简化页：
 *   - 码表管理     → /console/admin/cage-shelves/forms/codelists
 *   - 字段配置     → /console/admin/cage-shelves/forms/fields/cage（笼位字段字典套）
 *   - 字段字典套   → /console/admin/cage-shelves/forms/fields
 *   - 编辑并发布   → /console/admin/cage-shelves/forms/fields/cage
 *
 * 摘要数据来自笼位字段字典套（dictKey="cage"，FROZEN 即已发布）。
 */
export default function CageShelfFormManagePage() {
  const navigate = useNavigate();
  const [dict, setDict] = useState<NhpFieldDictionary | null>(null);
  const [frozenCount, setFrozenCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetchNhpFieldDictionary("cage"),
      fetchNhpFields(undefined, { dictKey: "cage", status: "FROZEN" }),
    ])
      .then(([d, fields]) => {
        setDict(d ?? null);
        setFrozenCount(fields?.length ?? 0);
      })
      .catch((e) => toast.error(e?.message || "加载笼位字段字典失败"))
      .finally(() => setLoading(false));
  }, []);

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
          <h2 className="text-base font-bold text-[var(--twin-ink)]">笼位详情表单管理</h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate("/console/admin/cage-shelves/forms/codelists")}
            className="inline-flex items-center gap-1.5 rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--twin-ink)] hover:bg-[var(--twin-canvas-soft)] transition"
          >
            <Database className="h-3.5 w-3.5" />码表管理
          </button>
          <button
            type="button"
            onClick={() => navigate("/console/admin/cage-shelves/forms/fields/cage")}
            className="inline-flex items-center gap-1.5 rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--twin-ink)] hover:bg-[var(--twin-canvas-soft)] transition"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />字段配置
          </button>
          <button
            type="button"
            onClick={() => navigate("/console/admin/cage-shelves/forms/fields")}
            className="inline-flex items-center gap-1.5 rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--twin-ink)] hover:bg-[var(--twin-canvas-soft)] transition"
          >
            <Layers className="h-3.5 w-3.5" />字段字典套
          </button>
        </div>
      </div>

      {/* 笼位字段字典套卡片 */}
      <div className="shrink-0 rounded-twin-xl border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-4">
        {loading ? (
          <div className="flex min-h-[80px] items-center justify-center text-sm text-[var(--twin-mute)]">
            <Loader2 className="h-4 w-4 animate-spin mr-2" />加载中…
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-[var(--twin-ink)]">
                  {dict?.name || "笼位字段字典"}
                </span>
                <span className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold bg-emerald-50 text-emerald-600 border border-emerald-200">
                  已发布字段 {frozenCount ?? 0} 个
                </span>
              </div>
              <div className="text-xs text-[var(--twin-mute)] mt-1">
                字段字典套 <span className="font-mono text-[11px] text-[var(--twin-ink)]">cage</span>
                {dict?.species ? <span className="ml-2">物种：{dict.species}</span> : null}
              </div>
              <div className="text-[11px] text-[var(--twin-mute)] mt-1">
                字段配置、码表与模板均复用 NHP 管理页，避免维护两套简化表单。
              </div>
            </div>
            <button
              type="button"
              onClick={() => navigate("/console/admin/cage-shelves/forms/fields/cage")}
              className="shrink-0 inline-flex items-center gap-1.5 rounded-twin-md px-4 py-2 text-xs font-semibold bg-[var(--twin-primary)] text-white hover:brightness-95 transition"
            >
              <PencilRuler className="h-4 w-4" />编辑并发布
            </button>
          </div>
        )}
      </div>

      {/* 入口说明卡片 */}
      <div className="flex-1 min-h-0 flex flex-col rounded-twin-xl border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] overflow-hidden">
        <div className="shrink-0 flex items-center justify-between px-4 py-2 border-b border-[var(--twin-hairline)]">
          <span className="text-sm font-semibold text-[var(--twin-ink)]">管理入口</span>
          <span className="text-[11px] text-[var(--twin-mute)]">复用 NHP 内容管理页面</span>
        </div>
        <div className="flex-1 min-h-0 overflow-auto p-4">
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
            <button
              type="button"
              onClick={() => navigate("/console/admin/cage-shelves/forms/codelists")}
              className="text-left rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-3 hover:border-[var(--twin-hairline-strong)] transition"
            >
              <div className="flex items-center gap-1.5 text-sm font-semibold text-[var(--twin-ink)]">
                <Database className="h-4 w-4 text-[var(--twin-mute)]" />码表管理
              </div>
              <div className="text-[11px] text-[var(--twin-mute)] mt-1">管理字段取值的码表字典</div>
            </button>
            <button
              type="button"
              onClick={() => navigate("/console/admin/cage-shelves/forms/fields/cage")}
              className="text-left rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-3 hover:border-[var(--twin-hairline-strong)] transition"
            >
              <div className="flex items-center gap-1.5 text-sm font-semibold text-[var(--twin-ink)]">
                <SlidersHorizontal className="h-4 w-4 text-[var(--twin-mute)]" />字段配置
              </div>
              <div className="text-[11px] text-[var(--twin-mute)] mt-1">配置并发布笼位字段字典（cage）</div>
            </button>
            <button
              type="button"
              onClick={() => navigate("/console/admin/cage-shelves/forms/fields")}
              className="text-left rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-3 hover:border-[var(--twin-hairline-strong)] transition"
            >
              <div className="flex items-center gap-1.5 text-sm font-semibold text-[var(--twin-ink)]">
                <Layers className="h-4 w-4 text-[var(--twin-mute)]" />字段字典套
              </div>
              <div className="text-[11px] text-[var(--twin-mute)] mt-1">浏览全部字段字典套（cage / 猪 / 猴 …）</div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
