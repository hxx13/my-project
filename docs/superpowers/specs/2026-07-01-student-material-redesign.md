# 申领物品页面 UI 品质提升 — 设计 Spec

> 日期: 2026-07-01 | 版本: v1 | 类型: 前端 UI 重构

## 背景

学生中心 → 申领物品页面（`/student/material`）存在多处设计品质缺陷，涉及硬编码颜色、组件状态缺失、信息层级扁平、弹窗体验不一致等问题。基于 Impeccable 产品 UI 品质标准 + Bento 令牌体系进行全面升级。

## 设计原则

- **产品 UI register**：设计服务于任务，非装饰
- **Bento 令牌**：所有颜色/间距/圆角走 `--student-*` / `--app-color-*` 体系
- **Impeccable 品质**：对比度 ≥4.5:1，排版克制，组件七态完整，零 AI 反模式

## 改动范围

### 文件
- `frontend/src/features/student/pages/student-material.tsx` — 主战场
- `frontend/src/components/material/MaterialSpecPickerSheet.tsx` — 规格选择器

### 不改
- 后端 API
- 移动端 MobileMaterialTab（独立迭代）
- 数据层 hooks / api

## 具体改动

### 1. 物品卡片 (MaterialItemCard)

| 项 | 当前 | 目标 |
|----|------|------|
| 缩略图 | 48px，无图显示"暂无图片" | 56px，无图显示物品首字大字 |
| 信息层级 | 名称+副标题+库存+操作挤同一行 | 主信息(14px)→辅助(12px)→分隔线→操作区 |
| 副标题 | line-clamp-2（高度不一） | 单行截断（卡片等距） |
| 库存 | 文字 "库存: 无限" | 胶囊标签 "库存充足/仅剩N件/已售罄" |
| 操作 | 裸 +/− 按钮 | 七态步进器，+按钮品牌色填充 |
| hover | 无 | 阴影微抬+边框色变 |

### 2. 分类侧栏

- 宽度 180→200px（中文不截断）
- 每项加物品数量 badge
- 激活态：全背景色 + 左侧 3px 圆角指示条
- hover 态补充

### 3. 规格选择器 (MaterialSpecPickerSheet)

- `bg-red-500` badge → `--student-danger`
- 新增显式关闭按钮（X）
- chip 选中态 border 1px→2px
- combo 行加卡片底色包裹
- "不选规格"行标签优化
- 入场动画 scale+fade 150ms

### 4. 提交确认弹窗 (新增)

- 使用已有 Dialog 组件
- 物品列表：缩略图首字+名称+规格+数量
- 合计行+取消/确认按钮
- 确认按钮有 loading 态

### 5. 申领栏 (CartSidebar)

- 关闭按钮 `&times;` → ✕ 图标按钮
- 空态：图标+"申领栏是空的"+"从左侧选择物品"+"去浏览物品"按钮
- Header: 标题+badge("3件"胶囊)
- 底部：左侧合计+右侧提交按钮

### 6. 加载态/空态/错误态

- 加载：分类侧栏骨架+物品骨架卡片+申领栏骨架
- 空物品："本分类暂无物品"+"切换分类"引导
- 空申领栏：教育性引导（教用户怎么用）
- 错误：ErrorRetry 组件+重新加载按钮

## 令牌合规检查

- [ ] 零 `bg-['#]` / `text-['#]` 硬编码
- [ ] 零 `bg-white` / `bg-slate-*` 裸色
- [ ] 零 `z-[0-9]` 裸 z-index
- [ ] 零 AI 反模式（侧边竖线/渐变文字/玻璃态/眉标/编号段）
- [ ] 组件七态完整
- [ ] 对比度 ≥4.5:1
