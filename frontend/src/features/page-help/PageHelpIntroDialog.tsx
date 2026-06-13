import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { ackPageHelpIntro, fetchPageHelpIntro, pageHelpVersionKindLabel, type PageHelpIntroBundle } from "@/api/domains/pageHelpIntro.api";
import { authStorage } from "@/features/auth/authStorage";
import { isPageHelpPathEligible, normalizePageHelpPath } from "@/features/page-help/pageHelpPath";
import { PageHelpModalShell } from "@/features/page-help/PageHelpModalShell";
import { PAGE_HELP_DIALOG_CLASS, PAGE_HELP_INTRO_DIALOG_CLASS, PAGE_HELP_SCROLL_CLASS } from "@/utils/pageHelpHtml";
import { PageHelpProseHtml } from "@/features/page-help/PageHelpProseHtml";
import { cn } from "@/lib/utils";

type IntroDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pagePath: string;
  bundle: PageHelpIntroBundle | null;
  onAcknowledged: () => void;
  onDeferred: () => void;
};

export function PageHelpIntroDialog({
  open,
  onOpenChange,
  pagePath,
  bundle,
  onAcknowledged,
  onDeferred,
}: IntroDialogProps) {
  const [submitting, setSubmitting] = useState(false);
  const pathKey = useMemo(() => normalizePageHelpPath(pagePath), [pagePath]);

  const close = useCallback(() => onOpenChange(false), [onOpenChange]);

  const onAck = async () => {
    const versionLabel = bundle?.currentVersion?.versionLabel;
    if (!versionLabel) {
      close();
      onAcknowledged();
      return;
    }
    setSubmitting(true);
    try {
      await ackPageHelpIntro(pathKey, versionLabel);
      onAcknowledged();
      close();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSubmitting(false);
    }
  };

  const onLater = () => {
    onDeferred();
    close();
  };

  return (
    <PageHelpModalShell
      open={open}
      onClose={close}
      ariaLabel="新功能介绍"
      className={cn(
        PAGE_HELP_DIALOG_CLASS,
        PAGE_HELP_INTRO_DIALOG_CLASS,
        "flex h-[80vh] max-h-[80vh] w-[50vw] max-w-[50vw] flex-col gap-0 overflow-hidden p-0 sm:rounded-[var(--app-radius-container)]",
      )}
    >
      <header className="shrink-0 space-y-1 border-b border-[var(--app-color-border-default)] px-5 pb-3.5 pt-5 text-left">
        <div className="flex flex-wrap items-center gap-2 pr-4">
          <h2 className="text-base font-semibold text-[var(--app-color-text-primary)]">新功能介绍</h2>
          {bundle?.currentVersion ? (
            <span className="inline-flex items-center gap-1.5 rounded-[var(--app-radius-pill)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-2 py-0.5 text-[10px] font-semibold text-[var(--app-color-text-secondary)]">
              <span className="font-mono text-[var(--app-color-text-primary)]">{bundle.currentVersion.versionLabel}</span>
              <span className="text-[var(--app-color-text-tertiary)]">·</span>
              <span>{pageHelpVersionKindLabel(bundle.currentVersion.versionKind)}</span>
            </span>
          ) : null}
        </div>
        <p className="text-xs text-[var(--app-color-text-secondary)]">
          当前页面：<span className="font-mono text-[var(--app-color-text-primary)]">{pathKey}</span>
        </p>
      </header>

      <PageHelpProseHtml
        html={bundle?.bodyHtml || ""}
        className={cn("min-h-0 flex-1 overflow-y-auto px-5 py-4", PAGE_HELP_SCROLL_CLASS)}
        emptyHtml='<p class="text-[var(--app-color-text-tertiary)]">暂无介绍内容。</p>'
      />

      <footer className="flex shrink-0 flex-row justify-end gap-2 border-t border-[var(--app-color-border-default)] px-5 py-3.5">
        <button
          type="button"
          disabled={submitting}
          onClick={onLater}
          className="rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-3 py-2 text-xs font-medium text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)] disabled:opacity-50"
        >
          下次再说
        </button>
        <button
          type="button"
          disabled={submitting}
          onClick={() => void onAck()}
          className="rounded-[var(--app-radius-element)] bg-[var(--app-color-accent-secondary)] px-3 py-2 text-xs font-semibold text-[var(--app-color-text-inverse)] hover:bg-[var(--app-color-accent)] disabled:opacity-50"
        >
          {submitting ? "保存中…" : "我已知晓"}
        </button>
      </footer>
    </PageHelpModalShell>
  );
}

type PageHelpIntroOptions = {
  /** 路由过渡页（如锁定跳转前的 /admin 工作台）— 禁止拉取/自动弹出，避免与最终落点帮助冲突 */
  suppressAutoIntro?: boolean;
};

/** 进入页面时自动弹出 + 手动打开帮助 */
export function usePageHelpIntro(pagePath: string, options?: PageHelpIntroOptions) {
  const suppressAutoIntro = options?.suppressAutoIntro ?? false;
  const pathKey = useMemo(() => normalizePageHelpPath(pagePath), [pagePath]);
  const eligible = useMemo(() => isPageHelpPathEligible(pagePath), [pagePath]);
  const [bundle, setBundle] = useState<PageHelpIntroBundle | null>(null);
  const [introOpen, setIntroOpen] = useState(false);
  const deferredForPathRef = useRef<string | null>(null);
  const lastAutoPathRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    if (!eligible || !authStorage.hasToken()) {
      setBundle(null);
      return null;
    }
    try {
      const b = await fetchPageHelpIntro(pathKey);
      setBundle(b);
      return b;
    } catch {
      setBundle(null);
      return null;
    }
  }, [eligible, pathKey]);

  useEffect(() => {
    if (suppressAutoIntro) {
      setIntroOpen(false);
    }
  }, [suppressAutoIntro]);

  useEffect(() => {
    if (!eligible || !authStorage.hasToken() || suppressAutoIntro) {
      setIntroOpen(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      const b = await load();
      if (cancelled || !b || suppressAutoIntro) return;
      const shouldAuto =
        b.shouldShowIntro &&
        Boolean(b.bodyHtml?.trim()) &&
        deferredForPathRef.current !== pathKey &&
        lastAutoPathRef.current !== pathKey;
      if (shouldAuto) {
        lastAutoPathRef.current = pathKey;
        setIntroOpen(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [eligible, load, pathKey, suppressAutoIntro]);

  const deferIntro = useCallback(() => {
    deferredForPathRef.current = pathKey;
  }, [pathKey]);

  useEffect(() => {
    return () => {
      if (deferredForPathRef.current === pathKey) {
        deferredForPathRef.current = null;
      }
    };
  }, [pathKey]);

  const acknowledgeIntro = useCallback(() => {
    deferredForPathRef.current = null;
    setBundle((prev) =>
      prev
        ? {
            ...prev,
            introAckVersionLabel: prev.currentVersion?.versionLabel ?? null,
            shouldShowIntro: false,
          }
        : prev,
    );
  }, []);

  const openIntroManually = useCallback(async () => {
    const b = bundle ?? (await load());
    if (!b?.bodyHtml?.trim()) {
      toast("本页暂无帮助内容", { icon: "ℹ️" });
      return;
    }
    setIntroOpen(true);
  }, [bundle, load]);

  return {
    bundle,
    introOpen,
    setIntroOpen,
    deferIntro,
    acknowledgeIntro,
    openIntroManually,
    reload: load,
  };
}
