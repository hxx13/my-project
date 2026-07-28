/** 手机版 — 设置页（通知偏好） */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { authHttp } from "@/api/core/authHttp";
import { ArrowLeft, Bell, Mail, MessageCircle, Smartphone } from "lucide-react";
import toast from "react-hot-toast";

interface SourceSetting {
  sourceCode: string; sourceName: string; description: string;
  sourceEnabled: boolean; myEnabled: boolean;
  muteEmail: boolean; muteServerChan: boolean; muteWxpusher: boolean;
}

export default function MobileSettingsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useQuery<SourceSetting[]>({
    queryKey: ["user-notify-settings"],
    queryFn: () => authHttp.get("/user/notify-settings").then(r => r.data.data),
  });

  const saveM = useMutation({
    mutationFn: ({ code, body }: { code: string; body: Record<string, unknown> }) =>
      authHttp.put(`/user/notify-settings/${code}`, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["user-notify-settings"] }),
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "保存失败"),
  });

  const active = (settings ?? []).filter(s => s.sourceEnabled);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* header */}
      <div className="sticky top-0 z-10 bg-white/90 dark:bg-gray-900/90 backdrop-blur border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-3 px-4 h-12">
          <button onClick={() => navigate(-1)} className="p-1 -ml-1">
            <ArrowLeft className="size-5 text-gray-700 dark:text-gray-300" />
          </button>
          <h1 className="text-base font-semibold text-gray-900 dark:text-gray-100">通知设置</h1>
        </div>
      </div>

      <div className="px-4 py-4">
        <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">以下设置仅影响你自己的通知接收，不影响其他人。</p>

        {isLoading ? (
          <p className="text-xs text-gray-400 py-8 text-center">加载中…</p>
        ) : active.length === 0 ? (
          <p className="text-xs text-gray-400 py-8 text-center">暂无可用通知</p>
        ) : (
          <div className="space-y-2">
            {active.map(s => (
              <div key={s.sourceCode} className="rounded-xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 px-4 py-3">
                {/* source toggle */}
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{s.sourceName}</p>
                    <p className="text-[11px] text-gray-400 truncate">{s.description}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => saveM.mutate({ code: s.sourceCode, body: { enabled: !s.myEnabled } })}
                    className="relative inline-flex h-6 w-10 shrink-0 items-center rounded-full transition-colors ml-3"
                    style={{ background: s.myEnabled ? "#10b981" : "#d1d5db" }}
                  >
                    <span className="inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform"
                      style={{ transform: s.myEnabled ? "translateX(1.25rem)" : "translateX(0.25rem)" }} />
                  </button>
                </div>
                {/* channel toggles */}
                {s.myEnabled && (
                  <div className="mt-2 pt-2 border-t border-gray-50 dark:border-gray-800 flex items-center gap-4">
                    {([
                      ["EMAIL", "邮件", Mail],
                      ["SERVER_CHAN", "Server酱", MessageCircle],
                      ["WXPUSHER", "WxPusher", Smartphone],
                    ] as const).map(([ch, label, Icon]) => {
                      const key = ch === "EMAIL" ? "muteEmail" : ch === "SERVER_CHAN" ? "muteServerChan" : "muteWxpusher";
                      const muted = (s as any)[key] as boolean;
                      return (
                        <button key={ch} type="button"
                          onClick={() => saveM.mutate({ code: s.sourceCode, body: { [key]: !muted } })}
                          className="flex items-center gap-1 text-[11px] font-medium rounded-md px-2 py-1 transition-colors"
                          style={{
                            color: muted ? "#9ca3af" : "#374151",
                            background: muted ? "transparent" : "rgba(16,185,129,0.08)",
                          }}
                        >
                          <Icon className="size-3" />
                          {label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
