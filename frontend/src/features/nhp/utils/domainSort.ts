/**
 * 域/子模块/字段编码：稳定 id 比较 + 展示序。
 *
 * Dn（D1…D10）是表码/id，不是「第 N 步」；展示顺序优先用 sortOrder。
 * compareCodedId 仅作无 sortOrder 时的稳定兜底，勿当成业务流程序。
 */

/** 从 "D1" / "DD10" / "monkey__D1" / "D1.02" 取出首位数字（域或纯数字段） */
function segmentNum(seg: string): number | null {
  const s = String(seg ?? "").trim();
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  // 套作用域原子码：monkey__D10 → D10（与后端 CodedIdOrder 对齐）
  const us = s.lastIndexOf("__");
  const domainPart = us >= 0 ? s.slice(us + 2) : s;
  const m = domainPart.match(/^D+(\d+)$/i);
  return m ? parseInt(m[1], 10) : null;
}

/** 从 "D1" / "DD10" / "monkey__D1" / "D1.02.003" 取出编码中的数字（仅作 id 排序兜底） */
export function domainNumericKey(code: string): number {
  const s = String(code ?? "").trim();
  const scoped = s.match(/__([Dd]+\d+)/);
  const m = (scoped ? scoped[1] : s).match(/^D+(\d+)/i);
  return m ? parseInt(m[1], 10) : 9999;
}

/** 按「.」分段比较：数字段按数值，其余按字典序（numeric）——稳定 id 列表，非业务流程 */
export function compareCodedId(a: string, b: string): number {
  const pa = String(a ?? "").split(".");
  const pb = String(b ?? "").split(".");
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    const sa = pa[i] ?? "";
    const sb = pb[i] ?? "";
    const na = segmentNum(sa);
    const nb = segmentNum(sb);
    if (na != null && nb != null && na !== nb) return na - nb;
    if (na != null && nb == null) return -1;
    if (na == null && nb != null) return 1;
    const c = sa.localeCompare(sb, undefined, { numeric: true, sensitivity: "base" });
    if (c !== 0) return c;
  }
  return 0;
}

export function compareDomainCodes(a: string, b: string): number {
  const na = domainNumericKey(a);
  const nb = domainNumericKey(b);
  if (na !== nb) return na - nb;
  return String(a).localeCompare(String(b), undefined, { numeric: true });
}

/** 展示序：sortOrder 优先；缺省时用编码数值序兜底（仍标注为表码，非步骤） */
export function compareBySortOrder(
  a: { code?: string; sortOrder?: number | null },
  b: { code?: string; sortOrder?: number | null },
): number {
  const ao = a.sortOrder;
  const bo = b.sortOrder;
  const aHas = ao != null && Number.isFinite(ao);
  const bHas = bo != null && Number.isFinite(bo);
  if (aHas && bHas && ao !== bo) return (ao as number) - (bo as number);
  if (aHas && !bHas) return -1;
  if (!aHas && bHas) return 1;
  return compareCodedId(a.code ?? "", b.code ?? "");
}

type SortableField = { fieldKey?: string; sortOrder?: number };
type SortableSub = { code: string; sortOrder?: number; fields?: SortableField[] };
type SortableSec = {
  code: string;
  sortOrder?: number;
  subsections?: SortableSub[];
  fields?: SortableField[];
};

/** 模板 Section / SubSection / Field：展示序优先 sortOrder，编码仅兜底 */
export function sortSectionsByDomainCode<T extends SortableSec>(sections: T[]): T[] {
  return [...sections]
    .map((sec) => {
      const subsections = sec.subsections
        ? [...sec.subsections]
            .map((sub) => ({
              ...sub,
              fields: sub.fields
                ? [...sub.fields].sort((a, b) => {
                    const so = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
                    if (so !== 0) return so;
                    return compareCodedId(a.fieldKey ?? "", b.fieldKey ?? "");
                  })
                : sub.fields,
            }))
            .sort((a, b) => compareBySortOrder(a, b))
        : sec.subsections;
      const fields = sec.fields
        ? [...sec.fields].sort((a, b) => {
            const so = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
            if (so !== 0) return so;
            return compareCodedId(a.fieldKey ?? "", b.fieldKey ?? "");
          })
        : sec.fields;
      return { ...sec, subsections, fields };
    })
    .sort((a, b) => compareBySortOrder(a, b)) as T[];
}
