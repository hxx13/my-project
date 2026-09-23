import { useMemo, useState } from "react";
import type { CartLine } from "./CartDrawer";
import CageLocationCell from "./CageLocationCell";

/**
 * 共享购物车的分组模型与身份判定 —— **三端唯一实现**。
 * PC（ReferenceDataManager）与 H5（MobileAnimalOrderView）直接复用本组件；
 * 小程序无打包通道，在 `aroapp/miniprogram/package-feature/pages/animalOrder/index.js`
 * 内联同名 `buildCartTree` / `canEditCartLine` 镜像（照 allocVerdict 的体例），改这里必须同步那边。
 */

export type CartTreeMode = "aup-user-spec" | "spec-user";

export interface CartSubGroup {
  key: string;
  title: string;
  lines: CartLine[];
}

export interface CartGroup {
  key: string;
  title: string;
  subGroups: CartSubGroup[];
}

/** 同一商品+规格下的行，再按加购人（实验员）拆一层 */
function splitByUser(lines: CartLine[]): CartSubGroup[] {
  const byUser = new Map<string, CartLine[]>();
  for (const l of lines) {
    // 按「人」聚：同一人可能同时持有 STAFF_xxx 与 aro_user_id 两个账号（双视角），
    // 用裸账号 id 会把自己拆成两个「实验员」分组。addedByKey 是 personnel.id。
    const key = l.addedByKey || l.addedBy;
    if (!byUser.has(key)) byUser.set(key, []);
    byUser.get(key)!.push(l);
  }
  return Array.from(byUser.entries()).map(([uid, userLines]) => ({
    key: uid,
    title: `实验员 · ${userLines[0].addedByLabel || uid}`,
    lines: userLines,
  }));
}

/** 默认 AUP→实验员→行；`spec-user` 为 规格→实验员→行 */
export function buildCartTree(lines: CartLine[], mode: CartTreeMode): CartGroup[] {
  if (mode === "spec-user") {
    const bySpec = new Map<string, CartLine[]>();
    for (const line of lines) {
      const sk = `${line.itemId}::${line.specLabel || "-"}`;
      if (!bySpec.has(sk)) bySpec.set(sk, []);
      bySpec.get(sk)!.push(line);
    }
    return Array.from(bySpec.entries()).map(([sk, groupLines]) => ({
      key: sk,
      title: `${groupLines[0].itemLabel}${groupLines[0].specLabel ? ` · ${groupLines[0].specLabel}` : ""}`,
      subGroups: splitByUser(groupLines),
    }));
  }

  const byAup = new Map<string, CartLine[]>();
  for (const line of lines) {
    const ak = String(line.aupRecordId ?? "none");
    if (!byAup.has(ak)) byAup.set(ak, []);
    byAup.get(ak)!.push(line);
  }
  return Array.from(byAup.entries()).map(([ak, groupLines]) => ({
    key: ak,
    title: `AUP · ${groupLines[0].aupLabel ?? "未归属"}`,
    subGroups: splitByUser(groupLines),
  }));
}

/** PI 可改所有行；非 PI 只能改本人加购的行 */
export function canEditCartLine(line: CartLine, opts: { isPi: boolean; currentUserId: string }): boolean {
  // mine 由服务端按 personnel.id 判出（同一人换视角也算本人）；回退到账号 id 比对待旧数据
  return opts.isPi || line.mine === true || line.addedBy === opts.currentUserId;
}

/**
 * 行是否落在「预约」tab：deliveryCycle 晚于当前周期才算；缺失/null/无当前周期都归本周期。
 *
 * <p><b>已知简化</b>：这里的 currentCycle 是**不带 categoryKey** 的当前周期，而行的
 * deliveryCycle 是加购时用**该行自己品种**的 categoryKey 算的。ETA 锚点来自可购窗口规则，
 * 规则可按品种配（CATEGORY 作用域）—— 一旦配了，两个品种的「当前周期」可能不同，这一行
 * 就可能被分错 tab。目前没配 CATEGORY 规则所以不会发生；真配了就按行品种分别取周期。
 *
 * <p>之所以可接受：**这只是展示分区**。权威的预约标记是服务端提交时判定并永久落库的
 * ref_order.is_preorder（审核页看的就是它），购物车里分错 tab 不会让单子变成非预约单。
 */
function isPreorderLine(line: CartLine, currentCycle?: string | null): boolean {
  const dc = line.deliveryCycle;
  if (!dc || !currentCycle) return false;
  return dc > currentCycle;
}

