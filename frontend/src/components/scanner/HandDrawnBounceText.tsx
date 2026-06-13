type Props = {
    text: string;
    className?: string;
};

/** 手绘风：逐字跳动循环 */
export function HandDrawnBounceText({ text, className = "" }: Props) {
    const chars = [...text];
    return (
        <p className={`access-motion-doodle-text ${className}`.trim()} aria-live="polite">
            {chars.map((char, i) => (
                <span
                    key={`${i}-${char}`}
                    className="access-motion-doodle-text__char"
                    style={{ animationDelay: `${i * 0.09}s` }}
                >
                    {char === " " ? "\u00a0" : char}
                </span>
            ))}
        </p>
    );
}
