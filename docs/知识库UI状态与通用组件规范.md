# 知识库模块 UI 状态规范 & 全站通用组件规范

> **定位**：知识库模块全部 UI 状态的视觉规格 + 全站通用表单/数据/反馈/页面框架规范。与 [UI设计规范与主题标准.md](UI设计规范与主题标准.md) 的设计令牌结合使用——本文档定义"怎么用"，上级文档定义"用什么值"。
>
> **设计日期**：2026-06-09
>
> **适用范围**：知识库模块（实验落地）+ 全站通用组件

---

## 一、知识库模块 — 状态 UI 规范

### 1.1 加载态

#### 场景 1：页面初次加载（目录树 + 内容区）

左侧目录树骨架：8 行灰色脉冲块（3 个分类标题 + 6 个文档占位），每行宽窄交替。右侧内容区骨架：标题宽条 + 元数据窄条 + 分割线 + 4 段文字块（宽窄交替）+ 1 个代码块占位（深色矩形）。

- 动画：复用已有 `animate-skeleton-pulse`（1.8s ease-in-out 无限循环）
- 组件：复用 `DataSkeleton`，传入 `lines` 控制行数
- 首次加载（无缓存）：显示完整双栏骨架
- 二次加载（有缓存 stale）：仅内容区显示骨架，目录树保留上次数据

#### 场景 2：切换文档（内容刷新中）

仅右侧内容区骨架。左侧目录树保留，不闪烁。

#### 场景 3：搜索加载中

搜索框尾部显示旋转图标，右侧内容区显示 3 行卡片式骨架。

### 1.2 空状态

四类空状态均复用 `EmptyState` 组件。

#### 空状态 1：知识库无内容

```
Icon: BookOpen (64px, 灰色)
标题: 知识库还是空的
描述: 创建第一篇文档或导入开发手册来开始
操作: [导入文档]（主按钮）+ [新建文档]（描边按钮）
权限: ADMIN+ 可见操作按钮
```

#### 空状态 2：分类下无文档

```
Icon: FolderOpen (48px, 灰色)
标题: 该分类下暂无文档
操作: 无（普通 STAFF 无编辑权限）
```

#### 空状态 3：搜索无结果

```
Icon: Search (48px, 灰色)
标题: 没有找到相关内容
描述: 试试其他关键词或浏览分类查找
操作: [浏览全部分类]（描边按钮）
```

#### 空状态 4：版本历史为空（编辑器底部）

单行灰色文字 "暂无修改历史"。字号 `var(--font-size-xs)`。

### 1.3 错误态

五类错误态，复用 `ErrorRetry` 组件。

#### 错误 1：API 请求失败

```
Icon: AlertTriangle (48px)
标题: 加载失败
描述: 无法获取文档内容，请检查网络后重试
操作: [重新加载]（调用 refetch()）
防抖: 10 秒内重复失败不重复弹出 Toast
```

#### 错误 2：文档不存在 (404)

```
Icon: FileQuestion (48px)
标题: 文档不存在或已被删除
描述: 该页面可能已被移动、删除，或链接无效
操作: [返回知识库首页]
```

#### 错误 3：权限不足 (403)

仅 `/edit` 路由触发，STAFF 角色直接看到此页而非空白闪烁：

```
Icon: Lock (48px)
标题: 暂无编辑权限
描述: 如需编辑文档，请联系管理员开通
操作: [返回阅读模式]
```

#### 错误 4：保存冲突 (409)

Toast 提示，不跳页。红色 Toast（8 秒），带 `[刷新页面]` 按钮。

```
⚠️ 保存失败 · 该文档已被其他人修改，请刷新后重试
```

#### 错误 5：批量导入结果抽屉

Toast 显示摘要，点击展开右侧 Sheet：

```
导入完成：320 成功 · 6 跳过  [查看详情 →]
```

Sheet 内容：
```
标题: 导入结果
摘要行: ✅ 成功导入 320 个文件 / ⚠️ 跳过 6 个文件
跳过列表（文件名 + 原因）:
  - index.html — 无法提取标题
  - config.html — 分类目录解析失败
  - guide (副本).html — 重复 slug
```

Sheet 宽度 400px，复用 `DialogContent variant="rightSheet"`。

### 1.4 导入进度

#### 导入对话框

