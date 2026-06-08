# 架构设计规范 · 从需求到 Spec 的标准化流程

> **定位**：定义"如何写好一份架构设计 Spec"的元规范。所有功能设计文档必须遵循本文档的章节结构和设计原则。
>
> **适用版本**：全局适用，与具体技术栈无关。
>
> **最后更新**：2026-06-08

---

## 一、为什么需要这份规范

AI 辅助写设计文档有三个常见病：

| 病症 | 表现 | 后果 |
|------|------|------|
| **偷懒省略** | 只写 Happy Path，不写边缘情况、错误码、测试边界 | 实现时不断踩坑，反复修补 |
| **硬编码惯性** | z-index: 99999、magic number、内联样式 | 层级混乱、改一处炸一片、无法维护 |
| **边界模糊** | "大概这样"式的模糊表述，不做明确的取舍记录 | 实现时超出范围，或该做的没做 |

本规范的核心目标：**用结构化的章节模板 + 显式的设计原则，消除模糊空间。**

---

## 二、Spec 必选章节模板

任何功能设计 Spec 必须包含以下章节。标注 `(条件)` 的章节在特定条件下可省略。

```
1.  概述与上下文            ← 目标 + 核心约束 + 设计原则
2.  架构分层总览            ← 模块归属、数据流图
3.  数据库变更              ← DDL + 兼容性分析 + 迁移方式
4.  后端 API 契约           ← Controller → Service → Mapper 全链路
5.  前端组件接口契约        ← Props/Hook/状态机/Types
6.  安全设计                ← 认证/鉴权/限流/审计
7.  路由与导航              ← URL 规划 + 跳转逻辑
8.  数据对接清单            ← 新 API ↔ 调用方映射表
9.  可复用模块清单          ← 含完整路径，不重复造轮子
10. 新增文件清单            ← 新/改/删，精确到每个文件
11. 导入变更                ← import 语句怎么改
12. 边缘情况与错误处理      ← 每个异常路径的处理方式
13. 约束与原则              ← 明确"不做什么" + "必须遵守什么"
14. 错误码定义              ← ErrorCodeConstants 枚举规划 + HTTP 状态码映射
15. 测试边界                ← 每个模块测什么、不测什么、用什么工具
16. 日志与可观测性          ← 日志前缀 + 关键事件记录点
17. (条件) Z 轴层级         ← 涉及 Portal/浮层/弹窗时必写
18. (条件) 清理清单         ← 涉及重构/替换旧代码时必写
```

### 2.1 每章节的判定标准

| 章节 | "写够了"的标准 |
|------|---------------|
| 边缘情况 | 至少覆盖 8 种异常路径（空数据、并发、权限不足、网络断开、重复提交、旧数据兼容、极端输入、资源不存在） |
| 错误码定义 | 每个错误码有唯一数字、中文描述、HTTP 状态码映射 |
| 测试边界 | 每层明确"测什么"和"不测什么"，不准写"全部测试" |
| 约束与原则 | 至少列出 3 条"明确不做"的事项 |
| 新增文件清单 | 区分"新建"/"修改"/"删除"/"明确不修改"四类 |
| 日志 | 定义日志前缀常量 + 每个关键事件的级别（INFO/WARN/ERROR） |

---

## 三、核心设计原则

### 3.1 融入而非替代

**原则：** 新功能应复用现有基础设施，而不是另起炉灶。

```
❌ 错误: 特殊通道签发不同格式的 token，前端单独处理
✅ 正确: 复用 AuthService.generateAuthResult()，前端 authStorage 零改动
```

**检查点：** 你的设计是否复用了现有的 Auth、HTTP 拦截器、路由守卫、异常处理、序列化机制？

### 3.2 壳与逻辑分离

**原则：** 每个复杂组件拆为三个文件，各司其职。

```
ComponentName.tsx        ← 壳：仅渲染，从 hook 取值，不写业务逻辑
useComponentName.ts      ← 逻辑 hook：状态机、API 调用、纯 TS，不引入 JSX
ComponentName.types.ts   ← 类型契约：所有 Props + 事件类型集中定义
```

**检查点：** 你的 hook 文件里有没有 JSX？你的壳文件里有没有 `useState` 管理业务状态？

### 3.3 注册表驱动扩展

**原则：** 当一个容器需要支持"后续持续添加子业务"时，用注册表模式而非硬编码。

