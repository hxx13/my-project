import { useState } from "react";
import toast from "react-hot-toast";
import { useQuery } from "@tanstack/react-query";
import {
  createRegistrationInvite,
  listRegistrationInvites,
  revokeRegistrationInvite,
  type RegistrationInviteRow,
} from "@/api/domains/siteAdmin.api";
import { AdminDataTableWrap } from "@/components/admin/AdminPageShell";
import { copyTextToClipboard } from "@/lib/copyToClipboard";
import DataSkeleton from "@/components/ui/DataSkeleton";
import EmptyState from "@/components/ui/EmptyState";

export default function AdminInviteCodesPage() {
  const [ttlDays, setTtlDays] = useState(3);
  const [maxUses, setMaxUses] = useState(1);
  const [note, setNote] = useState("");
  const [lastPlain, setLastPlain] = useState<string | null>(null);

  const { data: rows = [], isLoading, refetch } = useQuery({
    queryKey: ["registrationInvites"] as const,
    queryFn: async () => {
      const { rows, schemaHint } = await listRegistrationInvites(80);
      if (schemaHint) toast(schemaHint, { duration: 10000 });
      return rows;
    },
  });

  const gen = async () => {
    try {
      const r = await createRegistrationInvite({ ttlDays, maxUses, note });
      setLastPlain(r.plainCode);
      const copied = await copyTextToClipboard(r.plainCode);
      toast.success(copied ? "已生成并已复制到剪贴板" : "已生成（复制失败，请手动复制下方推荐码）");
      await refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "生成失败");
    }
  };

  const copyLast = async () => {
    if (!lastPlain) return;
    const ok = await copyTextToClipboard(lastPlain);
    toast[ok ? "success" : "error"](ok ? "已复制" : "复制失败，请手动选择复制");
  };

  const revoke = async (id: string) => {
    if (!window.confirm("确认作废该推荐码？")) return;
    try {
      await revokeRegistrationInvite(id);
      toast.success("已作废");
      await refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "作废失败");
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <h1 className="text-xl font-semibold text-[var(--twin-ink)]">注册推荐码</h1>
      <p className="text-sm text-[var(--twin-body)]">
        管理员及以上可生成；教职工注册须校验推荐码。库表脚本见 scripts/login_branding_invite_chat.ddl.sql。
      </p>

      {lastPlain ? (
        <div className="rounded-twin-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 shadow-twin-level-1">
          <div className="font-semibold">新生成的推荐码（仅显示一次）</div>
          <div className="mt-2 font-mono text-lg tracking-wide">{lastPlain}</div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="rounded-twin-lg bg-amber-700 px-3 py-2 text-xs font-medium text-white hover:bg-amber-800"
              onClick={() => void copyLast()}
            >
              一键复制
            </button>
            <button type="button" className="rounded-twin-lg border border-amber-400/80 px-3 py-2 text-xs text-amber-900 hover:bg-amber-100" onClick={() => setLastPlain(null)}>
              已保存，隐藏
            </button>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-end gap-3 rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-4 shadow-twin-level-1">
        <label className="text-xs text-[var(--twin-body)]">
          有效天数
          <input
            type="number"
            min={1}
            max={30}
            value={ttlDays}
            onChange={(e) => setTtlDays(Number(e.target.value) || 3)}
            className="ml-1 w-16 rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-1 py-1 text-[var(--twin-ink)]"
          />
        </label>
        <label className="text-xs text-[var(--twin-body)]">
          最大使用次数
          <input
            type="number"
            min={1}
            max={100}
            value={maxUses}
            onChange={(e) => setMaxUses(Number(e.target.value) || 1)}
            className="ml-1 w-16 rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-1 py-1 text-[var(--twin-ink)]"
          />
        </label>
        <label className="min-w-[10rem] flex-1 text-xs text-[var(--twin-body)]">
          备注
          <input value={note} onChange={(e) => setNote(e.target.value)} className="ml-1 w-full rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1 text-[var(--twin-ink)]" />
        </label>
        <button type="button" onClick={() => void gen()} className="rounded-twin-sm bg-[var(--twin-primary)] px-3 py-2 text-sm font-medium text-[var(--twin-on-primary)]">
          生成推荐码
        </button>
      </div>

      <AdminDataTableWrap scrollable>
        <table className="min-w-full text-left text-sm">
          <thead className="bg-[var(--twin-canvas-soft)] text-xs text-[var(--twin-body)]">
            <tr>
              <th className="px-3 py-2">ID</th>
              <th className="px-3 py-2">类型</th>
              <th className="px-3 py-2">过期</th>
              <th className="px-3 py-2">使用</th>
              <th className="px-3 py-2">备注</th>
              <th className="px-3 py-2">状态</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-[var(--twin-hairline)]">
                <td className="px-3 py-2 font-mono text-xs">{r.id}</td>
                <td className="px-3 py-2">{r.inviteKind}</td>
                <td className="px-3 py-2 text-xs">{r.expiresAt}</td>
                <td className="px-3 py-2">
                  {r.usedCount}/{r.maxUses}
                </td>
                <td className="max-w-[12rem] truncate px-3 py-2 text-xs" title={r.note}>
                  {r.note}
                </td>
                <td className="px-3 py-2">{r.revoked ? "已作废" : "有效"}</td>
                <td className="px-3 py-2">
                  {!r.revoked && r.usedCount < r.maxUses ? (
                    <button type="button" className="text-xs font-medium text-red-600" onClick={() => void revoke(r.id)}>
                      作废
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {isLoading ? <DataSkeleton variant="table" rows={6} /> : null}
        {!isLoading && !rows.length ? <EmptyState title="暂无记录" /> : null}
      </AdminDataTableWrap>
    </div>
  );
}
