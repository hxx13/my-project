# 申领物品页面 UI 品质提升 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 对学生中心申领物品页面及规格选择器进行 UI 品质全面升级，消除硬编码颜色、补全组件七态、建立三层信息节奏、新增提交确认弹窗。

**Architecture:** 纯前端 UI 重构，不改变数据流和 API。两个文件：`student-material.tsx`（主页面）和 `MaterialSpecPickerSheet.tsx`（规格选择器）。复用已有 Dialog/Skeleton/EmptyState 组件。

**Tech Stack:** React + TypeScript + Tailwind CSS 3 + Radix UI Dialog

---

### Task 1: 规格选择器去硬编码 + 品质提升

**Files:**
- Modify: `frontend/src/components/material/MaterialSpecPickerSheet.tsx`

- [ ] **Step 1: 替换 badge 硬编码 `bg-red-500` → `--student-danger` 令牌**

找到 `bg-red-500`（约第 320 行），替换为 `bg-[var(--student-danger)]`：
```tsx
// before
className={cn(
  "absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 text-[10px] text-white text-center leading-4 rounded-full bg-red-500",
  variant === "scanner" && "min-w-[14px] h-3.5 text-[9px] leading-[14px] -top-1 -right-1",
)}
// after
className={cn(
  "absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 text-[10px] text-white text-center leading-4 rounded-full bg-[var(--student-danger)]",
  variant === "scanner" && "min-w-[14px] h-3.5 text-[9px] leading-[14px] -top-1 -right-1",
)}
```

- [ ] **Step 2: 添加弹出层关闭按钮**

在 popover 顶部（dimensions 列表之前）加入：
```tsx
<div className="flex items-center justify-between mb-1">
  <span className={cn("text-[13px] font-semibold", variant === "scanner" ? "text-[var(--app-color-text-primary)]" : "text-[var(--student-ink)]")}>选择规格</span>
  <button
    type="button"
    onClick={() => setOpen(false)}
    className={cn("rounded-full p-0.5 hover:bg-[var(--student-canvas-soft)] transition-colors", "text-[var(--student-mute)]")}
  >
    <X className="size-3.5" />
  </button>
</div>
```
需要在文件顶部 import `X` from `lucide-react`。

- [ ] **Step 3: chip 选中态 border 1px → 2px**

修改 `chipCls` 函数中 active 分支：
```tsx
// before (student variant)
? "border-[var(--student-primary)] bg-[var(--student-primary-soft)] text-[var(--student-primary)]"
// after
? "border-[var(--student-primary)] bg-[var(--student-primary-soft)] text-[var(--student-primary)] border-2"
```
同理更新 scanner/mobile variant。

- [ ] **Step 4: combo 行加卡片底色包裹**

在 combo row 的容器 div 上加 `rounded-lg bg-[var(--student-canvas-soft)] px-2 py-1.5`：
```tsx
// before
<div key={combo.key} className="flex items-center justify-between gap-2">
// after
<div key={combo.key} className="flex items-center justify-between gap-2 rounded-lg bg-[var(--student-canvas-soft)] px-2 py-1.5">
```

- [ ] **Step 5: 更新"不选规格"行标签**
```tsx
// before
<span ...>不选规格</span>
// after  
<span ...>默认（不选规格）</span>
```

- [ ] **Step 6: Commit**
```bash
git add frontend/src/components/material/MaterialSpecPickerSheet.tsx
git commit -m "refactor: polish spec picker — remove hardcoded color, add close button, chip 2px border, combo card bg"
```

---

### Task 2: 物品卡片 (MaterialItemCard) 重设计

**Files:**
- Modify: `frontend/src/features/student/pages/student-material.tsx` (MaterialItemCard 函数)

- [ ] **Step 1: 缩略图 48→56px，无图时显示首字**

```tsx
// before
<div className="size-16 shrink-0 rounded-[var(--student-radius-sm)] bg-[var(--student-canvas-soft)] flex items-center justify-center text-[var(--student-mute)] text-[11px] overflow-hidden">
  {item.coverUrl ? (
    <img src={...} className="size-full object-cover" />
  ) : (
    "暂无图片"
  )}
</div>

// after
<div className="size-14 shrink-0 rounded-lg bg-[var(--student-canvas-soft)] flex items-center justify-center overflow-hidden">
  {item.coverUrl ? (
    <img src={webImageSrc(item.coverUrl) || item.coverUrl} alt={item.name} className="size-full object-cover" />
  ) : (
    <span className="text-xl font-bold text-[var(--student-primary)]/30">{item.name?.charAt(0) || "物"}</span>
  )}
</div>
```

