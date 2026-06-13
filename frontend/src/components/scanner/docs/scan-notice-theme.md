# 扫码灵动岛配色

## 链路

```
tokens.css（色板，必须有对应 --color-*）
  → semantic.css（--app-color-notice-{type}-{role} 共 8 个角色/类）
    → scan-notice-theme.css（--scan-notice-* → 上表直通）
      → ScanPopupNoticeBanner（noticeThemeShell = 主题根 + scan-notice-theme-*）
```

## 每类 8 个语义角色

| 后缀 | 用途 |
|------|------|
| `-accent` | 强调色、hover 边框、渐变收束高光 |
| `-bg` | Island 渐变起点（深色，如 `red-950` / `amber-950`） |
| `-bg-end` | Island 渐变终点（如 `red-700` / `amber-700`） |
| `-border` | 外框/内部分割 |
| `-text` | 标签/图标文字 |
| `-icon-bg` | 图标圆底 |
| `-icon-text` | 图标色 |
| `-pill` | 次要徽章底 |

改违规岛渐变 → `semantic.css` 里 `--app-color-notice-violation-bg` + `-bg-end`（例：`red-950` → `red-700`）。未绑卡琥珀：`amber-950` → `amber-700`。

## 硬性约束（扫码弹窗专用）

灵动岛叠在 **`scan-popup-backdrop` 暖桃渐变**上，不是普通页面底：

1. **`-bg` 禁止** `color-mix(..., transparent)` — 会透出渐变，看起来像「透明岛」。
2. 暗色 / 科幻主题应混 **`var(--app-color-surface-container)`** 或直接用 `*-100` / `*-950` 实色。
3. 色板必须存在于 `tokens.css`（曾误用不存在的 `--color-sky-*`，导致整组令牌失效）。
4. **三类详情弹窗统一** 使用 `ScanNoticeDoodleCard`（`scan-announcement-doodle.css`）：扫码公告、违规通告、未绑卡提示共用同一手绘便签卡，**无遮罩**；默认静态展示，仅右上角关闭按钮触发缩小消失动效。

## 组件挂载

`ScanPopupNoticeBanner` 在 Island 外层与 Portal 根挂：

- `theme.className` + `dark`（若暗色）
- `scan-notice-theme-announcement` | `violation` | `unbound`

## 相关文件

- `frontend/src/styles/semantic.css` — 改色入口
- `frontend/src/styles/scan-notice-theme.css` — Island / 弹窗样式
- `frontend/src/styles/scanPopupNotice.css` — 滚动条、周曲线（非灵动岛）
