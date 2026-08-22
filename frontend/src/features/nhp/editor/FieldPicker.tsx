/**
 * 从字典选字段：左栏域/子模块文件夹树 → 选字段 → 答题方式。
 */
import { useEffect, useMemo, useState } from "react";
import { fetchNhpDictStructure } from "../api/nhpFieldDictionary.api";
import { fetchNhpFieldDictionaries, type NhpFieldDictionary } from "../api/nhpFieldDictionary.api";
import { fetchNhpFields, type NhpField } from "../api/nhpField.api";
import { compatibleTypesFor, typeMetaOf } from "../schema/typeRegistry";
import type { FieldType } from "../schema/formTemplate";
import { compareBySortOrder } from "../utils/domainSort";
import { isBlankOrSameAsCode } from "../utils/nhpSectionTitle";

interface Props {
  onPick: (field: NhpField, type: FieldType) => void;
  onClose: () => void;
  /** 默认数据域套（与编辑器/章节上下文对齐） */
  defaultDictKey?: string;
  /** 仅展示该数据域下的字段（章节码如 D3） */
  filterDomainCode?: string;
}

function domainOf(fieldCode: string): string {
  const m = fieldCode?.match(/^(D+\d+)/i);
  return m ? m[1].toUpperCase() : "其它";
}

function submoduleOf(fieldCode: string): string {
  const m = fieldCode?.match(/^(D+\d+\.\d+)/i);
  return m ? m[1].toUpperCase() : "未分子模块";
}

