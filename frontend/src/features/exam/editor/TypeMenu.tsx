/**
 * 题型选择菜单（对齐 AUP TypeMenu）。
 */
import { TYPE_REGISTRY, FIELD_TYPE_GROUP_LABELS } from "../schema/typeRegistry";
import type { FieldType } from "../schema/formTemplate";

interface Props {
  onPick: (t: FieldType) => void;
  onClose: () => void;
}

export default function TypeMenu({ onPick, onClose }: Props) {
  return (
    <div className="aup-type-mask" onClick={onClose}>
      <div className="aup-type-menu" onClick={(e) => e.stopPropagation()}>
        <div className="aup-type-menu-hd">
          <span>选择题目类型</span>
          <span className="aup-muted" style={{ fontWeight: 400 }}>
            点空白处或 Esc 关闭
          </span>
          <button type="button" className="aup-iconbtn" onClick={onClose} title="关闭">
            ×
          </button>
        </div>
        <div className="aup-type-grid">
          {TYPE_REGISTRY.map((t) => (
            <button key={t.value} type="button" onClick={() => onPick(t.value)} title={FIELD_TYPE_GROUP_LABELS[t.group]}>
              <span className="aup-type-ic">{t.icon}</span>
              <span>{t.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
