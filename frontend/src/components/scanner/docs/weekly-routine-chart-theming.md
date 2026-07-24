# 预期核心在馆时间带配色（AI 必读）

组件：`UiverseProfilePopup.tsx` → `WeeklyRoutineMatrixChart`  
CSS class：`CHART_CARD` = `scan-weekly-chart-card`

## 配色体系

扫码弹窗使用 **单一统一配色** `SCAN_PALETTE`（Bento 暖桃 `#FAD4C0` + 钢蓝 `#80A1C1`），不再提供多套色系切换。

## 正确链路（必须保持）

```
scanPopupTheme.SCAN_PALETTE
  → scanPopupTheme.scanPaletteCssVars()
    → UiverseProfilePopup Portal 根 div style={scanPaletteCssVars()}
      → --scan-card-tint / --scan-card-tint-dark
      → scanPopupNotice.css `.scan-weekly-chart-card`
```

曲线与边框：

- `--scan-chart-entry` / `--scan-chart-exit` / `--scan-chart-fill` / `--scan-chart-grid`
- `--scan-accent` / `--scan-glow`（外框边框与阴影）

三张主卡片：

- `.scan-profile-card` / `.scan-student-card` / `.scan-ai-card` 读 `--scan-profile-bg` 等同 family 变量

## 改色入口

1. **弹窗整体色调**：改 `scanPopupTheme.ts` 的 `SCAN_PALETTE`
2. **主题静态兜底**：同步 `semantic.css` 的 `--app-color-scan-*`
3. **不要**只改 semantic 指望 Portal 内动态色生效（无注入时才是兜底）

## 相关文件

| 文件 | 职责 |
|------|------|
| `scanPopupTheme.ts` | `SCAN_PALETTE`、`scanPaletteCssVars` |
| `UiverseProfilePopup.tsx` | Portal 根 `style={scanPaletteCssVars()}` |
| `scanPopupNotice.css` | `.scan-weekly-chart-*`、`.scan-*-card` 只读 `--scan-*` |
| `semantic.css` | `--app-color-scan-*` 静态兜底 |
