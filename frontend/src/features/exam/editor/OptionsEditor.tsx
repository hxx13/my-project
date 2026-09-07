/**
 * 选项编辑：手动填写（对齐 AUP OptionsEditor + 设计 15）。
 */
import { move, normalizeOptions } from "../store/editorUtils";
import type { FormField, OptionItem } from "../schema/formTemplate";

interface Props {
  options: FormField["options"];
  onChange: (patch: { options?: FormField["options"] }) => void;
  editable?: boolean;
}

export default function OptionsEditor({ options, onChange, editable = true }: Props) {
  const opts = normalizeOptions(options) as OptionItem[];

  const setOpts = (next: OptionItem[]) => onChange({ options: next });

  return (
    <div>
      {opts.map((o, i) => (
        <div key={i} className="aup-opt-row">
          <input
            className="aup-input"
            placeholder="选项文字"
            value={o.label}
            disabled={!editable}
            onChange={(e) => {
              const text = e.target.value;
              setOpts(opts.map((x, j) => (j === i ? { value: text, label: text, fixed: x.fixed, group: x.group } : x)));
            }}
          />
          <input
            className="aup-input"
            style={{ width: 100, flex: "0 0 100px" }}
            placeholder="分组"
            value={o.group ?? ""}
            disabled={!editable}
            onChange={(e) =>
              setOpts(opts.map((x, j) => (j === i ? { ...x, group: e.target.value || undefined } : x)))
            }
          />
          <button type="button" className="aup-iconbtn" disabled={!editable} onClick={() => setOpts(move(opts, i, -1))}>
            ↑
          </button>
          <button type="button" className="aup-iconbtn" disabled={!editable} onClick={() => setOpts(move(opts, i, 1))}>
            ↓
          </button>
          <button
            type="button"
            className="aup-iconbtn danger"
            disabled={!editable}
            onClick={() => setOpts(opts.filter((_, j) => j !== i))}
          >
            ×
          </button>
        </div>
      ))}
      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
        <button
          type="button"
          className="aup-btn small ghost"
          disabled={!editable}
          onClick={() => setOpts([...opts, { value: "", label: "" }])}
        >
          ＋ 选项
        </button>
        <button
          type="button"
          className="aup-btn small ghost"
          disabled={!editable}
          onClick={() => setOpts([{ value: "是", label: "是" }, { value: "否", label: "否" }])}
        >
          ⚡ 是/否
        </button>
      </div>
    </div>
  );
}