```
触发: 分类树上方工具栏 [导入文档] 按钮 (ADMIN+)
标题: 导入文档
内容:
  - 目标分类（Select 下拉）
  - 导入方式（Radio: 上传文件 / 粘贴内容）
  - 拖拽上传区（虚线框，支持 .md .html，最多 50 个文件）
  - 已选文件列表（文件名 + 格式图标 + [移除] 按钮）
  - 作者标识输入框（默认 agent:claude:opus-4）
  - 底部: [取消] + [开始导入 (N)]
```

上传区空闲态：
```
边框: 2px dashed var(--app-color-border-default)
背景: var(--app-color-surface-page)
文字: 拖拽文件到此处或点击选择 · 支持 .md .html 格式 · 单次最多 50 个文件
Hover: 边框色变为 var(--app-color-accent)，背景 var(--app-color-accent-soft)
```

#### 导入进行中 Toast

```
右上角 Toast（不阻塞操作）:
📥 正在导入... 156/326
████████████████████░░░░░░ 78%
```

每完成一个文件更新进度，文件级别的错误不中断整体流程。

#### 导入完成 Toast

```
全部成功: ✅ 绿色 Toast，3s 消失
部分失败: ⚠️ 黄色 Toast，8s，"N 个跳过，点击查看详情"
全部失败: ❌ 红色 Toast，12s，"导入失败，点击查看详情"
```

#### YUDAO 初始批量导入

326 个文件的初始导入不走前端 UI——由启动脚本直接调用 Service 层，结果打印到服务端控制台。前端只处理日常增量导入（≤50 个文件/次）。

### 1.5 编辑器交互

#### 工具栏

```
[H1] [H2] [H3] [B] [I] [```] [🔗] [📎] ｜ [预览] [保存]
```

Markdown 模式全显，HTML 模式仅显示 [预览] [保存]。每个按钮操作**仅修改编辑区文本，不提交数据**。

#### 编辑/预览切换

顶部 Tab 切换：`[编辑] [预览]`。切换动效 `fade-in 0.2s`。预览模式复用 `KnowledgePageRenderer`。

#### 快捷键

| 快捷键 | 作用 |
|--------|------|
| `Ctrl+S` / `Cmd+S` | 保存 |
| `Ctrl+Shift+P` | 切换预览 |
| `Esc` | 退出编辑（有未保存内容弹确认框） |

#### 退出确认

有未保存修改时，点击返回/关闭弹出确认框：

```
标题: 未保存的更改
描述: 你有未保存的修改，是否放弃？
按钮: [继续编辑]（主按钮，聚焦） [放弃更改]
```

#### 保存反馈

- 保存中：工具栏 [保存] 按钮替换为菊花 + "保存中..."
- 保存成功：右上角绿色 Toast "文档已保存"，2s 消失
- 保存失败：红色 Toast（见错误 4）

### 1.6 版本历史与 Diff

#### 版本历史时间线

```
● v3  ← 当前
│  2026-06-10 09:15 · Claude · 修复代码示例
│  [对比当前]
│
○ v2
│  2026-06-09 16:20 · Admin · 补充配置说明
│  [对比 v3]  [回滚到此版本]
│
○ v1
  2026-06-09 14:30 · agent:claude:opus-4 · 初始导入
  [对比 v2]
```

- 当前版本：实心蓝色圆点
- 历史版本：空心灰色圆点
- 每项含时间、作者、修改摘要
- 操作按钮右对齐

#### 回滚确认

```
标题: 回滚确认
描述: 将当前内容回滚到 v{N}（{时间}），当前内容将作为 v{N+1} 保存到历史记录。
按钮: [取消] + [确认回滚]（危险按钮）
```

#### Diff 对比视图

点击 `[对比 vN]` 后在时间线节点下方内联展开：

- 新增行：`var(--app-color-feedback-success-soft)` 背景，行首 `+`
- 删除行：`var(--app-color-feedback-danger-soft)` 背景，行首 `-`
- 上下文行：无背景
- 顶部摘要行：`+N 行新增 · -N 行删除 · ±N 行修改`
- 使用 `diff` 库逐行对比，不做字符级高亮
- 可折叠收起

---

## 二、全站通用 — 表单规范

### 2.1 字段结构

```
[标签 *]          ← 14px medium, 主文字色
                   ← 间距 8px
[输入控件]         ← 高度 36px, 系统字体
                   ← 间距 4px（可选）
[辅助说明]        ← 12px, 三级文字色
                   ← 间距 4px（条件）
