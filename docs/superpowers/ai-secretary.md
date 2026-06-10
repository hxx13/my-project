# AI 小秘书 · 标准工作流定义

<!--
  ╔══════════════════════════════════════════════════════════╗
  ║  本文档 = 人类参考手册 + AI 执行脚本                       ║
  ║                                                        ║
  ║  给人类看：了解每个工作流做什么、包含哪些步骤              ║
  ║  给 AI 看：精确的调度指令、质量门禁、handoff 规则          ║
  ║                                                        ║
  ║  标记约定：                                              ║
  ║    @menu      → AI 在会话开始后必须展示的内容             ║
  ║    @workflow  → AI 执行任务时的调度链和规则               ║
  ║    @gates     → AI 验证阶段必须匹配的质量门禁             ║
  ║    @handoff   → AI 写/读接手文档的行为规则                ║
  ║    @tools     → AI 可用的 Skills 和 MCP 工具速查          ║
  ║    @maintenance → 人类如何维护本文档                      ║
  ║                                                        ║
  ║  版本: 1.0 | 更新: 2026-06-10 | 作者: hxx13             ║
  ╚══════════════════════════════════════════════════════════╝
-->

---

## 📋 主菜单 (@menu)

<!--
  AI 行为规则：
  1. 会话启动后，先检查 handoff/MANIFEST.json 是否有 active 任务
  2. 有 → 先展示接手选项（见 @handoff 章节）
  3. 无 → 展示以下菜单
  4. 用户可以直接说意图（如"我要加个导出按钮"），AI 自动归类
-->

**AI 开场白模板：**

```
👋 今天想做什么？

  ① 新功能开发      ④ 后端接口       ⑦ 部署/运维
  ② Bug修复         ⑤ 代码审查       ⑧ 重构优化
  ③ UI/前端调整     ⑥ 文档编写       ⑨ 学习/调研

或者直接说你想做的事，我自动归类 👇
```

**用户输入 → 自动归类的判定规则：**

| 用户说了什么（关键词） | 归类到 | 示例 |
|------------------------|--------|------|
| 新增/添加/实现/开发 + 功能/模块/页面 | ① 新功能开发 | "加一个导出Excel功能" |
| 报错/有问题/不工作/不对/修一下/bug | ② Bug修复 | "弹窗关不掉了" |
| 改样式/动画/布局/颜色/间距/响应式 | ③ UI/前端调整 | "按钮换个颜色" |
| 接口/API/数据库/加字段/改SQL | ④ 后端接口 | "加一个查询参数" |
| 帮我看下/审查/review/检查一下 | ⑤ 代码审查 | "帮我看下这段代码" |
| 写文档/记录/说明/整理 | ⑥ 文档编写 | "写个接口文档" |
| 部署/上线/发布/打包 | ⑦ 部署/运维 | "部署到测试环境" |
| 优化/重构/整理/简化/性能 | ⑧ 重构优化 | "这个组件太长了" |
| 查一下/调研/对比/分析/了解 | ⑨ 学习/调研 | "React 19 有什么新特性" |

---

## 🔀 工作流定义 (@workflow)

<!--
  AI 执行规则：
  - 每个工作流按 Phase 顺序执行，不可跳过标记为 [强制] 的 Phase
  - 每个 Phase 完成后检查：是否需要写 handoff 文档？（见 @handoff）
  - gates 为 auto 的：verification 阶段自动扫描改动文件匹配 @gates 注册表
  - 所有工作流结束后：更新 handoff/MANIFEST.json
-->

---

### ① 新功能开发 (@workflow:new-feature)