interface CartTreeProps {
  lines: CartLine[];
  isPi: boolean;
  currentUserId: string;
  onQtyChange: (line: CartLine, qty: number) => void;
  /** 单笼位上限：已挂笼位的行到上限后 `+` 置灰（房间领用行没有笼位，不传即不受限） */
  maxQtyPerCage?: number;
  /**
   * 购物车里的「定位」：**就地打开订购页的笼位抽屉并定位那一格**，
   * 不是跳去笼架页（跳笼架页是实验动物审核页面的定位）。
   */
  onLocateCage?: (cageId: string) => void;
  /** 只切样式：desktop 走 twin 卡片，mobile 走 student 细条；分组与判定完全同源 */
  layout?: "desktop" | "mobile";
  /** 受控分组视角（移动端抽屉标题行持有切换器时传）；不传则组件内部自管，PC 不受影响 */
  mode?: CartTreeMode;
  onModeChange?: (m: CartTreeMode) => void;
  /** 标题行已经有切换器时置 true，组件内不再重复画一份 */
  hideModeToggle?: boolean;
  /** 当前周期（预计到货日 ISO 日期）：行 deliveryCycle 晚于它才进「预约」tab；缺失时全落本周期 */
  currentCycle?: string | null;
}

/**
 * 分组视角切换器（AUP→实验员 / 规格→实验员）。PC 由 CartTree 内部渲染，
 * 移动端由购物车抽屉的标题行渲染 —— 位置不同但必须是同一个控件，
 * 复制一份按钮迟早两边样式和文案漂开。
 */
export function CartTreeModeToggle({
  mode,
  onChange,
  mobile,
}: {
  mode: CartTreeMode;
  onChange: (m: CartTreeMode) => void;
  mobile?: boolean;
}) {
  const cls = (on: boolean) =>
    mobile
      ? `rounded-full px-2.5 py-0.5 text-[10px] ${on ? "bg-[var(--student-primary)] text-white" : "border border-[var(--student-hairline)] text-[var(--student-mute)]"}`
      : `rounded-full px-2.5 py-0.5 text-[10px] ${on ? "bg-sky-600 text-white" : "border border-[var(--twin-hairline)] text-[var(--twin-mute)]"}`;
  return (
    <div className="flex shrink-0 gap-1">
      <button type="button" className={cls(mode === "aup-user-spec")} onClick={() => onChange("aup-user-spec")}>
        AUP→实验员
      </button>
      <button type="button" className={cls(mode === "spec-user")} onClick={() => onChange("spec-user")}>
        规格→实验员
      </button>
    </div>
  );
}

