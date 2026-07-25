# 平板 / 大屏适配（TABLET_ADAPTER）

依据微信文档：[响应显示区域变化](https://developers.weixin.qq.com/miniprogram/dev/framework/view/resizable.html)、[大屏适配指南](https://developers.weixin.qq.com/miniprogram/design/adapt.html)。

## 本包包含

| 文件 | 作用 |
|------|------|
| `app.json` 根级 `"resizable": true` | 大屏设备启用可调显示区域（含部分安卓平板环境） |
| `app.json` → `window.pageOrientation`: `"portrait"` | **全局竖屏**，避免 `resizable` + `auto` 在部分华为平板上默认横屏、竖持设备仍横屏的问题 |
| `app.wxss` → `@import "./styles/tabletAdapter.wxss"` | 全局低风险样式入口，可按需追加 `@media` |
| `styles/tabletAdapter.wxss` | `page` + 大屏 `@media` 下按钮/Vant 变量、常用 `.btn-pill` / `.top-pill` |

## 一键回滚（恢复改动前行为）

1. 打开 `app.json`，删除根对象的 **`"resizable": true`**（注意尾随逗号合法）。
2. 删除 `window` 内的 **`"pageOrientation": "portrait"`**。
3. 打开 `app.wxss`，删除 **`@import "./styles/tabletAdapter.wxss";`** 及上方注释（若有）。
4. 删除 **`styles/tabletAdapter.wxss`**（与本 README）。

## 副作用提示

- **PC 微信**等大屏上默认窗口可能变大或可拉伸；若仅需手机体验，请回滚 `resizable`。
- 当前使用 **`pageOrientation": "portrait"`**：手机与平板小程序均以竖屏为主（与多数页面设计一致）。若你希望 **平板横屏阅读**，可改为 `"auto"` 或 `"landscape"` 并自测华为机型（可能与 `resizable` 组合出现异常）。
- **`styles/tabletAdapter.wxss`** 内 `@media (min-width: 480px)`：略收紧按钮/pill 的 px，减轻大屏 rpx 放大导致的控件比例脱节；不需要时可删文件内 `@media` 段或整文件。