[⚠️ 错误文字]     ← 12px, 红色, AlertCircle 12px 图标
```

- 必填星号：红色，与标签间无空格
- 辅助说明仅在需要额外解释时显示
- 错误文字仅在校验失败时显示，出场动画 `fade-in 0.2s`

### 2.2 输入框状态

| 状态 | 边框 | 背景 | 文字 | 光标 |
|------|------|------|------|------|
| 默认 | `--app-color-border-default` | `--app-color-surface-container` | `--app-color-text-primary` | `--app-color-text-primary` |
| 聚焦 | `--app-color-border-strong` + ring 3px `--app-color-accent`/25% | 不变 | 不变 | 显示 |
| 错误 | `--app-color-feedback-danger` + ring 3px `--app-color-feedback-danger`/20% | 不变 | 不变 | 显示 |
| 禁用 | `--app-color-border-default` | `--app-color-surface-hover` | `--app-color-text-tertiary` | not-allowed |
| 只读 | `--app-color-border-default` | `--app-color-surface-page` | `--app-color-text-primary` | 默认 |

### 2.3 输入框尺寸

| 尺寸 | 高度 | Padding X | 字号 | 使用场景 |
|------|------|----------|------|---------|
| 紧凑 | 28px | `--space-2` | `--font-size-xs` | 表格内编辑 |
| 默认 | 36px | `--space-3` | `--font-size-sm` | 表单主体 |
| 大型 | 44px | `--space-4` | `--font-size-base` | 登录页、搜索框 |

### 2.4 表单布局

**单列布局**（对话框/抽屉）：标签在上，控件全宽，字段间距 `var(--space-5)`。

**双列布局**（全页面表单，≥768px 时触发）：两列各占 50% - 16px，列间距 32px。字段在两列内仍保持标签在上的单列模式。

**底部按钮区**：右对齐。主按钮（提交）在右，取消在左。间距 `var(--space-3)`。

### 2.5 Select / ComboBox

与输入框共享令牌。额外项：
- 下拉面板阴影：`var(--app-elevation-dropdown)`，z-index: `var(--z-dropdown)`
- 选中项背景：`var(--app-color-accent-soft)`
- 悬停项背景：`var(--app-color-surface-hover)`
- 空列表文字："无可用选项"，三级文字色

### 2.6 复选框 / 单选框

- 未选中：1.5px `var(--app-color-border-strong)`，高度 16px × 16px
- 选中：`var(--app-color-accent)` 填充 + 白色勾
- 悬停：`var(--app-color-surface-hover)` 光晕
- 禁用：不透明度 0.5
- 标签与控件间距：`var(--space-2)`
- 同组之间间距：`var(--space-4)`（水平排列）或 `var(--space-2)`（垂直排列）

---

## 三、全站通用 — 数据展示规范

### 3.1 长文本截断

| 策略 | 场景 | 实现 |
|------|------|------|
| 单行省略 | 表格单元格、卡片标题 | `truncate` |
| 多行夹断 | 列表摘要（2-3 行） | `line-clamp-2` / `line-clamp-3` |
| 展开全文 | 详情页正文 | 不截断 |

被截断文本必须提供 Tooltip：hover 500ms 后显示完整内容。使用 Radix Tooltip，内容过长时设置 `max-width: 360px` + 自动换行。

### 3.2 空单元格

| 数据类型 | 占位符 | 颜色 |
|---------|--------|------|
| 文本 | `—` | `var(--app-color-text-tertiary)` |
| 数值 | `0` | 同列数值色 |
| 状态 | `无` | `var(--app-color-text-tertiary)` |
| 未设置 | `—` | `var(--app-color-text-tertiary)` |

### 3.3 日期时间格式

使用已有 `lib/formatDateTimeAsiaShanghai.ts`：

| 粒度 | 格式 | 示例 |
|------|------|------|
| 完整 | `YYYY年M月D日 HH:mm` | 2026年6月9日 14:30 |
| 日期 | `YYYY年M月D日` | 2026年6月9日 |
| 简短 | `MM-DD HH:mm` | 06-09 14:30 |
| 相对 | `N分钟前 / N小时前 / N天前` | 3 分钟前 |

### 3.4 分页器

```
共 326 条    ◀ 1 2 3 ... 17 ▶    每页 [20 ▾] 条
```

- 总条数左对齐，页码居中，每页条数右对齐
- 当前页按钮：`var(--app-color-accent)` 背景 + 白色文字
- 非当前页按钮：白色背景，hover 变 `var(--app-color-surface-hover)`
- 页码按钮：`min-width: 32px; height: 32px; border-radius: var(--app-radius-element)`
- 边界按钮（◀ ▶）：hover 时变色，禁用时 opacity 0.3

### 3.5 Badge / 标签

| 变体 | 背景 | 文字 | 场景 |
|------|------|------|------|
| info | `blue-50` → `blue-700` | 分类标签、版本号 |
| success | `green-50` → `green-700` | 已发布、已完成 |
| warning | `amber-50` → `amber-700` | 草稿、待审核 |
| destructive | `red-50` → `red-700` | 已删除、失败 |
| secondary | `slate-100` → `slate-700` | 归档、默认状态 |

尺寸：
- sm: `padding: 1px 6px; font-size: var(--font-size-xs); border-radius: var(--radius-full)`
- md: `padding: 2px 8px; font-size: var(--font-size-xs); border-radius: var(--radius-full)`
- lg: `padding: 4px 12px; font-size: var(--font-size-sm); border-radius: var(--radius-full)`

### 3.6 来源标签（知识库专用）

```
🏷️ 导入    = info Badge, 色值同 Badge info
🤖 Agent   = secondary Badge
✏️ 人工    = success Badge
```

显示于文档底部元数据行，作者之前。

---

## 四、全站通用 — 反馈规范

### 4.1 Toast 变体

| 变体 | Icon | 左边框 | 持续时间（无按钮） | 持续时间（有按钮） |
|------|------|--------|-----------------|-----------------|
| 成功 | `CircleCheck` | `green-500` | 2s | 8s |
| 错误 | `AlertCircle` | `red-500` | 5s | 手动关闭 / 12s |
| 警告 | `AlertTriangle` | `amber-500` | 5s | 8s |
| 信息 | `Info` | `blue-500` | 3s | 8s |

统一样式：
- 背景 `var(--app-color-surface-elevated)`，阴影 `var(--app-elevation-dropdown)`
- 圆角 `var(--app-radius-element)`，内边距 `var(--space-3) var(--space-4)`
- min-width 320px，max-width 480px
- 位置：右上角（沿用 `Toaster position="top-right"`）

### 4.2 确认对话框

用于删除、回滚等不可逆操作：

```
┌──────────────────────────────────────┐
│  确认删除                            │
│                                      │
│  确定要删除"{名称}"吗？此操作不可恢复。 │
│                                      │
│           [取消]  [确认删除]          │
└──────────────────────────────────────┘
```

- 危险按钮：红色背景 + 白色文字
- 取消按钮：outline 变体
- 聚焦默认在取消（防止回车误触）

---

## 五、全站通用 — 页面框架

### 5.1 PageHeader

```
┌──────────────────────────────────────────────────────────┐
│  [面包屑]                            [操作按钮区]        │
│  管理后台 / 知识库 / MyBatis 配置                        │
│                                                          │
│  MyBatis 配置指南                        [编辑] [导出]   │
│  创建于 2026年6月9日 · v3 · Claude · 🏷️ 导入              │
└──────────────────────────────────────────────────────────┘
```

**面包屑**：（12px，三级文字色），`/` 分隔。末级不可点击（二级文字色），前级可链接（hover 变 accent 色）。

**标题**：（24px，600 字重，主文字色）。

**元数据行**：（12px，三级文字色），`·` 分隔。

**操作按钮区**：右对齐，与标题同行。按钮间距 8px。

### 5.2 Tab 页签

```
┌─ 基本信息 ─┬─ 编辑历史 ─┐
│            │            │
└────────────┴────────────┘
```

- 选中：底部 2px accent 实线 + accent 文字色
- 未选中：无底部边框 + 二级文字色，hover 变主文字色
- Tab 间距：16px
- 内容区顶边距：16px
- 选中指示条过渡：`margin 0.2s var(--motion-easing-out)`

### 5.3 Context Menu

```
┌─────────────────────┐
│  📝 编辑            │
│  📋 复制链接        │
│  ─────────────      │
│  🗑 删除      Ctrl+D │
└─────────────────────┘
```

- 背景：`var(--app-color-surface-elevated)`，阴影：`var(--app-elevation-dropdown)`
- 圆角：`var(--app-radius-element)`，内边距：4px
- 每项高度：32px，Padding X: 8px + 12px
- 悬停项背景：`var(--app-color-surface-hover)`
- 快捷键：右对齐，三级文字色
- 分割线：`1px solid var(--app-color-border-default)`
- z-index：`var(--z-dropdown)`

---

*本文档是知识库模块全部 UI 状态的视觉规格 + 全站通用组件规范。与 [UI设计规范与主题标准.md](UI设计规范与主题标准.md) 配合使用。*
