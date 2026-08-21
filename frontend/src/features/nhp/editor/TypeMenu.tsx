/**
 * 题型选择菜单 + 复合模板（对齐 AUP TypeMenu）。
 */
import { TYPE_REGISTRY, FIELD_TYPE_GROUP_LABELS } from "../schema/typeRegistry";
import { FIELD_TEMPLATES, type FieldTemplate } from "../schema/fieldTemplates";
import type { FieldType } from "../schema/formTemplate";

interface Props {
  onPick: (t: FieldType) => void;
  onPickTemplate: (t: FieldTemplate) => void;
  onClose: () => void;
}

export default function TypeMenu({ onPick, onPickTemplate, onClose }: Props) {
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
        <div className="aup-type-tpl-hd">复合模板（一键插入整组题目）</div>
        <div className="aup-type-grid tpl">
          {FIELD_TEMPLATES.map((t) => (
            <button key={t.key} type="button" onClick={() => onPickTemplate(t)} title={t.desc}>
              <span className="tpl-name">
                <span className="aup-type-ic">{t.icon}</span>
                <span>{t.label}</span>
                <span className="cnt">{t.count} 项</span>
              </span>
              <span className="tpl-desc">{t.desc}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
