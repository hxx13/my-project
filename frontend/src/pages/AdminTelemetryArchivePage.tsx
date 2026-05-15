import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { adminHttp } from "@/api/core/adminHttp";
import { AdminDataTableWrap } from "@/components/admin/AdminPageShell";
import { Archive } from "lucide-react";

type ArchiveRow = {
  id: number;
  sampleAt: string;
  variableName: string;
  numericValue: number | null;
  rawValue: string | null;
  metricKindCode: string | null;
  roomCanonical: string | null;
  bundleCode: string | null;
};

type ArchivePage = {
  total: number;
  page: number;
  size: number;
  items: ArchiveRow[];
};

type ApiResult<T> = { success?: boolean; message?: string; data?: T };

export default function AdminTelemetryArchivePage() {
  const [variableName, setVariableName] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);

  const queryKey = useMemo(
    () => ["admin", "telemetry-archive", page, variableName, from, to] as const,
    [page, variableName, from, to]
  );

  const listQ = useQuery({
    queryKey,
    queryFn: async () => {
      const res = await adminHttp.get<ApiResult<ArchivePage>>("telemetry/archive/query", {
        params: {
          page,
          size: 50,
          ...(variableName.trim() ? { variableName: variableName.trim() } : {}),
          ...(from.trim() ? { from: from.trim() } : {}),
          ...(to.trim() ? { to: to.trim() } : {}),
        },
      });
      const body = res.data;
      if (!body?.success || body.data == null) {
        throw new Error(body?.message || "加载失败");
      }
      return body.data;
    },
  });

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex flex-wrap items-center gap-2">
        <Archive className="h-6 w-6 text-sky-600" />
        <h1 className="text-xl font-semibold text-slate-900">温湿度数据归档</h1>
      </div>
      <p className="max-w-3xl text-sm text-slate-600">
        查询 WinCC 刷新写入的 <code className="rounded bg-slate-100 px-1">telemetry_value_archive</code>{" "}
        表；默认保留约 30 天（见 <code className="rounded bg-slate-100 px-1">app.telemetry.archive.retention-days</code>
        ）。
      </p>

      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <label className="text-xs text-slate-600">
          变量名包含
          <input
            value={variableName}
            onChange={(e) => {
              setVariableName(e.target.value);
              setPage(1);
            }}
            className="mt-1 block w-56 rounded border border-slate-200 px-2 py-1.5 text-sm"
            placeholder="可选"
          />
        </label>
        <label className="text-xs text-slate-600">
          起始时间 (ISO)
          <input
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(1);
            }}
            className="mt-1 block w-56 rounded border border-slate-200 px-2 py-1.5 font-mono text-xs"
            placeholder="可选"
          />
        </label>
        <label className="text-xs text-slate-600">
          结束时间 (ISO)
          <input
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(1);
            }}
            className="mt-1 block w-56 rounded border border-slate-200 px-2 py-1.5 font-mono text-xs"
            placeholder="可选"
          />
        </label>
        <button
          type="button"
          onClick={() => void listQ.refetch()}
          className="rounded-md bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-900"
        >
          刷新
        </button>
      </div>

      <AdminDataTableWrap scrollable>
        <table className="min-w-full border-collapse text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="border-b border-slate-200 px-3 py-2">时间</th>
              <th className="border-b border-slate-200 px-3 py-2">变量名</th>
              <th className="border-b border-slate-200 px-3 py-2">数值</th>
              <th className="border-b border-slate-200 px-3 py-2">原始值</th>
              <th className="border-b border-slate-200 px-3 py-2">房间</th>
              <th className="border-b border-slate-200 px-3 py-2">分区</th>
            </tr>
          </thead>
          <tbody>
            {listQ.isPending ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                  加载中…
                </td>
              </tr>
            ) : listQ.isError ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-rose-600">
                  {(listQ.error as Error)?.message || "加载失败"}
                </td>
              </tr>
            ) : (
              (listQ.data?.items ?? []).map((r) => (
                <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50/80">
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-slate-700">{r.sampleAt}</td>
                  <td className="max-w-xs truncate px-3 py-2 font-mono text-xs text-slate-800">{r.variableName}</td>
                  <td className="px-3 py-2 font-mono text-xs">{r.numericValue ?? "—"}</td>
                  <td className="max-w-xs truncate px-3 py-2 font-mono text-xs text-slate-600">{r.rawValue ?? "—"}</td>
                  <td className="px-3 py-2 text-xs text-slate-700">{r.roomCanonical ?? "—"}</td>
                  <td className="px-3 py-2 text-xs text-slate-700">{r.bundleCode ?? "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </AdminDataTableWrap>

      <div className="flex items-center justify-between text-sm text-slate-600">
        <span>
          共 {listQ.data?.total ?? 0} 条 · 第 {listQ.data?.page ?? page} /{" "}
          {Math.max(1, Math.ceil((listQ.data?.total ?? 0) / (listQ.data?.size ?? 50)))} 页
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="rounded border border-slate-200 px-3 py-1 disabled:opacity-40"
          >
            上一页
          </button>
          <button
            type="button"
            disabled={listQ.data != null && page * listQ.data.size >= listQ.data.total}
            onClick={() => setPage((p) => p + 1)}
            className="rounded border border-slate-200 px-3 py-1 disabled:opacity-40"
          >
            下一页
          </button>
        </div>
      </div>
    </div>
  );
}
