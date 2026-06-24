# 门禁应用页面重设计

## 目标

重设计小程序「我的 → 门禁应用」页面，解决平铺展开、无状态分类、交互粗糙的问题。

## 当前问题

1. 所有通道平铺，在线/离线仅用小标签区分，无分组
2. 每条通道 5 个按钮平铺，未区分即时操作和状态开关
3. 后端支持 `channelType` + `remarkCategoryId` 分类，前端未使用
4. 搜索框无 Enter 键触发，必须点击"检索"按钮
5. 操作成功仅 `wx.showToast`，失败弹 Modal，无内联反馈

## 设计方案

### 页面结构

```
搜索栏（Enter触发 + 500ms防抖自动搜索）
分类 Tab 横向滚动（全部 / 各 remarkCategory）
每组内：在线通道 → 分隔线 → 离线通道
底部状态统计（在线N通道 · 离线N通道）
```

### 操作分类

| 操作 | 性质 | 交互 |
|------|------|------|
| 开门 / 关门 | 一次性即时操作 | 按钮点击 → loading → 卡片内联结果动画 |
| 常开 / 常闭 / 普通 | 持续性状态开关 | 点击当前模式标签 → ActionSheet 三选一 → 标签实时更新 |

### 卡片布局

- 左侧/主体：当前模式标签（常开绿/常闭红/普通灰/离线半透明），可点击切换
- 右侧：开门 + 关门两个小按钮

### 通知改进

- 去掉系统 toast 和 Modal
- 卡片内联结果横幅动画：
  - 成功：绿色边框脉冲闪烁 + 结果文字滑入，3秒自消
  - 失败：红色边框闪烁 + 错误文字滑入，手动关闭

### 搜索改进

- `bindconfirm` 捕获 Enter 键触发搜索
- 500ms 防抖自动搜索（输入停止 500ms 后自动触发）

### 模式标签

| 模式 | 颜色 | 文字 |
|------|------|------|
| STAY_OPEN | 绿底 | 常开 |
| STAY_CLOSE | 红底 | 常闭 |
| NORMAL | 灰底 | 普通 |
| 设备离线 | 灰描边+半透明 | 离线 |

## 涉及文件

- `aroapp/miniprogram/package-feature/pages/doorControl/index.wxml` — 模板重写
- `aroapp/miniprogram/package-feature/pages/doorControl/index.js` — 逻辑重构
- `aroapp/miniprogram/package-feature/pages/doorControl/index.wxss` — 样式重写
- `aroapp/miniprogram/package-feature/utils/doorControlApi.js` — 可能需要扩展 API 调用

## 技术约束

- WeChat 小程序原生框架（无第三方 UI 库依赖）
- 使用 Vant Weapp 组件（`van-action-sheet` 用于模式切换选择）
- 后端 API 不变，前端仅调整展示和交互
