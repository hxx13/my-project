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
}

export default function CartTree({ lines, isPi, currentUserId, onQtyChange, onLocateCage, layout = "desktop", maxQtyPerCage }: CartTreeProps) {
  const [mode, setMode] = useState<CartTreeMode>("aup-user-spec");
  const groups = useMemo(() => buildCartTree(lines, mode), [lines, mode]);
  const mobile = layout === "mobile";

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
      return (
        <div key={line.key} className="flex items-center gap-2 border-b border-[var(--student-hairline)] py-2.5 last:border-b-0">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-[var(--student-ink)]">{line.itemLabel}</p>
            <p className="mt-0.5 text-[11px] text-[var(--student-mute)]">
              {line.specLabel && <span>{line.specLabel} · </span>}
              <span className="rounded bg-[var(--student-canvas-soft)] px-1 py-0.5 text-[10px]">{badge}</span>
            </p>
            {price && <p className="mt-0.5 text-[10px] font-semibold text-sky-700">{price}</p>}
            {(line.pickupRoomName || line.collectorName) && (
              <p className="mt-0.5 truncate text-[10px] text-[var(--student-mute)]">
                {line.pickupRoomName ? `房间 ${line.pickupRoomName}` : ""}
                {line.pickupRoomName && line.collectorName ? " · " : ""}
                {line.collectorName ? `领用人 ${line.collectorName}` : ""}
              </p>
            )}
            {line.remark && (
              <p className="mt-0.5 truncate text-[10px] text-[var(--student-ink)]">备注：{line.remark}</p>
            )}
            {line.packageRemark && (
              <p className="mt-0.5 truncate text-[10px] text-[var(--student-mute)]">包备注：{line.packageRemark}</p>
            )}
          </div>
          {canEdit ? (
            <div className="flex shrink-0 items-center gap-1">
              <button type="button" onClick={() => onQtyChange(line, line.qty - 1)} className="size-6 rounded border border-[var(--student-hairline)] bg-[var(--student-canvas-soft)] text-xs font-bold text-[var(--student-ink)]">−</button>
              <span className="w-6 text-center text-xs font-semibold tabular-nums">{line.qty}</span>
              <button type="button" disabled={atCap} title={atCap ? `单个笼位最多放 ${maxQtyPerCage} 只` : undefined} onClick={() => onQtyChange(line, line.qty + 1)} className="size-6 rounded bg-[var(--student-primary)] text-xs font-bold text-white disabled:bg-slate-300">+</button>
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

  const toggleClass = (on: boolean) =>
    mobile
      ? `rounded-full px-2.5 py-0.5 text-[10px] ${on ? "bg-[var(--student-primary)] text-white" : "border border-[var(--student-hairline)] text-[var(--student-mute)]"}`
      : `rounded-full px-2.5 py-0.5 text-[10px] ${on ? "bg-sky-600 text-white" : "border border-[var(--twin-hairline)] text-[var(--twin-mute)]"}`;

  const groupTitleClass = mobile
    ? "text-[11px] font-semibold text-[var(--student-ink)]"
    : "text-[11px] font-semibold text-sky-700";

  const subTitleClass = mobile ? "text-[10px] text-[var(--student-mute)]" : "text-[10px] text-[var(--twin-mute)]";

  return (
    <>
      {isPi && (
        <div className="mb-2 flex gap-1">
          <button type="button" className={toggleClass(mode === "aup-user-spec")} onClick={() => setMode("aup-user-spec")}>
            AUP→实验员
          </button>
          <button type="button" className={toggleClass(mode === "spec-user")} onClick={() => setMode("spec-user")}>
            规格→实验员
          </button>
        </div>
      )}

      {lines.length === 0 ? (
        <div className={`text-center text-xs ${mobile ? "py-8 text-[var(--student-mute)]" : "py-6 text-[var(--twin-mute)]"}`}>
          共享购物车是空的
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => (
            <div key={g.key} className="space-y-1.5">
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
