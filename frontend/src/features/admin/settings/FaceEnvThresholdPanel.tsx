import { useEffect, useState } from "react";
import { fetchFaceEnvThresholds, type FaceEnvThresholdConfig } from "@/api/domains/face.api";
import { AdminFormCard } from "@/components/admin/AdminPageShell";
import { adminHintClass } from "@/features/admin/adminFormUi";

function fmtThreshold(v: number | undefined): string {
  if (v == null || Number.isNaN(v)) return "—";
  return v.toFixed(2);
}

type EnvRow = {
  label: string;
  envVar?: string;
  value: string;
  hint: string;
};

export function FaceEnvThresholdPanel() {
  const [data, setData] = useState<FaceEnvThresholdConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = () => {
    setLoading(true);
    setError(null);
    fetchFaceEnvThresholds()
      .then(setData)
      .catch((e) => {
        setError(e instanceof Error ? e.message : "加载失败");
        setData(null);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    reload();
  }, []);

  const rows: EnvRow[] = data
    ? [
        {
          label: "全局通过阈值（当前生效）",
          envVar: data.matchEnvVar,
          value: fmtThreshold(data.matchThreshold),
          hint: "可在上方配置项修改，保存后立即生效",
        },
        {
          label: "全局拒绝阈值（当前生效）",
          envVar: data.rejectEnvVar,
          value: fmtThreshold(data.rejectThreshold),
          hint: "低于此值立即拒绝",
        },
        {
          label: "门禁 gate 通过阈值",
          value: fmtThreshold(data.matchThresholdGate),
          hint: "未单独配置时等于全局通过阈值",
        },
        {
          label: "个人中心 personal 通过阈值",
          value: fmtThreshold(data.matchThresholdPersonal),
          hint: "未单独配置时等于全局通过阈值",
        },
        {
          label: "画中画 pip 通过阈值",
          value: fmtThreshold(data.matchThresholdPip),
          hint: "未单独配置时等于全局通过阈值",
        },
      ]
    : [];

  return (
    <AdminFormCard
      title="当前生效阈值（只读快照）"
      description="上方「配置项」保存后立即生效，无需重启。本表展示进程内当前读到的值；修改后点刷新可核对。"
    >
      {loading ? (
        <p className={adminHintClass}>加载…</p>
      ) : error ? (
        <p className="text-sm text-[var(--app-color-feedback-danger)]">{error}</p>
      ) : (
        <div className="space-y-4">
          {data?.modelVersion ? (
            <p className={adminHintClass}>
              模型版本：<code className="rounded bg-neutral-100 px-1 font-mono text-[11px]">{data.modelVersion}</code>
              {data.hotReload ? " · 阈值支持热更新" : null}
            </p>
          ) : null}
          {data?.note ? <p className={adminHintClass}>{data.note}</p> : null}
          <div className="overflow-x-auto rounded-[var(--app-radius-container)] border border-[var(--app-color-border-default)]">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-[var(--app-color-surface-container)] text-xs text-[var(--app-color-text-secondary)]">
                <tr>
                  <th className="px-3 py-2 font-medium">参数</th>
                  <th className="px-3 py-2 font-medium">环境变量（默认）</th>
                  <th className="px-3 py-2 font-medium">当前生效值</th>
                  <th className="px-3 py-2 font-medium">说明</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.label} className="border-t border-[var(--app-color-border-default)]">
                    <td className="px-3 py-2.5 font-medium text-[var(--app-color-text-primary)]">{row.label}</td>
                    <td className="px-3 py-2.5">
                      {row.envVar ? (
                        <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[11px]">{row.envVar}</code>
                      ) : (
                        <span className="text-[var(--app-color-text-secondary)]">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-[var(--app-color-text-primary)]">{row.value}</td>
                    <td className="px-3 py-2.5 text-xs text-[var(--app-color-text-secondary)]">{row.hint}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            className="text-xs text-[var(--twin-link-deep)] hover:underline"
            onClick={reload}
          >
            刷新快照
          </button>
          <div className="rounded-[var(--app-radius-container)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-3 py-2.5 text-xs leading-relaxed text-[var(--app-color-text-secondary)]">
            <p className="font-medium text-[var(--app-color-text-primary)]">离线模型包（可选，item 4）</p>
            <p className="mt-1">
              将 <code className="font-mono">face_feature.zip</code>、<code className="font-mono">ultranet.zip</code>{" "}
              放到 <code className="font-mono">uploads/models/</code> 可免远程下载；底库特征缓存目录{" "}
              <code className="font-mono">uploads/face-embed-cache/</code>。
            </p>
          </div>
        </div>
      )}
    </AdminFormCard>
  );
}
