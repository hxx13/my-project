import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { fetchAdminApiDocs, type ApiDocItem } from "@/api/domains/docs.api";
import { authStorage } from "@/features/auth/authStorage";

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
  const [rows, setRows] = useState<ApiDocItem[]>([]);
  const [standardResponse, setStandardResponse] = useState<Record<string, unknown>>({});
  const [keyword, setKeyword] = useState("");
  const [method, setMethod] = useState("ALL");
  const [module, setModule] = useState("ALL");
  const [manualToken, setManualToken] = useState(() => localStorage.getItem("try_it_token") ?? "");
  const [tryStates, setTryStates] = useState<Record<string, TryState>>({});

  useEffect(() => {
    (async () => {
      try {
        const data = await fetchAdminApiDocs();
        setRows(data.data || []);
        setStandardResponse(data.standardResponse || {});
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "加载接口文档失败");
      }
    })();
  }, []);

  useEffect(() => {
    localStorage.setItem("try_it_token", manualToken);
  }, [manualToken]);

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
    try {
      await navigator.clipboard.writeText(text);
      toast.success(success);
    } catch {
      toast.error("复制失败，请手动复制");
    }
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
      <h2 className="text-lg font-semibold">接口中心（自动获取）</h2>
      <div className="rounded border bg-white p-4 text-sm">
        <div className="mb-2 font-medium">Try it 认证</div>
        <div className="grid gap-2 md:grid-cols-2">
          <div className="rounded bg-slate-50 p-2 text-xs text-slate-600">
            当前登录态 Token：{currentToken ? "已自动读取" : "未读取到"}
          </div>
          <input
            value={manualToken}
            onChange={(e) => setManualToken(e.target.value)}
            placeholder="回退Token（未登录态时使用）"
            className="rounded border px-3 py-2 text-sm"
          />
        </div>
      </div>
      <div className="flex gap-2">
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="搜索路径/说明/标签"
          className="flex-1 rounded border px-3 py-2 text-sm"
        />
        <select value={method} onChange={(e) => setMethod(e.target.value)} className="rounded border px-3 py-2 text-sm">
          <option value="ALL">全部方法</option>
          <option value="GET">GET</option>
          <option value="POST">POST</option>
          <option value="PATCH">PATCH</option>
          <option value="PUT">PUT</option>
          <option value="DELETE">DELETE</option>
        </select>
        <select value={module} onChange={(e) => setModule(e.target.value)} className="rounded border px-3 py-2 text-sm">
          <option value="ALL">全部模块</option>
          {modules.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>
      <div className="space-y-3">
        {rows.length === 0 && (
          <div className="rounded border bg-amber-50 p-4 text-sm text-amber-700">
            当前没有发现可展示接口。可能原因：未以超级管理员登录、后端路由未注册、或接口被过滤。
          </div>
        )}
        {Object.entries(grouped).map(([moduleName, items]) => (
          <details key={moduleName} open className="rounded border bg-slate-50/40 p-3">
            <summary className="cursor-pointer text-sm font-semibold text-slate-700">
              模块：{moduleName}（{items.length}）
            </summary>
            <div className="mt-3 space-y-3">
              {items.map((it, idx) => (
                <div key={`${it.method}-${it.path}-${idx}`} className="rounded border bg-white p-4">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold">{it.summary || "未命名接口"}</div>
                    <span className="rounded bg-slate-100 px-2 py-1 text-xs">{it.method}</span>
                  </div>
                  <div className="mt-1 text-sm text-slate-700">{it.path}</div>
                  <div className="mt-1 text-xs text-slate-500">{it.description || "暂无描述"}</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button className="rounded border px-2 py-1 text-xs" onClick={() => copyText(it.path, "已复制路径")}>复制路径</button>
                    <button className="rounded border px-2 py-1 text-xs" onClick={() => copyText(buildCurl(it), "已复制 curl")}>复制 curl</button>
                    {!!it.requestBodyExample && (
                      <button className="rounded border px-2 py-1 text-xs" onClick={() => copyText(it.requestBodyExample, "已复制请求示例")}>复制请求示例</button>
                    )}
                  </div>
                  {(it.tags || []).length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {it.tags.map((tag) => (
                        <span key={tag} className="rounded bg-blue-50 px-2 py-1 text-xs text-blue-700">{tag}</span>
                      ))}
                    </div>
                  )}
                  {it.parameters?.length > 0 && (
                    <div className="mt-3">
                      <div className="text-xs font-medium text-slate-600 mb-1">参数</div>
                      <div className="space-y-1">
                        {it.parameters.map((p) => (
                          <div key={`${p.in}-${p.name}`} className="text-xs text-slate-600">
                            {p.name} ({p.in}) {p.required ? "[必填]" : "[可选]"} - {p.description || "无描述"}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {(it.statusCodes || []).length > 0 && (
                    <div className="mt-3">
                      <div className="text-xs font-medium text-slate-600 mb-1">状态码</div>
                      <div className="flex flex-wrap gap-2">
                        {(it.statusCodes || []).map((s) => (
                          <span key={`${s.code}-${s.description}`} className="rounded bg-emerald-50 px-2 py-1 text-xs text-emerald-700">
                            {s.code} {s.description}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {it.requestBodyExample && (
                    <div className="mt-3">
                      <div className="text-xs font-medium text-slate-600 mb-1">请求体示例</div>
                      <pre className="overflow-auto rounded bg-slate-50 p-2 text-xs text-slate-700">{it.requestBodyExample}</pre>
                    </div>
                  )}
                  {(it.qualityHints || []).length > 0 && (
                    <div className="mt-3 rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-700">
                      文档质量提示：{(it.qualityHints || []).join("；")}
                    </div>
                  )}
                  <details className="mt-3 rounded border bg-slate-50 p-3 min-w-0">
                    <summary className="cursor-pointer text-sm font-medium text-slate-700">
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
                                <label className="text-xs text-slate-600">
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
                                  className="rounded border px-2 py-1 text-xs"
                                />
                              </div>
                            ))}
                          {!!it.requestBodyExample && (
                            <div>
                              <div className="mb-1 text-xs text-slate-600">Body(JSON)</div>
                              <textarea
                                value={state.body}
                                onChange={(e) => updateTryState(key, { body: e.target.value })}
                                className="h-36 w-full rounded border p-2 font-mono text-xs"
                              />
                            </div>
                          )}
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              onClick={() => runTryIt(it, key)}
                              disabled={state.loading}
                              className="rounded bg-blue-600 px-3 py-1 text-xs text-white disabled:bg-slate-400"
                            >
                              {state.loading ? "请求中..." : "发送请求"}
                            </button>
                            <button
                              onClick={() => clearTryResponse(key)}
                              className="rounded border px-3 py-1 text-xs"
                            >
                              关闭响应
                            </button>
                            <button
                              onClick={() => resetTryState(it, key)}
                              className="rounded border px-3 py-1 text-xs"
                            >
                              重置Try it
                            </button>
                            <span className="text-xs text-slate-500">
                              即将调用：{it.method} {it.path}
                            </span>
                          </div>
                          {state.error && (
                            <div className="rounded border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700">
                              请求失败：{state.error}
                            </div>
                          )}
                          {state.response && (
                            <div className="space-y-2 rounded border bg-white p-2 min-w-0">
                              <div className="text-xs text-slate-600">
                                状态码：{state.response.status} | 耗时：{state.response.durationMs}ms
                              </div>
                              <pre className="max-h-56 overflow-auto rounded bg-slate-50 p-2 text-xs whitespace-pre-wrap break-all">
                                {JSON.stringify(state.response.body, null, 2)}
                              </pre>
                              <div className="flex gap-2">
                                <button
                                  className="rounded border px-2 py-1 text-xs"
                                  onClick={() =>
                                    copyText(JSON.stringify(state.response?.body ?? "", null, 2), "已复制响应 JSON")
                                  }
                                >
                                  复制响应 JSON
                                </button>
                                <button
                                  className="rounded border px-2 py-1 text-xs"
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
        ))}
      </div>
    </div>
  );
}
