import React from "react";

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
            <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-[#050A15]/85 backdrop-blur-sm">
                <div className="w-[520px] max-w-[90vw] rounded-xl border border-red-500/40 bg-[#0B1020] p-6 text-slate-200">
                    <h3 className="text-lg font-bold mb-2">弹窗渲染异常</h3>
                    <p className="text-sm text-slate-300 mb-4">
                        已拦截本次异常，页面不会崩溃。请关闭弹窗后重试扫码。
                    </p>
                    <button
                        className="px-4 py-2 rounded bg-red-600 hover:bg-red-500 text-white text-sm font-semibold"
                        onClick={this.props.onClose}
                    >
                        关闭弹窗
                    </button>
                </div>
            </div>
        );
    }
}
