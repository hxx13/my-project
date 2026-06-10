# 知识库数字花园重构 — 设计规格

> **目标**：将现有知识库从"多页面跳转模式"重构为"单页应用壳"的数字花园，实现沉浸式文档浏览体验。
>
> **参考**：doc.iocoder.cn（芋道 VuePress 文档站）+ Obsidian 知识图谱 + Git-log 时间线
>
> **交付对象**：下一个 Agent（AI 开发者），本文档是完整的设计规格。
>
> **设计日期**：2026-06-10
>
> **版本**：v1
>
> **依赖规格**：本规格是对 `docs/数字花园设计计划.md`（v2）的补充和局部重构，不替代原规格。原规格中未被本节覆盖的部分（如后端 API 端点、安全设计、导入流程、测试边界等）仍然有效。

---

## 一、问题陈述

### 1.1 当前问题

| # | 问题 | 影响 |
|---|------|------|
| 1 | 点击左侧目录项 → 路由跳转 `navigate(/admin/knowledge/page/:pageId)` → 整页重渲染 | 割裂感，不像"花园" |
| 2 | 目录滚动框和布局不符合极客风审美 | 缺乏沉浸感 |
| 3 | 缺少知识图谱可视化 | 无法感知文档间的关系 |
| 4 | 缺少编辑/更新的时间线视图 | 无法感知花园"生长" |
| 5 | 仪表盘首页只是提示文字 | 缺乏"进入花园"的仪式感 |
| 6 | 没有标签系统 | 检索维度只有分类+搜索 |
| 7 | 没有反向链接（backlinks） | 文档孤立，不成网络 |

### 1.2 用户愿景

- 预置 326 篇 YUDAO 导入文档作为"种子"
- Agent 和人工可持续编写新文档
- 形成标准的文档管理体系
- 整体风格：**极客风数字花园**（白底阅读 + 暗色代码 + 终端美学 + 知识图谱）

---

## 二、架构决策

### 2.1 核心决策：单页应用壳（Single-Page App Shell）

**选定方案 A**：将原有 5 条独立路由合并为 1 条 `/admin/knowledge`，内部视图切换全由 React state 驱动。

| 维度 | 旧架构 | 新架构 |
|------|--------|--------|
| 路由数 | 6 条 | **1 条** |
| 页面跳转 | 每次点击 = 整页导航 | **零跳转**，state 切换 |
| 深链接 | 路由参数 | query params（`?page=42&view=graph`） |
| 页面组件 | 4 个独立 Page | **1 个 KnowledgeShell** |

### 2.2 路由设计

| 路由 | 用途 |
|------|------|
| `/admin/knowledge` | 知识花园主壳，默认展示仪表盘 |
| `/admin/knowledge?page=42` | 深链接：直接打开某篇文档 |
| `/admin/knowledge?view=graph` | 知识图谱视图 |
| `/admin/knowledge?view=timeline` | 生长记录时间线 |
| `/admin/knowledge?edit=42` | 编辑模式 |
| `/admin/knowledge?new` | 新建文档（编辑模式） |

所有 query params 变化不触发路由重载，仅更新组件内部 state。浏览器前进/后退由 `useSearchParams` 监听。

### 2.3 权限

知识库入口权限保持现有 `AdminAccessGuard`（STAFF+）。编辑操作由 `AdminGuard`（ADMIN+）控制。分类管理由 `SuperAdminGuard` 控制。这与原规格一致。

---

## 三、壳布局设计

### 3.1 KnowledgeShell 结构

```
┌──────────────────────────────────────────────────────────┐
│  Tab Bar: 📄文档浏览 | 🕸️知识图谱 | 🌱生长记录    [+ 新建] [⚙] │
├──────────┬────────────────────────────────┬──────────────┤
│ 左侧目录  │        中间面板                   │  右侧面板     │
│ (260px,  │  浏览视图: 仪表盘/文档正文          │ (200px,      │
│  可拖拽)  │  图谱视图: 力导向图                │  xl:block)   │
│          │  时间线: Git-log 风格              │              │
│ 📁 分类树 │  编辑器: Markdown 编辑             │  浏览: 大纲    │
│ 🏷️ 标签云 │                                   │  + 反向链接   │
│          │                                   │  编辑: 元数据   │
│          │                                   │  + 版本列表   │
├──────────┴────────────────────────────────┴──────────────┤
│  Status Bar: 🟢 326 篇 · 23 分类 · 58 标签 · 最近更新 2h前    │
└──────────────────────────────────────────────────────────┘
```

