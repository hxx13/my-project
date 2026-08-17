import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import { ArrowLeft, ScanLine, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import {
  addScanLine,
  cancelScanSession,
  commitScanSession,
  fetchSpaceTree,
  getScanSession,
  startScanSession,
  type Item,
  type ScanSession,
  type ScanSessionDetail,
  type SpaceNode,
} from "@/api/domains/inventory.api";
import { toAdminRoutePath } from "@/features/admin/buildAdminNavModel";
import { AdminButton } from "@/components/admin/AdminButton";
import { AdminFormCard, AdminPageShell } from "@/components/admin/AdminPageShell";
import { AdminSelect } from "@/components/admin/AdminSelect";
import { Portal } from "@/components/Portal";
import { cn } from "@/lib/utils";

type ConfirmState = {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
};

type TreeOption = { value: number; label: string };

function flattenSpaceTree(nodes: SpaceNode[], depth = 0): TreeOption[] {
  const out: TreeOption[] = [];
  for (const n of nodes) {
    out.push({ value: n.id, label: `${"　".repeat(depth)}${n.name}` });
    if (n.children?.length) out.push(...flattenSpaceTree(n.children, depth + 1));
  }
  return out;
}

function sessionActive(s: ScanSession | null): boolean {
  return s != null && s.status === "IN_PROGRESS";
}

function Section({
  title,
  colorClass,
  count,
  children,
}: {
  title: string;
  colorClass: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] p-4 shadow-sm">
      <div className="mb-2 flex items-center gap-2">
        <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold", colorClass)}>
          {title}
          <span className="font-mono">{count}</span>
        </span>
      </div>
      <div className="min-h-[40px]">{children}</div>
    </div>
  );
}