```
Phase 1: 需求澄清 [强制]
  skill: superpowers:brainstorming
  产出: 设计规格文档 (docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md)
  涉及 UI: 同时确认使用的设计系统（默认 @design 当前系统）
  handoff_recommended: true  ← 此阶段后建议开新对话继续

Phase 2: 实现计划
  skill: superpowers:writing-plans
  产出: 实现计划（任务拆解 + 文件清单）
  rule: 涉及 UI 的任务 → 计划中须标注"令牌合规检查"步骤
  rule: 涉及 UI 的任务 → 计划中引用 @design 当前设计系统

Phase 3: 编码实现
  skill: superpowers:executing-plans
  strategy: 前后端子 agent 并行执行
  前端 agent 启动顺序:
    ① 读取 @design 当前设计系统 → 有 skill 则读取 SKILL.md + DESIGN.md
    ② 读取 docs/UI设计规范与主题标准.md（三层令牌架构）
    ③ 读取 docs/UI令牌实施调教指南.md（Tailwind 语义类名映射）
    ④ 将设计 skill 令牌映射到 --app-color-* 语义令牌
    ⑤ 所有颜色引用 --app-color-* 语义令牌
    ⑥ 所有 z-index 引用 var(--z-*)
    ⑦ 禁止硬编码颜色值、禁止定义独立变量体系
  后端 agent: 遵循 docs/后端架构规范.md

Phase 4: 验证
  skill: superpowers:verification-before-completion
  gates: auto  ← 自动扫描改动文件，匹配 @gates 注册表（含 Pre-Code + Post-Code）
  browser_check: true  ← 用 browser_snapshot 验证页面状态
```

---

### ② Bug修复 (@workflow:bug-fix)

```
Phase 1: 信息收集 [强制关卡]
  ⚠️ AI 必须问完以下全部问题后才能进入 Phase 2：
    1. "在哪个页面/哪个操作触发的？"
    2. "复现步骤是什么？（从哪一步到哪一步）"
    3. "浏览器控制台/后端日志有错误吗？"
    4. "是每次必现还是偶发？"
    5. "这个功能之前正常过吗？最近改了什么相关代码？"
  rule: 信息不足 → 继续追问，不准猜，不准假设

Phase 2: 系统溯源
  skill: superpowers:systematic-debugging
  前端bug追溯链: 组件 → hook → state → API调用 → 响应数据 → 渲染
  后端bug追溯链: Controller → Service → Mapper → SQL → 数据库
  产出: 根因报告（精确到代码行 + 触发条件 + 影响范围）

Phase 3: 同源扫描 [强制]
  ⚠️ 从根因提炼 bad pattern → grep 全仓库 → 分级标记
  分级:
    🔴 会触发bug: 相同模式且触发条件满足
    🟡 有风险: 相同模式但触发条件不满足（潜在地雷）
    🟢 安全: 类似代码但写法正确（已有防护）
  rule: 呈现扫描结果给用户 → 用户决定修哪些 → 不准AI自己决定全修

Phase 4: 批量修复
  skill: superpowers:test-driven-development
  步骤:
    1. 先写复现测试（证明bug存在）
    2. 修复所有用户确认要修的位置
    3. 运行回归测试
    4. 确认复现测试通过（证明bug修复）

Phase 5: 注册表回写
  action: AI 问用户"要把这个 bug 模式加到门禁注册表吗？"
  if_yes: 在 @gates 注册表新增一行，写清楚触发条件和检查清单
  commit: 提交门禁注册表更新
```

---

### ③ UI/前端调整 (@workflow:ui-change)

```
Phase 0: 设计资源加载 [强制，编码前]
  ⚠️ AI 必须先按 @design 调用链加载资源：
    ① 检查 CLAUDE.md "当前设计系统" → 🍱 Bento → 读取 .claude/skills/bento/SKILL.md
    ② 读取 .claude/skills/bento/DESIGN.md 获取令牌表
    ③ 读取 docs/UI设计规范与主题标准.md（三层令牌：基础→语义→组件）
    ④ 读取 docs/UI令牌实施调教指南.md（Tailwind 语义类名、暗色映射）
    ⑤ 输出: "当前使用 Bento 风格（暖桃色+钢蓝），令牌映射到 --app-color-*"
  rule: 任何新 CSS 变量必须属于第三层（组件令牌），引用 --app-color-* 语义令牌
  rule: 禁止定义独立的 --xxx-* 变量体系

Phase 1: 设计
  skill: frontend-design
  叠加: bento ← 应用 Bento 组件规则（圆角 sm=4px md=8px，间距 4/8/12/16/24/32）
  遵循: docs/UI设计规范与主题标准.md
  output: 设计稿须注明所用令牌 + Bento 规则（如 "bg: var(--app-color-surface-container), rounded: var(--bento-radius-md)"）

Phase 2: 编码
  遵循: docs/前端Web架构规范.md
  动画相关: 使用 gsap-react + gsap-scrolltrigger
  新组件: 遵循 docs/知识库UI状态与通用组件规范.md
  ⚠️ 编码时自动匹配 @gates Pre-Code 规则（G04令牌合规）

Phase 3: 验证
  skill: superpowers:verification-before-completion
  gates: auto  ← 自动匹配 @gates 注册表（G01动画/G02弹窗/G03表格/G04令牌）
  browser_check: true
  确认方式: browser_snapshot + browser_evaluate → 结构化报告 → 人工确认
```

