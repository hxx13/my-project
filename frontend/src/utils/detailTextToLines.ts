/**
 * 把一长串说明拆成多行，避免详情里全挤在一行。
 * 优先按换行；否则按中文分号、竖线、英文分号等切。
 */
export function detailTextToLines(text: string | null | undefined): string[] {
    const s = String(text ?? "").trim();
    if (!s) return [];
    const normalized = s.replace(/\r\n/g, "\n");
    if (normalized.includes("\n")) {
        return normalized
            .split("\n")
            .map((t) => t.trim())
            .filter(Boolean);
    }
    const chunks = normalized
        .split(/[；;|｜]+/)
        .map((t) => t.trim())
        .filter(Boolean);
    if (chunks.length > 1) return chunks;
    return [s];
}
