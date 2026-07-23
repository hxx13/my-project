import type {ReactNode} from "react";

type Props = {
    name: string;
    userId: string;
    avatarUrl?: string | null;
    badges?: ReactNode;
    headerRight?: ReactNode;
    children: ReactNode;
    className?: string;
};

export function DebugPersonCardShell({name, userId, avatarUrl, badges, headerRight, children, className = ""}: Props) {
    const initial = (name || userId || "?").charAt(0);
    return (
        <article
            className={`flex flex-col rounded-xl border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] p-3 shadow-[var(--app-elevation-card)] transition-shadow hover:shadow-[var(--app-elevation-card-hover,var(--app-elevation-card))] ${className}`}
        >
            <header className="mb-2 flex items-start gap-2 border-b border-[var(--app-color-border-default)] pb-2">
                {avatarUrl ? (
                    <img
                        src={avatarUrl}
                        alt=""
                        className="h-10 w-10 shrink-0 rounded-full border border-[var(--app-color-border-default)] object-cover"
                    />
                ) : (
                    <div
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--app-color-surface-active)] text-sm font-black text-[var(--app-color-text-inverse)]"
                    >
                        {initial}
                    </div>
                )}
                <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-black text-[var(--app-color-text-primary)]">{name || "未知"}</div>
                    <div className="truncate font-mono text-[10px] text-[var(--app-color-text-tertiary)]" title={userId}>
                        {userId}
                    </div>
                    {badges ? <div className="mt-1 flex flex-wrap gap-1">{badges}</div> : null}
                </div>
                {headerRight ? <div className="shrink-0">{headerRight}</div> : null}
            </header>
            {children}
        </article>
    );
}