### 3.2 中间面板状态机

| 条件 | 中间面板内容 | 右侧面板内容 |
|------|------------|------------|
| 无选中文档 + 浏览 | **仪表盘**（统计+标签云+卡片网格） | 隐藏或显示花园统计 |
| 选中文档 + 浏览 | **文档正文**（面包屑+内容+上一篇/下一篇） | 大纲 + 反向链接 |
| 图谱视图 | **知识图谱**（筛选面板+力导向画布） | 隐藏 |
| 时间线视图 | **生长记录**（筛选面板+垂直时间线） | 隐藏 |
| 编辑模式 | **编辑器**（标题/分类/slug/标签/MD编辑区） | 元数据 + 最近版本 |

### 3.3 左侧目录设计

- 宽度默认 260px，**可拖拽调整**（180px ~ 400px），位置持久化到 `localStorage`
- 顶部：搜索输入框（即时过滤）
- 中部：分类树（递归展开/折叠，当前文档高亮）
- 底部：标签云（按 count 加权字号），点击标签过滤树和卡片

### 3.4 设计决策记录

| 决策 | 选项 | 结论 |
|------|------|------|
| 版本历史展示 | A.壳内弹窗 / B.独立路由 / C.侧边栏 | **A.壳内弹窗**（从右侧滑入） |
| 左侧栏宽度 | A.可拖拽 / B.固定+折叠 / C.保持现状 | **A.可拖拽**（180-400px） |
| 反向链接来源 | A.手动[[wikilink]] / B.自动扫描 / C.两者结合 | **C.两者结合**（手动优先显示） |

---

## 四、知识图谱视图

### 4.1 布局

进入图谱视图时，左侧目录精简为筛选面板，中间为全宽力导向图，右侧栏隐藏。

### 4.2 数据模型

- **Nodes**：每篇文档一个节点，大小 = 被引用次数（加权），颜色 = 所属分类
- **Edges**：实线 = 手动 `[[wikilink]]`，虚线 = 自动扫描发现
- 独立 API：`GET /api/admin/knowledge/graph?categoryId=&tag=`

### 4.3 交互

- 拖拽节点、滚轮缩放、画布平移
- 悬停节点 → 弹出文档卡片（标题/引用数/被引用数/最后更新）
- 点击卡片"打开文档" → 切换到浏览视图并选中该文档
- 左侧筛选：按分类（checkbox）/ 按标签 / 按引用深度

### 4.4 技术选型

**D3.js forceSimulation**，Canvas 渲染（500+ 节点无性能压力）。

新增后端 Service：
- `WikilinkScanner`：正则扫描 `content_md` 中的 `[[title]]`
- `ReferenceAnalyzer`：基于标题关键词共现 + 分类相似度自动发现潜在引用
- `GraphService`：合并手动+自动引用，构建 nodes+edges，计算引用权重

---

## 五、生长记录时间线

### 5.1 布局

Git-log 风格垂直时间线。左侧筛选面板，右侧时间线主体。

### 5.2 数据来源

复用现有 `knowledge_history` 表，**无需新建表**。

事件类型推断规则：
- `version=1` → 🆕 新建
- `source='imported'` → 📥 导入
- `summary` 含 "回滚" → ⏪ 回滚
- 其余 → ✏️ 编辑

### 5.3 API

`GET /api/admin/knowledge/timeline?limit=50&type=all|created|edited|imported|rollback&author=&since=`

### 5.4 交互

- 日期分组（今天/昨天/日期），可折叠
- 左侧筛选：事件类型 / 作者 / 时间范围
- 点击条目 → 切换到浏览视图打开对应文档
- 无限滚动加载更多

---

## 六、编辑器工作流

### 6.1 入口

| 入口 | 位置 | 行为 |
|------|------|------|
| 顶栏 "+ 新建" | Tab Bar 右侧 | 中间面板切换编辑器，空白状态 |
| 文档底部 "编辑" | 文档内容区 | 中间面板切换编辑器，加载现有内容 |
| Agent API | `POST /api/admin/knowledge/pages/import` | 后端自动创建，source='agent' |

