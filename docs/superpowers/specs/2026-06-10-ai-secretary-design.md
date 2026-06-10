# AI 小秘书 — 工作流定义系统 设计规格

> **版本**: 2.0
> **日期**: 2026-06-10
> **状态**: 已确认，实现中

---

## 1. 概述与上下文

### 目标

创建一份"AI 小秘书"工作流定义系统，实现：

1. **会话启动自动展示主菜单** — 用户打开对话，AI 主动呈现 9 大标准工作流选项
2. **自动调度子 Agent** — 用户选择后，AI 按预定义调度链自动串联 skills 和子 agent
3. **可扩展质量门禁** — 按改动类型自动匹配检查项，结构化报告代替视觉截图
4. **Bug 修复防脑补** — 强制信息收集 + 系统溯源 + 同源扫描
5. **上下文接力** — 标准化手交文档协议，新对话无缝接手未完成任务

### 核心约束

- 文档即脚本：同一份 markdown，人类可读，AI 可执行
- 门禁注册表持续生长，不硬编码
- 确认方式用结构化数据（browser_snapshot + browser_evaluate），不依赖模型 vision 能力
- 手交文档遵循标准模板，新对话可独立理解并继续执行
- 遵循现有架构设计规范（[架构设计规范.md](../../架构设计规范.md)）的章节约定

---

## 2. 架构分层总览

```
┌──────────────────────────────────────────────────┐
│               AI 小秘书 完整架构                    │
│                                                  │
│  会话N 启动                                       │
│     │                                            │
│     ▼                                            │
│  SessionStart hook 触发                           │
│     │                                            │
│     ├─ ① 读取 handoff/MANIFEST.json               │
│     │     └─ 有 active 任务 → 展示接手选项         │
│     │                                            │
│     └─ ② 读取 ai-secretary.md                     │
│           └─ 无 active 任务 → 展示 @menu 主菜单    │
│                                                  │
│  用户选择 / AI 自动归类                            │
│     │                                            │
│     ▼                                            │
│  执行 @workflow 调度链                             │
│     ├─ 按 Phase 推进                              │
│     ├─ 每 Phase 结束 → 写 handoff 文档             │
│     ├─ 上下文将满 → 写 handoff → 建议开新对话       │
│     └─ verification 阶段匹配 @gates 注册表          │
│                                                  │
│  会话N+1 启动                                     │
│     ├─ 读到会话N的手交文档                          │
│     ├─ 完整恢复状态                                │
│     └─ 继续执行剩余 Phase                          │
│                                                  │
└──────────────────────────────────────────────────┘
```

### 文件布局

```
docs/superpowers/
├── ai-secretary.md              ← 工作流定义（核心文档，永久）
├── handoff/
│   ├── MANIFEST.json            ← 总索引（快速判断任务状态）
│   ├── template.md              ← 标准模板（AI 写手交时参照）
│   ├── active/                  ← 进行中的手交文档
│   │   └── <task-id>.md
│   └── archive/                 ← 已完成的手交文档（只增不删）
│       └── <task-id>.md
└── specs/
    └── 2026-06-10-ai-secretary-design.md  ← 本设计文档

.claude/
└── settings.json                ← SessionStart hook（触发 + 手交检测）
```

---

## 3. 工作流定义（9 大类）

### 调度链总览

| # | 大类 | 调度链 | 子Agent策略 |
|---|------|--------|------------|
| ① | 新功能开发 | brainstorming → writing-plans → executing-plans → verification | 前后端各1个子agent并行 |
| ② | Bug修复 | 信息收集(强制) → systematic-debugging → 同源扫描(强制) → TDD → 修复 → verification → 注册表回写 | 根因分析可并行交叉验证 |
| ③ | UI/前端调整 | frontend-design → 编码 → verification(自动匹配门禁) | 独立组件并行开发 |
| ④ | 后端接口 | TDD → Controller→Service→Mapper 编码 → verification | Service/Mapper可并行 |
| ⑤ | 代码审查 | code-review + security-review + simplify 三线并行 → 汇总 | 3个子agent同时审查 |
| ⑥ | 文档编写 | deep-research(如需) → 撰写 → humanizer(强制) → 用户确认 | 多源并行搜索 |
| ⑦ | 部署/运维 | verification(测试通过) → 构建 → 部署 → Playwright冒烟 | — |
| ⑧ | 重构优化 | simplify → TDD(确保覆盖) → 重构 → verification | 多模块并行分析 |
| ⑨ | 学习/调研 | deep-research → humanizer → 结构化报告 | 多源交叉验证 |

### ② Bug修复 — 五阶段详解（核心改造）

**Phase 1: 信息收集（强制关卡）**
AI 必须问完以下全部问题后才能开始排查：
- 在哪个页面/哪个操作触发的？
- 复现步骤（1→2→3）？
- 浏览器控制台/后端日志有错误吗？
- 每次必现还是偶发？
- 这个功能之前正常过吗？最近改了什么？