- [ ] **Step 2: 副标题单行截断**

```tsx
// before
{item.subtitle && (
  <p className="text-[11px] text-[var(--student-mute)] mt-0.5 line-clamp-2">{item.subtitle}</p>
)}

// after
{item.subtitle && (
  <p className="text-[12px] text-[var(--student-mute)] mt-0.5 truncate">{item.subtitle}</p>
)}
```

- [ ] **Step 3: 三层信息节奏 — 分割线 + 库存胶囊标签 + 步进器**

将操作区改为：
```tsx
{/* 库存 + 操作区 — 分隔线隔离 */}
<div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-[var(--student-hairline)]">
  {/* 库存胶囊标签 */}
  <span className={cn(
    "text-[11px] px-2 py-0.5 rounded-full font-medium",
    item.stockMode === "UNLIMITED" ? "bg-green-50 text-green-600" :
    (item.stockQty || 0) <= 3 ? "bg-orange-50 text-orange-600" :
    (item.stockQty || 0) <= 0 ? "bg-red-50 text-red-600" :
    "bg-[var(--student-canvas-soft)] text-[var(--student-mute)]"
  )}>
    {item.stockMode === "UNLIMITED" ? "库存充足" :
     (item.stockQty || 0) <= 0 ? "已售罄" :
     `仅剩 ${item.stockQty} 件`}
  </span>
  {/* 步进器 — 保留 isHasSpec 分支 */}
  {hasSpecs ? (
    <MaterialSpecPickControl ... />
  ) : (
    <div className="flex items-center gap-0.5 shrink-0 border border-[var(--student-hairline)] rounded-lg overflow-hidden">
      {cartQty > 0 && (
        <>
          <button onClick={() => onCartChange(cartKey, -1)} className="size-7 flex items-center justify-center hover:bg-[var(--student-canvas-soft)] transition-colors">
            <Minus className="size-3" />
          </button>
          <span className="w-6 text-center text-[13px] font-semibold tabular-nums">{cartQty}</span>
        </>
      )}
      <button
        onClick={() => onCartChange(cartKey, 1)}
        disabled={atCap || soldOut}
        className="size-7 flex items-center justify-center bg-[var(--student-primary)] text-white disabled:bg-[var(--student-hairline)] disabled:text-[var(--student-mute)] transition-colors rounded-r-md"
      >
        <Plus className="size-3" />
      </button>
    </div>
  )}
</div>
```

注意：库存胶囊标签的颜色使用 Tailwind 的 `bg-green-50` / `text-green-600` 等语义 token 类名，这些都是 Tailwind 内置的调色板色，不是硬编码 hex。如果项目有对应的 `--student-*` 语义色则优先使用。

- [ ] **Step 4: 卡片 hover 态**

在 StudentCard 外套一层或直接在 card 上添加：
```tsx
<StudentCard className="flex items-start gap-3 p-3 overflow-visible hover:shadow-md hover:border-[var(--student-primary)]/20 transition-all duration-150">
```

- [ ] **Step 5: Commit**
```bash
git add frontend/src/features/student/pages/student-material.tsx
git commit -m "refactor: redesign MaterialItemCard — 3-layer rhythm, stock badge, hover state, first-char thumbnail"
```

---

### Task 3: 新增提交确认弹窗 (SubmitConfirmDialog)

**Files:**
- Modify: `frontend/src/features/student/pages/student-material.tsx`

使用已有的 Dialog 组件。在 `handleSubmit` 改为先打开弹窗，确认后才提交。

- [ ] **Step 1: 添加 confirm 状态和组件**

在 StudentMaterialPage 函数内添加：
```tsx
const [confirmOpen, setConfirmOpen] = useState(false);
```

- [ ] **Step 2: 修改提交按钮为打开确认弹窗**

```tsx
// before: onClick={handleSubmit}
// after: onClick={() => { if (cartCount > 0) setConfirmOpen(true); }}
```

- [ ] **Step 3: 实现确认弹窗 JSX**

