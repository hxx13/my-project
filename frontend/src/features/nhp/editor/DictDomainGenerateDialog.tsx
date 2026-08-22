/**
 * 从字典生成原子：先选数据域套 + 数据域，再调用 generateFromDict。
 */
import { useEffect, useMemo, useState } from "react";
import {
  fetchNhpDictStructure,
  fetchNhpFieldDictionaries,
  type NhpFieldDictionary,
} from "../api/nhpFieldDictionary.api";
import { compareBySortOrder } from "../utils/domainSort";
import { isBlankOrSameAsCode, NHP_DOMAIN_LABELS } from "../utils/nhpSectionTitle";

interface Props {
  initialDictKey?: string;
  initialDomainCode?: string | null;
  onConfirm: (dictKey: string, domainCode: string) => void;
  onClose: () => void;
  confirming?: boolean;
}

function domainLabel(code: string, name?: string): string {
  const raw = (name || "").trim();
  const zh = !isBlankOrSameAsCode(code, raw) ? raw : NHP_DOMAIN_LABELS[code] || "";
  return zh ? `${zh} · ${code}` : code;
}

export default function DictDomainGenerateDialog({
  initialDictKey = "pig",
  initialDomainCode,
  onConfirm,
  onClose,
  confirming,
}: Props) {
  const [dicts, setDicts] = useState<NhpFieldDictionary[]>([]);
  const [dictKey, setDictKey] = useState(initialDictKey);
  const [domains, setDomains] = useState<{ code: string; name?: string; sortOrder?: number }[]>([]);
  const [domainCode, setDomainCode] = useState((initialDomainCode || "").toUpperCase());

  useEffect(() => {
    void fetchNhpFieldDictionaries().then((rows) => {
      setDicts(rows ?? []);
      if (rows?.length && !rows.some((d) => d.dictKey === dictKey)) {
        setDictKey(rows[0].dictKey);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!dictKey) return;
    void fetchNhpDictStructure(dictKey).then((s) => {
      const next = [...(s?.domains ?? [])].sort(compareBySortOrder);
      setDomains(next);
      setDomainCode((prev) => {
        const hit = prev && next.some((d) => d.code.toUpperCase() === prev);
        if (hit) return prev;
        const initial = (initialDomainCode || "").toUpperCase();
        if (initial && next.some((d) => d.code.toUpperCase() === initial)) return initial;
        return next[0]?.code?.toUpperCase() ?? "";
      });
    });
  }, [dictKey, initialDomainCode]);

  const sortedDomains = useMemo(
    () =>
      [...domains].sort((a, b) =>
        compareBySortOrder(
          { code: a.code, sortOrder: a.sortOrder },
          { code: b.code, sortOrder: b.sortOrder },
        ),
      ),
    [domains],
  );

  return (
    <div className="aup-type-mask" onClick={() => !confirming && onClose()}>
      <div
        className="aup-type-menu nhp-field-picker"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 520, width: "min(520px, 96vw)" }}
      >
        <div className="aup-type-menu-hd">
          <span>从字典生成</span>
          <button type="button" className="aup-iconbtn" onClick={onClose} title="关闭" disabled={confirming}>
            ×
          </button>
        </div>

        <p className="aup-muted" style={{ margin: "0 0 12px", fontSize: 12, lineHeight: 1.5 }}>
          选择数据域套与数据域，将该域下全部已冻结字段生成到原子模板（域内一题一字段）。
        </p>

        <div className="aup-row">
          <label>数据域套</label>
          <select
            className="aup-select"
            value={dictKey}
            disabled={confirming}
            onChange={(e) => setDictKey(e.target.value)}
          >
            {dicts.map((d) => (
              <option key={d.dictKey} value={d.dictKey}>
                {d.name || d.dictKey}
              </option>
            ))}
          </select>
        </div>

        <div className="aup-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 6 }}>
          <label>数据域</label>
          {sortedDomains.length === 0 ? (
            <div className="nhp-field-picker-empty">本套尚无数据域，请先在字段字典页创建</div>
          ) : (
            <div className="nhp-field-picker-tree" style={{ maxHeight: 280, overflow: "auto" }}>
              {sortedDomains.map((d) => {
                const code = d.code.toUpperCase();
                const on = domainCode === code;
                return (
                  <button
                    key={code}
                    type="button"
                    className={`nhp-field-picker-field${on ? " on" : ""}`}
                    disabled={confirming}
                    onClick={() => setDomainCode(code)}
                  >
                    <span className="lbl">{domainLabel(code, d.name)}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="aup-modal-foot" style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
          <button type="button" className="aup-btn" onClick={onClose} disabled={confirming}>
            取消
          </button>
          <button
            type="button"
            className="aup-btn primary"
            disabled={confirming || !domainCode}
            onClick={() => domainCode && onConfirm(dictKey, domainCode)}
          >
            {confirming ? "生成中…" : "生成"}
          </button>
        </div>
      </div>
    </div>
  );
}
