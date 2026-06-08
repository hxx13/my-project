# 特殊通道 Phase 2 · 弹窗卡片重构 + 学生中心导航增强

**日期**: 2026-06-08
**状态**: 设计评审通过
**分支**: refactor/twin-package-split
**依赖**: [Phase 1 架构设计](2026-06-08-special-channel-student-entry-design.md)

---

## 1. 概述

### 1.1 两个子系统

| 子系统 | 范围 | 依赖 |
|--------|------|------|
| **A. 弹窗左下角卡片重构** | StudentEntryCard 组件 + 按钮重定位 + 空间负载模块 | Phase 1 已实现的 NumericKeypad / BizOverlayShell |
| **B. 学生中心导航增强** | 返回按钮 + 空闲超时自动登出 | Phase 1 已实现的 authStorage / 路由 |

### 1.2 设计原则

- **壳与逻辑分离** — StudentEntryCard 纯渲染，分页逻辑在 hook 内
- **Tailwind CSS 全部** — 原始 styled-components 代码仅作视觉参考，不引入项目
- **可配置** — 空闲超时参数作为常量集中管理
- **最小侵入** — 弹窗布局（grid 三栏）不变，仅替换左列下半部分

---

## 2. Sub-project A：弹窗卡片重构

### 2.1 组件定位

```
UiverseProfilePopup 左列 (25fr)
┌──────────────────────┐
│     RPG 徽章         │  ← 保留
├──────────────────────┤
│    ProfileHeader     │  ← 保留
│    (flex-[2])        │
├──────────────────────┤
│  StudentEntryCard    │  ← 新建，替换 CapacityStatusList
│  (flex-[3])          │     原 "实时空间负载" 区域
└──────────────────────┘
```

弹窗底部中央的两个独立按钮（"进入学生中心"+"快捷业务"）——移除。

### 2.2 StudentEntryCard 组件

**文件**: `frontend/src/components/scanner/StudentEntryCard.tsx`

#### Props

```ts
interface StudentEntryCardProps {
  // 空间负载数据（来自 useProfilePopup）
  capacityStats: CapacityStat[];
  roomOverviewFetching: boolean;
  roomOverviewSourceCount: number;

  // 学生入口
  studentUserId: string;
  studentName?: string;

  // 回调
  onEnterStudentCenter: () => void;
  onOpenQuickActions: () => void;
  onClosePopup: () => void;
}
```

#### 双页设计

```
┌──────────────────────┐
│  ● ○   (分页指示器)   │  ← 2 个 dot，当前页亮紫色
│  🏠 标题              │  ← 随翻页切换
│  副标题               │
│                      │
│  [当前页内容]         │
│                      │
│  [← 上一页] [下一页→] │  ← 第1页"上一页"隐藏，最后一页"下一页"隐藏
└──────────────────────┘
```

#### 第 1 页：空间负载

- 图标：🏠
- 标题："馆内实时负载"
- 副标题："各房间当前占用情况"
- 内容：房间列表，每行 = 名称 | 紧凑进度条 | "占用/总量"
- 满载行：rose-500 高亮
- 正常行：cyan-400
- 空数据：骨架屏（与现有 `roomOverviewFetching` 状态联动）
- 数据不足时：与现有 CapacityStatusList 同样的降级提示

#### 第 2 页：操作入口

- 图标：🔑
- 标题："快捷入口"
- 副标题："选择你要执行的操作"
- 三个按钮，沿用原 Card 的 radio-option 风格（圆角卡片 + 图标 + 文字 + 箭头），但改为普通 button（不维持选中态）：

| 按钮 | 图标 | 标题 | 描述 | 点击 |
|------|------|------|------|------|
| 进入学生中心 | 🎓 | 进入学生中心 | 查看个人学习记录与数据 | `onEnterStudentCenter` |
| 快捷业务 | 📋 | 快捷业务 | 签到 · 上报 · 申领 | `onOpenQuickActions` |
| 返回主屏幕 | 🔙 | 返回主屏幕 | 关闭弹窗回到扫码页 | `onClosePopup` |

### 2.3 样式规格

- **宽度**: `w-full` 自适应左列容器（约 25% 视口宽）
- **最大高度**: 适配左列 flex-[3] 空间，内容区 `overflow-y-auto`
- **配色**: 沿用弹窗暗色主题（`bg-[#0f172a]`, `border-white/10`, `text-white`），强调色 `purple-500`（替代原 Card 的 `#8b5cf6`）
- **圆角**: `rounded-2xl`
- **按钮尺寸**: 比原 Card 缩小约 20%（字体 `text-[11px]`，padding 紧凑）
- **分页 dot**: 宽 `2.2em` → `w-5`，高 `0.25em` → `h-0.5`
- **进度指示器间距**: `gap-0.4em` → `gap-1`

### 2.4 不引入 styled-components

原始 Card 代码使用 `styled-components`（项目未安装）。所有样式用 Tailwind CSS 类名重写，`@apply` 或内联复杂样式用 `style` 属性兜底。左侧发光效果用 Tailwind 伪元素类或 `before:` 实现。

### 2.5 UiverseProfilePopup 改动清单

