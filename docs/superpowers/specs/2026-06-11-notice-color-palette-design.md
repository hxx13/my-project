# 灵动岛通知配色体系重设计

> **日期**：2026-06-11
> **方案**：A — Tailwind 语义色系（参考 Preline UI soft color 模式）

## 问题

当前每种通知类型只有一个 `accent` 变量，其余颜色全部通过 `color-mix()` 派生，导致单色相、无层次。

## 设计

每种类型 8 个独立色值，使用完整 Tailwind 色阶：

| 令牌 | 公告(Sky) | 违规(Red) | 未绑卡(Amber) |
|------|----------|----------|-------------|
| accent | sky-600 | red-600 | amber-600 |
| bg | sky-100 | red-100 | amber-100 |
| border | sky-200 | red-200 | amber-200 |
| text | sky-800 | red-800 | amber-800 |
| textSoft | sky-600/70 | red-600/70 | amber-600/70 |
| iconBg | sky-200 | red-200 | amber-200 |
| iconText | sky-700 | red-700 | amber-700 |
| pill | sky-600/15 | red-600/15 | amber-600/15 |
| bg-dark | sky-500/15 | red-500/15 | amber-500/15 |
| border-dark | sky-900/40 | red-900/40 | amber-900/40 |
| text-dark | sky-300 | red-300 | amber-300 |
| textSoft-dark | sky-300/60 | red-300/60 | amber-300/60 |
| iconBg-dark | sky-500/20 | red-500/20 | amber-500/20 |
| iconText-dark | sky-400 | red-400 | amber-400 |
| pill-dark | sky-500/15 | red-500/15 | amber-500/15 |

## 实施

1. `semantic.css` — 新增 3×8=24 个 `--app-color-notice-{type}-{role}` 令牌
2. `scanPopupNotice.css` — 引用新令牌替换 `color-mix()` 派生
3. 删除旧的单一 `--app-color-notice-announcement/violation/unbound` + `-soft` 令牌

## 不改动

- `scanPopupTheme.ts` — 已清理完毕，无需恢复
- `ScanPopupNoticeBanner.tsx` — 已无 JS 注入
- 弹窗主体 10 色系 — 不变
