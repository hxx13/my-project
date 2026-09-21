import type { WebLoginCandidate } from "@/api/domains/auth.api";

/**
 * 手机号命中多个账号时的候选选择器。
 *
 * 后端在 `errorCode=MULTIPLE_ACCOUNTS` 时带回 candidates（历史数据里有手机号重号，
 * 例如同一个人的多个 ARO 账号共用一个手机号）。登录页据此让用户**自己挑**一个再重试，
 * 不替他猜——猜错了密码必然不匹配，用户只会看到莫名其妙的"账号或密码错误"。
 *
 * `tone` 只影响描边/文字配色，供深色门户与浅色学生端复用同一份逻辑。
 */
export default function AccountChooser({
  candidates,
  onPick,
  tone = "light",
}: {
  candidates: WebLoginCandidate[];
  onPick: (username: string) => void;
  tone?: "light" | "dark";
}) {
  const dark = tone === "dark";
  return (
    <div
      className={`rounded border p-3 ${
        dark ? "border-white/15 bg-black/25" : "border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)]"
      }`}
    >
      <p className={`mb-2 text-xs ${dark ? "text-white/60" : "text-[var(--twin-mute)]"}`}>
        该手机号绑定了 {candidates.length} 个账号，请选择要登录的账号：
      </p>
      <div className="flex flex-col gap-1.5">
        {candidates.map((c) => (
          <button
            key={c.username}
            type="button"
            onClick={() => onPick(c.username)}
            className={`flex items-center justify-between rounded border px-3 py-2 text-left text-sm ${
              dark
                ? "border-white/15 text-white/90 hover:bg-white/5"
                : "border-[var(--twin-hairline)] text-[var(--twin-body)] hover:bg-[var(--twin-canvas-soft-2)]"
            }`}
          >
            <span>{c.name || "(无姓名)"}</span>
            <span className={`text-xs ${dark ? "text-white/50" : "text-[var(--twin-mute)]"}`}>
              {c.username || "(无账号名)"}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
