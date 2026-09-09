/**
 * 选项编辑：手动填写（对齐 AUP OptionsEditor + 设计 15）。
 */
import { move, normalizeOptions } from "../store/editorUtils";
import type { ChoiceType, FormField, OptionItem } from "../schema/formTemplate";

interface Props {
  options: FormField["options"];
  onChange: (patch: { options?: FormField["options"] }) => void;
  editable?: boolean;
  /** 提供后（choice 题）渲染「正确答案」单选/复选控件 */
  choiceType?: ChoiceType;
  answer?: string | string[];
  onAnswerChange?: (answer: string | string[]) => void;
}

export default function OptionsEditor({
  options,
  onChange,
  editable = true,
  choiceType = "single",
  answer,
  onAnswerChange,
}: Props) {
  const opts = normalizeOptions(options) as OptionItem[];
  const multiple = choiceType === "multiple";
  const answerArr = multiple ? (Array.isArray(answer) ? answer : answer ? [answer] : []) : [];

  const setOpts = (next: OptionItem[]) => onChange({ options: next });

  const isCorrect = (v: string) => (multiple ? answerArr.includes(v) : answer === v);

  const toggleAnswer = (v: string) => {
    if (!onAnswerChange) return;
    if (multiple) {
      onAnswerChange(answerArr.includes(v) ? answerArr.filter((x) => x !== v) : [...answerArr, v]);
    } else {
      onAnswerChange(v);
    }
  };

  return (
    <div>
      {opts.map((o, i) => (
        <div key={i} className="aup-opt-row">
          {onAnswerChange && (
            <input
              type={multiple ? "checkbox" : "radio"}
              name={multiple ? undefined : "correct-answer"}
              className="aup-answer-mark"
              title="正确答案"
              checked={isCorrect(o.value)}
              disabled={!editable}
              onChange={() => toggleAnswer(o.value)}
            />
          )}
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
