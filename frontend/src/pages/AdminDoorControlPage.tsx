import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";
import {
  executeDoorControl,
  fetchDoorControlChannels,
  fetchDahuaDeviceChannelRemarkCategories,
  queryDoorControlStatus,
  type DahuaDeviceChannelRow,
  type DahuaDeviceChannelRemarkCategory,
} from "@/api/twinApi";
import { AdminFormCard, AdminPageShell } from "@/components/admin/AdminPageShell";
import { AdminButton } from "@/components/admin/AdminButton";
import { adminChromeTitle } from "@/features/admin/adminShellNavigation";
import { Portal } from "@/components/Portal";

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

  const location = useLocation();
  const pageLabel = useMemo(() => adminChromeTitle(location.pathname), [location.pathname]);

  return (
    <AdminPageShell>
      <div className="flex flex-col max-h-[calc(100dvh-var(--admin-chrome-offset))] min-h-[200px]">
        <AdminFormCard className="shrink-0 mb-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--app-color-border-default)] pb-3 mb-3">
            <h2 className="text-base font-bold text-[var(--app-color-text-primary)] shrink-0">{pageLabel}</h2>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <input
              className="border border-[var(--app-color-border-default)] rounded-lg px-3 py-2 text-sm min-w-[260px] bg-[var(--app-color-surface-container)] text-[var(--app-color-text-primary)] placeholder:text-[var(--app-color-text-tertiary)]"
              placeholder="检索通道名称/编码"
              value={keyword}
              onChange={(e) => {
                setKeyword(e.target.value);
                setPage(1);
              }}
            />
            <select
              className="border border-[var(--app-color-border-default)] rounded-lg px-3 py-2 text-sm bg-[var(--app-color-surface-container)] text-[var(--app-color-text-primary)]"
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
              className="border border-[var(--app-color-border-default)] rounded-lg px-3 py-2 text-sm bg-[var(--app-color-surface-container)] text-[var(--app-color-text-primary)]"
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
            <AdminButton
              tone="secondary"
              size="sm"
              onClick={() => void refreshBatchStatus(list)}
            >
              刷新状态
            </AdminButton>
          </div>
        </AdminFormCard>

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

        <div className="flex-1 min-h-0 flex flex-col rounded-xl border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] shadow-sm overflow-hidden">
          <div className="flex-1 min-h-0 overflow-auto">
            {isLoading ? (
              <div className="flex min-h-[200px] items-center justify-center text-sm text-[var(--app-color-text-tertiary)]">加载中...</div>
            ) : list.length === 0 ? (
              <div className="flex min-h-[160px] items-center justify-center text-sm text-[var(--app-color-text-tertiary)]">暂无通道</div>
            ) : (
              <div>
                <table className="w-full min-w-max text-left text-sm whitespace-nowrap border-collapse">
                  <thead className="border-b-2 border-[var(--app-color-border-strong)]">
                    <tr className="sticky top-0 z-[2] bg-[var(--app-color-surface-hover)] text-[var(--app-color-text-secondary)] font-bold shadow-[var(--app-elevation-card)]">
                      <th className="p-3">通道名称</th>
                      <th className="p-3">在线状态</th>
                      <th className="p-3">编码</th>
                      <th className="p-3">分类</th>
                      <th className="text-right p-3">控制</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((row) => (
                      <tr key={`${row.id}-${row.channelCode}`} className="border-t border-[var(--app-color-border-default)]">
                        <td className="p-3 font-semibold text-[var(--app-color-text-primary)]">{row.channelName || "-"}</td>
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
                        <td className="p-3 font-mono text-[var(--app-color-text-secondary)]">{row.channelCode || "-"}</td>
                        <td className="p-3 text-[var(--app-color-text-tertiary)]">{row.channelType || "-"}</td>
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
                                      : "border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] hover:bg-[var(--app-color-surface-hover)] text-[var(--app-color-text-primary)]"
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
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="shrink-0 flex items-center justify-between gap-3 px-3 py-2 border-t border-[var(--app-color-border-default)] text-sm">
            <span className="text-[var(--app-color-text-tertiary)]">第 {page} / {totalPages} 页，共 {total} 条</span>
            <div className="flex gap-2">
              <AdminButton tone="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                上一页
              </AdminButton>
              <AdminButton tone="secondary" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                下一页
              </AdminButton>
            </div>
          </div>
        </div>
      </div>

      {confirmModal.open && (
        <Portal>
          <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
            <div className="w-full max-w-md rounded-xl border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] p-4 shadow-xl">
              <h3 className="text-base font-bold text-[var(--app-color-text-primary)]">确认执行操作</h3>
              <p className="mt-2 text-sm text-[var(--app-color-text-secondary)]">
                将执行「{confirmModal.modeLabel}」
              </p>
              <p className="mt-1 text-sm text-[var(--app-color-text-tertiary)]">通道：{confirmModal.channelName}</p>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  className="px-3 py-2 rounded-lg border border-[var(--app-color-border-default)] text-sm bg-[var(--app-color-surface-container)] hover:bg-[var(--app-color-surface-hover)] text-[var(--app-color-text-primary)]"
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
        </Portal>
      )}
    </AdminPageShell>
  );
}