```
❌ 错误: BizOverlayShell 内部写死 if (type === 'A') renderA; else if (type === 'B') renderB
✅ 正确: useBizRegistry.register({ id, label, component }) — 容器只遍历 getItems()
```

**适用场景识别：**
- "后续由其他 agent 实现" → 必须用注册表
- "可能有更多类型" → 用注册表
- "只有这 2 种，未来不会变" → YAGNI，不引入注册表

### 3.4 常量集中管理

**原则：** 任何跨文件使用的数值、字符串、配置，必须抽到单一源文件。

| 类型 | 存放位置 | 示例 |
|------|---------|------|
| Z-Index | `constants/zIndex.ts` | `Z_INDEX.keypad = 500` |
| 错误码 | `ErrorCodeConstants.java` | `SPECIAL_CHANNEL_PIN_LOCKED = 4106` |
| 角色/权限 | `RoleEnum.java` / `roleAccess.ts` | 已有 |
| API 路径前缀 | Controller 类级 `@RequestMapping` | `/api/auth/special-channel` |

**硬编码检测清单：**
- [ ] 有没有 `z-[99999]` 或 `z-index: 9999`？
- [ ] 有没有直接写数字字符串作为错误码？
- [ ] 有没有内联 `style={{ zIndex: 9999 }}`？
- [ ] 有没有散落的 API 路径字符串？

### 3.5 显式状态机

**原则：** 当组件有 ≥3 个互斥状态且存在状态转换规则时，用 `useReducer` 实现显式状态机。

```
❌ 错误: 散落的 useState — isInputting, isVerifying, isLocked, isConfirming...
         状态组合爆炸，可能出现 isVerifying && isLocked 同时为 true 的 bug
✅ 正确: useReducer 单一步骤，state.step ∈ { idle | input | verifying | locked | confirming }
         每个状态的数据（输入值、错误信息、倒计时）作为 reducer payload
```

**适用阈值：** ≥3 个互斥状态 → 状态机。≤2 个（如开/关）→ useState 即可。

### 3.6 接口契约文档化

**原则：** 跨模块/跨角色的接口必须有显式的 TypeScript 类型或 Java 接口定义，并写在 spec 中。

```
❌ 错误: "后续 agent 参考 BizOverlayShell 源码开发业务组件"
✅ 正确: 定义 BizItemSlotProps 接口契约，agent 只需实现该接口，不看源码
```

**契约必须包含：** 输入参数类型、返回值类型、可选/必选标记、错误的传播方式。

---

## 四、反模式目录

以下是在 AI 辅助开发中高频出现的反模式。Spec 自检时必须逐项排查。

### 4.1 硬编码 z-index 抢最高

```
❌ z-[99999] 或 z-index: 99999
✅ Z_INDEX.keypad (来自 constants/zIndex.ts)
```

**为什么坏：** 每个组件都抢"最高"，后果是谁也叠不上去。应该按功能分层，常量管理。

### 4.2 只有 Happy Path

```
❌ spec 中没有边缘情况章节，或边缘情况只有 2-3 条
✅ 至少覆盖 8 种异常路径（见 2.1 判定标准）
```

### 4.3 模糊的错误处理

```
❌ "出错时返回错误信息"
✅ "PIN 未设置 → 400 PIN_NOT_SET (4102)；PIN 错误 → 401 PIN_INVALID (4103)；锁定 → 429 PIN_LOCKED (4106)"
```

### 4.4 缺少"不做什么"

```
❌ spec 只有"要做什么"，没有"不做什么"
✅ §约束与原则 至少列出 3 条明确排除的事项
```

**为什么重要：** 没有边界约束的设计，实现时会自然膨胀。AI 尤其容易"顺手"多做。

### 4.5 新/改/删文件不明确

```
❌ "需要修改前端相关文件"
✅ "新建: NumericKeypad.tsx, useNumericKeypad.ts, NumericKeypad.types.ts"
   "修改: UiverseProfilePopup.tsx — 新增按钮区域 + z 值替换"
   "不修改: router/index.tsx, AuthGuard.tsx, authStorage.ts"
```

### 4.6 测试写了等于没写

```
❌ "测 NumericKeypad 组件" (太模糊)
❌ "全面测试" (无意义)
✅ "useNumericKeypad: Vitest renderHook — 测状态机转换路径、错误计数+锁定倒计时、set 模式两阶段"
   "不测: NumericKeypad 壳 (纯渲染，视觉验收为主)"
```