---

### ④ 后端接口 (@workflow:backend-api)

```
Phase 1: TDD
  skill: superpowers:test-driven-development
  产出: 接口测试用例（覆盖正常+异常路径）

Phase 2: 编码
  遵循: docs/后端架构规范.md
  全链路: Controller → Service → Mapper（接口驱动，自上而下）
  涉及数据库变更: 必须写 SQL 迁移文件
  错误码: 遵循 src/main/java/.../ErrorCodeConstants.java 规范

Phase 3: 验证
  skill: superpowers:verification-before-completion
  check_items:
    - API 响应格式是否符合项目约定
    - 异常处理是否完整（至少8种异常路径）
    - 数据库变更是否兼容（无锁表/无数据丢失）
```

---

### ⑤ 代码审查 (@workflow:code-review)

```
执行策略: 三线并行
  ├─ 线1: code-review（正确性 + 代码质量）
  ├─ 线2: security-review（安全漏洞：注入/越权/敏感信息泄露）
  ├─ 线3: simplify（重复代码/过度设计/可简化点）
  └─ 线4: @gates G04 令牌合规检查（自动扫描改动文件中的颜色/z-index/变量定义）

产出: 汇总报告
  - 🔴 必须修: 安全漏洞 + 逻辑错误 + 令牌不合规（硬编码颜色/裸z-index/独立变量体系）
  - 🟡 建议修: 代码异味 + 可简化点 + 设计风格偏离 @design 当前系统
  - 🟢 好实践: 值得保留的模式
```

---

### ⑥ 文档编写 (@workflow:documentation)

```
Phase 1: 调研（如需要）
  skill: deep-research
  tool: mcp__firecrawl__firecrawl_search（多源并行搜索）

Phase 2: 撰写
  遵循: docs/架构设计规范.md（Spec 必选章节模板）
  原则: 文档聚焦架构决策和接口契约，不写大段代码 [[feedback_no_code_in_docs]]
  涉及设计/UI文档: 引用 @design 当前系统令牌（勿硬编码颜色值）

Phase 3: 人味化 [强制]
  skill: humanizer  ← 不可跳过
  目的: 去除 AI 写作痕迹

Phase 4: 确认
  action: 交给用户审查 → 修改 → 提交
```

---

### ⑦ 部署/运维 (@workflow:deploy)

```
Phase 1: 预检 [强制]
  skill: superpowers:verification-before-completion
  确保: 所有测试通过 + 无未提交的临时文件

Phase 2: 构建
  前端: npm run build
  后端: mvn compile

Phase 3: 部署
  rule: 不擅自杀进程 [[feedback_no_kill_process]]
  rule: 部署前必须用户确认

Phase 4: 冒烟测试
  tool: mcp__playwright__browser_navigate + browser_snapshot
  验证: 关键页面可访问 + 核心功能正常
```

---

### ⑧ 重构优化 (@workflow:refactor)

```
Phase 1: 分析
  skill: simplify
  产出: 优化点清单（按影响面排序）
  涉及 UI 重构: 同步检查 @gates G04 令牌合规 + @design 当前系统对齐

Phase 2: 加固测试 [强制]
  skill: superpowers:test-driven-development
  确保: 重构前有足够测试覆盖

Phase 3: 重构
  rule: 小步提交，每步可回滚
  rule: 不改行为，只改结构
  rule: UI 重构不得引入新的硬编码颜色或独立变量体系

Phase 4: 验证
  skill: superpowers:verification-before-completion
  check: 重构前后测试全绿 + 功能不变 + 令牌合规
```

---

### ⑨ 学习/调研 (@workflow:research)

```
Phase 1: 多源搜索
  skill: deep-research
  tool: mcp__firecrawl__firecrawl_search（web + news）
  rule: 至少 3 个独立来源交叉验证

Phase 2: 人味化 [强制]
  skill: humanizer

Phase 3: 输出
  格式: 结构化报告（背景 → 分析 → 结论 → 建议 → 来源）
```

---

