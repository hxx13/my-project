import { useId, type InputHTMLAttributes } from "react";
import styled, { css } from "styled-components";
import { cn } from "@/lib/utils";

export type AdminSwitchProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "checked" | "onChange"
> & {
  checked: boolean;
  onChange: (checked: boolean) => void;
  className?: string;
};

const SwitchRoot = styled.label<{ $disabled?: boolean }>`
  display: inline-flex;
  flex-shrink: 0;
  opacity: ${({ $disabled }) => ($disabled ? 0.5 : 1)};
  cursor: ${({ $disabled }) => ($disabled ? "not-allowed" : "pointer")};
`;

const HiddenCheckbox = styled.input`
  opacity: 0;
  width: 0;
  height: 0;
  position: absolute;
  pointer-events: none;
`;

const Track = styled.span<{ $checked: boolean; $disabled?: boolean }>`
  width: 40px;
  height: 22px;
  position: relative;
  display: block;
  border-radius: 11px;
  cursor: ${({ $disabled }) => ($disabled ? "not-allowed" : "pointer")};
  background-color: var(--app-color-border-default);
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.06);
  transition: background-color 0.16s ease-out;

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }

  ${({ $checked }) =>
    $checked &&
    css`
      background-color: var(--app-color-feedback-success);
    `}
`;

const Thumb = styled.span<{ $checked: boolean }>`
  width: 18px;
  height: 18px;
  position: absolute;
  left: ${({ $checked }) => ($checked ? "20px" : "2px")};
  top: 2px;
  border-radius: 50%;
  background: var(--app-color-surface-raised, #ffffff);
  box-shadow:
    0 1px 2px rgba(0, 0, 0, 0.2),
    0 0 0 0.5px rgba(0, 0, 0, 0.04);
  transition: left 0.16s ease-out;

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

/**
 * iOS-style toggle switch for admin backend pages.
 * Uses --app-color-* semantic tokens; checked state uses feedback-success green.
 */
export function AdminSwitch({
  checked,
  onChange,
  disabled = false,
  id,
  className,
  ...rest
}: AdminSwitchProps) {
  const autoId = useId();
  const inputId = id ?? autoId;

  // Extract interactive event handlers so they fire on the visible label/track
  // instead of the hidden <input> which has pointer-events: none.
  const {
    onClick,
    onMouseDown,
    onMouseUp,
    onMouseEnter,
    onMouseLeave,
    onFocus,
    onBlur,
    onKeyDown,
    onKeyUp,
    ...inputAttrs
  } = rest;

  return (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <SwitchRoot
      className={cn(className)}
      $disabled={disabled}
      {...({ onClick, onMouseDown, onMouseUp, onMouseEnter, onMouseLeave, onFocus, onBlur, onKeyDown, onKeyUp } as any)}
    >
      <HiddenCheckbox
        {...inputAttrs}
        id={inputId}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <Track $checked={checked} $disabled={disabled} aria-hidden="true">
        <Thumb $checked={checked} />
      </Track>
    </SwitchRoot>
  );
}
