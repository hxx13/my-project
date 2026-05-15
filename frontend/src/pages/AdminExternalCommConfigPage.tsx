import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  fetchExternalCommConfigOverview,
  type ExternalCommConfigItem,
  type ExternalCommConfigOverview,
} from "@/api/domains/notification.api";

export default function AdminExternalCommConfigPage() {
  const [overview, setOverview] = useState<ExternalCommConfigOverview>({
    hardcoded: [],
    applicationProperties: [],
    environmentVariables: [],
  });
  const [keyword, setKeyword] = useState("");
  const [showSensitive, setShowSensitive] = useState<Record<string, boolean>>({});

  useEffect(() => {
    (async () => {
      try {
        const data = await fetchExternalCommConfigOverview();
        setOverview(data);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "加载外部通信配置失败");
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
      { title: "代码硬编码", rows: filterRows(overview.hardcoded) },
      { title: "application.properties", rows: filterRows(overview.applicationProperties) },
      { title: "环境变量", rows: filterRows(overview.environmentVariables) },
    ],
    [overview, keyword]
  );

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">外部通信配置总览（只读）</h2>
      <div className="rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
        本页面仅用于巡检与核对，不支持在线修改。敏感字段默认脱敏，点击“查看”后仅在当前页面会话展示。
      </div>
      <input
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
        placeholder="搜索 key / 来源 / 值"
        className="w-full rounded border px-3 py-2 text-sm"
      />
      <div className="grid gap-3 md:grid-cols-3">
        {sections.map((sec) => (
          <section key={sec.title} className="min-w-0 rounded border bg-white p-3">
            <h3 className="mb-2 text-sm font-medium">{sec.title}</h3>
            {sec.rows.length === 0 ? (
              <div className="text-xs text-slate-500">暂无数据</div>
            ) : (
              <div className="space-y-2">
                {sec.rows.map((row) => {
                  const canView = row.masked && row.exists;
                  const visible = canView && showSensitive[row.key];
                  const displayValue = visible ? (row.actualValue || "") : row.value;
                  return (
                    <div key={`${sec.title}-${row.key}`} className="rounded border bg-slate-50 p-2 text-xs">
                      <div className="break-all font-medium text-slate-700">{row.key}</div>
                      <div className="mt-1 flex items-start gap-2">
                        <div className="min-w-0 flex-1 break-all text-slate-600">
                          值：{row.exists ? displayValue : "(未设置)"}
                        </div>
                        {canView ? (
                          <button
                            type="button"
                            className="shrink-0 rounded border px-2 py-0.5 text-[11px]"
                            onClick={() => setShowSensitive((prev) => ({ ...prev, [row.key]: !prev[row.key] }))}
                          >
                            {visible ? "隐藏" : "查看"}
                          </button>
                        ) : null}
                      </div>
                      <div className="mt-1 break-all text-slate-500">来源：{row.source}</div>
                      {row.masked ? <div className="mt-1 text-amber-700">敏感字段</div> : null}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}