export default function ScanSessionPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const urlSpaceId = searchParams.get("spaceId");

  const [spaceId, setSpaceId] = useState<string>(urlSpaceId ?? "");
  const [session, setSession] = useState<ScanSession | null>(null);
  const [detail, setDetail] = useState<ScanSessionDetail | null>(null);
  const [inputVal, setInputVal] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: spaceTree } = useQuery({
    queryKey: ["inventory", "spaces"],
    queryFn: fetchSpaceTree,
  });
  const spaceOptions = useMemo(() => flattenSpaceTree(spaceTree ?? []), [spaceTree]);

  // 会话激活时自动聚焦扫码输入框
  useEffect(() => {
    if (sessionActive(session)) {
      inputRef.current?.focus();
    }
  }, [session?.id, session?.status]);

  const start = async () => {
    if (!spaceId) {
      toast.error("请先选择空间");
      return;
    }
    setBusy(true);
    try {
      const s = await startScanSession({ spaceId: Number(spaceId) });
      setSession(s);
      const d = await getScanSession(s.id);
      setDetail(d);
      setInputVal("");
      toast.success("盘点已开始，请扫描 RFID 码");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "开始盘点失败");
    } finally {
      setBusy(false);
    }
  };

  const submitScan = async (code: string) => {
    if (!sessionActive(session)) return;
    setBusy(true);
    try {
      await addScanLine(session!.id, { rfidCode: code });
      const d = await getScanSession(session!.id);
      setDetail(d);
      setSession(d.session);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "扫描失败");
    } finally {
      setInputVal("");
      setBusy(false);
      inputRef.current?.focus();
    }
  };

  const doCommit = async () => {
    setConfirmState(null);
    setBusy(true);
    try {
      const r = await commitScanSession(session!.id);
      toast.success(`盘点完成：在册 ${r.foundCount}，新增 ${r.newCount}，丢失 ${r.missingCount}`);
      const d = await getScanSession(session!.id);
      setDetail(d);
      setSession(d.session);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "提交失败");
    } finally {
      setBusy(false);
    }
  };

  const doCancel = async () => {
    setConfirmState(null);
    setBusy(true);
    try {
      await cancelScanSession(session!.id);
      toast.success("已取消盘点");
      const d = await getScanSession(session!.id);
      setDetail(d);
      setSession(d.session);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "取消失败");
    } finally {
      setBusy(false);
    }
  };

  const commit = () => {
    if (!sessionActive(session)) return;
    setConfirmState({
      title: "结束盘点",
      message: "确认结束并提交本次盘点？提交后按对账结果批量落库并留痕。",
      confirmLabel: "确认提交",
      onConfirm: () => void doCommit(),
    });
  };

  const cancel = () => {
    if (!sessionActive(session)) return;
    setConfirmState({
      title: "取消盘点",
      message: "确认取消本次盘点？取消后不产生任何变更。",
      confirmLabel: "确认取消",
      danger: true,
      onConfirm: () => void doCancel(),
    });
  };

  const reset = () => {
    setSession(null);
    setDetail(null);
    setInputVal("");
    setBusy(false);
  };

  const lines = detail?.lines ?? [];
  const inPlace = lines.filter((l) => l.lineType === "IN_PLACE");
  const elsewhere = lines.filter((l) => l.lineType === "ELSEWHERE");
  const newLines = lines.filter((l) => l.lineType === "NEW");
  const missing: Item[] = detail?.missing ?? [];

  // 会话进行中后端 scannedCount 尚未回填，用明细行数；提交后再用回填值
  const scannedCount = sessionActive(session) ? lines.length : session?.scannedCount ?? 0;

  const inputDisabled = !sessionActive(session) || busy;

  const renderLines = (list: { id: number; rfidCode: string }[]) => {
    if (!list.length) return <div className="text-xs text-[var(--app-color-text-tertiary)]">暂无</div>;
    return (
      <ul className="space-y-1">
        {list.map((l) => (
          <li key={l.id} className="font-mono text-xs text-[var(--app-color-text-secondary)]">
            {l.rfidCode}
          </li>
        ))}
      </ul>
    );
  };

  const renderMissing = (list: Item[]) => {
    if (!list.length) return <div className="text-xs text-[var(--app-color-text-tertiary)]">暂无</div>;
    return (
      <ul className="space-y-1">
        {list.map((m) => (
          <li key={m.id} className="text-xs text-[var(--app-color-text-secondary)]">
            <span className="font-medium text-[var(--app-color-text-primary)]">{m.name}</span>
            {m.rfidCode && <span className="ml-1 font-mono text-[var(--app-color-text-tertiary)]">{m.rfidCode}</span>}
          </li>
        ))}
      </ul>
    );
  };

  const statusText = session
    ? session.status === "IN_PROGRESS"
      ? "进行中"
      : session.status === "COMMITTED"
        ? "已提交"
        : "已取消"
    : "";

  return (
    <AdminPageShell
      title="RFID 盘点"
      description="选择空间后开始盘点，扫描 RFID 码实时对账，结束提交生成盘点结果。"
      actions={
        <AdminButton type="button" tone="secondary" className="inline-flex min-h-9 items-center gap-2" onClick={() => navigate(toAdminRoutePath("/admin/inventory"))}>
          <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
          返回台账
        </AdminButton>
      }
    >
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
        <AdminFormCard title="盘点设置">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex min-w-56 flex-1 flex-col gap-1">
              <span className="text-xs font-medium text-[var(--app-color-text-secondary)]">盘点空间</span>
              <AdminSelect
                value={spaceId}
                disabled={sessionActive(session)}
                onChange={(e) => setSpaceId(e.target.value)}
                className="w-full"
              >
                <option value="">请选择空间</option>
                {spaceOptions.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </AdminSelect>
            </label>
            {!session ? (
              <AdminButton type="button" loading={busy} onClick={() => void start()} className="inline-flex items-center gap-2">
                <ScanLine className="h-4 w-4" />
                开始盘点
              </AdminButton>
            ) : (
              <span className="inline-flex items-center gap-2 rounded-full border border-[var(--app-color-border-default)] px-3 py-2 text-sm text-[var(--app-color-text-secondary)]">
                <span className="text-[var(--app-color-accent)] font-medium">{statusText}</span>
              </span>
            )}
          </div>
        </AdminFormCard>

        {session && (
          <>
            {/* 扫码输入框 */}
            <AdminFormCard>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    ref={inputRef}
                    autoFocus
                    type="text"
                    value={inputVal}
                    disabled={inputDisabled}
                    onChange={(e) => setInputVal(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        const v = (e.target as HTMLInputElement).value.trim();
                        if (v) void submitScan(v);
                      }
                    }}
                    className="w-full rounded-lg border border-[var(--app-color-border-default)] bg-white px-4 py-3 font-mono text-lg text-[var(--app-color-text-primary)] outline-none placeholder:text-[var(--app-color-text-tertiary)] focus-visible:border-[var(--app-color-accent)] focus-visible:ring-2 focus-visible:ring-[var(--app-color-accent)]/30 disabled:opacity-50"
                    placeholder={!sessionActive(session) ? "盘点已结束" : busy ? "处理中…" : "扫描或输入 RFID 码后回车…"}
                  />
                </div>
                <div className="flex items-center gap-2 text-xs text-[var(--app-color-text-tertiary)]">
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  <span>已扫描 {scannedCount} 件</span>
                </div>
              </div>
            </AdminFormCard>

            {/* 四区实时预览 */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Section title="在册" colorClass="bg-emerald-50 text-emerald-700" count={inPlace.length}>
                {renderLines(inPlace)}
              </Section>
              <Section title="异地发现" colorClass="bg-amber-50 text-amber-700" count={elsewhere.length}>
                {renderLines(elsewhere)}
              </Section>
              <Section title="新发现" colorClass="bg-sky-50 text-sky-700" count={newLines.length}>
                {renderLines(newLines)}
              </Section>
              <Section title="疑似丢失" colorClass="bg-red-50 text-red-700" count={missing.length}>
                {renderMissing(missing)}
              </Section>
            </div>

            {/* 底部操作 */}
            <div className="flex items-center justify-end gap-2">
              {sessionActive(session) ? (
                <>
                  <AdminButton type="button" tone="secondary" disabled={busy} onClick={() => void cancel()}>
                    取消
                  </AdminButton>
                  <AdminButton type="button" loading={busy} disabled={busy} onClick={() => void commit()}>
                    结束盘点（提交）
                  </AdminButton>
                </>
              ) : (
                <AdminButton type="button" onClick={() => void reset()} className="inline-flex items-center gap-2">
                  <ScanLine className="h-4 w-4" />
                  再来一轮
                </AdminButton>
              )}
            </div>
          </>
        )}
      </div>

      {confirmState && (
        <Portal>
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-sm rounded-twin-xl bg-[var(--twin-canvas)] p-5 shadow-twin-level-3">
              <h3 className="text-base font-semibold text-[var(--twin-ink)]">{confirmState.title}</h3>
              <p className="mt-2 text-sm text-[var(--twin-body)]">{confirmState.message}</p>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-2 text-sm text-[var(--twin-body)]"
                  onClick={() => setConfirmState(null)}
                >
                  取消
                </button>
                <button
                  className={
                    confirmState.danger
                      ? "rounded-[var(--app-radius-container)] bg-[var(--app-color-surface-danger)] px-3 py-2 text-sm font-medium text-[var(--app-color-text-on-danger)]"
                      : "rounded-twin-sm bg-[var(--twin-primary)] px-3 py-2 text-sm font-medium text-[var(--twin-on-primary)]"
                  }
                  onClick={confirmState.onConfirm}
                >
                  {confirmState.confirmLabel}
                </button>
              </div>
            </div>
          </div>
        </Portal>
      )}
    </AdminPageShell>
  );
}
