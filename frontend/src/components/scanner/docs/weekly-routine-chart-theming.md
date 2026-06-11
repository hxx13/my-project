# 「预期核心在馆时间带」配色说明

组件：`UiverseProfilePopup.tsx` → `WeeklyRoutineMatrixChart`

## 背景框（已修复）

原先 `CHART_CARD` 写死 `bg-[#1c1410]` / `dark:bg-[#0f0b09]`，无论亮色主题还是切换左上角色系，外框始终是深暖棕。

现已改为 CSS 类 `scan-weekly-chart-card`（`scanPopupNotice.css`）：

| 模式 | 背景令牌 |
|------|----------|
| 亮色 | `var(--scan-card-tint)` — 随当前 `SCAN_COLOR_SCHEMES` 变化（如桃色 `#fff5f3`、琥珀 `#fffbf0`） |
| 暗色 | `var(--scan-card-tint-dark)` |

边框与阴影使用 `var(--scan-accent)`、`var(--scan-glow)`，与 AI 预测卡、Profile 卡同一套 `schemeCssVars` 注入链路。

## 其他元素

- 标题 / 坐标 / 星期：`--app-color-text-*`
- 曲线：`--scan-chart-entry` / `--scan-chart-exit` / `--scan-chart-fill`
- 网格：`--scan-chart-grid`（由 `schemeCssVars` 按 accent 生成）
- Time Band 徽章：`scan-weekly-chart-badge`

## 相关文件

- `frontend/src/styles/scanPopupNotice.css` — `.scan-weekly-chart-card`
- `frontend/src/components/scanner/scanPopupTheme.ts` — `CHART_CARD`、`schemeCssVars`
- `frontend/src/components/scanner/UiverseProfilePopup.tsx` — 组件实现