## 🚧 质量门禁注册表 (@gates)

<!--
  AI 规则：
  1. Pre-Code 门禁：编码前自动检查（不依赖 browser）
  2. Post-Code 门禁：verification 阶段自动扫描改动文件
  3. 匹配"触发条件"列 → 命中则执行"检查清单"
  4. Post-Code 用 browser_snapshot + browser_evaluate 产出报告
  5. Pre-Code 用 grep + Read 验证代码合规
  6. 报告呈现给人类确认 → 人类点头才能继续

  人类规则：
  1. 发现新问题模式 → 对 AI 说"加到门禁" → AI 新增一行
  2. 某条门禁不再适用 → 删除对应行
  3. 格式统一：| ID | 阶段 | 触发条件 | 检查清单 | 确认方式 |
-->

### 确认工具说明

| 工具 | 产出 | 适用场景 |
|------|------|---------|
| Grep + Read | 代码文本扫描 | Pre-Code：验证代码引用正确的令牌、无硬编码颜色 |
| `browser_snapshot` | 页面无障碍结构树（纯文本） | Post-Code：验证元素存在/消失、层级关系、状态变化 |
| `browser_evaluate` | 执行 JS 返回结构化数据 | Post-Code：验证 computed style、re-render 次数、API 调用量 |

### Pre-Code 门禁（编码前触发）

| ID | 触发条件 | 检查清单 | 确认方式 |
|----|---------|---------|---------|
| G04 | **任何 .css/.scss/.tsx/.jsx 文件新增或修改** | ① 是否定义了独立于项目令牌体系的新 CSS 变量（如 `--smartsheet-*` 而非引用 `--app-color-*`）？→ 必须重写为组件令牌（第三层），引用语义令牌（第二层） ② 是否出现硬编码颜色（`bg-white`、`bg-[#09090b]`、`dark:bg-[#131316]`、`text-slate-800`）？→ 必须替换为 `var(--app-color-*)` 或 Tailwind 语义类名 ③ z-index 是否使用了裸数字（`z-50`）而非项目令牌（`var(--z-dropdown)` = 200, `var(--z-modal)` = 800）？ ④ 新增 CSS 文件是否定义了独立主题变量而非组件令牌？→ 组件令牌 = `--<component>-<prop>` 引用 `var(--app-color-<semantic>)` ⑤ 暗色主题值是否与 `docs/UI令牌实施调教指南.md` 的官方映射一致？ | Grep 扫描新代码 → 检查每处颜色/z-index/变量定义 → 违规项逐条报告 → 人工确认后修复 |

### Post-Code 门禁（验证阶段触发）

| ID | 触发条件 | 检查清单 | 确认方式 |
|----|---------|---------|---------|
| G01 | 文件包含 `gsap`/`animation`/`transition`/`transform` | ① computed style: overflow:hidden 是否正确设置 ② will-change 属性是否声明 ③ transform3d 是否启用 GPU 加速 ④ 相邻元素是否有意外位移 | browser_evaluate 读取 computed style → 结构化报告 → 人工确认 |
| G02 | 文件包含 `Dialog`/`Modal`/`Popover`/`Portal`/`Sheet` | ① body.style.overflow 是否被设置为 hidden ② 关闭后 body scroll lock 是否释放 ③ backdrop 节点是否存在且覆盖全屏 ④ z-index 与现有弹窗/提示/tooltip 是否冲突 ⑤ 嵌套弹窗：内层关闭后外层 scroll 是否恢复 | browser_snapshot 验证节点层级 + browser_evaluate 读取 body style / z-index 堆叠 → 结构化报告 → 人工确认 |
| G03 | 文件包含 `Table`/`DataGrid`/`FlatList`/列表类组件 | ① 注入 render 计数器：单次用户操作触发了几次组件 re-render ② 注入 API 拦截器：操作 X 触发了 M 次 API 调用 ③ 行操作（选中/编辑/删除）是否影响其他行状态 ④ 全选/批量操作是否触发逐行 re-render | browser_evaluate 注入计数器 + 拦截器 → 执行操作 → 返回数字报告 → 人工确认 |

<!--
  ⬇️ 新门禁在此下方追加，Pre-Code 例：
  | G05 | Pre-Code | <触发条件> | <检查清单> | Grep+Read → 报告 → 人工确认 |
  Post-Code 例：
  | G06 | Post-Code | <触发条件> | <检查清单> | browser_evaluate → 报告 → 人工确认 |
