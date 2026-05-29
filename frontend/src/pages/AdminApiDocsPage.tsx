import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { useQuery } from "@tanstack/react-query";
import { fetchAdminApiDocs, type ApiDocItem } from "@/api/domains/docs.api";
import { authStorage } from "@/features/auth/authStorage";
import { copyTextToClipboard } from "@/lib/copyToClipboard";
import DataSkeleton from "@/components/ui/DataSkeleton";
import EmptyState from "@/components/ui/EmptyState";

type TryState = {
  values: Record<string, string>;
  body: string;
  loading: boolean;
  response?: {
    status: number;
    durationMs: number;
    headers: Record<string, string>;
    body: unknown;
    rawText: string;
  };
  error?: string;
};

export default function AdminApiDocsPage() {
  const [keyword, setKeyword] = useState("");
  const [method, setMethod] = useState("ALL");
  const [module, setModule] = useState("ALL");
  const [manualToken, setManualToken] = useState(() => localStorage.getItem("try_it_token") ?? "");
  const [tryStates, setTryStates] = useState<Record<string, TryState>>({});

  const { data: apiDocs, isLoading } = useQuery({
    queryKey: ["adminApiDocs"] as const,
    queryFn: fetchAdminApiDocs,
  });

  const rows = apiDocs?.data || [];

  const syncToken = (v: string) => {
    setManualToken(v);
    localStorage.setItem("try_it_token", v);
  };

  const filtered = useMemo(() => {
    return rows.filter((it) => {
      const hitMethod = method === "ALL" || it.method === method;
      const hitModule = module === "ALL" || (it.module || "other") === module;
      const key = keyword.trim().toLowerCase();
      const hitKey =
        !key ||
        it.path.toLowerCase().includes(key) ||
        it.summary.toLowerCase().includes(key) ||
        (it.tags || []).join(" ").toLowerCase().includes(key);
      return hitMethod && hitModule && hitKey;
    });
  }, [rows, keyword, method, module]);

  const modules = useMemo(() => {
    return Array.from(new Set(rows.map((it) => it.module || "other"))).sort();
  }, [rows]);

  const grouped = useMemo(() => {
    return filtered.reduce<Record<string, ApiDocItem[]>>((acc, item) => {
      const key = item.module || "other";
      if (!acc[key]) acc[key] = [];
      acc[key].push(item);
      return acc;
    }, {});
  }, [filtered]);

  const copyText = async (text: string, success: string) => {
    const ok = await copyTextToClipboard(text);
    if (ok) toast.success(success);
    else toast.error("复制失败，请手动复制");
  };

  const buildCurl = (it: ApiDocItem) => {
    const body = it.requestBodyExample ? ` -d '${it.requestBodyExample.replace(/\n/g, "")}'` : "";
    return `curl -X ${it.method} "http://<host>${it.path}" -H "Authorization: Bearer <token>" -H "Content-Type: application/json"${body}`;
  };

  const tryKey = (it: ApiDocItem, idx: number) => `${it.method}-${it.path}-${idx}`;
  const isWriteMethod = (m: string) => ["POST", "PATCH", "PUT", "DELETE"].includes(m.toUpperCase());
  const currentToken = authStorage.getToken();
  const effectiveToken = currentToken || manualToken;

  const ensureTryState = (it: ApiDocItem, key: string): TryState => {
    const existing = tryStates[key];
    if (existing) return existing;
    const values: Record<string, string> = {};
    (it.parameters || [])
      .filter((p) => p.in !== "body")
      .forEach((p) => {
        values[p.name] = p.defaultValue ?? "";
      });
    return {
      values,
      body: it.requestBodyExample || "",
      loading: false,
    };
  };

  const updateTryState = (key: string, patch: Partial<TryState>) => {
    setTryStates((prev) => ({
      ...prev,
      [key]: {
        ...(prev[key] || { values: {}, body: "", loading: false }),
        ...patch,
      },
    }));
  };

  const clearTryResponse = (key: string) => {
    setTryStates((prev) => {
      const current = prev[key];
      if (!current) return prev;
      return {
        ...prev,
        [key]: {
          ...current,
          response: undefined,
          error: undefined,
        },
      };
    });
  };

  const resetTryState = (it: ApiDocItem, key: string) => {
    const values: Record<string, string> = {};
    (it.parameters || [])
      .filter((p) => p.in !== "body")
      .forEach((p) => {
        values[p.name] = p.defaultValue ?? "";
      });
    setTryStates((prev) => ({
      ...prev,
      [key]: {
        values,
        body: it.requestBodyExample || "",
        loading: false,
        response: undefined,
        error: undefined,
      },
    }));
  };

  const runTryIt = async (it: ApiDocItem, key: string) => {
    const state = ensureTryState(it, key);
    if (isWriteMethod(it.method)) {
      const ok = window.confirm(`将调用写接口 ${it.method} ${it.path}，是否继续？`);
      if (!ok) return;
    }
    let resolvedPath = it.path;
    const query = new URLSearchParams();
    const headers: Record<string, string> = {
      Accept: "application/json",
    };

    (it.parameters || []).forEach((p) => {
      const value = state.values[p.name] ?? "";
      if (!value) return;
      if (p.in === "path") {
        resolvedPath = resolvedPath.replace(`{${p.name}}`, encodeURIComponent(value));
      } else if (p.in === "query") {
        query.set(p.name, value);
      } else if (p.in === "header") {
        headers[p.name] = value;
      }
    });
    if (effectiveToken && !headers.Authorization) {
      headers.Authorization = `Bearer ${effectiveToken}`;
    }

    let body: string | undefined;
    if (it.requestBodyExample) {
      if (state.body?.trim()) {
        try {
          const parsed = JSON.parse(state.body);
          body = JSON.stringify(parsed);
          headers["Content-Type"] = "application/json";
        } catch {
          toast.error("请求体不是合法 JSON");
          return;
        }
      }
    }

    updateTryState(key, { loading: true, error: undefined });
    const url = query.toString() ? `${resolvedPath}?${query.toString()}` : resolvedPath;
    const start = performance.now();
    try {
      const resp = await fetch(url, {
        method: it.method,
        headers,
        body: ["GET", "DELETE"].includes(it.method) ? undefined : body,
      });
      const rawText = await resp.text();
      let parsedBody: unknown = rawText;
      try {
        parsedBody = rawText ? JSON.parse(rawText) : null;
      } catch {
        parsedBody = rawText;
      }
      const headerObj: Record<string, string> = {};
      resp.headers.forEach((v, k) => {
        headerObj[k] = v;
      });
      updateTryState(key, {
        loading: false,
        response: {
          status: resp.status,
          durationMs: Math.round(performance.now() - start),
          headers: headerObj,
          body: parsedBody,
          rawText,
        },
      });
    } catch (error) {
      updateTryState(key, {
        loading: false,
        error: error instanceof Error ? error.message : "请求失败",
      });
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-[var(--twin-ink)]">接口中心（自动获取）</h2>
      <div className="rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-4 text-sm shadow-twin-level-1">
        <div className="mb-2 font-medium text-[var(--twin-ink)]">Try it 认证</div>
        <div className="grid gap-2 md:grid-cols-2">
          <div className="rounded-twin-sm bg-[var(--twin-canvas-soft)] p-2 text-xs text-[var(--twin-body)]">
            当前登录态 Token：{currentToken ? "已自动读取" : "未读取到"}
          </div>
          <input
            value={manualToken}
            onChange={(e) => syncToken(e.target.value)}
            placeholder="回退Token（未登录态时使用）"
            className="rounded-twin-sm border border-[var(--twin-hairline)] px-3 py-2 text-sm"
          />
        </div>
      </div>
      <div className="flex gap-2">
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="搜索路径/说明/标签"
          className="flex-1 rounded-twin-sm border border-[var(--twin-hairline)] px-3 py-2 text-sm"
        />
        <select value={method} onChange={(e) => setMethod(e.target.value)} className="rounded-twin-sm border border-[var(--twin-hairline)] px-3 py-2 text-sm">
          <option value="ALL">全部方法</option>
          <option value="GET">GET</option>
          <option value="POST">POST</option>
          <option value="PATCH">PATCH</option>
          <option value="PUT">PUT</option>
          <option value="DELETE">DELETE</option>
        </select>
        <select value={module} onChange={(e) => setModule(e.target.value)} className="rounded-twin-sm border border-[var(--twin-hairline)] px-3 py-2 text-sm">
          <option value="ALL">全部模块</option>
          {modules.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>
      <div className="space-y-3">
        {isLoading ? (
          <DataSkeleton variant="card" rows={6} />
        ) : rows.length === 0 ? (
          <EmptyState title="当前没有发现可展示接口" description="可能原因：未以超级管理员登录、后端路由未注册、或接口被过滤。" />
        ) : (
          Object.entries(grouped).map(([moduleName, items]) => (
            <details key={moduleName} open className="rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] p-3">
              <summary className="cursor-pointer text-sm font-semibold text-[var(--twin-body)]">
                模块：{moduleName}（{items.length}）
              </summary>
              <div className="mt-3 space-y-3">
                {items.map((it, idx) => (
                  <div key={`${it.method}-${it.path}-${idx}`} className="rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-4 shadow-twin-level-1">
                    <div className="flex items-center justify-between">
                      <div className="font-semibold text-[var(--twin-ink)]">{it.summary || "未命名接口"}</div>
                      <span className="rounded-twin-sm bg-[var(--twin-canvas-soft)] px-2 py-1 text-xs">{it.method}</span>
                    </div>
                    <div className="mt-1 text-sm text-[var(--twin-body)]">{it.path}</div>
                    <div className="mt-1 text-xs text-[var(--twin-mute)]">{it.description || "暂无描述"}</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button className="rounded-twin-sm border border-[var(--twin-hairline)] px-2 py-1 text-xs" onClick={() => copyText(it.path, "已复制路径")}>复制路径</button>
                      <button className="rounded-twin-sm border border-[var(--twin-hairline)] px-2 py-1 text-xs" onClick={() => copyText(buildCurl(it), "已复制 curl")}>复制 curl</button>
                      {!!it.requestBodyExample && (
                        <button className="rounded-twin-sm border border-[var(--twin-hairline)] px-2 py-1 text-xs" onClick={() => copyText(it.requestBodyExample, "已复制请求示例")}>复制请求示例</button>
                      )}
                    </div>
                    {(it.tags || []).length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {it.tags.map((tag) => (
                          <span key={tag} className="rounded-twin-sm bg-[var(--twin-canvas-soft-2)] px-2 py-1 text-xs text-[var(--twin-body)]">{tag}</span>
                        ))}
                      </div>
                    )}
                    {it.parameters?.length > 0 && (
                      <div className="mt-3">
                        <div className="text-xs font-medium text-[var(--twin-body)] mb-1">参数</div>
                        <div className="space-y-1">
                          {it.parameters.map((p) => (
                            <div key={`${p.in}-${p.name}`} className="text-xs text-[var(--twin-body)]">
                              {p.name} ({p.in}) {p.required ? "[必填]" : "[可选]"} - {p.description || "无描述"}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {(it.statusCodes || []).length > 0 && (
                      <div className="mt-3">
                        <div className="text-xs font-medium text-[var(--twin-body)] mb-1">状态码</div>
                        <div className="flex flex-wrap gap-2">
                          {(it.statusCodes || []).map((s) => (
                            <span key={`${s.code}-${s.description}`} className="rounded-twin-sm bg-emerald-50 px-2 py-1 text-xs text-emerald-700">
                              {s.code} {s.description}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {it.requestBodyExample && (
                      <div className="mt-3">
                        <div className="text-xs font-medium text-[var(--twin-body)] mb-1">请求体示例</div>
                        <pre className="overflow-auto rounded-twin-sm bg-[var(--twin-canvas-soft)] p-2 text-xs text-[var(--twin-body)]">{it.requestBodyExample}</pre>
                      </div>
                    )}
                    {(it.qualityHints || []).length > 0 && (
                      <div className="mt-3 rounded-twin-sm border border-amber-200/90 bg-amber-50 p-2 text-xs text-amber-700">
                        文档质量提示：{(it.qualityHints || []).join("；")}
                      </div>
                    )}
                    <details className="mt-3 rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] p-3 min-w-0">
                      <summary className="cursor-pointer text-sm font-medium text-[var(--twin-body)]">
                        Try it 在线调试
                      </summary>
                      {(() => {
                        const key = tryKey(it, idx);
                        const state = ensureTryState(it, key);
                        return (
                          <div className="mt-3 space-y-3">
                            {(it.parameters || [])
                              .filter((p) => p.in !== "body")
                              .map((p) => (
                                <div key={`${key}-${p.in}-${p.name}`} className="grid gap-1">
                                  <label className="text-xs text-[var(--twin-body)]">
                                    {p.name} ({p.in}) {p.required ? "[必填]" : "[可选]"}
                                  </label>
                                  <input
                                    value={state.values[p.name] ?? ""}
                                    onChange={(e) =>
                                      updateTryState(key, {
                                        values: { ...state.values, [p.name]: e.target.value },
                                      })
                                    }
                                    placeholder={`${p.type || "string"} 参数`}
                                    className="rounded-twin-sm border border-[var(--twin-hairline)] px-2 py-1 text-xs"
                                  />
                                </div>
                              ))}
                            {!!it.requestBodyExample && (
                              <div>
                                <div className="mb-1 text-xs text-[var(--twin-body)]">Body(JSON)</div>
                                <textarea
                                  value={state.body}
                                  onChange={(e) => updateTryState(key, { body: e.target.value })}
                                  className="h-36 w-full rounded-twin-sm border border-[var(--twin-hairline)] p-2 font-mono text-xs"
                                />
                              </div>
                            )}
                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                onClick={() => runTryIt(it, key)}
                                disabled={state.loading}
                                className="rounded-twin-sm bg-[var(--twin-primary)] px-3 py-1 text-xs font-medium text-[var(--twin-on-primary)] disabled:opacity-50"
                              >
                                {state.loading ? "请求中..." : "发送请求"}
                              </button>
                              <button
                                onClick={() => clearTryResponse(key)}
                                className="rounded-twin-sm border border-[var(--twin-hairline)] px-3 py-1 text-xs"
                              >
                                关闭响应
                              </button>
                              <button
                                onClick={() => resetTryState(it, key)}
                                className="rounded-twin-sm border border-[var(--twin-hairline)] px-3 py-1 text-xs"
                              >
                                重置Try it
                              </button>
                              <span className="text-xs text-[var(--twin-mute)]">
                                即将调用：{it.method} {it.path}
                              </span>
                            </div>
                            {state.error && (
                              <div className="rounded-twin-sm border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700">
                                请求失败：{state.error}
                              </div>
                            )}
                            {state.response && (
                              <div className="space-y-2 rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-2 min-w-0">
                                <div className="text-xs text-[var(--twin-body)]">
                                  状态码：{state.response.status} | 耗时：{state.response.durationMs}ms
                                </div>
                                <pre className="max-h-56 overflow-auto rounded-twin-sm bg-[var(--twin-canvas-soft)] p-2 text-xs whitespace-pre-wrap break-all">
                                  {JSON.stringify(state.response.body, null, 2)}
                                </pre>
                                <div className="flex gap-2">
                                  <button
                                    className="rounded-twin-sm border border-[var(--twin-hairline)] px-2 py-1 text-xs"
                                    onClick={() =>
                                      copyText(JSON.stringify(state.response?.body ?? "", null, 2), "已复制响应 JSON")
                                    }
                                  >
                                    复制响应 JSON
                                  </button>
                                  <button
                                    className="rounded-twin-sm border border-[var(--twin-hairline)] px-2 py-1 text-xs"
                                    onClick={() => copyText(buildCurl(it), "已复制可执行 curl 模板")}
                                  >
                                    复制可执行 curl
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </details>
                  </div>
                ))}
              </div>
            </details>
          ))
        )}
      </div>
    </div>
  );
}
