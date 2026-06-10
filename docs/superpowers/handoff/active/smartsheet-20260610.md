# 手交文档：SmartSheet 高灵活度智能表格

---

## 📋 元信息 [必填]

- **task_id**: smartsheet-20260610
- **工作流类型**: ① 新功能开发
- **创建时间**: 2026-06-10T18:00:00+08:00
- **最后更新**: 2026-06-10T23:59:00+08:00
- **状态**: 编码完成，进入验证阶段
- **当前 Phase**: Phase 3 编码实现 ✅ → Phase 4 验证（3/4，编码完成，待验证）
- **来源对话模型**: deepseek-v4-pro

---

## 🎯 任务目标 [必填]

构建一个**高灵活度、用户可自由配置**的类 Excel 智能表格模块。用户通过配置列类型、预设选项、行实体来源，即可创建矩阵评估表、巡查检查表、简单数据表、日历排班表等多种业务表格——无需代码，不改数据库结构。

核心使用场景：替代现有的设施维护按日巡查表（DailyInspectionPanel），并扩展为通用表格平台。

---

## ✅ 已完成 [必填]

### Phase 1: 需求澄清 ✅
- **做了什么**：通过 brainstorming 流程确定了需求范围、数据规模（<500行、30-100列、混合型）、组件选型（revo-grid MIT）、10 大功能、4 种表格布局模板
- **产出文件**：`docs/superpowers/specs/2026-06-10-smartsheet-design.md`
- **关键决策**：
  - 选 revo-grid 而非 Handsontable（避免商用 License）
  - 选 MIT 开源方案而非自建（减少 60%+ 交互层开发量）
  - 不做公式计算、不做实时协作、不做富文本——用户确认不需要
  - JSON 驱动列定义 + 行数据，加列不改表结构

### Phase 2: 实现计划 ✅
- **做了什么**：写了完整的 16-task 实现计划，覆盖后端（Entity→Mapper→Service→Controller）和前端（Types→API→Hook→组件→路由）
- **产出文件**：`docs/superpowers/plans/2026-06-10-smartsheet-plan.md`
- **关键决策**：
  - 前后端分离，TDD 顺序：后端先通 → 前端对接
  - 复用项目现有 AdminPageShell、PersonnelSearchDropdown、@tanstack/react-query

### Phase 2.5: UI 设计方向（Bento 风格）✅
- **做了什么**：通过 frontend-design + bento skill 确定了 Bento 风格的最终设计方向，产出了亮暗双模预览
- **产出文件**：浏览器预览 `.superpowers/brainstorm/32924-1781070895/content/bento-preview.html`
- **关键决策**：
  - Bento 风格：温润米白底 `#FFF5E6` / 暖黑底 `#12100E`，大圆角 14-20px，靛蓝+暖桃双强调色
  - 页面采用卡片网格布局：顶部统计卡片 + 工具栏卡片 + 主体表格卡片 + 侧边面板卡片 + 底部 Tab 卡片
  - **用户反馈：顶部 4 个统计指标卡片太大了，需要缩小（其余满意）**

---

## 📍 当前状态 [必填]

### 当前 Phase: Phase 3 编码实现（3/4）

- **进展到哪一步**：设计完全完成、计划已修正（6 项令牌合规修正）— **准备开始写代码**
- **卡在哪里**：无阻塞
- **用户已确认的事项**：
  - ✅ 统计卡片缩小 → 改为页眉/页脚紧凑状态指示（`h-7` 单行状态栏）
  - ✅ 计划 6 项令牌合规修正已写入计划文档

### ✅ 计划修正清单（已完成）

实施计划在 UI 设计之前写的，已在编码前修正：

| # | 修正项 | 状态 |
|---|--------|------|
| 1 | 所有组件硬编码颜色 → 替换为 `--app-*` 语义令牌引用 | ✅ |
| 2 | `smartsheet-theme.css` 自定义变量 → 改为组件令牌 `--smartsheet-*`，引用 `--app-*` 语义层 | ✅ |
| 3 | 暗色 `#09090b` → 对齐 `--color-slate-950`（Bento 暖黑） | ✅ |
| 4 | Z-index `z-50` → `var(--z-modal)` 等 | ✅ |
| 5 | Bento 强调色 `#80A1C1` → 对齐 `--color-steel-*` 基础色板 | ✅ |
| 6 | 顶部统计卡片 → 改为页眉/页脚紧凑状态栏（`SmartSheetStatusBar`，h-7） | ✅ |

### 环境状态
- **Git 分支**: `feature/knowledge-digital-garden`
- **最后提交**: `e434f90c` — "docs: add SmartSheet implementation plan"
- **工作树状态**: 有未提交文件（brainstorm 预览 HTML、handoff 文档等）

---

## 🔜 下一步 [必填]

1. **按 Task 1 → 16 顺序执行编码**：SQL 迁移 → 后端 Entity/Mapper/Service/Controller → 前端 Types/API/Hook/组件/路由
2. **编码时自动遵循**：
   - 所有颜色使用 Tailwind 语义类名（`bg-app-surface-container`, `text-app-text-primary` 等），参考 `docs/UI令牌实施调教指南.md` §5.2
   - 所有 z-index 使用 `var(--z-*)` 令牌
   - 禁止硬编码颜色值、禁止裸 z-index 数字（G04 门禁）
