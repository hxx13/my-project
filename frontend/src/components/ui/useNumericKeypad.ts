import { useReducer, useEffect, useCallback, useRef } from "react";
import type { KeypadMode, KeypadStep, UseNumericKeypadReturn } from "./NumericKeypad.types";
import { setPin, specialChannelLogin } from "@/components/scanner/specialChannel.api";
import type { AuthData } from "@/api/domains/auth.api";

interface State {
  mode: KeypadMode;
  step: KeypadStep;
  input: number[];
  confirmInput: number[];
  dots: number[];
  errorText: string | null;
  isLoading: boolean;
  isLocked: boolean;
  lockSeconds: number;
  failCount: number;
}

type Action =
  | { type: "DIGIT"; digit: number }
  | { type: "DELETE" }
  | { type: "CONFIRM_START" }
  | { type: "SUBMIT" }
  | { type: "SUCCESS" }
  | { type: "FAILURE"; error: string }
  | { type: "LOCK_TICK" }
  | { type: "UNLOCK" }
  | { type: "CANCEL" };

const MAX_DIGITS = 8;
const MIN_DIGITS = 6;
const MAX_FAILURES = 3;
const LOCK_SECONDS = 30;

function createInitialState(mode: KeypadMode): State {
  return {
    mode,
    step: "idle",
    input: [],
    confirmInput: [],
    dots: [],
    errorText: null,
    isLoading: false,
    isLocked: false,
    lockSeconds: 0,
    failCount: 0,
  };
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "DIGIT": {
      const current = state.step === "confirming" ? state.confirmInput : state.input;
      if (current.length >= MAX_DIGITS) return state;
      const next = [...current, action.digit];
      if (state.step === "confirming") {
        return { ...state, confirmInput: next, dots: next.map(() => 0) };
      }
      return { ...state, input: next, step: "input", dots: next.map(() => 0) };
    }
    case "DELETE": {
      if (state.step === "confirming") {
        const next = state.confirmInput.slice(0, -1);
        return { ...state, confirmInput: next, dots: next.map(() => 0) };
      }
      const next = state.input.slice(0, -1);
      return {
        ...state,
        input: next,
        step: next.length > 0 ? "input" : "idle",
        dots: next.map(() => 0),
      };
    }
    case "CONFIRM_START":
      return { ...state, step: "confirming", confirmInput: [], dots: [], errorText: null };
    case "SUBMIT":
      return { ...state, isLoading: true, errorText: null };
    case "SUCCESS":
      return createInitialState(state.mode);
    case "FAILURE": {
      const newFail = state.failCount + 1;
      if (newFail >= MAX_FAILURES) {
        return {
          ...state,
          isLoading: false,
          failCount: newFail,
          isLocked: true,
          lockSeconds: LOCK_SECONDS,
          step: "locked",
          errorText: action.error,
        };
      }
      return {
        ...state,
        isLoading: false,
        failCount: newFail,
        input: [],
        confirmInput: [],
        dots: [],
        step: "idle",
        errorText: action.error,
      };
    }
    case "LOCK_TICK": {
      const next = state.lockSeconds - 1;
      if (next <= 0)
        return { ...state, lockSeconds: 0, isLocked: false, failCount: 0, step: "idle", errorText: null };
      return { ...state, lockSeconds: next };
    }
    case "UNLOCK":
      return { ...state, isLocked: false, lockSeconds: 0, failCount: 0, step: "idle", errorText: null };
    case "CANCEL":
      return createInitialState(state.mode);
  }
}

export function useNumericKeypad(
  mode: KeypadMode,
  userId: string,
  onSuccess: (result: AuthData) => void,
  onCancel: () => void
): UseNumericKeypadReturn {
  const [state, dispatch] = useReducer(reducer, mode, createInitialState);
  const onSuccessRef = useRef(onSuccess);
  onSuccessRef.current = onSuccess;

  // Lock countdown timer
  useEffect(() => {
    if (!state.isLocked || state.lockSeconds <= 0) return;
    const id = setInterval(() => dispatch({ type: "LOCK_TICK" }), 1000);
    return () => clearInterval(id);
  }, [state.isLocked, state.lockSeconds]);

  const handleDigit = useCallback(
    (d: number) => {
      if (state.isLocked || state.isLoading) return;
      dispatch({ type: "DIGIT", digit: d });
    },
    [state.isLocked, state.isLoading]
  );

  const handleDelete = useCallback(() => {
    if (state.isLocked || state.isLoading) return;
    dispatch({ type: "DELETE" });
  }, [state.isLocked, state.isLoading]);

  const handleSubmit = useCallback(async () => {
    if (state.isLocked || state.isLoading) return;

    // set mode: first entry → confirm phase
    if (state.mode === "set" && state.step === "input") {
      if (state.input.length < MIN_DIGITS) return;
      dispatch({ type: "CONFIRM_START" });
      return;
    }

    // set mode: confirm phase — check match
    if (state.mode === "set" && state.step === "confirming") {
      if (state.confirmInput.join("") !== state.input.join("")) {
        dispatch({ type: "FAILURE", error: "两次输入不一致，请重新设置" });
        return;
      }
    }

    // verify mode or set confirm matched — call API
    const currentInput = state.step === "confirming" ? state.confirmInput : state.input;
    if (currentInput.length < MIN_DIGITS) return;

    dispatch({ type: "SUBMIT" });
    const pin = currentInput.join("");
    try {
      const result = state.mode === "set" ? await setPin(userId, pin) : await specialChannelLogin(userId, pin);
      onSuccessRef.current(result);
      dispatch({ type: "SUCCESS" });
    } catch (err: any) {
      dispatch({ type: "FAILURE", error: err?.message || (state.mode === "set" ? "设置失败" : "验证失败") });
    }
  }, [state, userId]);

  const handleCancel = useCallback(() => {
    dispatch({ type: "CANCEL" });
    onCancel();
  }, [onCancel]);

  return {
    dots: state.dots,
    mode: state.mode,
    step: state.step,
    isLocked: state.isLocked,
    lockSeconds: state.lockSeconds,
    errorText: state.errorText,
    isLoading: state.isLoading,
    handleDigit,
    handleDelete,
    handleSubmit,
    handleCancel,
  };
}
