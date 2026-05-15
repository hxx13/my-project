/** 流水 / 雷达：自带卡走孪生建档可认准；其余一律按「领用公卡」展示（含未走扫码建档的兜底，与领用公卡同一套样式与含义） */

export function toBoolFlag(value: unknown): boolean {
    if (value === true || value === 1) return true;
    if (typeof value === "string") {
        const s = value.trim().toLowerCase();
        return s === "1" || s === "true" || s === "yes";
    }
    return false;
}

export function resolveLedgerIsOwnCard(log: Record<string, unknown>): boolean {
    const isBorrowed =
        toBoolFlag(log.is_borrowed_card) || toBoolFlag(log.isBorrowedCard);
    const hasPhysicalMapping =
        toBoolFlag(log.has_physical_card_mapping) ||
        toBoolFlag(log.hasPhysicalCardMapping) ||
        toBoolFlag(log.physicalCardMapping);
    return (
        toBoolFlag(log.is_own_card) ||
        toBoolFlag(log.isOwnCard) ||
        (hasPhysicalMapping && !isBorrowed)
    );
}