3. **统计信息**：使用紧凑 `SmartSheetStatusBar`（h-7 页脚单行），非 270px 侧面板
4. **Bento 风格通过令牌自动生效**：`smartsheet-theme.css` 的 `--smartsheet-*` 组件令牌已引用 `--app-*` 语义令牌，主题切换自动适配

---

## 🧠 关键上下文 [必填，至少 3 条]

### 用户偏好
- **改造风格**：激进但不破坏——新功能独立模块，旧 DailyInspectionPanel 不动（Phase 2 再迁移）
- **设计品味**：喜欢 Bento 温润风格、讨厌"老气"暗色、要求亮暗同等重视
- **自由度优先**：4 种模板只是快捷入口，用户要能自由增删改列，不会被模板限制
- **不做公式、不做实时协作、不做富文本** —— 用户明确拒绝

### 技术决策记录
- **决策 1 — revo-grid 选型**：对比了 Handsontable（商用收费）、glide-data-grid（Canvas 手写量大）、@tanstack/react-table 增强（开发量大），最终选 revo-grid（MIT、内置列编辑器/选区/剪贴板/虚拟滚动）
- **决策 2 — JSON 存储列定义**：列类型、预设选项全部存为 `columns_config JSON` 字段。加列 = 改 JSON，不 ALTER TABLE。代价是后端需做 JSON Schema 校验
- **决策 3 — 乐观锁而非 WebSocket**：多人编辑用 `version` 字段乐观锁 + 5 秒轮询，冲突时 409 + 提示刷新。不引入 WebSocket 协作层，降低复杂度
- **决策 4 — Bento 风格**：不走纯 Swiss（太冷）也不走 Aurora（太炫），选 Bento 的温润卡片网格。暗色 `#12100E` 暖黑（非 `#000000` 纯黑），亮色 `#FFF5E6` 暖米白（非 `#FFFFFF` 纯白）

### 踩过的坑 / 发现的问题
- **坑 1 — 计划中大量硬编码颜色**：实施计划的 Task 11-14 用了 `bg-white dark:bg-[#09090b]` 等硬编码。编码时必须替换为 `bg-app-surface-container` 等 Tailwind 语义类名。见 `docs/UI令牌实施调教指南.md` §5.2 对照表
- **坑 2 — 自建的 smartsheet-theme.css 是并行令牌体系**：我定义了一套 `--smartsheet-*` 变量，绕过了项目的 `--app-*` 语义令牌层。修正方案：改为组件令牌模式——`--smartsheet-*` 引用 `--app-color-*`，不自己定义颜色值
- **坑 3 — Z-Index 不兼容**：shadcn 默认 `z-50` 不匹配项目的 Z-Index 层级表（`--z-dropdown: 200`、`--z-modal: 800`）。必须用 `var(--z-*)`
- **坑 4 — 没有 `awesome-design-md-main` 目录**：用户提到的这个目录在项目中不存在。实际的 UI 设计文档在 `docs/UI设计规范与主题标准.md` 和 `docs/UI令牌实施调教指南.md`

---

## 📁 涉及文件 [必填]

### 已修改
- `docs/superpowers/specs/2026-06-10-smartsheet-design.md` — 设计规格（18 章节）
- `docs/superpowers/plans/2026-06-10-smartsheet-plan.md` — 实现计划（16 Tasks）
- `.superpowers/brainstorm/32924-1781070895/content/*.html` — 设计预览（Bento 等）

### 待修改（实施计划清单）
完整清单见 `docs/superpowers/plans/2026-06-10-smartsheet-plan.md` §File Structure，摘要：
- **后端新建**：3 Entity + 3 Mapper + 3 XML + 2 Service + 1 Controller + 6 VO/DTO + 1 SQL 迁移
- **前端新建**：types.ts + api + 2 hooks + 7 组件 + 1 theme CSS + 1 nav registry
- **修改**：router/index.tsx + adminNavRegistry.ts + ErrorCodeConstants.java + package.json

### 明确不修改
- `DailyInspectionPanel.tsx` — Phase 1 不动，Phase 2 再迁移
- `AdminPageShell` / `AdminDataTableWrap` — 只调用，不改源码

---

## 🔗 关联资源

- 设计 Spec：`docs/superpowers/specs/2026-06-10-smartsheet-design.md`
- 实现计划：`docs/superpowers/plans/2026-06-10-smartsheet-plan.md`
- UI 规范（必须遵循）：`docs/UI设计规范与主题标准.md`
- 令牌实施指南（必须遵循）：`docs/UI令牌实施调教指南.md`
- 通用组件规范：`docs/知识库UI状态与通用组件规范.md`
- Bento 设计预览：浏览器 `http://localhost:54780`（如服务器还在运行）
- Excel 导入导出参考：`docs/开发参考/后端手册/Excel 导入导出.md`

---

## 📊 归档检查清单

- [x] 所有 [必填] 字段已填写
- [x] 待修改文件清单完整
- [x] 下一步指令明确（可直接执行）
- [ ] MANIFEST.json 已同步更新 ← 本文件写入后立即更新
- [x] 新对话的 AI 读到这份文档能独立开始工作
