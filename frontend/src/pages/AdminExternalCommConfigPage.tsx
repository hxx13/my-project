import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Radio } from "lucide-react";
import {
  fetchExternalCommConfigOverview,
  type ExternalCommConfigItem,
  type ExternalCommConfigOverview,
} from "@/api/domains/notification.api";
import { AdminButton } from "@/components/admin/AdminButton";
import { AdminFormCard, AdminPageShell } from "@/components/admin/AdminPageShell";
import { AdminToolbarSearchField } from "@/components/admin/AdminToolbarSearchField";
import { adminHintClass } from "@/features/admin/adminFormUi";

const SECTION_LABELS: Record<string, string> = {
  hardcoded: "代码硬编码",
  applicationProperties: "应用配置文件",
  environmentVariables: "环境变量",
};

export default function AdminExternalCommConfigPage() {
  const [overview, setOverview] = useState<ExternalCommConfigOverview>({
    hardcoded: [],
    applicationProperties: [],
    environmentVariables: [],
  });
  const [keyword, setKeyword] = useState("");
  const [showSensitive, setShowSensitive] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const data = await fetchExternalCommConfigOverview();
        setOverview(data);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "加载外部通信配置失败");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filterRows = (rows: ExternalCommConfigItem[]) => {
    const key = keyword.trim().toLowerCase();
    if (!key) return rows;
    return rows.filter((row) => {
      return (
        row.key.toLowerCase().includes(key) ||
        row.source.toLowerCase().includes(key) ||
        (row.actualValue || row.value || "").toLowerCase().includes(key)
      );
    });
  };

  const sections = useMemo(
    () => [
      { id: "hardcoded", title: SECTION_LABELS.hardcoded, rows: filterRows(overview.hardcoded) },
      { id: "props", title: SECTION_LABELS.applicationProperties, rows: filterRows(overview.applicationProperties) },
      { id: "env", title: SECTION_LABELS.environmentVariables, rows: filterRows(overview.environmentVariables) },
    ],
    [overview, keyword],
  );

  return (
    <AdminPageShell
      title={
        <span className="inline-flex items-center gap-2">
          <Radio className="h-6 w-6 shrink-0 text-[#0070f3]" aria-hidden />
          外部通信配置
        </span>
      }
      description="只读巡检页：汇总硬编码、配置文件与环境变量中的通信相关项，便于核对密钥与端点是否配置正确。"
    >
      <div className="rounded-lg border border-amber-200/90 bg-amber-50/90 px-4 py-3 text-sm text-amber-900">
        本页不支持在线修改。敏感字段默认脱敏，点击「查看」后仅在当前浏览器会话中显示明文。
      </div>

      <AdminFormCard title="检索">
        <AdminToolbarSearchField
          placeholder="搜索配置键、来源或值…"
          value={keyword}
          onChange={setKeyword}
          onSubmit={() => undefined}
        />
      </AdminFormCard>

      {loading ? (
        <div className="flex min-h-[160px] items-center justify-center text-sm text-neutral-500">加载中…</div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          {sections.map((sec) => (
            <AdminFormCard key={sec.id} title={sec.title} description={`共 ${sec.rows.length} 项`}>
              {sec.rows.length === 0 ? (
                <p className={adminHintClass}>暂无数据</p>
              ) : (
                <div className="max-h-[min(60vh,520px)] space-y-2 overflow-y-auto">
                  {sec.rows.map((row) => {
                    const canView = row.masked && row.exists;
                    const visible = canView && showSensitive[row.key];
                    const displayValue = visible ? row.actualValue || "" : row.value;
                    return (
                      <div
                        key={`${sec.id}-${row.key}`}
                        className="rounded-lg border border-neutral-200 bg-neutral-50/80 p-2.5 text-xs"
                      >
                        <p className="break-all font-medium text-neutral-800">{row.key}</p>
                        <p className="mt-1 break-all text-neutral-600">值：{row.exists ? displayValue || "（空）" : "未设置"}</p>
                        <p className="mt-1 break-all text-neutral-500">来源：{row.source}</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {row.masked ? (
                            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">敏感</span>
                          ) : null}
                          {!row.modifiable ? (
                            <span className="rounded bg-neutral-200 px-1.5 py-0.5 text-[10px] text-neutral-600">只读</span>
                          ) : null}
                          {canView ? (
                            <AdminButton
                              type="button"
                              tone="secondary"
                              size="sm"
                              className="h-6 px-2 text-[10px]"
                              onClick={() => setShowSensitive((prev) => ({ ...prev, [row.key]: !prev[row.key] }))}
                            >
                              {visible ? "隐藏" : "查看"}
                            </AdminButton>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </AdminFormCard>
          ))}
        </div>
      )}
    </AdminPageShell>
  );
}
