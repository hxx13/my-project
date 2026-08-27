import { useEffect, useId, useState, type JSX } from "react";
import { fetchDispositionStrategies, type DispositionStrategyMeta } from "@/api/domains/obligation.api";
import { InspectorGroup, InspectorRow } from "../shared/InspectorGroup";
import { BareInput, BareNumberWithUnit } from "../shared/BareControl";
import { MultiSelectField } from "../shared/MultiSelectField";
import { SelectField } from "../shared/SelectField";
import type { MultiSelectOption } from "../shared/multiSelectModel";
import { VIOLATION_FIELD_COPY, type ViolationFieldCopy } from "../violationsCopy";
import {
  DISPOSITION_FULL,
  DISPOSITION_STRATEGY_LABEL,
  ensureForbidForStrategy,
  registryDispositionType,
} from "./dispositionTypes";
import type {
  DispositionActionCode,
  DispositionCapability,
  DispositionStrategy,
  DispositionValue,
  ExpiryValue,
} from "./dispositionTypes";

/**
 * 抗返工插槽① · 期 3：策略选择器 + 策略自带 schema 字段。
 * props / dispositionTypes 导出契约不变。
 */

type DispositionFieldsSlotProps = {
  value: DispositionValue;
  onChange: (next: DispositionValue) => void;
  capability?: DispositionCapability;
  expiryMode?: "create" | "edit";
  disabled?: boolean;
  /** 提交失败后高亮未填必填项 */
  showValidation?: boolean;
  expiryCopy?: Partial<Pick<ViolationFieldCopy, "label" | "placeholder" | "hint">>;
};

const ACTION_OPTIONS: Record<DispositionActionCode, MultiSelectOption<DispositionActionCode>> = {
  forbid: { value: "forbid", label: VIOLATION_FIELD_COPY.forbidEnter.label, tone: "danger" },
  every: { value: "every", label: VIOLATION_FIELD_COPY.showNoticeEveryScan.label, tone: "default" },
  unlock: { value: "unlock", label: VIOLATION_FIELD_COPY.unlockOnVerify.label, tone: "info" },
};

const EXPIRY_EDIT_OPTIONS: { value: ExpiryValue["mode"]; label: string }[] = [
  { value: "KEEP", label: "保持不变" },
  { value: "CLEAR", label: "清除到期" },
  { value: "RELATIVE", label: "重新起算天数" },
];

const FALLBACK_STRATEGIES: DispositionStrategyMeta[] = [
  { type: "SHOW_ONLY", requiresInteraction: false, configSchema: {} },
  { type: "ACK_READ", requiresInteraction: true, configSchema: {} },
  { type: "ACK_PUZZLE", requiresInteraction: true, configSchema: { phrase: "目标短语" } },
  { type: "QUIZ", requiresInteraction: true, configSchema: { questionBankId: "题库", drawCount: "抽题数", passCount: "及格题数", maxAttempts: "重试上限" } },
  { type: "SIGNATURE", requiresInteraction: true, configSchema: { preamble: "签名前声明" } },
];

