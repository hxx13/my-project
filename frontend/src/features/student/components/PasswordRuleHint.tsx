import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PASSWORD_CATEGORY_LABELS,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_CATEGORIES,
  PASSWORD_MIN_LENGTH,
  passwordCategoriesMet,
} from "@/utils/passwordPolicy";

const CATEGORY_ORDER = ["lowercase", "uppercase", "digit", "special"] as const;

/**
 * 密码规则提示：把「要凑哪几类字符」摆在输入框下面实时打勾。
 *
 * <p>取代原来那句「至少 6 位」——后端实际要求 8 位起、且四类字符至少三类，
 * 只写长度会让用户填完才发现被拒。规则本身来自 {@code utils/passwordPolicy}。
 */
export function PasswordRuleHint({ password }: { password: string }) {
  const met = passwordCategoriesMet(password);
  const lengthOk = password.trim().length >= PASSWORD_MIN_LENGTH && password.trim().length <= PASSWORD_MAX_LENGTH;
  const metCount = CATEGORY_ORDER.filter((k) => met[k]).length;

  const items = [
    { key: "length", label: `${PASSWORD_MIN_LENGTH}-${PASSWORD_MAX_LENGTH} 位`, ok: lengthOk },
    ...CATEGORY_ORDER.map((k) => ({ key: k, label: PASSWORD_CATEGORY_LABELS[k], ok: met[k] })),
  ];

  return (
    <div className="mt-2 rounded-[var(--student-radius-sm)] bg-[var(--student-canvas-soft)] px-3 py-2">
      <p className="text-xs text-[var(--student-mute)]">
        四类字符里至少凑够 {PASSWORD_MIN_CATEGORIES} 类（已满足 {metCount}/4）
      </p>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
        {items.map((item) => (
          <span
            key={item.key}
            className={cn(
              "inline-flex items-center gap-1 text-xs transition-colors",
              item.ok ? "text-[var(--student-success)]" : "text-[var(--student-mute)]",
            )}
          >
            {item.ok ? (
              <Check className="h-3 w-3 shrink-0" />
            ) : (
              <span className="h-1 w-1 shrink-0 rounded-full bg-current" />
            )}
            {item.label}
          </span>
        ))}
      </div>
    </div>
  );
}