export default function FieldPicker({ onPick, onClose, defaultDictKey = "pig", filterDomainCode }: Props) {
  const [dicts, setDicts] = useState<NhpFieldDictionary[]>([]);
  const [dictKey, setDictKey] = useState<string>(defaultDictKey);
  const [fields, setFields] = useState<NhpField[]>([]);
  const [structureDomains, setStructureDomains] = useState<
    { code: string; name?: string; sortOrder?: number; submodules?: { code: string; name?: string; sortOrder?: number }[] }[]
  >([]);
  const [collapsedDomain, setCollapsedDomain] = useState<Set<string>>(new Set());
  const [collapsedSub, setCollapsedSub] = useState<Set<string>>(new Set());
  const [selField, setSelField] = useState<NhpField | null>(null);
  const [selType, setSelType] = useState<FieldType | "">("");

  useEffect(() => {
    fetchNhpFieldDictionaries().then((rows) => {
      setDicts(rows ?? []);
      const preferred = defaultDictKey || rows?.[0]?.dictKey || "pig";
      if (rows?.length && !rows.some((d) => d.dictKey === dictKey)) {
        setDictKey(preferred);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultDictKey]);

  useEffect(() => {
    if (defaultDictKey) setDictKey(defaultDictKey);
  }, [defaultDictKey]);

  useEffect(() => {
    if (!dictKey) return;
    setSelField(null);
    setSelType("");
    void fetchNhpFields(undefined, { dictKey }).then((rows) => setFields(rows ?? []));
    void fetchNhpDictStructure(dictKey).then((s) => {
      let domains = [...(s?.domains ?? [])].sort(compareBySortOrder);
      if (filterDomainCode) {
        const fc = filterDomainCode.toUpperCase();
        domains = domains.filter((d) => d.code.toUpperCase() === fc);
      }
      setStructureDomains(domains);
      if (filterDomainCode) {
        setCollapsedDomain(new Set());
        setCollapsedSub(new Set());
      }
    });
  }, [dictKey, filterDomainCode]);

  const domainZhName = (code: string) => {
    const raw = (structureDomains.find((d) => d.code === code)?.name || "").trim();
    return isBlankOrSameAsCode(code, raw) ? "" : raw;
  };

  const submoduleZhName = (code: string) => {
    for (const d of structureDomains) {
      const hit = (d.submodules ?? []).find((s) => s.code === code);
      if (hit) {
        const raw = (hit.name || "").trim();
        return isBlankOrSameAsCode(code, raw) ? "" : raw;
      }
    }
    return "";
  };

  const folderLabel = (code: string, zh: string) => (zh ? zh : code);

  const grouped = useMemo(() => {
    const domainMap = new Map<string, Map<string, NhpField[]>>();
    const domainMeta = new Map<string, { sortOrder?: number }>();
    const subMeta = new Map<string, { sortOrder?: number }>();

    for (const d of structureDomains) {
      const code = (d.code || "").toUpperCase();
      if (!code) continue;
      domainMeta.set(code, { sortOrder: d.sortOrder });
      if (!domainMap.has(code)) domainMap.set(code, new Map());
      const subMap = domainMap.get(code)!;
      for (const s of d.submodules ?? []) {
        const sc = (s.code || "").toUpperCase();
        if (sc && !subMap.has(sc)) subMap.set(sc, []);
        if (sc) subMeta.set(sc, { sortOrder: s.sortOrder });
      }
    }

    for (const f of fields) {
      const d = domainOf(f.fieldCode);
      const s = submoduleOf(f.fieldCode);
      if (filterDomainCode && d !== filterDomainCode.toUpperCase()) continue;
      if (!domainMap.has(d)) domainMap.set(d, new Map());
      const sub = domainMap.get(d)!;
      if (!sub.has(s)) sub.set(s, []);
      sub.get(s)!.push(f);
    }

    return Array.from(domainMap.entries())
      .map(([dom, subs]) => {
        const sortedSubs = new Map(
          Array.from(subs.entries())
            .map(([sub, list]) => [sub, [...list].sort((a, b) => a.fieldCode.localeCompare(b.fieldCode, undefined, { numeric: true }))] as const)
            .sort((a, b) =>
              compareBySortOrder(
                { code: a[0], sortOrder: subMeta.get(a[0])?.sortOrder },
                { code: b[0], sortOrder: subMeta.get(b[0])?.sortOrder },
              ),
            ),
        );
        return [dom, sortedSubs] as [string, Map<string, NhpField[]>];
      })
      .sort((a, b) =>
        compareBySortOrder(
          { code: a[0], sortOrder: domainMeta.get(a[0])?.sortOrder },
          { code: b[0], sortOrder: domainMeta.get(b[0])?.sortOrder },
        ),
      );
  }, [fields, structureDomains, filterDomainCode]);

  const compatible = useMemo(
    () => (selField ? compatibleTypesFor(selField.dataType) : []),
    [selField],
  );

  const toggleDomain = (code: string) => {
    setCollapsedDomain((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const toggleSub = (key: string) => {
    setCollapsedSub((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="aup-type-mask" onClick={onClose}>
      <div
        className="aup-type-menu nhp-field-picker"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 680, width: "min(680px, 96vw)" }}
      >
        <div className="aup-type-menu-hd">
          <span>从字典选字段</span>
          <button type="button" className="aup-iconbtn" onClick={onClose} title="关闭">
            ×
          </button>
        </div>

        <div className="aup-row">
          <label>数据域套</label>
          <select
            className="aup-select"
            value={dictKey}
            onChange={(e) => setDictKey(e.target.value)}
          >
            {dicts.map((d) => (
              <option key={d.dictKey} value={d.dictKey}>
                {d.name || d.dictKey}
              </option>
            ))}
          </select>
        </div>

        <div className="nhp-field-picker-body">
          <aside className="nhp-field-picker-tree">
            {grouped.length === 0 ? (
              <div className="nhp-field-picker-empty">本套暂无字段</div>
            ) : (
              grouped.map(([dom, subs]) => {
                const domCollapsed = collapsedDomain.has(dom);
                const domZh = domainZhName(dom);
                return (
                  <div key={dom}>
                    <button type="button" className="nhp-field-picker-folder" onClick={() => toggleDomain(dom)}>
                      <span className="chev">{domCollapsed ? "▸" : "▾"}</span>
                      <span className="name">{folderLabel(dom, domZh)}</span>
                      {domZh ? <span className="id">{dom}</span> : null}
                    </button>
                    {!domCollapsed &&
                      Array.from(subs.entries()).map(([sub, list]) => {
                        const subKey = `${dom}:${sub}`;
                        const subCollapsed = collapsedSub.has(subKey);
                        const subZh = submoduleZhName(sub);
                        return (
                          <div key={subKey}>
                            <button
                              type="button"
                              className="nhp-field-picker-folder sub"
                              onClick={() => toggleSub(subKey)}
                            >
                              <span className="chev">{subCollapsed ? "▸" : "▾"}</span>
                              <span className="name">{folderLabel(sub, subZh)}</span>
                              {subZh ? <span className="id">{sub}</span> : null}
                            </button>
                            {!subCollapsed &&
                              list.map((f) => (
                                <button
                                  key={f.fieldCode}
                                  type="button"
                                  className={`nhp-field-picker-field${selField?.fieldCode === f.fieldCode ? " on" : ""}`}
                                  onClick={() => {
                                    setSelField(f);
                                    setSelType("");
                                  }}
                                >
                                  <span className="lbl">{f.nameCn || f.nameEn}</span>
                                  <span className="code">{f.fieldCode}</span>
                                </button>
                              ))}
                          </div>
                        );
                      })}
                  </div>
                );
              })
            )}
          </aside>

          <div className="nhp-field-picker-side">
            {selField ? (
              <>
                <div className="nhp-field-picker-selected">
                  <div className="title">{selField.nameCn || selField.nameEn}</div>
                  <div className="meta">{selField.fieldCode} · {selField.dataType}</div>
                </div>
                <div className="aup-row">
                  <label>答题方式（受 {selField.dataType} 约束）</label>
                  <select
                    className="aup-select"
                    value={selType}
                    onChange={(e) => setSelType(e.target.value as FieldType)}
                  >
                    <option value="">— 选择答题方式 —</option>
                    {compatible.map((tv) => (
                      <option key={tv} value={tv}>
                        {typeMetaOf(tv)?.label ?? tv}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            ) : (
              <div className="nhp-field-picker-empty">从左侧文件夹逐级选择字段</div>
            )}
          </div>
        </div>

        <div className="aup-modal-foot" style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
          <button type="button" className="aup-btn" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className="aup-btn primary"
            disabled={!selField || !selType}
            onClick={() => selField && selType && onPick(selField, selType)}
          >
            加入题目
          </button>
        </div>
      </div>
    </div>
  );
}
