import { createPortal } from "react-dom";
import { ANIMAL_ORDER_CAMPUSES, type AnimalOrderCampus } from "./campus";

/** 动物订购入口的校区门禁：未选校区前不渲染业务内容。 */
export default function CampusGate({ onSelect }: { onSelect: (campus: AnimalOrderCampus) => void }) {
  return createPortal(
    <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-twin-xl border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-6 shadow-twin-level-4">
        <div className="text-base font-semibold text-[var(--twin-ink)]">请选择校区</div>
        <div className="mt-1 text-xs leading-relaxed text-[var(--twin-mute)]">
          可购时间、预计送达与订单归属均按校区区分，请先选择进入的校区。
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          {ANIMAL_ORDER_CAMPUSES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => onSelect(c)}
              className="rounded-twin-md border border-sky-300 bg-sky-50 py-4 text-sm font-semibold text-sky-700 transition-colors hover:bg-sky-100"
            >
              {c}校区
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
