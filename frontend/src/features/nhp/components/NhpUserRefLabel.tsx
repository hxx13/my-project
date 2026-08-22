/**
 * 人员展示：姓名为主，用户 ID 为次要 monospace 徽标（与域码 Dn 徽标模式一致）。
 * 用于留痕、快照等处的操作人 / 创建人。
 */
type Props = {
  name?: string | null;
  userId?: string | null;
  /** 如「操作人」；渲染为「操作人：」前缀 */
  prefix?: string;
  className?: string;
  inline?: boolean;
};

export default function NhpUserRefLabel({ name, userId, prefix, className, inline }: Props) {
  const id = (userId || "").trim();
  const rawName = (name || "").trim();
  const displayName = rawName && rawName !== id ? rawName : "";
  if (!displayName && !id) return null;

  const body = (
    <>
      {displayName ? <b>{displayName}</b> : <b>{id}</b>}
      {displayName && id ? (
        <span
          className="aup-wb-chip muted nhp-user-id-chip"
          style={{ marginLeft: 6, fontFamily: "ui-monospace, monospace", fontSize: 10 }}
        >
          {id}
        </span>
      ) : null}
    </>
  );

  if (inline) {
    return (
      <span className={className}>
        {prefix ? `${prefix}：` : null}
        {body}
      </span>
    );
  }

  return (
    <span className={className}>
      {prefix ? `${prefix}：` : null}
      {body}
    </span>
  );
}

/** 纯文本：「张三 · uid」或仅 id */
export function formatUserRefText(name?: string | null, userId?: string | null): string {
  const id = (userId || "").trim();
  const rawName = (name || "").trim();
  const displayName = rawName && rawName !== id ? rawName : "";
  if (displayName && id) return `${displayName} · ${id}`;
  return displayName || id || "";
}
