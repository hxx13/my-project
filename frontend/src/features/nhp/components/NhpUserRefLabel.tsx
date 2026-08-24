/**
 * 人员展示：仅显示中文姓名；无法解析姓名时降级显示用户 ID。
 * 用于留痕、快照等处的操作人 / 创建人。
 */
type Props = {
  name?: string | null;
  userId?: string | null;
  /** 如「操作人」；渲染为「操作人：」前缀 */
  prefix?: string;
  className?: string;
  inline?: boolean;
  /** 管理调试：同时显示 ID 徽标（默认仅姓名） */
  showId?: boolean;
};

export default function NhpUserRefLabel({ name, userId, prefix, className, inline, showId = false }: Props) {
  const id = (userId || "").trim();
  const rawName = (name || "").trim();
  const displayName = rawName && rawName !== id ? rawName : "";
  if (!displayName && !id) return null;

  const body = (
    <>
      {displayName ? <b>{displayName}</b> : <b>{id}</b>}
      {showId && displayName && id ? (
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

/** 纯文本：姓名；无法解析时仅 id */
export function formatUserRefText(name?: string | null, userId?: string | null, showId = false): string {
  const id = (userId || "").trim();
  const rawName = (name || "").trim();
  const displayName = rawName && rawName !== id ? rawName : "";
  if (showId && displayName && id) return `${displayName} · ${id}`;
  return displayName || id || "";
}