### 6.2 编辑器布局

- 左侧目录树**常驻不消失**
- 中间面板切换为编辑器（标题 / 分类 select / slug 输入 / 标签输入 / Markdown 编辑区 / 修改摘要）
- 右侧面板切换为元数据（版本/作者/来源/时间） + 最近 5 个版本列表

### 6.3 编辑器行为

- 有 `content_md` → Markdown 编辑器（Textarea 增强版，支持语法高亮）
- 仅有 `content_html` → HTML 简易编辑器（contenteditable）
- 新建文档默认 Markdown 模式
- slug 从标题自动生成拼音，可手动修改
- `[[wikilink]]` 语法实时高亮 + 自动补全已有文档标题（模糊匹配）
- `Ctrl+S` 快捷保存
- 保存成功后自动切换到浏览视图

### 6.4 保存流程

1. 前端提交 `PUT /api/admin/knowledge/pages/{id}`（含 tags）
2. 后端 flexmark MD→HTML → jsoup 清洗 → 写入 `content_html`
3. 后端 `WikilinkScanner` 扫描 `content_md` 中的 `[[title]]`，更新引用关系
4. `version+1`，插入 `knowledge_history` 快照
5. 前端 invalidate 相关 queries → 自动刷新目录树 + 大纲 + 反向链接

### 6.5 版本历史（壳内弹窗）

点击"历史"→ 右侧滑入 Drawer：
- 垂直时间线展示所有版本
- 每个版本显示：版本号、作者、时间、修改摘要
- 点击某版本 → 展示该版本内容预览
- "回滚到此版本"按钮（ADMIN+）

---

## 七、标签系统与仪表盘

### 7.1 标签数据模型

`knowledge_pages` 表新增 `tags JSON DEFAULT '[]'` 列。

```json
["Spring", "ORM", "后端"]
```

MVP 用 JSON 数组，不建独立关联表。后续可升级。

### 7.2 标签 API

- `GET /api/admin/knowledge/tags?categoryId=` → `[{name: "Spring", count: 42}, ...]`
- 标签云按 count 加权字号（10px ~ 16px）
- 点击标签 → 筛选左侧目录树 + 仪表盘卡片

### 7.3 仪表盘（无选中文档时的中间面板）

```
┌──────────────────────────────────────────┐
│  📊 326 文档 · 23 分类 · 58 标签 · 2h前   │  ← 统计卡片
├──────────────────────────────────────────┤
│  🏷️ 标签云: Spring AI 后端 React ...      │  ← 点击筛选
├──────────────────────────────────────────┤
│  📄 文档卡片网格（3列）                      │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐  │
│  │ MyBatis   │ │ RAG 检索  │ │ RabbitMQ  │  │
│  │ #Spring   │ │ #AI #LLM │ │ #中间件    │  │
│  └──────────┘ └──────────┘ └──────────┘  │
│  ...                                      │
└──────────────────────────────────────────┘
```

### 7.4 仪表盘 API

`GET /api/admin/knowledge/stats` → `{ totalPages, totalCategories, totalTags, lastUpdated }`

---

## 八、数据模型变更汇总

### 8.1 数据库（1 个 ALTER）

```sql
ALTER TABLE knowledge_pages ADD COLUMN tags JSON DEFAULT '[]';
```

`knowledge_categories` 和 `knowledge_history` 表不变。

### 8.2 新增 API（6 个端点）

| 方法 | 路径 | 用途 |
|------|------|------|
| `GET` | `/api/admin/knowledge/graph` | 图谱数据 {nodes, edges} |
| `GET` | `/api/admin/knowledge/pages/{id}/backlinks` | 反向链接列表 |
| `POST` | `/api/admin/knowledge/graph/rebuild` | 触发全量引用分析重建 (SUPER_ADMIN) |
| `GET` | `/api/admin/knowledge/timeline` | 时间线数据 |
| `GET` | `/api/admin/knowledge/tags` | 标签云 [{name, count}] |
| `GET` | `/api/admin/knowledge/stats` | 仪表盘统计 |

### 8.3 修改现有 API（1 个）

`PUT /api/admin/knowledge/pages/{id}` — 请求体新增 `tags` 字段；保存时自动扫描 `[[wikilink]]`