**Phase 2: 系统溯源**
- 前端：组件 → hook → state → API调用 → 响应数据 → 渲染
- 后端：Controller → Service → Mapper → SQL → 数据库
- 输出：根因报告（精确到代码行 + 触发条件）

**Phase 3: 同源扫描（blast-radius，强制）**
- 从根因提炼 bad pattern
- Grep 全仓库找出所有相同模式
- 分级标记：🔴会触发 / 🟡有风险 / 🟢安全
- 呈现给用户，由用户决定修哪些

**Phase 4: 批量修复**
- TDD 先写复现测试
- 修复所有确认要修的位置
- 回归测试

**Phase 5: 注册表回写**
- AI 问"要把这个模式加到门禁注册表吗？"
- 用户确认 → 新增门禁条目

---

## 4. 质量门禁系统

### 设计原则

- **不硬编码**：门禁是注册表条目，从3条种子开始，持续生长
- **自动匹配**：verification 阶段扫描改动文件，匹配注册表的触发条件
- **结构化确认**：用 browser_snapshot + browser_evaluate 产出数据报告

### 确认方式

| 工具 | 产出 | 适用场景 |
|------|------|---------|
| browser_snapshot | 页面无障碍结构树（纯文本） | 验证元素存在/消失、层级关系、状态变化 |
| browser_evaluate | 执行 JS 返回结构化数据 | 验证 computed style、re-render 次数、API 调用量 |

### 种子门禁（3条，持续扩展）

| ID | 触发条件 | 检查清单 | 确认方式 |
|----|---------|---------|---------|
| G01 | 文件包含 gsap/animation/transition | computed style: overflow/will-change/transform；相邻元素位置变化 | browser_evaluate → 结构化报告 → 人工 |
| G02 | 文件包含 Dialog/Modal/Popover/Portal | body.style.overflow / backdrop节点 / z-index堆叠 | browser_snapshot + browser_evaluate → 报告 → 人工 |
| G03 | 文件包含 Table/DataGrid/列表组件 | render计数器 + API拦截器：操作X→N次render、M次API调用 | browser_evaluate 注入计数器 → 报告 → 人工 |

---

## 5. 上下文接力协议

### 三层防护机制

| 层 | 文件 | 保护什么 |
|----|------|---------|
| 索引层 | `handoff/MANIFEST.json` | 快速判断有无待接手任务、数量、优先级 |
| 活跃层 | `handoff/active/<task-id>.md` | 完整上下文（不覆盖，一个任务一个文件） |
| 归档层 | `handoff/archive/<task-id>.md` | 完成后移入，历史可查，不丢记录 |

### MANIFEST.json 格式

```json
{
  "version": "1.0",
  "updated": "2026-06-10T15:30:00+08:00",
  "active": [
    {
      "task_id": "bugfix-gsap-dialog-20260610",
      "title": "Bug修复 — GSAP弹窗关闭问题",
      "phase": "同源扫描",
      "phase_index": "3/5",
      "created": "2026-06-10T14:00:00+08:00",
      "file": "active/bugfix-gsap-dialog-20260610.md"
    }
  ],
  "recently_completed": [
    {
      "task_id": "feature-knowledge-base-20260609",
      "title": "新功能 — 知识库模块",
      "completed": "2026-06-09T22:00:00+08:00",
      "file": "archive/feature-knowledge-base-20260609.md"
    }
  ]
}
```

### 手交文档标准模板

位于 `handoff/template.md`，所有 [必填] 字段不可省略：

1. **元信息** — task_id, 工作流类型, 状态, 当前 Phase
2. **任务目标** — 用户最初想要达成的结果，一句话说清
3. **已完成** — 每个 Phase 的具体产出和关键决策
4. **当前状态** — 进展到哪、卡在哪、等待什么确认、Git 状态
5. **下一步** — 下一对话接手后要做的第一件事（必须可直接执行）
6. **关键上下文** — 用户偏好、技术决策记录、踩过的坑（至少3条）
7. **涉及文件** — 已修改 / 待修改 / 明确不修改
8. **关联资源** — 相关 Spec/Issue/PR/参考链接
9. **完成检查清单** — AI 归档前自查

### AI 行为规则

```
写手交：
  ├─ 必须用模板，所有 [必填] 字段不可省略
  ├─ "关键上下文"章节至少 3 条
  ├─ 写完后同步更新 MANIFEST.json
  └─ 自检：新对话读这个文件能独立开始工作吗？

读手交：
  ├─ 读 MANIFEST.json → 有 active 任务 → 展示给用户
  ├─ 用户选择 → 读取对应手交文档
  ├─ 先复述状态给用户确认 → 再继续执行
  └─ 任务完成 → 移入 archive，更新 MANIFEST.json

归档：
  ├─ active → archive（不移除，只移动）
  ├─ recently_completed 保留最近 10 条
  └─ archive 永久保留，事后可追溯
```