-->

---

## 🎨 设计资源调度系统 (@design)

<!--
  AI 规则：
  1. 任何涉及 UI/前端的工作流在编码前必须读取本章节
  2. 当前活动设计系统由 CLAUDE.md "当前设计系统" 行指定
  3. 设计资源分四层，按需层层深入
  4. 切换设计系统 → 从层次一选新 skill → 安装 → 更新 CLAUDE.md → 后续会话自动使用
-->

### 当前活动设计系统

<!-- AI: 从 CLAUDE.md "当前设计系统" 行读取，如不存在则默认无 -->

| 项目 | 值 |
|------|-----|
| 当前系统 | 🍱 **Bento** — 模块化卡片网格、暖桃色 #FAD4C0 + 钢蓝 #80A1C1 |
| Skill 路径 | `.claude/skills/bento/SKILL.md` |
| 设计令牌 | `.claude/skills/bento/DESIGN.md` |
| 后备系统 | `docs/UI设计规范与主题标准.md`（项目自有令牌体系） |

### 四层设计资源 & 联动规则

```
Agent 做 UI 时按此顺序调用：

┌─ 层次一：当前设计 Skill（如 Bento SKILL.md）
│  ├─ 优先读取 SKILL.md → 遵循其组件规则/颜色/字体/间距
│  ├─ 如当前无设计 Skill → 跳到层次二
│  └─ 如想换风格 → 从 awesome-design-skills 选新 slug → 安装
│
├─ 层次二：67 套备用设计 Skill（awesome-design-skills）
│  ├─ 安装: 从 github.com/bergside/awesome-design-skills 下载
│  ├─ 预览: https://typeui.sh/design-skills
│  └─ 自定义: npx typeui.sh generate
│
├─ 层次三：73 个品牌 DESIGN.md（awesome-design-md）
│  ├─ 参考: 精确的品牌令牌值（颜色/字体/间距）
│  ├─ 预览: https://getdesign.md/<brand>/design-md
│  └─ 完整目录: docs/superpowers/specs/previews/design-catalog.md
│
└─ 层次四：项目自有令牌体系 [强制底线]
   ├─ docs/UI设计规范与主题标准.md（三层令牌：基础→语义→组件）
   ├─ docs/UI令牌实施调教指南.md（Tailwind 语义类名映射）
   └─ ⚠️ 这是底线 — 所有颜色必须最终映射到 --app-color-* 语义令牌
```

### AI 编码时的设计资源调用链

```
1. 检查 CLAUDE.md "当前设计系统" → 有则读取对应 SKILL.md
2. 读取 DESIGN.md 获取令牌表（颜色/字体/间距）
3. 将设计 Skill 的令牌映射到项目 --app-color-* 语义令牌
4. 遵循设计 Skill 的组件规则（圆角/阴影/间距/排版）
5. 遵循 @gates G04（令牌合规）
6. 最终产出代码引用 --app-color-* 令牌体系
```

### 如何切换设计系统

```
用户: "换 design skill 为 <slug>"
  → AI 从 awesome-design-skills 下载对应 SKILL.md + DESIGN.md
  → 放到 .claude/skills/<slug>/
  → 更新 CLAUDE.md "当前设计系统" 行
  → 更新 ai-secretary.md 此表的"当前系统"行
  → 告知用户: "已切换。新对话生效。"

用户: "用项目自带设计，不用 skill"
  → AI 更新 CLAUDE.md 移除设计 skill 引用
  → 更新 ai-secretary.md 当前系统设为 "项目自有令牌体系"
  → 后续 UI 工作直接使用 docs/UI设计规范与主题标准.md
```

### 设计 Skill 安装规范

```
安装新设计 skill:
  1. mkdir -p .claude/skills/<slug>/
  2. curl SKILL.md 和 DESIGN.md 从:
     https://raw.githubusercontent.com/bergside/awesome-design-skills/main/skills/<slug>/
  3. 验证两个文件完整
  4. 更新 CLAUDE.md + ai-secretary.md
  5. 告知用户技能已可用

查看已安装:
  ls .claude/skills/   ← 每个子目录是一个设计 skill

卸载:
  rm -rf .claude/skills/<slug>/  → 更新 CLAUDE.md → 完成
```

---