### 8.4 新增后端 Service（3 个）

| Service | 职责 |
|---------|------|
| `WikilinkScanner` | 正则扫描 MD 中的 `[[title]]`，返回引用列表 |
| `ReferenceAnalyzer` | 关键词共现 + 分类相似度自动发现潜在引用 |
| `GraphService` | 合并手动+自动引用，构建 nodes+edges，计算权重 |

### 8.5 新增后端 Controller

| Controller | 说明 |
|-----------|------|
| `KnowledgeGraphController` | `/api/admin/knowledge/graph/**` |
| `KnowledgeTimelineController` | `/api/admin/knowledge/timeline/**` |
| `KnowledgeTagController` | `/api/admin/knowledge/tags/**` |
| `KnowledgeStatsController` | `/api/admin/knowledge/stats/**` |

### 8.6 前端变更

| 变更 | 内容 |
|------|------|
| **新建** | `features/knowledge/components/KnowledgeShell.tsx` — 主壳组件 |
| **新建** | `features/knowledge/components/KnowledgeGraphView.tsx` — 图谱视图 |
| **新建** | `features/knowledge/components/KnowledgeTimelineView.tsx` — 时间线视图 |
| **新建** | `features/knowledge/components/KnowledgeDashboard.tsx` — 仪表盘 |
| **新建** | `features/knowledge/components/KnowledgeHistoryDrawer.tsx` — 历史弹窗 |
| **新建** | `features/knowledge/hooks/useKnowledgeShell.ts` — 壳状态管理 |
| **修改** | `KnowledgeLayout.tsx` — 支持可拖拽分隔线 |
| **修改** | `KnowledgeCategoryTree.tsx` — 标签筛选 + 点击切换 state 不导航 |
| **修改** | `KnowledgePageRenderer.tsx` — 支持 [[wikilink]] 渲染为可点击链接 |
| **修改** | `KnowledgeEditorPanel.tsx` — [[wikilink]] 自动补全 + 标签输入 |
| **删除** | `AdminKnowledgePageDetail.tsx` — 并入 KnowledgeShell |
| **删除** | `AdminKnowledgeEditorPage.tsx` — 并入 KnowledgeShell |
| **删除** | `AdminKnowledgeHistoryPage.tsx` — 并入 KnowledgeHistoryDrawer |
| **重写** | `AdminKnowledgeHomePage.tsx` — 简化为 KnowledgeShell 的挂载点 |
| **修改** | `router/index.tsx` — 删除 5 条路由，保留 1 条 |
| **新建** | `api/domains/knowledge.api.ts` — 新增 6 个 API 调用函数 |

---

## 九、极客风视觉语言

### 9.1 色彩系统

| 区域 | 底色 | 强调色 | 代码底色 |
|------|------|--------|---------|
| 文档阅读 | 白 #fff | 青蓝 #11a8cd | GitHub Dark #0d1117 |
| 代码块 | #0d1117 | 蓝 #58a6ff | #0d1117 |
| 图谱画布 | 暗蓝渐变 | 节点色按分类 | #0a0f1a → #111827 |
| 终端元素 | #0d1117 | 绿 #3fb950 | #0d1117 |
| 时间线 | 浅色 | 事件色按类型 | — |

### 9.2 字体系统

| 用途 | 字体栈 | 字号 |
|------|--------|------|
| 正文阅读 | 'Inter', 'Noto Sans SC', system-ui | 14px |
| 标题 | 同上 | 18-24px |
| 代码块 | 'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace | 13px |
| 技术元数据（slug/版本/标签/时间戳） | 'JetBrains Mono', monospace | 10-12px |

### 9.3 极客细节

- 代码块：macOS 三灯窗口控件（红黄绿）+ 文件名标题栏
- 终端风格：`user@knowledge:~/category$ cat document.md` 标题装饰
- 暗色图谱：夜空中的知识星系，节点带发光效果
- 动效克制：150-250ms，只在目录展开/文档切换/编辑器出入/视图切换时触发
- 复用项目现有 `--app-color-*` CSS 变量体系
- 新增专用变量：`--knowledge-code-bg` `--knowledge-graph-bg`

### 9.4 动效规范

