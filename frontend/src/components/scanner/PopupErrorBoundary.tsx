import React from "react";
import { SCAN_POPUP_BACKDROP, SCAN_MODAL_LAYER_PROPS } from "./scanPopupTheme";
import { ScanPopupBackdropDecor } from "./ScanPopupBackdropDecor";

type PopupErrorBoundaryProps = {
    onClose: () => void;
    children: React.ReactNode;
};

type PopupErrorBoundaryState = {
    hasError: boolean;
};

export class PopupErrorBoundary extends React.Component<PopupErrorBoundaryProps, PopupErrorBoundaryState> {
    state: PopupErrorBoundaryState = { hasError: false };

    static getDerivedStateFromError(): PopupErrorBoundaryState {
        return { hasError: true };
    }

    componentDidCatch(error: Error) {
        console.error("[PopupErrorBoundary] popup render failed:", error);
    }

    render() {
        if (!this.state.hasError) return this.props.children;

        return (
            <div {...SCAN_MODAL_LAYER_PROPS} className={`fixed inset-0 z-[var(--z-modal)] flex items-center justify-center ${SCAN_POPUP_BACKDROP}`}>
                <ScanPopupBackdropDecor />
                <div className="w-[520px] max-w-[90vw] rounded-[var(--app-radius-container)] border border-[var(--app-color-feedback-danger)]/40 bg-[var(--app-color-surface-container)] p-6 text-[var(--app-color-text-primary)] shadow-[var(--app-elevation-modal)]">
                    <h3 className="mb-2 text-lg font-bold">弹窗渲染异常</h3>
                    <p className="mb-4 text-sm text-[var(--app-color-text-secondary)]">
                        已拦截本次异常，页面不会崩溃。请关闭弹窗后重试扫码。
                    </p>
                    <button
                        className="rounded-[var(--app-radius-element)] bg-[var(--app-color-feedback-danger)] px-4 py-2 text-sm font-semibold text-[var(--app-color-text-inverse)] hover:opacity-90"
                        onClick={this.props.onClose}
                    >
                        关闭弹窗
                    </button>
                </div>
            </div>
        );
    }
}
