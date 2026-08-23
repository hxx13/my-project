import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { ArrowUp, ArrowDown, Loader2, ChevronLeft, Send } from "lucide-react";
import { fetchCageInfoFields, publishCageInfoFields, updateCageInfoField, type CageInfoField } from "../api/cageForm.api";

const DATA_TYPE_LABELS: Record<string, string> = {
  number: "数字",
  text: "文本",
  boolean: "布尔",
};

/**
 * CageFormEditorPage — 编辑器（字段排序 + 发布）
 *
 * - 上下箭头交换相邻字段的 sort 值
 * - 「发布」调用 publishCageInfoFields()（发布全部）
 */
export default function CageFormEditorPage() {
  const navigate = useNavigate();
  const [fields, setFields] = useState<CageInfoField[]>([]);
  const [loading, setLoading] = useState(true);
  const [moving, setMoving] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const loadFields = useCallback(async () => {
    setLoading(true);
    try {
      const list = await fetchCageInfoFields();
      setFields([...list].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0)));
    } catch (e) {
      toast.error((e as Error)?.message || "加载字段失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFields();
  }, [loadFields]);

  const move = async (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= fields.length) return;
    setMoving(true);
    try {
      // 本地重排
      const reordered = [...fields];
      const [item] = reordered.splice(index, 1);
      reordered.splice(target, 0, item);

      // 整表重编号：sort = 0,1,2,...（每个字段拿到唯一 sort，部分失败也不产生重复值）
      const updates = reordered
        .map((f, i) => ({ field: f, sort: i }))
        .filter(({ field, sort }) => (field.sort ?? -1) !== sort)
        .map(({ field, sort }) => updateCageInfoField(field.id, { sort }));

      await Promise.all(updates);
      await loadFields();
    } catch (e) {
      toast.error((e as Error)?.message || "调整顺序失败");
    } finally {
      setMoving(false);
    }
  };

  const handlePublish = async () => {
    setPublishing(true);
    try {
      await publishCageInfoFields();
      toast.success("发布成功");
      await loadFields();
    } catch (e) {
      toast.error((e as Error)?.message || "发布失败");
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* 顶栏 */}
      <div className="shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate("..")}
            className="inline-flex items-center gap-0.5 text-xs text-[var(--twin-mute)] hover:text-[var(--twin-ink)] transition"
          >
            <ChevronLeft className="h-3.5 w-3.5" />返回
          </button>
          <span className="text-[var(--twin-hairline)]">|</span>
          <h2 className="text-base font-bold text-[var(--twin-ink)]">编辑器</h2>
        </div>
        <button
          type="button"
          onClick={handlePublish}
          disabled={publishing || loading}
          className="inline-flex items-center gap-1.5 rounded-twin-md px-4 py-2 text-xs font-semibold bg-[var(--twin-primary)] text-white hover:brightness-95 transition disabled:opacity-50"
        >
          {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}发布
        </button>
      </div>

      {/* 字段排序列表 */}
      <div className="flex-1 min-h-0 flex flex-col rounded-twin-xl border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] overflow-hidden">
        <div className="shrink-0 flex items-center justify-between px-4 py-2 border-b border-[var(--twin-hairline)]">
          <span className="text-sm font-semibold text-[var(--twin-ink)]">字段排序</span>
          <span className="text-[11px] text-[var(--twin-mute)]">{fields.length} 个字段 · 点击「发布」将全部字段发布</span>
        </div>
        <div className="flex-1 min-h-0 overflow-auto">
          {loading ? (
            <div className="flex min-h-[120px] items-center justify-center text-sm text-[var(--twin-mute)]">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />加载中…
            </div>
          ) : fields.length === 0 ? (
            <div className="flex min-h-[120px] items-center justify-center text-sm text-[var(--twin-mute)]">
              暂无字段
            </div>
          ) : (
            <ul className="divide-y divide-[var(--twin-hairline)]">
              {fields.map((f, i) => (
                <li key={f.id} className="flex items-center gap-3 px-3 py-2 hover:bg-[var(--twin-canvas-soft)] transition-colors">
                  <div className="flex flex-col items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => move(i, -1)}
                      disabled={i === 0 || moving}
                      className="p-1 rounded text-[var(--twin-mute)] hover:text-blue-600 hover:bg-blue-50 disabled:opacity-30 disabled:cursor-not-allowed"
                      title="上移"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => move(i, 1)}
                      disabled={i === fields.length - 1 || moving}
                      className="p-1 rounded text-[var(--twin-mute)] hover:text-blue-600 hover:bg-blue-50 disabled:opacity-30 disabled:cursor-not-allowed"
                      title="下移"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="w-8 text-center text-[11px] font-mono text-[var(--twin-mute)]">{f.sort ?? 0}</div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-[var(--twin-ink)] truncate">{f.label || f.canonical}</div>
                    <div className="text-[10px] text-[var(--twin-mute)] font-mono truncate">{f.canonical}</div>
                  </div>
                  <span className="text-[11px] text-[var(--twin-mute)]">{DATA_TYPE_LABELS[f.dataType] ?? f.dataType}</span>
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${f.published ? "bg-emerald-50 text-emerald-600 border border-emerald-200" : "bg-slate-100 text-slate-500 border border-slate-200"}`}>
                    {f.published ? "已发布" : "未发布"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