| 场景 | 动效 | 时长 |
|------|------|------|
| 目录树展开/折叠 | max-height + opacity transition | 200ms ease-out |
| 文档内容切换 | cross-fade | 150ms |
| 编辑器 ↔ 浏览 | scale(0.98→1) + opacity | 200ms |
| 视图切换 tab | 下划线 slide + 内容 cross-fade | 200ms |
| 图谱节点悬停 | D3 force 实时 + 卡片 pop-in | 实时 60fps |
| 历史弹窗 | 右侧滑入 + backdrop blur | 250ms cubic-bezier |

---

## 十、组件树

```
AdminKnowledgeHomePage (挂载点，路由 /admin/knowledge)
└── KnowledgeShell (主壳)
    ├── TabBar (视图切换 + 新建按钮)
    ├── LeftPanel
    │   ├── SearchInput
    │   ├── KnowledgeCategoryTree (重构：点击不导航，回调 onSelectPage)
    │   └── TagCloud
    ├── CenterPanel (状态机驱动)
    │   ├── KnowledgeDashboard (无选中 + 浏览)
    │   ├── KnowledgePageRenderer (选中文档 + 浏览)
    │   ├── KnowledgeGraphView (图谱)
    │   ├── KnowledgeTimelineView (时间线)
    │   └── KnowledgeEditorPanel (编辑模式)
    ├── RightPanel
    │   ├── KnowledgePageOutline (浏览时)
    │   ├── BacklinksList (浏览时，反向链接)
    │   └── EditorMetaSidebar (编辑时)
    ├── KnowledgeHistoryDrawer (壳内弹窗)
    └── StatusBar (底部状态栏)
```

---

## 十一、与原规格的关系

本规格是对 `docs/数字花园设计计划.md`（v2）的**局部重构**，不替代原规格：

- **保留不变的**：数据库三表结构（仅加一个 tags 列）、后端包结构、安全设计、YUDAO 导入流程、错误码、测试边界、与其他模块的关系
- **修改的**：前端路由架构（多路由→单路由）、前端组件结构（4 Page→1 Shell+多 View）、部分 API 端点（新增 6 个）
- **新增的**：知识图谱、生长时间线、标签系统、仪表盘、反向链接、极客风视觉设计

---

## 十二、实施阶段

### Phase 1：壳 + 浏览打通（核心）

1. 创建 `KnowledgeShell` + `useKnowledgeShell` 状态管理
2. 重构 `KnowledgeCategoryTree`，点击回调 onSelectPage 不导航
3. 合并 Detail/Editor/History 页面到 Shell 内
4. 可拖拽左侧栏 + 三栏响应式
5. 删除旧路由，简化 `AdminKnowledgeHomePage` 为 Shell 挂载点
6. 仪表盘首页（统计 + 标签云 + 卡片网格）

### Phase 2：图谱 + 时间线

1. 后端：`WikilinkScanner` + `ReferenceAnalyzer` + `GraphService`
2. 后端：Graph/Timeline/Tag/Stats 四个新 Controller
3. `ALTER TABLE knowledge_pages ADD COLUMN tags JSON`
4. 前端：`KnowledgeGraphView`（D3.js）
5. 前端：`KnowledgeTimelineView`
6. 前端：`KnowledgeHistoryDrawer`

### Phase 3：编辑器增强

1. `[[wikilink]]` 自动补全
2. 标签输入组件
3. 编辑器 ↔ 浏览切换动效
4. Ctrl+S 保存

### Phase 4：极客风润色

1. GitHub Dark 代码块主题
2. JetBrains Mono 字体集成
3. 终端风格装饰元素
4. 图谱画布暗色渐变
5. 浏览/编辑过渡动效
6. 底部状态栏

---

## 十三、待定项（后续迭代）

| 项目 | 说明 |
|------|------|
| 乐观锁冲突检测 | 当前最后保存者胜出，后续可加 version 校验 |
| 标签升级为独立表 | 当前 JSON 列满足 MVP，后续可建 `knowledge_tags` 多对多 |
| 图谱 3D 模式 | 可考虑 Three.js 实现 3D 知识星系 |
| 文档 Diff 对比 | 两个版本之间的内容 diff 可视化 |
| 协同编辑 | 多人同时编辑（需 WebSocket） |

---

*本文档交付给下一个 Agent 作为实现规格。所有细节已明确，无模糊空间。*
*版本 v1 — 2026-06-10*