在 return 末尾（`</div>` 之前）添加：
```tsx
<Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
  <DialogHeader>
    <DialogTitle>确认提交申领</DialogTitle>
    <DialogDescription>请核对以下物品，提交后将进入审核流程</DialogDescription>
  </DialogHeader>

  <div className="max-h-[40vh] overflow-y-auto space-y-2 my-2">
    {cartItems.map((group) =>
      group.entries.map((entry) => (
        <div key={entry.key} className="flex items-center gap-3 p-2 rounded-lg bg-[var(--student-canvas-soft)]">
          <div className="size-9 rounded-md bg-[var(--student-canvas-soft)] flex items-center justify-center text-sm font-bold text-[var(--student-primary)]/40 shrink-0">
            {group.item.name?.charAt(0) || "物"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-[var(--student-ink)] truncate">{group.item.name}</p>
            <p className="text-[11px] text-[var(--student-mute)]">{entry.specLabel || "默认"}</p>
          </div>
          <span className="text-[13px] font-semibold text-[var(--student-ink)] shrink-0">×{entry.qty}</span>
        </div>
      ))
    )}
  </div>

  <div className="flex items-center justify-between py-2 border-t border-[var(--student-hairline)]">
    <span className="text-[13px] text-[var(--student-mute)]">合计 <strong className="text-[var(--student-ink)]">{cartCount} 件</strong></span>
  </div>

  <DialogFooter>
    <button
      onClick={() => setConfirmOpen(false)}
      className="px-4 py-2 rounded-lg border border-[var(--student-hairline)] text-[13px] text-[var(--student-body)] hover:bg-[var(--student-canvas-soft)] transition-colors"
    >
      取消
    </button>
    <button
      onClick={handleSubmit}
      disabled={createRequest.isPending}
      className="px-4 py-2 rounded-lg bg-[var(--student-primary)] text-white text-[13px] font-semibold disabled:opacity-50 flex items-center gap-2"
    >
      {createRequest.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
      {createRequest.isPending ? "提交中…" : "确认提交"}
    </button>
  </DialogFooter>
</Dialog>
```

- [ ] **Step 4: 确保 import 了 Dialog 相关组件**

在文件顶部确认：
```tsx
import { StudentCard, Skeleton, EmptyState, Badge, Dialog, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "../components/ui";
```

- [ ] **Step 5: Commit**
```bash
git add frontend/src/features/student/pages/student-material.tsx
git commit -m "feat: add submit confirm dialog with item review before checkout"
```

---

### Task 4: 申领栏 (CartSidebar) 优化

**Files:**
- Modify: `frontend/src/features/student/pages/student-material.tsx`

- [ ] **Step 1: 关闭按钮 `&times;` → ✕ 图标**

```tsx
// before
<button onClick={() => setShowCart(false)} className="text-[var(--student-mute)] hover:text-[var(--student-ink)] text-[20px] leading-none">
  &times;
</button>

// after
<button onClick={() => setShowCart(false)} className="p-1 rounded-md hover:bg-[var(--student-canvas-soft)] text-[var(--student-mute)] hover:text-[var(--student-ink)] transition-colors">
  <X className="size-4" />
</button>
```
需要确保 import 了 `X`。

- [ ] **Step 2: header 添加计数 badge**

```tsx
// before
<h3 className="text-[14px] font-semibold">申领物品栏 ({cartCount} 件)</h3>

// after
<div className="flex items-center gap-2">
  <h3 className="text-[15px] font-bold text-[var(--student-ink)]">申领物品栏</h3>
  {cartCount > 0 && (
    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[var(--student-primary-soft)] text-[var(--student-primary)]">{cartCount} 件</span>
  )}
</div>
```

- [ ] **Step 3: 空态教育性引导**

```tsx
// before
<p className="text-center text-[13px] text-[var(--student-mute)] py-8">申领物品栏为空</p>

// after
<div className="flex flex-col items-center justify-center py-12 px-4 text-center">
  <Package className="size-10 text-[var(--student-mute)]/30 mb-3" />
  <p className="text-[14px] font-semibold text-[var(--student-ink)] mb-1">申领栏是空的</p>
  <p className="text-[12px] text-[var(--student-mute)] mb-4">从左侧物品列表中选择你需要的物品加入申领栏</p>
  <button
    onClick={() => { setShowCart(false); }}
    className="text-[12px] font-medium px-4 py-1.5 rounded-full border border-[var(--student-primary)] text-[var(--student-primary)] hover:bg-[var(--student-primary-soft)] transition-colors"
  >
    去浏览物品
  </button>
</div>
```

- [ ] **Step 4: 底部操作栏改为左合计 + 右按钮**

```tsx
// before
<div className="p-3 border-t border-[var(--student-hairline)]">
  <button onClick={handleSubmit} ... className="w-full ...">提交申领</button>
</div>

// after
<div className="flex items-center justify-between p-3 border-t border-[var(--student-hairline)]">
  <span className="text-[13px] text-[var(--student-mute)]">合计 <strong className="text-[var(--student-ink)] text-[15px]">{cartCount} 件</strong></span>
  <button
    onClick={() => setConfirmOpen(true)}
    disabled={cartCount === 0}
    className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[var(--student-primary)] text-white text-[13px] font-semibold disabled:opacity-40 transition-opacity"
  >
    <Send className="size-4" /> 提交申领
  </button>
</div>
```

