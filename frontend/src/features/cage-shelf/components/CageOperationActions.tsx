import { useEffect, useState } from "react";
import { SplitSquareHorizontal, MoveRight } from "lucide-react";
import toast from "react-hot-toast";
import { claimCageAsOwner, claimCageOnBehalf, fetchCageOpOperable } from "@/api/domains/cageShelf.api";
import ReservePersonDialog from "./ReservePersonDialog";
import { AdminButton } from "@/components/admin/AdminButton";
import type { CageOpKind, CageOpMark, CageOpSource } from "../useCageOpSelect";

/**
 * 分笼 / 转移笼位入口 — 三端详情面板共用。
 *
 * 后端 `/cage-op/operable` 给出：
 *   - operable=true            → 「分笼」「转移笼位」
 *   - code=NOT_CLAIMED         → 该笼位没认领人且无认领记录：提示 + 「认领该笼位」（本人一键认领）
 *   - canClaimOnBehalf=true    → 额外身份（饲养员/饲养组长/超管）：多一个「认领」按钮，
 *                                弹窗检索**本课题组**人员做代绑定，支持覆盖已有认领
 *   - 其他不可操作              → 展示后端给的具体原因（不再静默隐藏）
 *
 * 两条认领路径互斥：有认领记录的笼位归原有「申请/预定/确认」流程，这里不会给本人认领入口。
 */
export default function CageOperationActions({
  source,
  occupied,
  onStart,
  onChanged,
  className,
  opMark,
}: {
  source: CageOpSource;
  /** 是否占用中（非占用笼位不出现分笼/转移入口） */
  occupied: boolean;
  onStart: (kind: CageOpKind, source: CageOpSource) => void;
  /** 认领/代认领成功后的回调（页面据此刷新网格/详情） */
  onChanged?: () => void;
  className?: string;
  /** 该笼位的待审分笼/转移中间态；有值时只展示状态条，不再给新入口 */
  opMark?: CageOpMark | null;
}) {
  const [checked, setChecked] = useState(false);
  const [operable, setOperable] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  /** 不可操作的具体原因 —— 直接展示出来，否则用户只看到「没有入口」而不知道卡在哪 */
  const [reason, setReason] = useState<string | null>(null);
  const [canClaimOnBehalf, setCanClaimOnBehalf] = useState(false);
  const [groupNames, setGroupNames] = useState<string[]>([]);
  const [claiming, setClaiming] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    const cageId = source.animalCageId;
    if (!occupied || !cageId) {
      setChecked(false);
      setOperable(false);
      setCode(null);
      setReason(null);
      setCanClaimOnBehalf(false);
      setGroupNames([]);
      return;
    }
    let cancelled = false;
    setChecked(false);
    fetchCageOpOperable(cageId)
      .then((r) => {
        if (cancelled) return;
        setOperable(r.operable);
        setCode(r.code ?? null);
        setReason(r.reason ?? null);
        setCanClaimOnBehalf(!!r.canClaimOnBehalf);
        setGroupNames(r.groupNames ?? []);
      })
      .catch(() => {
        if (!cancelled) {
          setOperable(false);
          setCode(null);
          setReason(null);
          setCanClaimOnBehalf(false);
          setGroupNames([]);
        }
      })
      .finally(() => {
        if (!cancelled) setChecked(true);
      });
    return () => {
      cancelled = true;
    };
  }, [occupied, source.animalCageId]);

  const handleSelfClaim = async () => {
    setClaiming(true);
    try {
      await claimCageAsOwner(source.animalCageId);
      toast.success("已认领，你已成为该笼位的实验员");
      onChanged?.();
    } catch (e: any) {
      toast.error(e?.message || "认领失败");
    } finally {
      setClaiming(false);
    }
  };

  const handleOnBehalf = async (p: { name: string; accountId: string }) => {
    setClaiming(true);
    try {
      const r = await claimCageOnBehalf(source.animalCageId, p.accountId);
      toast.success(`已将该笼位认领给 ${r.claimantName || p.name}`);
      setPickerOpen(false);
      onChanged?.();
    } catch (e: any) {
      toast.error(e?.message || "代认领失败");
    } finally {
      setClaiming(false);
    }
  };

  /**
   * 中间态：该笼位已有待审的分笼/转移 —— 只展示状态条（配对色与网格上一致），不再给第二个入口，
   * 避免同一笼位重复提交互相打架。请求在 material/review 的「分笼审核 / 转移审核」里审。
   */
  if (opMark) {
    const PendingIcon = opMark.kind === "divide" ? SplitSquareHorizontal : MoveRight;
    return (
      <div className={`flex flex-wrap items-center gap-2 ${className ?? ""}`}>
        <span className="inline-flex items-center gap-1 rounded-twin-md px-2 py-1 text-[11px] font-semibold text-white" style={{ background: opMark.color }}>
          <PendingIcon className="size-3.5" strokeWidth={2.6} />
          {opMark.label}
        </span>
        <span className="text-[10px] text-[var(--twin-mute)]">
          {opMark.applicantName ? `由「${opMark.applicantName}」提交 · ` : ""}
          {opMark.kind === "divide" ? `目标 ${opMark.targetAnimalCageIds?.length ?? 0} 个笼位` : "一对一转移"}
          {" · 审核通过后自动生效"}
        </span>
      </div>
    );
  }

  if (!occupied || !checked) return null;

  const showSelfClaim = !operable && code === "NOT_CLAIMED";
  /**
   * 不可操作时把原因露出来。之前这里直接 return null —— 用户只看到「没有入口」，
   * 到底是没认领、不是本课题组、还是 id 对不上，界面上完全无声，排查全靠猜。
   */
  const denyHint = !operable && !showSelfClaim && !canClaimOnBehalf ? reason : null;
  if (!operable && !showSelfClaim && !canClaimOnBehalf && !denyHint) return null;

  return (
    <>
      <div className={`flex flex-wrap items-center gap-2 ${className ?? ""}`}>
        {denyHint && (
          <span className="text-[10px] text-[var(--twin-mute)]">分笼 / 转移不可用：{denyHint}</span>
        )}
        {operable && (
          <>
            <AdminButton type="button" tone="secondary" size="xs" onClick={() => onStart("divide", source)}>
              分笼
            </AdminButton>
            <AdminButton type="button" tone="secondary" size="xs" onClick={() => onStart("transfer", source)}>
              转移笼位
            </AdminButton>
          </>
        )}
        {showSelfClaim && (
          <>
            <span className="text-[10px] text-[var(--twin-warning,#d97706)]">
              该笼位尚未认领，认领成本人后才能分笼 / 转移
            </span>
            <AdminButton type="button" size="xs" loading={claiming} onClick={handleSelfClaim}>
              {claiming ? "认领中…" : "认领该笼位"}
            </AdminButton>
          </>
        )}
        {canClaimOnBehalf && (
          <AdminButton type="button" tone="secondary" size="xs" onClick={() => setPickerOpen(true)}>
            认领
          </AdminButton>
        )}
      </div>
      {canClaimOnBehalf && (
        <ReservePersonDialog
          open={pickerOpen}
          submitting={claiming}
          groupNames={groupNames}
          title="代认领笼位"
          description="选择本课题组人员，其将成为该笼位的实验员（已有认领会被覆盖）"
          confirmText="确认认领"
          onClose={() => setPickerOpen(false)}
          onConfirm={handleOnBehalf}
        />
      )}
    </>
  );
}