| 改动 | 说明 |
|------|------|
| 替换 `CapacityStatusList` | → `<StudentEntryCard capacityStats={...} ... />` |
| 移除底部 student 按钮 | 删除 `{studentUserId && (<div>进入学生中心 + 快捷业务</div>)}` 整个区块 |
| z-index 清理 | 按钮区域的 `z-[10001]` 随删除一起移除 |
| 新增回调传参 | 将 `handleEnterStudentCenter` / `handleKeypadSuccess` / `setShowQuickActions` 传给 StudentEntryCard |

---

## 3. Sub-project B：学生中心导航增强

### 3.1 返回按钮

**文件**: `frontend/src/features/student/components/layout/student-layout.tsx`

在 StudentLayout 的 header 区域（导航栏右侧）添加：

```tsx
<button
  onClick={() => {
    authStorage.clear();
    navigate("/");
  }}
  className="text-xs text-slate-400 hover:text-white transition-colors"
>
  🔙 返回扫码页面
</button>
```

点击 → 清除 token → 跳转首页 → ScannerPanel 恢复待刷卡状态。

### 3.2 空闲超时自动登出

#### 配置常量

```ts
// frontend/src/config/idleTimeout.ts
export const IDLE_TIMEOUT_MS = 5 * 60 * 1000;      // 5 分钟无操作
export const IDLE_WARNING_MS = 30 * 1000;            // 30 秒倒计时警告
```

#### useIdleTimeout hook

**文件**: `frontend/src/hooks/useIdleTimeout.ts`

```ts
interface UseIdleTimeoutOptions {
  timeoutMs: number;       // 无操作多久触发警告
  warningMs: number;       // 警告倒计时时长
  onTimeout: () => void;   // 最终登出回调
}

function useIdleTimeout({ timeoutMs, warningMs, onTimeout }: UseIdleTimeoutOptions) {
  // 监听事件: mousemove, keydown, click, scroll, touchstart
  // 阶段 1: timeoutMs 无操作 → setShowWarning(true) → 开始 warningMs 倒计时
  // 阶段 2: warningMs 内无操作 → onTimeout()
  // 任何操作 → 重置到阶段 1
  // 返回: { showWarning, remainingSeconds }
}
```

**实现要点**:
- `useEffect` + `setTimeout` + 事件监听
- 事件监听使用 `passive: true`
- cleanup 清除定时器和监听器

#### 挂载位置

**文件**: `frontend/src/features/student/components/layout/student-layout.tsx`

```tsx
const { showWarning, remainingSeconds } = useIdleTimeout({
  timeoutMs: IDLE_TIMEOUT_MS,
  warningMs: IDLE_WARNING_MS,
  onTimeout: () => {
    authStorage.clear();
    navigate("/");
  },
});
```

#### 警告 UI

空闲 5 分钟后，在页面中央弹出半透明倒计时提示：

```tsx
{showWarning && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
    <div className="bg-slate-800 rounded-xl px-6 py-4 text-center text-white">
      <p>长时间未操作，{remainingSeconds} 秒后自动退出</p>
      <p className="text-xs text-slate-400 mt-1">点击任意位置继续使用</p>
    </div>
  </div>
)}
```

用户点击任意位置 → 重置定时器，警告消失。

---

## 4. 新增/修改文件清单

### 新建

| 文件 | 说明 |
|------|------|
| `components/scanner/StudentEntryCard.tsx` | 双页卡片组件 |
| `hooks/useIdleTimeout.ts` | 空闲超时 hook |
| `config/idleTimeout.ts` | 超时配置常量 |

### 修改

| 文件 | 改动 |
|------|------|
| `components/scanner/UiverseProfilePopup.tsx` | 替换 CapacityStatusList → StudentEntryCard；移除底部按钮区域 |
| `features/student/components/layout/student-layout.tsx` | 添加返回按钮 + useIdleTimeout |

### 不修改

| 文件 | 原因 |
|------|------|
| `CapacityStatusList.tsx` | 保留不动，Dashboard 等其他页面可能引用 |
| `useProfilePopup.ts` | 数据提供不变 |
| `ScannerPanel.tsx` | 不改 |

---

## 5. 边缘情况

| 场景 | 处理 |
|------|------|
| 空间负载数据为空 | 显示骨架屏（与现有逻辑一致） |
| 空间负载数据加载中 | `roomOverviewFetching=true` → 骨架屏 |
| 学生在第2页点击进入学生中心 | 触发 PIN 流程，与原先按钮行为完全一致 |
| 空闲警告期间用户回来 | 点击/按键 → 重置定时器，警告消失 |
| 学生中心页面刷新 | `authStorage` 有 token → 正常渲染；已过期 → 登出 |
| 非特殊通道登录的学生 | StudentLayout 返回按钮同样显示（所有学生都受益） |

---

## 6. 约束

- ❌ 不安装 styled-components
- ❌ 不改动弹窗三栏 grid 布局
- ❌ 不删除 CapacityStatusList（其他页面可能引用）
- ❌ 不改动 NumericKeypad / BizOverlayShell 内部逻辑
- ✅ 空闲超时参数从 `config/idleTimeout.ts` 读取
