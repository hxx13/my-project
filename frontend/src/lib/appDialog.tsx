/**
 * 应用内居中确认/提示/输入框，替代 window.alert / confirm / prompt。
 * 命令式 API，可在任意事件处理中 await 使用。
 */
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export type AppAlertOptions = {
  title?: string;
  okText?: string;
};

export type AppConfirmOptions = {
  title?: string;
  confirmText?: string;
  cancelText?: string;
  /** 危险操作（删除等）用强调色确认钮 */
  danger?: boolean;
};

export type AppPromptOptions = {
  title?: string;
  confirmText?: string;
  cancelText?: string;
  placeholder?: string;
  /** 为空时是否允许提交，默认 true（与原生 prompt 一致，由调用方校验） */
  allowEmpty?: boolean;
};

type AlertRequest = {
  kind: "alert";
  message: string;
  options?: AppAlertOptions;
  resolve: (value: void) => void;
};

type ConfirmRequest = {
  kind: "confirm";
  message: string;
  options?: AppConfirmOptions;
  resolve: (value: boolean) => void;
};

type PromptRequest = {
  kind: "prompt";
  message: string;
  defaultValue: string;
  options?: AppPromptOptions;
  resolve: (value: string | null) => void;
};

type DialogRequest = AlertRequest | ConfirmRequest | PromptRequest;

const QUEUE: DialogRequest[] = [];
let current: DialogRequest | null = null;
let hostRoot: Root | null = null;
let bump: (() => void) | null = null;

function ensureHost() {
  if (typeof document === "undefined") return;
  if (hostRoot) return;
  const el = document.createElement("div");
  el.id = "app-dialog-host";
  document.body.appendChild(el);
  hostRoot = createRoot(el);
  hostRoot.render(<AppDialogHost />);
}

function pump() {
  bump?.();
}

function enqueue(req: DialogRequest) {
  QUEUE.push(req);
  ensureHost();
  if (!current) {
    current = QUEUE.shift() ?? null;
  }
  pump();
}

function finishCurrent() {
  current = QUEUE.shift() ?? null;
  pump();
}

function splitMessage(message: string): string[] {
  return String(message ?? "").split(/\n/);
}

function AppDialogHost() {
  const [, setTick] = useState(0);
  useEffect(() => {
    bump = () => setTick((n) => n + 1);
    return () => {
      bump = null;
    };
  }, []);

  const req = current;
  if (!req || typeof document === "undefined") return null;

  return createPortal(
    <AppDialogSurface
      key={`${req.kind}-${QUEUE.length}-${req.message.slice(0, 24)}`}
      request={req}
      onDone={() => finishCurrent()}
    />,
    document.body,
  );
}

function AppDialogSurface({
  request,
  onDone,
}: {
  request: DialogRequest;
  onDone: () => void;
}) {
  const titleId = useId();
  const descId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(
    request.kind === "prompt" ? request.defaultValue : "",
  );

  const title =
    request.kind === "alert"
      ? request.options?.title ?? "提示"
      : request.kind === "confirm"
        ? request.options?.title ?? "确认"
        : request.options?.title ?? "请输入";

  const okText =
    request.kind === "alert"
      ? request.options?.okText ?? "确定"
      : request.kind === "confirm"
        ? request.options?.confirmText ?? "确定"
        : request.options?.confirmText ?? "确定";

  const cancelText =
    request.kind === "confirm"
      ? request.options?.cancelText ?? "取消"
      : request.kind === "prompt"
        ? request.options?.cancelText ?? "取消"
        : "取消";

  const danger = request.kind === "confirm" && Boolean(request.options?.danger);
  const lines = splitMessage(request.message);

  useEffect(() => {
    if (request.kind === "prompt") {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [request.kind]);

  const closeAlert = () => {
    if (request.kind !== "alert") return;
    request.resolve();
    onDone();
  };

  const closeConfirm = (ok: boolean) => {
    if (request.kind !== "confirm") return;
    request.resolve(ok);
    onDone();
  };

  const closePrompt = (result: string | null) => {
    if (request.kind !== "prompt") return;
    request.resolve(result);
    onDone();
  };

  const onOverlayClick = () => {
    if (request.kind === "alert") closeAlert();
    else if (request.kind === "confirm") closeConfirm(false);
    else closePrompt(null);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onOverlayClick();
    }
  };

  const submitPrompt = (e?: FormEvent) => {
    e?.preventDefault();
    if (request.kind !== "prompt") return;
    const allowEmpty = request.options?.allowEmpty !== false;
    if (!allowEmpty && !value.trim()) return;
    closePrompt(value);
  };

  return (
    <div
      className="fixed inset-0 z-[1100] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.45)" }}
      data-modal-layer="true"
      role="presentation"
      onKeyDown={onKeyDown}
      onClick={(e) => {
        if (e.target === e.currentTarget) onOverlayClick();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="relative w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 text-slate-900 shadow-lg outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="absolute right-4 top-4 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2"
          onClick={onOverlayClick}
          aria-label="关闭"
        >
          <X className="h-4 w-4" />
        </button>

        <h2 id={titleId} className="pr-8 text-lg font-semibold leading-none tracking-tight">
          {title}
        </h2>

        <div id={descId} className="mt-3 space-y-1 text-sm text-slate-600 whitespace-pre-wrap">
          {lines.map((line, i) => (
            <p key={i} className={line === "" ? "h-3" : undefined}>
              {line}
            </p>
          ))}
        </div>

        {request.kind === "prompt" ? (
          <form className="mt-4" onSubmit={submitPrompt}>
            <input
              ref={inputRef}
              type="text"
              value={value}
              placeholder={request.options?.placeholder}
              onChange={(e) => setValue(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
            />
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-2">
              <button
                type="button"
                className="inline-flex h-9 items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
                onClick={() => closePrompt(null)}
              >
                {cancelText}
              </button>
              <button
                type="submit"
                className="inline-flex h-9 items-center justify-center rounded-md bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800"
              >
                {okText}
              </button>
            </div>
          </form>
        ) : (
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-2">
            {request.kind === "confirm" ? (
              <button
                type="button"
                className="inline-flex h-9 items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
                onClick={() => closeConfirm(false)}
              >
                {cancelText}
              </button>
            ) : null}
            <button
              type="button"
              autoFocus
              className={cn(
                "inline-flex h-9 items-center justify-center rounded-md px-4 text-sm font-medium",
                danger
                  ? "bg-red-600 text-white hover:bg-red-500"
                  : "bg-slate-900 text-white hover:bg-slate-800",
              )}
              onClick={() => {
                if (request.kind === "alert") closeAlert();
                else closeConfirm(true);
              }}
            >
              {okText}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** 提示框（替代 window.alert） */
export function appAlert(message: string, options?: AppAlertOptions): Promise<void> {
  return new Promise((resolve) => {
    enqueue({ kind: "alert", message, options, resolve });
  });
}

/** 确认框（替代 window.confirm）；确定 → true，取消/Esc/遮罩 → false */
export function appConfirm(message: string, options?: AppConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    enqueue({ kind: "confirm", message, options, resolve });
  });
}

/** 输入框（替代 window.prompt）；确定 → 字符串，取消/Esc/遮罩 → null */
export function appPrompt(
  message: string,
  defaultValue = "",
  options?: AppPromptOptions,
): Promise<string | null> {
  return new Promise((resolve) => {
    enqueue({
      kind: "prompt",
      message,
      defaultValue: defaultValue ?? "",
      options,
      resolve,
    });
  });
}