export default function CartTree({ lines, isPi, currentUserId, onQtyChange, onLocateCage, layout = "desktop", maxQtyPerCage, mode: modeProp, onModeChange, hideModeToggle, currentCycle }: CartTreeProps) {
  const [innerMode, setInnerMode] = useState<CartTreeMode>("aup-user-spec");
  const mode = modeProp ?? innerMode;
  const setMode = onModeChange ?? setInnerMode;
  const [tab, setTab] = useState<"current" | "preorder">("current");
  const mobile = layout === "mobile";

  const currentLines = useMemo(() => lines.filter((l) => !isPreorderLine(l, currentCycle)), [lines, currentCycle]);
  const preorderLines = useMemo(() => lines.filter((l) => isPreorderLine(l, currentCycle)), [lines, currentCycle]);
  const visibleLines = tab === "preorder" ? preorderLines : currentLines;
  const groups = useMemo(() => buildCartTree(visibleLines, mode), [visibleLines, mode]);

  const renderLine = (line: CartLine) => {
    const canEdit = canEditCartLine(line, { isPi, currentUserId });
    // 挂了笼位的行受「单笼上限」约束：到上限后 + 置灰，不然就是能绕过校验的漏洞
    const atCap = !!line.targetAnimalCageId && (maxQtyPerCage ?? 0) > 0 && line.qty >= (maxQtyPerCage ?? 0);
    const badge = line.packageStatus === "READY" ? "READY" : "DRAFT";
    const price =
      line.lineAmount != null
        ? `${line.unitPrice != null ? `¥${line.unitPrice.toFixed(2)} × ${line.qty} = ` : ""}¥${line.lineAmount.toFixed(2)}`
        : null;

    if (mobile) {
      // 紧凑三行：主行（品名 + 规格 + 状态徽标）/ 副行（笼位位置+定位 …… 金额靠右）/ 备注行（有才出现）。
      // 原来一个字段一行（最多六行），一屏放不下两行车——小程序那边同款改法。
      const ready = badge === "READY";
      const hasCage = line.targetAnimalCageId != null && !!(line.targetCageLabel || line.targetCageLocation?.shelveId);
      const showSub = hasCage || !!(line.pickupRoomName || line.collectorName || price);
      return (
        <div key={line.key} className="flex items-center gap-3 py-1.5">
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="truncate text-sm font-medium text-[var(--student-ink)]">{line.itemLabel}</span>
              {line.specLabel && (
                <span className="max-w-[45%] shrink-0 truncate rounded bg-[var(--student-canvas-soft)] px-1.5 py-0.5 text-[10px] text-[var(--student-body)]">
                  {line.specLabel}
                </span>
              )}
              <span
                className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${
                  ready
                    ? "bg-[var(--student-success-soft)] text-[var(--student-success)]"
                    : "bg-[var(--student-canvas-soft)] text-[var(--student-mute)]"
                }`}
              >
                {badge}
              </span>
              {line.deliveryCycle && (
                <span className="shrink-0 rounded bg-[var(--student-canvas-soft)] px-1.5 py-0.5 text-[10px] text-[var(--student-primary)]">
                  到货 {line.deliveryCycle}
                </span>
              )}
            </div>
            {showSub && (
              <div className="mt-0.5 flex min-w-0 items-center gap-2 overflow-hidden">
                {/* 挂了笼位的行走「位置 + 定位」（定位 = 就地开笼位抽屉聚焦那一格）；
                    房间领用行没有笼位，才退回落房间/领用人 */}
                {hasCage ? (
                  <CageLocationCell
                    label={line.targetCageLabel}
                    location={line.targetCageLocation}
                    onLocate={
                      onLocateCage && line.targetAnimalCageId != null
                        ? () => onLocateCage(String(line.targetAnimalCageId))
                        : undefined
                    }
                    className="text-[10px] text-[var(--student-body)]"
                  />
                ) : (
                  <>
                    {line.pickupRoomName && (
                      <span className="shrink-0 truncate text-[10px] text-[var(--student-mute)]">{line.pickupRoomName}</span>
                    )}
                    {line.collectorName && (
                      <span className="shrink-0 truncate text-[10px] text-[var(--student-mute)]">领用人 {line.collectorName}</span>
                    )}
                  </>
                )}
                {price && <span className="ml-auto shrink-0 text-[10px] font-semibold text-sky-700">{price}</span>}
              </div>
            )}
            {(line.remark || line.packageRemark) && (
              <div className="mt-0.5 flex min-w-0 items-center gap-2 overflow-hidden">
                {line.remark && (
                  <span className="truncate text-[10px] text-[var(--student-ink)]">备注：{line.remark}</span>
                )}
                {line.packageRemark && (
                  <span className="truncate text-[10px] text-[var(--student-mute)]">包备注：{line.packageRemark}</span>
                )}
              </div>
            )}
          </div>
          {canEdit ? (
            <div className="flex shrink-0 items-center gap-1">
              <button type="button" onClick={() => onQtyChange(line, line.qty - 1)} className="flex size-6 items-center justify-center rounded border border-[var(--student-hairline)] bg-[var(--student-canvas-soft)] text-xs font-bold text-[var(--student-ink)]">−</button>
              <span className="w-6 text-center text-xs font-semibold tabular-nums">{line.qty}</span>
              <button type="button" disabled={atCap} title={atCap ? `单个笼位最多放 ${maxQtyPerCage} 只` : undefined} onClick={() => onQtyChange(line, line.qty + 1)} className="flex size-6 items-center justify-center rounded bg-[var(--student-primary)] text-xs font-bold text-white disabled:bg-slate-300">+</button>
            </div>
          ) : (
            <span className="shrink-0 text-xs font-semibold tabular-nums">×{line.qty}</span>
          )}
        </div>
      );
    }

    return (
      <div key={line.key} className="rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] p-2">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-[var(--twin-ink)]">{line.itemLabel}</div>
            <div className="mt-0.5 text-[11px] text-[var(--twin-mute)]">
              {line.specLabel && <span>{line.specLabel}</span>}
              {line.deliveryCycle && <span className="ml-1 text-sky-700">到货 {line.deliveryCycle}</span>}
              <span className="ml-1 rounded bg-slate-200/80 px-1 py-0.5 text-[10px]">{badge}</span>
            </div>
            {price && <div className="mt-0.5 text-[10px] font-semibold text-sky-700">{price}</div>}
            {(line.targetCageLabel || line.targetCageLocation?.shelveId) && (
              <div className="mt-0.5">
                <CageLocationCell
                  label={line.targetCageLabel}
                  location={line.targetCageLocation}
                  onLocate={
                    onLocateCage && line.targetAnimalCageId != null
                      ? () => onLocateCage(String(line.targetAnimalCageId))
                      : undefined
                  }
                  className="text-[10px] text-[var(--twin-body)]"
                />
              </div>
            )}
            {(line.pickupRoomName || line.collectorName) && (
              <div className="mt-0.5 truncate text-[10px] text-[var(--twin-mute)]">
                {line.pickupRoomName ? `领用房间：${line.pickupRoomName}` : ""}
                {line.pickupRoomName && line.collectorName ? " · " : ""}
                {line.collectorName ? `领用人：${line.collectorName}` : ""}
              </div>
            )}
          </div>
          {canEdit ? (
            <div className="flex shrink-0 items-center gap-0.5">
              <button type="button" onClick={() => onQtyChange(line, line.qty - 1)} className="h-6 w-6 rounded border border-[var(--twin-hairline)] bg-white text-xs">−</button>
              <span className="w-8 text-center text-xs font-semibold tabular-nums">{line.qty}</span>
              <button type="button" disabled={atCap} title={atCap ? `单个笼位最多放 ${maxQtyPerCage} 只` : undefined} onClick={() => onQtyChange(line, line.qty + 1)} className="h-6 w-6 rounded bg-sky-600 text-xs font-bold text-white disabled:bg-slate-300">+</button>
            </div>
          ) : (
            <span className="shrink-0 text-xs font-semibold tabular-nums">×{line.qty}</span>
          )}
        </div>
        {line.remark && (
          <div className="mt-1 truncate text-[10px] text-[var(--twin-ink)]">备注：{line.remark}</div>
        )}
        {line.packageRemark && (
          <div className="mt-1 truncate text-[10px] text-[var(--twin-mute)]">包备注：{line.packageRemark}</div>
        )}
      </div>
    );
  };

  const groupTitleClass = mobile
    ? "text-[11px] font-semibold text-[var(--student-ink)]"
    : "text-[11px] font-semibold text-sky-700";

  const subTitleClass = mobile ? "text-[10px] text-[var(--student-mute)]" : "text-[10px] text-[var(--twin-mute)]";

  const tabCls = (on: boolean) =>
    mobile
      ? `rounded-[var(--student-radius-sm)] px-3 py-1 text-xs font-medium ${on ? "bg-[var(--student-primary)] text-[var(--student-primary-foreground)]" : "border border-[var(--student-hairline)] bg-[var(--student-canvas-soft)] text-[var(--student-body)]"}`
      : `rounded-twin-sm px-3 py-1 text-xs font-medium ${on ? "bg-sky-600 text-white" : "border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] text-[var(--twin-body)]"}`;

  return (
    <>
      {lines.length > 0 && (
        <div className="mb-2 flex gap-1">
          <button type="button" className={tabCls(tab === "current")} onClick={() => setTab("current")}>
            本周期 ({currentLines.length})
          </button>
          <button type="button" className={tabCls(tab === "preorder")} onClick={() => setTab("preorder")}>
            预约 ({preorderLines.length})
          </button>
        </div>
      )}

      {isPi && !hideModeToggle && (
        <div className="mb-2">
          <CartTreeModeToggle mode={mode} onChange={setMode} mobile={mobile} />
        </div>
      )}

      {lines.length === 0 ? (
        <div className={`text-center text-xs ${mobile ? "py-8 text-[var(--student-mute)]" : "py-6 text-[var(--twin-mute)]"}`}>
          共享购物车是空的
        </div>
      ) : visibleLines.length === 0 ? (
        <div className={`text-center text-xs ${mobile ? "py-8 text-[var(--student-mute)]" : "py-6 text-[var(--twin-mute)]"}`}>
          {tab === "preorder" ? "暂无预约行" : "暂无本周期行"}
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => (
            /* 移动端：一个分组一张卡（白底 + 圆角 + 微投影），与物品列表/侧栏同一套立体语言；
               行本身照小程序保持平铺紧凑（py-1.5、不加分隔线），不在行上再加卡片 */
            <div
              key={g.key}
              className={
                mobile
                  ? "space-y-1.5 rounded-[var(--student-radius-md)] bg-[var(--student-surface)] p-3 shadow-[0_2px_7px_rgba(15,23,42,0.06)]"
                  : "space-y-1.5"
              }
            >
              <div className={groupTitleClass}>{g.title}</div>
              {g.subGroups.map((sg) => (
                <div key={sg.key} className="space-y-1 pl-2">
                  <div className={subTitleClass}>{sg.title}</div>
                  {sg.lines.map(renderLine)}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