---

## 6. 文档标记约定

在 `ai-secretary.md` 中使用轻量标记：

| 标记 | 作用 | AI 行为 |
|------|------|--------|
| `@menu` | 主菜单区块 | 会话启动时展示 |
| `@workflow:xxx` | 工作流定义 | 用户选择后执行对应调度链 |
| `@gates` | 门禁注册表 | verification 阶段自动匹配 |
| `@handoff` | 手交机制说明 | Phase 结束/会话结束时写手交文档 |
| `@tools` | MCP/Skills 速查 | AI 调用工具时参考 |
| `@maintenance` | 维护说明 | 人类参考 |

---

## 7. 覆盖的 Skills 与 MCP 工具

### 流程控制类
- `superpowers:brainstorming` — 创意工作、功能设计
- `superpowers:writing-plans` — 规格 → 实现计划
- `superpowers:executing-plans` — 并行执行实现计划
- `superpowers:subagent-driven-development` — 子 agent 调度
- `superpowers:systematic-debugging` — 系统调试
- `superpowers:test-driven-development` — TDD
- `superpowers:verification-before-completion` — 完成前验证
- `superpowers:dispatching-parallel-agents` — 并行 agent 调度
- `superpowers:writing-skills` — 编写新 skill

### 实现类
- `frontend-design` — 前端 UI 设计
- `agent-skills:react-best-practices` — React 最佳实践
- `agent-skills:web-design-guidelines` — Web 设计规范
- `gsap-core` ~ `gsap-utils`（8个）— GSAP 动画

### 审查类
- `code-review` — 代码审查
- `simplify` — 简化重构
- `security-review` — 安全审查
- `verify` — 验证变更

### 文档类
- `humanizer` — 去 AI 痕迹（强制执行）
- `deep-research` — 深度调研

### 工具类
- `superpowers:using-git-worktrees` — Git worktree 隔离
- `update-config` — 配置管理
- `loop` — 循环任务
- `fewer-permission-prompts` — 减少权限提示

### MCP 工具
- **Firecrawl** — 网页搜索、抓取、爬取、结构化提取、监控
- **Playwright** — 浏览器自动化、快照、evaluate、截图

---

## 8. Hook 配置

`.claude/settings.json` 的 SessionStart hook：

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "",
        "command": "cat docs/superpowers/handoff/MANIFEST.json 2>/dev/null; echo '---HANDOFF_SEPARATOR---'; cat docs/superpowers/ai-secretary.md"
      }
    ]
  }
}
```

效果：新对话启动 → 先展示 MANIFEST（有则 AI 问是否接手） → 再展示工作流菜单。

---

## 9. 约束与原则

- **文档即脚本**：不创建单独的可执行文件，markdown 本身就是指令
- **门禁可扩展**：从不硬编码门禁列表，始终从注册表读取
- **信息不完整不动手**：Bug 修复 Phase 1 是强制关卡
- **修一处扫全库**：同源扫描是 Bug 修复的强制步骤
- **结构化优于视觉**：用数据报告代替截图确认
- **humanizer 必调**：文档类工作流强制调用
- **手交必填满**：模板 [必填] 字段不可省略
- **归档只增不删**：archive 永久保留
- **不擅自杀进程**：部署/运维操作需用户确认

---

## 10. 新增/修改文件清单

| 操作 | 文件 | 说明 |
|------|------|------|
| 新建 | `docs/superpowers/ai-secretary.md` | AI 小秘书工作流定义（核心） |
| 新建 | `docs/superpowers/handoff/MANIFEST.json` | 手交任务总索引 |
| 新建 | `docs/superpowers/handoff/template.md` | 手交文档标准模板 |
| 新建 | `docs/superpowers/specs/2026-06-10-ai-secretary-design.md` | 本设计规格文档 |
| 修改 | `.claude/settings.json` | 新增 SessionStart hook |

---

## 11. 渐进完善流程

```
发现新 bug 模式
  → 你对 AI 说"加到门禁"
  → AI 更新 @gates 注册表
  → 提交

新 skills 安装
  → AI 检测新增
  → 提示"检测到新 skill: xxx，要加入工作流吗？"
  → 你确认后更新对应 @workflow

工作流不适用
  → 你对 AI 说"这个流程不对，应该..."
  → AI 更新工作流定义 → 提交

新门禁类型
  → 你说"以后这类改动也要检查XXX"
  → AI 新增门禁条目 → 提交
```

---

## 12. 测试边界

| 测什么 | 不测什么 |
|--------|---------|
| SessionStart hook 是否触发 | 不测每条工作流的完整执行 |
| AI 是否展示 @menu 内容 | 不测 AI 语义理解准确性 |
| 手交文档模板必填字段完整性 | 不测 browser 端实际渲染 |
| MANIFEST.json 与 active 目录一致性 | — |
| 每条工作流调度链的 skills 是否可用 | — |