## 🔄 上下文接力协议 (@handoff)

<!--
  AI 规则：见下方各子章节
  人类规则：不需要手动管理 handoff 文件，AI 自动维护
-->

### 文件结构

```
docs/superpowers/handoff/
├── MANIFEST.json        ← 总索引（AI 自动维护）
├── template.md          ← 标准模板（AI 写 handoff 时的参照）
├── active/              ← 进行中的手交文档
│   └── <task-id>.md
└── archive/             ← 已完成的手交文档（只增不删）
    └── <task-id>.md
```

### 触发时机

| 时机 | 动作 |
|------|------|
| 工作流一个 Phase 完成 | 更新当前 handoff 文档（覆盖写入） |
| 用户说"先到这里"/"暂停" | 写完整 handoff → 建议开新对话继续 |
| 上下文估算接近极限 | 当前子任务完成后 → 写 handoff → 建议开新对话 |
| 工作流全部完成 | 写完成记录 → 移入 archive → 清空 active → 更新 MANIFEST |
| 新对话启动 | 读 MANIFEST → 有 active 任务 → 展示接手选项 |

### AI 写 handoff 规则

```
1. 使用 template.md 的结构，所有 [必填] 字段不可省略
2. "关键上下文"章节至少写 3 条（用户偏好/技术决策/踩坑）
3. 写完后必须同步更新 MANIFEST.json
4. 自检：一个没参与之前对话的 AI 读到这份 handoff 能独立开始工作吗？
   → 不能 → 继续补充
   → 能 → 告诉用户"handoff 已就绪，开新对话说'接手'即可继续"
```

### AI 读 handoff 规则

```
1. SessionStart 时检测 MANIFEST.json 是否有 active 任务
2. 有 → 展示：
   "📋 检测到未完成任务：
    1. [Bug修复] GSAP弹窗关闭问题 — Phase 3/5
    2. [新功能] 知识库模块 — Phase 1/5
    输入编号接手，或说'新任务'跳过。"
3. 用户选择 → 读取对应 handoff 文档
4. 先复述当前状态给用户确认：
   "上次做到 Phase 3 同源扫描，发现 7 处相同模式，你还没确认修哪些。继续吗？"
5. 用户确认 → 从断点继续执行
6. 任务完成 → 移入 archive → 更新 MANIFEST
```

### MANIFEST.json 格式

```json
{
  "version": "1.0",
  "updated": "ISO_8601_TIMESTAMP",
  "active": [
    {
      "task_id": "unique-task-id",
      "title": "任务标题",
      "workflow": "bug-fix | new-feature | ...",
      "phase": "当前阶段名",
      "phase_index": "N/总数",
      "created": "ISO_8601_TIMESTAMP",
      "file": "active/<task-id>.md"
    }
  ],
  "recently_completed": [
    {
      "task_id": "unique-task-id",
      "title": "任务标题",
      "completed": "ISO_8601_TIMESTAMP",
      "file": "archive/<task-id>.md"
    }
  ]
}
```

---

## 🔧 工具速查表 (@tools)

<!--
  AI 规则：调用前确认 skill/mcp 名称与此表一致
  人类规则：新装 skill/mcp 后在此表追加条目
-->

### Skills（按用途）

| Skill | 用途 | 触发场景 |
|-------|------|---------|
| `superpowers:brainstorming` | 需求澄清 + 设计 | 新功能、模糊需求 |
| `superpowers:writing-plans` | 规格 → 实现计划 | 设计完成后 |
| `superpowers:executing-plans` | 并行执行实现计划 | 计划确认后 |
| `superpowers:subagent-driven-development` | 子 agent 调度 | 多文件并行开发 |
| `superpowers:systematic-debugging` | 系统溯源调试 | Bug 排查 |
| `superpowers:test-driven-development` | TDD 开发 | 新功能/Bug修复 |
| `superpowers:verification-before-completion` | 完成前验证 | 所有编码完成后 |
| `superpowers:dispatching-parallel-agents` | 并行 agent | 需要同时做多件事 |
| `superpowers:writing-skills` | 编写新 skill | 需要创建自定义 skill |
| `superpowers:using-git-worktrees` | Git worktree 隔离 | 需要隔离开发环境 |
| `frontend-design` | 前端 UI 设计（8个锚点） | 页面/组件设计 |
| `bento` | 🍱 Bento 设计系统（当前选用） | 模块化卡片网格 UI |
| `agent-skills:react-best-practices` | React 最佳实践 | React 组件开发 |
| `agent-skills:web-design-guidelines` | Web 设计规范 | 设计系统/规范 |
| `gsap-core` ~ `gsap-utils` | GSAP 动画（8个） | 动画/过渡效果 |
| `code-review` | 代码审查 | PR review |
| `simplify` | 代码简化 | 重构优化 |
| `security-review` | 安全审查 | 安全审计 |
| `verify` | 验证变更 | 确认修改正确 |
| `humanizer` | 去 AI 痕迹 | 文档/文案写作 [强制执行] |
| `deep-research` | 深度调研 | 技术调研/竞品分析 |
| `update-config` | 配置管理 | 修改 settings.json |
| `loop` | 循环任务 | 定时检查/轮询 |