function toNumberOrNull(raw: string): number | null {
  if (raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function toDaysOrNull(raw: string): number | null {
  const n = toNumberOrNull(raw);
  return n != null && n <= 0 ? null : n;
}

function expiryFromEditMode(mode: ExpiryValue["mode"]): ExpiryValue {
  if (mode === "RELATIVE") return { mode, days: null };
  if (mode === "KEEP") return { mode };
  return { mode: "CLEAR" };
}

function maxEnterOf(s: DispositionStrategy): number | null {
  if (s.type === "unset") return null;
  return s.maxEnterSuccess;
}

function strategyFromRegistryType(
  type: string,
  prev: DispositionStrategy
): DispositionStrategy {
  const maxEnter = maxEnterOf(prev);
  switch (type) {
    case "QUIZ":
      return {
        type: "quiz",
        questionBankId: prev.type === "quiz" ? prev.questionBankId : "default",
        drawCount: prev.type === "quiz" ? prev.drawCount : 3,
        passCount: prev.type === "quiz" ? prev.passCount : 2,
        maxAttempts: prev.type === "quiz" ? prev.maxAttempts : 3,
        maxEnterSuccess: maxEnter,
      };
    case "ACK_READ":
      return { type: "ack_read", maxEnterSuccess: maxEnter };
    case "SIGNATURE":
      return {
        type: "signature",
        preamble: prev.type === "signature" ? prev.preamble : "",
        maxEnterSuccess: maxEnter,
      };
    case "SHOW_ONLY":
      return { type: "fixed", challengePhrase: "", maxEnterSuccess: maxEnter, puzzle: false };
    case "ACK_PUZZLE":
      return {
        type: "fixed",
        // 切换到拼图时清空短语，强制手动填写（不沿用仅展示的空串以外的旧值亦可接受）
        challengePhrase: "",
        maxEnterSuccess: maxEnter,
        puzzle: true,
      };
    default:
      return { type: "unset" };
  }
}

function withMaxEnter(s: DispositionStrategy, maxEnterSuccess: number | null): DispositionStrategy {
  if (s.type === "unset") return s;
  return { ...s, maxEnterSuccess };
}

export function DispositionFieldsSlot({
  value,
  onChange,
  capability = DISPOSITION_FULL,
  expiryMode = "create",
  disabled = false,
  showValidation = false,
  expiryCopy,
}: DispositionFieldsSlotProps): JSX.Element {
  const daysInputId = useId();
  const [strategies, setStrategies] = useState<DispositionStrategyMeta[]>(FALLBACK_STRATEGIES);

  useEffect(() => {
    let cancelled = false;
    fetchDispositionStrategies()
      .then((list) => {
        if (!cancelled && Array.isArray(list) && list.length > 0) {
          setStrategies(list);
        }
      })
      .catch(() => {
        /* 离线/未登录时用本地兜底 */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const actionOptions = capability.allowActions.map((a) => ACTION_OPTIONS[a]);
  const effectiveActions = value.actions.filter((a) => capability.allowActions.includes(a));
  const days = value.expiry.mode === "RELATIVE" ? value.expiry.days : null;
  const daysString = days == null ? "" : String(days);
  const isClear = value.expiry.mode === "CLEAR";
  const expiryLabel = expiryCopy?.label ?? VIOLATION_FIELD_COPY.expireDays.label;
  const expiryPlaceholder = expiryCopy?.placeholder ?? VIOLATION_FIELD_COPY.expireDays.placeholder;
  // 到期时间与验证后解禁可并存：不再因 unlock 禁用或改提示
  const expiryHint = expiryCopy?.hint ?? VIOLATION_FIELD_COPY.expireDays.hint;
  const expiryControlsDisabled = disabled;
  const registryType = registryDispositionType(value);
  const strategyOptions = strategies.map((s) => ({
    value: s.type,
    label: DISPOSITION_STRATEGY_LABEL[s.type] ?? s.type,
  }));
  // Narrow once so JSX/callbacks can read variant fields without casting.
  const puzzleStrategy =
    value.strategy.type === "fixed" && value.strategy.puzzle ? value.strategy : null;
  const quizStrategy = value.strategy.type === "quiz" ? value.strategy : null;
  const signatureStrategy = value.strategy.type === "signature" ? value.strategy : null;
  const phraseEmpty = puzzleStrategy != null && !puzzleStrategy.challengePhrase.trim();
  const strategyMissing = registryType === "";
  const strategyInvalid = showValidation && strategyMissing;
  const phraseInvalid = showValidation && phraseEmpty;

  const setActions = (actions: DispositionActionCode[]) => {
    const next: DispositionValue = {
      ...value,
      // 非「仅展示」时取消禁入会立刻补回，避免交互处置沦为摆设
      actions: ensureForbidForStrategy(actions, value.strategy),
    };
    onChange(next);
  };
  return (
    <InspectorGroup title="处置">
      <InspectorRow stack label="处置动作">
        {(controlId) => (
          <MultiSelectField
            id={controlId}
            options={actionOptions}
            value={effectiveActions}
            onChange={setActions}
            maxChips={3}
            disabled={disabled}
          />
        )}
      </InspectorRow>

      <InspectorRow
        label="处置策略"
        required={expiryMode === "create"}
        tone={strategyInvalid ? "error" : strategyMissing ? "warn" : "default"}
        hint={strategyInvalid ? "请选择处置策略" : strategyMissing ? "必选" : undefined}
      >
        {(controlId) => (
          <SelectField
            id={controlId}
            options={strategyOptions}
            value={registryType}
            invalid={strategyInvalid}
            onChange={(type) => {
              const strategy = strategyFromRegistryType(type, value.strategy);
              const next: DispositionValue = {
                ...value,
                strategy,
                // 选交互类策略（除仅展示）时连锁勾选立即禁入；切回仅展示不强制去掉
                actions: ensureForbidForStrategy(value.actions, strategy),
              };
              onChange(next);
            }}
            placeholder="请选择处置策略"
            disabled={disabled}
          />
        )}
      </InspectorRow>

      {puzzleStrategy && capability.allowChallenge ? (
        <InspectorRow
          label={VIOLATION_FIELD_COPY.challengePhrase.label}
          required
          tone={phraseInvalid ? "error" : phraseEmpty ? "warn" : "default"}
          hint={phraseInvalid ? "请填写拼图短语" : phraseEmpty ? "必填" : undefined}
        >
          {(controlId) => (
            <BareInput
              id={controlId}
              value={puzzleStrategy.challengePhrase}
              invalid={phraseInvalid}
              onChange={(e) =>
                onChange({
                  ...value,
                  strategy: {
                    ...puzzleStrategy,
                    challengePhrase: e.target.value,
                  },
                })
              }
              placeholder={VIOLATION_FIELD_COPY.challengePhrase.placeholder}
              disabled={disabled}
            />
          )}
        </InspectorRow>
      ) : null}

      {quizStrategy ? (
        <>
          <InspectorRow label="题库 ID">
            {(controlId) => (
              <BareInput
                id={controlId}
                value={quizStrategy.questionBankId}
                onChange={(e) =>
                  onChange({
                    ...value,
                    strategy: { ...quizStrategy, questionBankId: e.target.value },
                  })
                }
                placeholder="default"
                disabled={disabled}
              />
            )}
          </InspectorRow>
          <InspectorRow label="抽题数">
            {(controlId) => (
              <BareNumberWithUnit
                id={controlId}
                value={String(quizStrategy.drawCount)}
                onChange={(raw) =>
                  onChange({
                    ...value,
                    strategy: {
                      ...quizStrategy,
                      drawCount: Math.max(1, toNumberOrNull(raw) ?? 3),
                    },
                  })
                }
                unit="题"
                disabled={disabled}
              />
            )}
          </InspectorRow>
          <InspectorRow label="及格题数">
            {(controlId) => (
              <BareNumberWithUnit
                id={controlId}
                value={String(quizStrategy.passCount)}
                onChange={(raw) =>
                  onChange({
                    ...value,
                    strategy: {
                      ...quizStrategy,
                      passCount: Math.max(1, toNumberOrNull(raw) ?? 2),
                    },
                  })
                }
                unit="题"
                disabled={disabled}
              />
            )}
          </InspectorRow>
          <InspectorRow label="重试上限">
            {(controlId) => (
              <BareNumberWithUnit
                id={controlId}
                value={String(quizStrategy.maxAttempts)}
                onChange={(raw) =>
                  onChange({
                    ...value,
                    strategy: {
                      ...quizStrategy,
                      maxAttempts: Math.max(1, toNumberOrNull(raw) ?? 3),
                    },
                  })
                }
                unit="次"
                disabled={disabled}
              />
            )}
          </InspectorRow>
        </>
      ) : null}

      {signatureStrategy ? (
        <InspectorRow label="签名前声明">
          {(controlId) => (
            <BareInput
              id={controlId}
              value={signatureStrategy.preamble}
              onChange={(e) =>
                onChange({
                  ...value,
                  strategy: { ...signatureStrategy, preamble: e.target.value },
                })
              }
              disabled={disabled}
            />
          )}
        </InspectorRow>
      ) : null}

      {capability.allowMaxEnter && value.strategy.type !== "unset" ? (
        <InspectorRow label={VIOLATION_FIELD_COPY.maxEnterSuccess.label}>
          {(controlId) => (
            <BareNumberWithUnit
              id={controlId}
              value={maxEnterOf(value.strategy) == null ? "" : String(maxEnterOf(value.strategy))}
              onChange={(raw) =>
                onChange({
                  ...value,
                  strategy: withMaxEnter(value.strategy, toNumberOrNull(raw)),
                })
              }
              unit="次"
              placeholder={VIOLATION_FIELD_COPY.maxEnterSuccess.placeholder}
              disabled={disabled}
            />
          )}
        </InspectorRow>
      ) : null}

      {capability.allowExpire
        ? expiryMode === "create" ? (
            <InspectorRow
              label={expiryLabel}
              tone={days == null ? "warn" : "default"}
              hint={days == null ? expiryHint : undefined}
            >
              {(controlId) => (
                <BareNumberWithUnit
                  id={controlId}
                  value={daysString}
                  onChange={(raw) => onChange({ ...value, expiry: { mode: "RELATIVE", days: toDaysOrNull(raw) } })}
                  unit="天"
                  placeholder={expiryPlaceholder}
                  disabled={expiryControlsDisabled}
                />
              )}
            </InspectorRow>
          ) : (
            <InspectorRow
              label={expiryLabel}
              tone={isClear ? "warn" : "default"}
              hint={isClear ? expiryHint : undefined}
            >
              {(controlId) => (
                <div className="flex flex-col gap-2">
                  <SelectField
                    id={controlId}
                    options={EXPIRY_EDIT_OPTIONS}
                    value={value.expiry.mode}
                    onChange={(mode) => onChange({ ...value, expiry: expiryFromEditMode(mode) })}
                    disabled={expiryControlsDisabled}
                  />
                  {value.expiry.mode === "RELATIVE" ? (
                    <>
                      <label htmlFor={daysInputId} className="sr-only">{expiryLabel}（重新起算）</label>
                      <BareNumberWithUnit
                        id={daysInputId}
                        value={daysString}
                        onChange={(raw) => onChange({ ...value, expiry: { mode: "RELATIVE", days: toDaysOrNull(raw) } })}
                        unit="天"
                        placeholder={expiryPlaceholder}
                        disabled={expiryControlsDisabled}
                      />
                    </>
                  ) : null}
                </div>
              )}
            </InspectorRow>
          )
        : null}
    </InspectorGroup>
  );
}
