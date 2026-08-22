import { type ReactNode, type RefObject } from "react";
import "@/features/aup/aup.css";

export interface ContentManagerWorkbenchLayoutProps {
  /** Modals and overlays rendered outside the workbench chrome */
  children?: ReactNode;
  onBack: () => void;
  /** Defaults to "← 返回" */
  backLabel?: string;
  searchPlaceholder?: string;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  /** Nodes between search/clear and count (filters, batch actions, etc.) */
  toolbarExtra?: ReactNode;
  countText?: ReactNode;
  aside?: ReactNode;
  main: ReactNode;
  /** When false, main fills width below toolbar (card/list pages). Default true = aside + main split. */
  split?: boolean;
  wideAside?: boolean;
  asideRef?: RefObject<HTMLElement | null>;
}

/**
 * Shared content-manager workbench shell: toolbar + aside/main split.
 * Matches `aup-wb` patterns used by NHP codelist / field admin pages.
 */
export default function ContentManagerWorkbenchLayout({
  children,
  onBack,
  backLabel = "← 返回",
  searchPlaceholder,
  searchValue,
  onSearchChange,
  toolbarExtra,
  countText,
  aside,
  main,
  split = true,
  wideAside = false,
  asideRef,
}: ContentManagerWorkbenchLayoutProps) {
  const showSearch = onSearchChange != null && searchValue != null;
  const trimmedSearch = (searchValue ?? "").trim();

  return (
    <div className="aup-app aup-app--workbench" style={{ background: "var(--bg)" }}>
      <div className="aup-wb">
        <div className="aup-wb-toolbar">
          <button type="button" className="btn ghost small" onClick={onBack} style={{ flexShrink: 0 }}>
            {backLabel}
          </button>
          {showSearch && (
            <>
              <input
                className="input"
                placeholder={searchPlaceholder}
                value={searchValue}
                onChange={(e) => onSearchChange(e.target.value)}
              />
              {trimmedSearch && (
                <button type="button" className="btn ghost small" onClick={() => onSearchChange("")}>
                  清除
                </button>
              )}
            </>
          )}
          {toolbarExtra}
          {countText != null && <span className="aup-wb-count">{countText}</span>}
        </div>

        {split && aside != null ? (
          <div className={`aup-wb-split${wideAside ? " aup-wb-split--wide-aside" : ""}`}>
            <aside className="aup-wb-aside" ref={asideRef}>
              {aside}
            </aside>
            <div className="aup-wb-main">{main}</div>
          </div>
        ) : (
          <div className="aup-wb-main aup-wb-main--full">{main}</div>
        )}
      </div>
      {children}
    </div>
  );
}
