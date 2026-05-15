import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  executeDoorControl,
  fetchDoorControlChannels,
  fetchDahuaDeviceChannelRemarkCategories,
  queryDoorControlStatus,
  type DahuaDeviceChannelRow,
  type DahuaDeviceChannelRemarkCategory,
} from "@/api/twinApi";
import { AdminDataTableWrap } from "@/components/admin/AdminPageShell";

const MODES = [
  { key: "OPEN", label: "远程开门" },
  { key: "CLOSE", label: "远程关门" },
  { key: "STAY_OPEN", label: "常开" },
  { key: "STAY_CLOSE", label: "常闭" },
  { key: "NORMAL", label: "普通" },
] as const;

export default function AdminDoorControlPage() {
  const [keyword, setKeyword] = useState("");
  const [channelType, setChannelType] = useState("");
  const [remarkCategoryId, setRemarkCategoryId] = useState<number | "">("");
  const [page, setPage] = useState(1);
  const pageSize = 30;
  const [statusByCode, setStatusByCode] = useState<Record<string, { status?: number; workMode?: number; onlineStatus?: string }>>({});
  const [confirmModal, setConfirmModal] = useState<{
    open: boolean;
    mode: (typeof MODES)[number]["key"] | "";
    modeLabel: string;
    channelCode: string;
    channelName: string;
  }>({ open: false, mode: "", modeLabel: "", channelCode: "", channelName: "" });
  const [inlineNotice, setInlineNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["door-control-channels", page, pageSize, keyword, channelType, remarkCategoryId],
    queryFn: () =>
      fetchDoorControlChannels({
        page,
        pageSize,
        keyword: keyword.trim() || undefined,
        channelType: channelType || undefined,
        remarkCategoryId: remarkCategoryId === "" ? undefined : Number(remarkCategoryId),
      }),
  });

  const { data: remarkCategories = [] } = useQuery({
    queryKey: ["door-control-remark-categories"],
    queryFn: () => fetchDahuaDeviceChannelRemarkCategories(),
  });

  const actionMutation = useMutation({
    mutationFn: executeDoorControl,
    onSuccess: async (_res) => {
      setInlineNotice({ type: "success", text: "执行成功" });
      refetch();
    },
    onError: (e: any) => {
      setInlineNotice({ type: "error", text: `执行失败：${e?.message || "unknown"}` });
    },
    onSettled: async (_data, _err, vars) => {
      if (vars?.channelCodeList?.[0]) {
        await refreshSingleStatusWithRetry(vars.channelCodeList[0]);
      }
    },
  });

  const list: DahuaDeviceChannelRow[] = data?.list || [];
  const total = data?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const channelTypeOptions = useMemo(() => {
    const set = new Set<string>();
    list.forEach((x) => {
      const t = (x.channelType || "").trim();
      if (t) set.add(t);
    });
    return Array.from(set);
  }, [list]);

  const runAction = (mode: (typeof MODES)[number]["key"], row: DahuaDeviceChannelRow) => {
    const code = (row.channelCode || "").trim();
    if (!code) return;
    const modeLabel = MODES.find((m) => m.key === mode)?.label || mode;
    const channelName = (row.channelName || "").trim() || code;
    setConfirmModal({
      open: true,
      mode,
      modeLabel,
      channelCode: code,
      channelName,
    });
  };

  const confirmExecute = () => {
    if (!confirmModal.mode || !confirmModal.channelCode) {
      setConfirmModal({ open: false, mode: "", modeLabel: "", channelCode: "", channelName: "" });
      return;
    }
    actionMutation.mutate({ mode: confirmModal.mode, channelCodeList: [confirmModal.channelCode] });
    setConfirmModal({ open: false, mode: "", modeLabel: "", channelCode: "", channelName: "" });
  };

  const resolveActiveMode = (status?: number, workMode?: number) => {
    if (workMode === 2) return "STAY_OPEN";
    if (workMode === 1) return "STAY_CLOSE";
    if (workMode === 0) return "NORMAL";
    if (status === 1) return "OPEN";
    if (status === 2) return "CLOSE";
    return "";
  };

  const refreshBatchStatus = async (rows: DahuaDeviceChannelRow[]) => {
    const codes = rows.map((r) => (r.channelCode || "").trim()).filter(Boolean);
    if (codes.length === 0) return;
    try {
      const resp = await queryDoorControlStatus({ channelCodes: codes });
      const next: Record<string, { status?: number; workMode?: number; onlineStatus?: string }> = {};
      (resp.rows || []).forEach((x: any) => {
        const code = String(x.channelCode || "");
        if (!code) return;
        next[code] = {
          status: Number(x.status),
          workMode: Number(x.workMode),
          onlineStatus: String(x.onlineStatus || "").toUpperCase(),
        };
      });
      setStatusByCode(next);
    } catch {
      // keep old
    }
  };

  const refreshSingleStatus = async (channelCode: string) => {
    try {
      const resp = await queryDoorControlStatus({ channelCode });
      const first = (resp.rows || [])[0] as any;
      if (!first) return;
      setStatusByCode((prev) => ({
        ...prev,
        [channelCode]: {
          status: Number(first.status),
          workMode: Number(first.workMode),
          onlineStatus: String(first.onlineStatus || "").toUpperCase(),
        },
      }));
    } catch {
      // ignore
    }
  };

  const refreshSingleStatusWithRetry = async (channelCode: string) => {
    const delays = [0, 350, 900, 1800];
    for (let i = 0; i < delays.length; i += 1) {
      const d = delays[i];
      if (d > 0) {
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, d));
      }
      // eslint-disable-next-line no-await-in-loop
      await refreshSingleStatus(channelCode);
    }
  };

  useEffect(() => {
    void refreshBatchStatus(list);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.list]);

  return (
    <div className="p-6 bg-slate-50 min-h-full">
      <div className="mb-4">
        <h1 className="text-2xl font-black text-slate-800">门禁控制</h1>
        <p className="text-sm text-slate-500">仅超级管理员可见，按通道名称控制门禁模式</p>
      </div>
      {inlineNotice && (
        <div
          className={`mb-3 rounded-lg border px-3 py-2 text-sm ${
            inlineNotice.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-rose-200 bg-rose-50 text-rose-700"
          }`}
        >
          {inlineNotice.text}
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-end gap-2">
        <input
          className="border border-slate-200 rounded-xl px-3 py-2 text-sm min-w-[260px]"
          placeholder="检索通道名称/编码"
          value={keyword}
          onChange={(e) => {
            setKeyword(e.target.value);
            setPage(1);
          }}
        />
        <select
          className="border border-slate-200 rounded-xl px-3 py-2 text-sm"
          value={channelType}
          onChange={(e) => {
            setChannelType(e.target.value);
            setPage(1);
          }}
        >
          <option value="">全部分类</option>
          {channelTypeOptions.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <select
          className="border border-slate-200 rounded-xl px-3 py-2 text-sm"
          value={remarkCategoryId}
          onChange={(e) => {
            const v = e.target.value;
            setRemarkCategoryId(v === "" ? "" : Number(v));
            setPage(1);
          }}
        >
          <option value="">全部备注分类</option>
          {(remarkCategories as DahuaDeviceChannelRemarkCategory[]).map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <button
          type="button"
          className="border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white hover:bg-slate-50"
          onClick={() => void refreshBatchStatus(list)}
        >
          刷新状态
        </button>
      </div>

      <AdminDataTableWrap scrollable>
        {isLoading ? (
          <div className="p-8 text-center text-slate-500">加载中...</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-slate-700">
              <tr>
                <th className="text-left p-3">通道名称</th>
                <th className="text-left p-3">在线状态</th>
                <th className="text-left p-3">编码</th>
                <th className="text-left p-3">分类</th>
                <th className="text-right p-3">控制</th>
              </tr>
            </thead>
            <tbody>
              {list.map((row) => (
                <tr key={`${row.id}-${row.channelCode}`} className="border-t border-slate-100">
                  <td className="p-3 font-semibold text-slate-800">{row.channelName || "-"}</td>
                  <td className="p-3">
                    {statusByCode[(row.channelCode || "").trim()]?.onlineStatus === "OFF" ? (
                      <span className="inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700">
                        设备离线
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                        在线
                      </span>
                    )}
                  </td>
                  <td className="p-3 font-mono text-slate-600">{row.channelCode || "-"}</td>
                  <td className="p-3 text-slate-500">{row.channelType || "-"}</td>
                  <td className="p-3">
                    <div className="flex justify-end gap-2">
                      {MODES.map((m) => {
                        const state = statusByCode[(row.channelCode || "").trim()];
                        const active = resolveActiveMode(state?.status, state?.workMode) === m.key;
                        return (
                        <button
                          key={m.key}
                          type="button"
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border ${
                            active
                              ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                              : "border-slate-200 bg-white hover:bg-slate-50"
                          }`}
                          disabled={actionMutation.isPending}
                          onClick={() => runAction(m.key, row)}
                        >
                          {m.label}
                        </button>
                        );
                      })}
                    </div>
                  </td>
                </tr>
              ))}
              {list.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-slate-500">暂无通道</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </AdminDataTableWrap>

      <div className="mt-4 flex justify-end items-center gap-3 text-sm">
        <button className="px-2 py-1 border rounded disabled:opacity-40" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>上一页</button>
        <span>{page} / {totalPages}</span>
        <button className="px-2 py-1 border rounded disabled:opacity-40" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>下一页</button>
      </div>

      {confirmModal.open && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
            <h3 className="text-base font-bold text-slate-800">确认执行操作</h3>
            <p className="mt-2 text-sm text-slate-600">
              将执行「{confirmModal.modeLabel}」
            </p>
            <p className="mt-1 text-sm text-slate-500">通道：{confirmModal.channelName}</p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white hover:bg-slate-50"
                onClick={() => setConfirmModal({ open: false, mode: "", modeLabel: "", channelCode: "", channelName: "" })}
              >
                取消
              </button>
              <button
                type="button"
                className="px-3 py-2 rounded-lg border border-emerald-600 bg-emerald-600 text-white text-sm hover:bg-emerald-700"
                onClick={confirmExecute}
              >
                确认执行
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