### 4.7 @Autowired 字段注入

```
❌ @Autowired private XxxService xxxService;
✅ private final XxxService xxxService; + 构造函数注入
```

### 4.8 读操作加 @Transactional

```
❌ @Transactional public XxxView findById(String id) { ... }
✅ public XxxView findById(String id) { ... }  // 读操作不加事务
```

---

## 五、决策记录格式

当存在多个可选方案时，必须在 spec 中记录决策过程和理由。

```markdown
### 决策: {决策主题}

| 方案 | 简述 | 优点 | 缺点 |
|------|------|------|------|
| A | {一句话描述} | {核心优点} | {核心缺点} |
| B | {一句话描述} | {核心优点} | {核心缺点} |

**选择: {方案 X}**
**理由: {2-3 句话解释为什么，引用具体约束或原则}**
```

---

## 六、集成影响分析

每个 spec 必须回答以下 5 个问题：

| 问题 | 当前 spec 中的对应章节 |
|------|----------------------|
| 现有认证/鉴权机制需要改吗？ | §7 路由与导航 |
| 现有数据库表结构会被影响吗？ | §3 数据库变更（含兼容性分析） |
| 现有前端路由/状态管理需要改吗？ | §11 导入变更 |
| 现有日志/监控需要新增吗？ | §16 日志与可观测性 |
| 删除或废弃了什么旧代码？ | §18 清理清单 |

---

## 七、设计完成前的自检清单

在提交 Spec 供评审前，逐项确认：

### 结构完整性
- [ ] 所有必选章节均已填写（§二列出的 16 个必选 + 条件章节）
- [ ] 每个章节达到"写够了"的判定标准

### 反模式排查
- [ ] 无硬编码 z-index（全部引用常量）
- [ ] 无硬编码错误码字符串（全部引用 ErrorCodeConstants）
- [ ] 无模糊表述（"大概""应该""可能"）
- [ ] 边缘情况 ≥8 条
- [ ] "不做什么" ≥3 条
- [ ] 测试边界明确（每层测什么/不测什么）

### 架构合规
- [ ] 后端: Controller → Service → Mapper 调用链不跨模块
- [ ] 后端: 构造函数注入，无 @Autowired 字段注入
- [ ] 后端: 读操作无 @Transactional
- [ ] 后端: 业务异常统一 TwinBusinessException
- [ ] 前端: 壳与逻辑分离（hook 无 JSX，壳无业务状态）
- [ ] 前端: barrel export 作为调用方唯一入口
- [ ] 前端: 无硬编码 API 路径
- [ ] 日志前缀已定义且全局唯一

### 决策记录
- [ ] 所有多方案选择已记录决策理由
- [ ] 所有"后续实现"的功能已明确排除并标注负责人

---

## 八、与现有架构规范的关系

| 文档 | 关注点 | 与本规范的关系 |
|------|--------|---------------|
| `ARCHITECTURE_BACKEND.md` | 后端技术规范（包结构、Controller/Service/Mapper 模板） | 本规范引用其规则，不重复定义 |
| `ARCHITECTURE_FRONTEND_WEB.md` | 前端技术规范（目录结构、HTTP 客户端、状态管理） | 本规范引用其规则，不重复定义 |
| **本规范** | **设计方法论（Spec 怎么写、原则怎么用、反模式怎么避）** | **元规范，高于以上两者** |

**优先级：** 本规范 > ARCHITECTURE_BACKEND.md / ARCHITECTURE_FRONTEND_WEB.md > 个人偏好

---

## 九、示例参考

本规范的首次完整应用见：
[`docs/superpowers/specs/2026-06-08-special-channel-student-entry-design.md`](superpowers/specs/2026-06-08-special-channel-student-entry-design.md)

该 Spec 覆盖全部 18 个章节，包含：
- 壳与逻辑分离（NumericKeypad / BizOverlayShell 三文件结构）
- 注册表驱动扩展（useBizRegistry）
- Z 轴层级常量管理（Z_INDEX）
- 显式状态机（useNumericKeypad useReducer）
- 接口契约文档化（BizItemSlotProps）
- 完整的边缘情况（13 条）、错误码（7 个）、测试边界（6 个模块）
- 决策记录（后端模块归属、PIN 存储位置、组件归属、注册表模式）