### MCP 工具

| 工具 | 用途 | 触发场景 |
|------|------|---------|
| `mcp__firecrawl__firecrawl_search` | 网页搜索 | 查资料/调研 |
| `mcp__firecrawl__firecrawl_scrape` | 网页抓取 | 抓取指定页面内容 |
| `mcp__firecrawl__firecrawl_crawl` | 网站爬取 | 批量抓取页面 |
| `mcp__firecrawl__firecrawl_extract` | 结构化提取 | 从网页提取结构化数据 |
| `mcp__firecrawl__firecrawl_map` | 网站地图 | 发现网站所有页面 |
| `mcp__firecrawl__firecrawl_agent` | AI 网页研究员 | 复杂多步网页研究 |
| `mcp__playwright__browser_navigate` | 浏览器导航 | 打开页面 |
| `mcp__playwright__browser_snapshot` | 页面结构快照 | 验证元素/层级/状态 |
| `mcp__playwright__browser_evaluate` | 执行 JS | 读取 computed style/render 计数等 |
| `mcp__playwright__browser_click` | 点击元素 | 交互测试 |
| `mcp__playwright__browser_type` | 输入文本 | 表单测试 |
| `mcp__playwright__browser_take_screenshot` | 截图 | 仅在必要时使用（非门禁默认方式） |

### 设计资源

| 资源 | 用途 | 链接 |
|------|------|------|
| 🍱 Bento Skill（已安装） | 当前选用的设计系统，SKILL.md + DESIGN.md | `.claude/skills/bento/` |
| awesome-design-skills（67套） | 跨工具设计 Skill 注册表 | `npx typeui.sh list` |
| typeui.sh 预览 | 所有 67 套在线预览 | [typeui.sh/design-skills](https://typeui.sh/design-skills) |
| awesome-design-md（73品牌） | 品牌级 DESIGN.md 集合 | [getdesign.md](https://getdesign.md/) |
| 设计资源完整目录 | 全部四层设计资源 + 安装指南 | `docs/superpowers/specs/previews/design-catalog.md` |

---

## 📝 维护说明 (@maintenance)

<!--
  给人类看的，AI 也会参考。
-->

### 如何新增门禁

```
1. 发现 bug 模式 → AI 修完后 → 对 AI 说"加到门禁"
2. AI 会在 @gates 注册表新增一行，格式：
   | Gxx | <触发条件> | <检查清单> | browser_evaluate → 报告 → 人工确认 |
3. 审查 → 提交
```

### 如何修改工作流

```
1. 发现某个工作流的流程不对 → 对 AI 说"更新工作流：Bug修复的Phase 3应该..."
2. AI 更新 @workflow 对应章节
3. 审查 → 提交
```

### 如何新增工作流

```
1. 出现新的高频任务类型 → 对 AI 说"新增工作流：XXX"
2. AI 按模板新增 @workflow:xxx 章节
3. 同步更新 @menu 主菜单
4. 审查 → 提交
```

### 如何更新工具表

```
1. 新装 skill/MCP → 对 AI 说"更新工具表"
2. AI 检测新增的工具 → 在 @tools 章节追加 → 提交
```

### handoff 维护

```
- AI 自动维护 active/archive/MANIFEST.json
- 人类偶尔检查 archive/ 目录，清理半年前的旧记录即可
```

### 版本记录

| 版本 | 日期 | 变更 |
|------|------|------|
| 1.0 | 2026-06-10 | 初始版本：9大工作流 + 3条种子门禁 + 手交协议 |