- [ ] **Step 5: Commit**
```bash
git add frontend/src/features/student/pages/student-material.tsx
git commit -m "refactor: polish cart sidebar — X icon close, empty state with guide, badge count, left-total layout"
```

---

### Task 5: 分类侧栏优化

**Files:**
- Modify: `frontend/src/features/student/pages/student-material.tsx`

- [ ] **Step 1: 宽度 180→200px，添加物品数量**

需要先计算每个分类下的物品数量。在组件内：
```tsx
const categoryCounts = useMemo(() => {
  if (!items || !categories) return new Map<number, number>();
  const map = new Map<number, number>();
  for (const item of items) {
    const cid = item.categoryId;
    if (cid != null) map.set(cid, (map.get(cid) || 0) + 1);
  }
  return map;
}, [items, categories]);
```

注意：这个需要配合 items 数据（目前只在选中分类后才加载）。可以在全部分类时使用一个简单的方案：预先加载所有物品的计数。如果 API 不支持，则简化——只在每项上显示占位。

- [ ] **Step 2: 侧栏宽度和每项样式**

```tsx
// before
<aside className="w-[180px] shrink-0 border-r ...">

// after
<aside className="w-[200px] shrink-0 border-r ...">

// 每项
<button className={cn(
  "w-full text-left px-3 py-2.5 rounded-[var(--student-radius-sm)] text-[13px] transition-colors flex items-center justify-between",
  activeCategoryId === cat.id
    ? "bg-[var(--student-primary-soft)] text-[var(--student-primary)] font-semibold border-l-[3px] border-l-[var(--student-primary)]"
    : "text-[var(--student-body)] hover:bg-[var(--student-canvas-soft)] border-l-[3px] border-l-transparent",
)}>
  <span>{cat.name}</span>
  {/* 数量 badge — 如果能获取到数据 */}
</button>
```

- [ ] **Step 3: Commit**
```bash
git add frontend/src/features/student/pages/student-material.tsx
git commit -m "refactor: polish category sidebar — 200px width, 3px active indicator, hover states"
```

---

### Task 6: 需求建议表单微调

**Files:**
- Modify: `frontend/src/features/student/pages/student-material.tsx`

- [ ] **Step 1: textarea 加白色底色 + 按钮右对齐**

```tsx
// before: textarea className 加 bg-white, 去掉 bg-[var(--student-canvas-soft)]
<textarea
  className="w-full rounded-[var(--student-radius-sm)] border border-[var(--student-hairline)] bg-white px-3 py-2 text-[13px] text-[var(--student-ink)] resize-none focus:outline-none focus:ring-2 focus:ring-[var(--student-primary)]/20"
  ...
/>

// 按钮区改为 justify-end
<div className="flex justify-end gap-2">
  <button onClick={...} className="...">取消</button>
  <button onClick={...} className="...">提交建议</button>
</div>
```

- [ ] **Step 2: Commit**
```bash
git add frontend/src/features/student/pages/student-material.tsx
git commit -m "refactor: polish demand suggestion form — white textarea bg, right-aligned buttons, focus ring"
```

---

### Task 7: 全局令牌合规自检 + 最终提交

- [ ] **Step 1: Grep 检查硬编码颜色**
```bash
grep -rn 'bg-\[#' frontend/src/components/material/MaterialSpecPickerSheet.tsx frontend/src/features/student/pages/student-material.tsx
grep -rn 'bg-red-500\|bg-white\|bg-slate\|bg-gray\|bg-zinc' frontend/src/components/material/MaterialSpecPickerSheet.tsx frontend/src/features/student/pages/student-material.tsx
```

- [ ] **Step 2: Grep 检查裸 z-index**
```bash
grep -rn 'z-\[[0-9]' frontend/src/features/student/pages/student-material.tsx
```

- [ ] **Step 3: 目视检查 Impeccable 反模式清单**
- [ ] 无侧边竖线装饰
- [ ] 无渐变文字
- [ ] 无玻璃态默认
- [ ] 无眉标/编号段
- [ ] 组件七态完整

- [ ] **Step 4: Final commit**
```bash
git add -A
git commit -m "refactor: complete student material page UI quality upgrade — Impeccable + Bento compliant"
```
