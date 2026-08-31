/**
 * NHP 章节标题：中文名 + 编码各出现一次，避免「DD3 DD3」。
 * DD* 与 D* 均可回退到猪套域名字典（按数字段对齐）。
 */

/** 猪套临床域显示名（与后端 NhpTemplateService.DOMAIN_LABELS 对齐） */
export const NHP_DOMAIN_LABELS: Record<string, string> = {
  D1: "供体猪域",
  D2: "受体猴域",
  D3: "配型与手术域",
  D4: "样本与检测域",
  D5: "随访与事件域",
  D6: "免疫抑制用药域",
  D7: "麻醉术中监护域",
  D8: "病理诊断域",
  D9: "心脏移植模块",
  D10: "体外肝灌注模块",
  D11: "公共数据层",
  D12: "标准与版本域",
  D13: "用户与权限域",
};

/** DD3 / DDD10 → D3 / D10，便于查字典；非法则原样大写 */
export function canonicalDomainCode(code: string | null | undefined): string {
  const raw = String(code ?? "").trim().toUpperCase();
  if (!raw) return "";
  const bare = raw.includes("__") ? raw.slice(raw.lastIndexOf("__") + 2) : raw;
  const multi = bare.match(/^D{2,}(\d{1,3})(\..*)?$/i);
  if (multi) return `D${multi[1]}${multi[2] ?? ""}`;
  return bare;
}

function domainLookupKey(code: string): string {
  const c = canonicalDomainCode(code);
  const m = c.match(/^(D\d+)/i);
  return m ? m[1].toUpperCase() : c;
}

/** label 是否无信息量（空 / 等于 code / 仅重复编码） */
export function isBlankOrSameAsCode(
  code: string | null | undefined,
  label: string | null | undefined,
): boolean {
  const c = String(code ?? "").trim();
  const l = String(label ?? "").trim();
  if (!l) return true;
  if (!c) return false;
  if (l === c) return true;
  const cu = c.toUpperCase();
  const lu = l.toUpperCase();
  if (lu === cu) return true;
  // 「DD3 DD3」整串
  if (lu === `${cu} ${cu}`) return true;
  return false;
}

/**
 * 解析章节中文名：优先模板 label；否则域名字典；再否则空（调用方只显示编码）。
 */
export function resolveSectionZhName(
  code: string | null | undefined,
  label: string | null | undefined,
  nameMap?: Record<string, string> | null,
): string {
  const c = String(code ?? "").trim();
  const l = String(label ?? "").trim();
  if (c && !isBlankOrSameAsCode(c, l)) {
    // label 已带 code 前缀时去掉，避免再拼编码
    if (l.startsWith(c + "：") || l.startsWith(c + ":") || l.startsWith(c + " ")) {
      return l.slice(c.length).replace(/^[\s：:·\-]+/, "").trim() || l;
    }
    return l;
  }
  const keys = [c, canonicalDomainCode(c), domainLookupKey(c)].filter(Boolean);
  for (const k of keys) {
    const fromMap = nameMap?.[k] ?? nameMap?.[k.toUpperCase()];
    if (fromMap && !isBlankOrSameAsCode(k, fromMap)) return fromMap.trim();
  }
  for (const k of keys) {
    const fromDict = NHP_DOMAIN_LABELS[domainLookupKey(k)];
    if (fromDict) return fromDict;
  }
  return "";
}

/** 纯文本标题（主内容 h2 / 无 JSX 处）：「中文名 · CODE」或仅 CODE */
export function formatSectionTitle(
  code: string | null | undefined,
  label: string | null | undefined,
  nameMap?: Record<string, string> | null,
): string {
  const c = String(code ?? "").trim();
  const zh = resolveSectionZhName(c, label, nameMap);
  if (zh && c) return `${zh} · ${c}`;
  return zh || c || "—";
}
