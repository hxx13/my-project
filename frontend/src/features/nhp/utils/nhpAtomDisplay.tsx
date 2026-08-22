/**
 * 数据域原子展示：中文文件夹名为主，Dn 编码为次要 id 徽标。
 * 与 NhpFieldPage / NhpSectionNav 的 folderDisplayName + id chip 模式一致。
 */
import type { ReactNode } from "react";
import { isBlankOrSameAsCode, resolveSectionZhName } from "./nhpSectionTitle";

export type AtomPickLike = {
  atomCode: string;
  version?: number | null;
  title?: string | null;
};

export function folderDisplayName(code: string, zh: string): string {
  return zh ? zh : code;
}

export function resolveAtomZhName(
  code: string,
  title?: string | null,
  nameMap?: Record<string, string> | null,
): string {
  return resolveSectionZhName(code, title, nameMap);
}

/** 字典 structure.domains → code→中文名 */
export function buildDomainNameMap(
  domains?: { code: string; name?: string }[] | null,
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const d of domains ?? []) {
    const code = (d.code || "").trim();
    const name = (d.name || "").trim();
    if (code && name && !isBlankOrSameAsCode(code, name)) {
      map[code] = name;
    }
  }
  return map;
}

/** 纯文本：「供体猪域 · D1@v3」；无中文时降级为「D1@v3」 */
export function formatAtomPickText(
  pick: AtomPickLike,
  nameMap?: Record<string, string> | null,
): string {
  const code = pick.atomCode;
  const zh = resolveAtomZhName(code, pick.title, nameMap);
  const ver = pick.version != null ? `@v${pick.version}` : "";
  if (zh && !isBlankOrSameAsCode(code, zh)) {
    return `${zh} · ${code}${ver}`;
  }
  return `${code}${ver}`;
}

export function formatAtomPicksText(
  picks: AtomPickLike[],
  nameMap?: Record<string, string> | null,
  sep = " · ",
): string {
  return picks.map((p) => formatAtomPickText(p, nameMap)).join(sep);
}

export function AtomCodeChip({ code }: { code: string }) {
  return (
    <span
      className="aup-wb-chip muted nhp-atom-code-chip"
      style={{ fontFamily: "ui-monospace, monospace", fontSize: 10 }}
    >
      {code}
    </span>
  );
}

/** 行内：中文名 + 可选 Dn 徽标 + 可选版本 */
export function AtomPickInline({
  pick,
  nameMap,
}: {
  pick: AtomPickLike;
  nameMap?: Record<string, string> | null;
}) {
  const code = pick.atomCode;
  const zh = resolveAtomZhName(code, pick.title, nameMap);
  const showChip = !!zh && !isBlankOrSameAsCode(code, zh);
  const ver = pick.version != null ? `v${pick.version}` : null;
  return (
    <span className="nhp-atom-pick-inline">
      <span className="nhp-atom-pick-name">{folderDisplayName(code, zh)}</span>
      {showChip ? <AtomCodeChip code={code} /> : null}
      {ver ? <span className="nhp-atom-pick-ver">{ver}</span> : null}
    </span>
  );
}

export function AtomPickList({
  picks,
  nameMap,
  sep = " · ",
}: {
  picks: AtomPickLike[];
  nameMap?: Record<string, string> | null;
  sep?: ReactNode;
}) {
  if (!picks.length) return null;
  return (
    <span className="nhp-atom-pick-list">
      {picks.map((pick, i) => (
        <span key={`${pick.atomCode}-${pick.version ?? i}`} className="nhp-atom-pick-list-item">
          {i > 0 ? sep : null}
          <AtomPickInline pick={pick} nameMap={nameMap} />
        </span>
      ))}
    </span>
  );
}
