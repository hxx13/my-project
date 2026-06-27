# 豁免配置展示 + 豁免筛选器 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Web + 小程序 dahua-issue/roomAudit 列表中添加豁免房间名展示和三态豁免筛选器

**Architecture:** 纯前端改动。`freezeExemptRoomIds` 存储格式从 `["id"]` 升级为 `[{"roomId":"x","roomName":"y"}]`。新增 `parseExemptRoomNames()` 兼容新旧格式。筛选器为本地过滤，叠加关键词搜索。

**Tech Stack:** React + TypeScript (Web), 微信小程序原生 (miniprogram)

---

### Task 1: Web — `parseExemptRoomNames()` 工具函数

**Files:**
- Modify: `frontend/src/constants/exemptDurationPresets.ts` (末尾追加)

- [ ] **Step 1: 追加工具函数**

在 `exemptDurationPresets.ts` 文件末尾追加以下代码：

```ts
/** 从 freezeExemptRoomIds JSON 解析房间名数组。兼容旧格式 ["id1","id2"] 和新格式 [{"roomId":"x","roomName":"y"}] */
export function parseExemptRoomNames(roomIdsJson?: string | null): string[] {
    if (!roomIdsJson) return [];
    try {
        const arr = JSON.parse(roomIdsJson);
        if (!Array.isArray(arr) || arr.length === 0) return [];
        return arr.map((item: unknown) => {
            if (typeof item === 'object' && item !== null) {
                const name = (item as Record<string, unknown>).roomName;
                if (typeof name === 'string' && name.trim()) return name.trim();
                const id = (item as Record<string, unknown>).roomId;
                return typeof id === 'string' ? id : '';
            }
            if (typeof item === 'string') return item;
            return '';
        }).filter(Boolean);
    } catch {
        return [];
    }
}
```

- [ ] **Step 2: 验证编译** 

Run: `cd frontend && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: 无新增类型错误

- [ ] **Step 3: Commit**

```bash
git add frontend/src/constants/exemptDurationPresets.ts
git commit -m "feat: add parseExemptRoomNames utility for exemption room display"
```

---

### Task 2: Web — 豁免房间名展示 + 筛选器 + 提交格式

**Files:**
- Modify: `frontend/src/pages/DebugCardMappingPage.tsx`

- [ ] **Step 1: 导入新工具函数**

在文件顶部 import 语句中，找到 `formatExemptStatus` 的导入行，在其后追加 `parseExemptRoomNames`：

```tsx
import {
    DEFAULT_EXEMPT_UNTIL_TIME,
    formatExemptExpireAt,
    formatExemptRemaining,
    EXEMPT_MODE_OPTIONS,
    formatExemptStatus,
    parseExemptRoomNames,  // 新增
} from "@/constants/exemptDurationPresets";
```

- [ ] **Step 2: 添加筛选器 state**

在组件 state 声明区（约 L79 附近，与其他 useState 并列）新增：

```tsx
const [exemptFilter, setExemptFilter] = useState<"all" | "exempt" | "controlled">("all");
```

- [ ] **Step 3: 替换 `displayData` 计算逻辑**

找到 `const displayData: CardMappingRow[] = isSearching ? searchResults : (data?.list || []);` （约 L738），在其下方追加筛选逻辑：

```tsx
const displayData: CardMappingRow[] = (() => {
    const raw: CardMappingRow[] = isSearching ? searchResults : (data?.list || []);
    if (exemptFilter === "all") return raw;
    return raw.filter(row => {
        const isExempt =
            row.freezeExemptFlag === 1 &&
            (!row.freezeExemptExpireAt ||
                Date.parse(String(row.freezeExemptExpireAt).replace(/-/g, "/")) > Date.now());
        return exemptFilter === "exempt" ? isExempt : !isExempt;
    });
})();
```

- [ ] **Step 4: 添加筛选器 UI**

在 toolbar 区域，搜索栏左侧（`<AdminToolbarSearchField` 之前）插入分段按钮。找到 L823 `{freezeLoading ? ...` 行，在其**前面**插入：

```tsx
{/* 豁免筛选器 */}
<div className="flex shrink-0 rounded-xl border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] p-0.5 shadow-[var(--app-elevation-card)]">
    {([
        { key: "all", label: "全部" },
        { key: "exempt", label: "已豁免" },
        { key: "controlled", label: "未豁免" },
    ] as const).map((opt) => (
        <button
            key={opt.key}
            type="button"
            className={`px-3 py-1.5 text-xs font-bold rounded-[10px] transition-colors ${
                exemptFilter === opt.key
                    ? "bg-[var(--app-color-accent)] text-[var(--app-color-text-inverse)] shadow-sm"
                    : "text-[var(--app-color-text-secondary)] hover:text-[var(--app-color-text-primary)]"
            }`}
            onClick={() => setExemptFilter(opt.key)}
        >
            {opt.label}
        </button>
    ))}
</div>
```

- [ ] **Step 5: 添加豁免房间名展示**

在表体 TD 的豁免状态区域中，找到 `formatExemptStatus(row)` 返回文字的 `<div>` 块（约 L936-941），在其下方追加房间名行。在 `formatExemptStatus(row)` 的 `</div>` 闭合后、`isExempt && row.freezeExemptExpireAt` 的 `<div>` 之前插入：

```tsx
{isExempt && (() => {
    const roomNames = parseExemptRoomNames(row.freezeExemptRoomIds);
    return roomNames.length > 0 ? (
        <div className="mt-0.5 text-[10px] text-[var(--app-color-accent)] font-medium leading-tight">
            房间: {roomNames.join(', ')}
        </div>
    ) : null;
})()}
```

- [ ] **Step 6: 修改 `submitExemptConfig` 提交格式**

找到 `submitExemptConfig` 函数（约 L662），修改 `roomIds` 的序列化方式。将：

```tsx
roomIds: JSON.stringify(selectedRooms.map((r) => r.roomId)),
```

改为：

```tsx
roomIds: JSON.stringify(selectedRooms.map((r) => ({ roomId: r.roomId, roomName: r.roomName }))),
```

- [ ] **Step 7: 验证编译**

Run: `cd frontend && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: 无新增类型错误

- [ ] **Step 8: Commit**

```bash
git add frontend/src/pages/DebugCardMappingPage.tsx
git commit -m "feat: exemption room display + filter pills in dahua-issue list"
```

---

### Task 3: 小程序 — `parseExemptRoomNames()` 工具函数

**Files:**
- Modify: `aroapp/miniprogram/package-feature/utils/exemptDurationPresets.js`

- [ ] **Step 1: 追加工具函数 + 更新导出**

在 `exemptDurationPresets.js` 中，`serializeSelectedRoomIds` 函数之后、`module.exports` 之前追加：

```js
function parseExemptRoomNames(roomIdsJson) {
  if (!roomIdsJson) return [];
  try {
    var arr = JSON.parse(roomIdsJson);
    if (!Array.isArray(arr) || arr.length === 0) return [];
    return arr.map(function (item) {
      if (typeof item === 'object' && item !== null) {
        var name = item.roomName;
        if (typeof name === 'string' && name.trim()) return name.trim();
        var id = item.roomId;
        return typeof id === 'string' ? id : '';
      }
      if (typeof item === 'string') return item;
      return '';
    }).filter(Boolean);
  } catch (e) {
    return [];
  }
}
```

- [ ] **Step 2: 更新 `module.exports`**

在 `module.exports` 对象中添加 `parseExemptRoomNames`：

```js
module.exports = {
  // ... 现有导出 ...
  parseExemptRoomNames,
};
```

- [ ] **Step 3: Commit**

```bash
git add aroapp/miniprogram/package-feature/utils/exemptDurationPresets.js
git commit -m "feat(miniprogram): add parseExemptRoomNames utility"
```

---

### Task 4: 小程序 — exempt-setup-panel 提交格式

**Files:**
- Modify: `aroapp/miniprogram/package-feature/components/exempt-setup-panel/index.js`

- [ ] **Step 1: 修改 `selectedRoomIdsJson` 方法**

找到 `selectedRoomIdsJson()` 方法（约 L105），替换为：

```js
selectedRoomIdsJson() {
  const selected = (this.data.rooms || []).filter(function (r) { return r.selected; });
  const items = selected.map(function (r) {
    return { roomId: r.roomId, roomName: r.roomName };
  });
  return items.length ? JSON.stringify(items) : null;
},
```

- [ ] **Step 2: Commit**

```bash
git add aroapp/miniprogram/package-feature/components/exempt-setup-panel/index.js
git commit -m "feat(miniprogram): exempt-setup-panel submit rooms as [{roomId,roomName}]"
```

---

### Task 5: 小程序 — dahuaIssue 页面筛选器 + 房间名

**Files:**
- Modify: `aroapp/miniprogram/package-feature/pages/dahuaIssue/index.wxml`
- Modify: `aroapp/miniprogram/package-feature/pages/dahuaIssue/index.js`

- [ ] **Step 1: 在 JS 中新增 state 和筛选逻辑**

文件：`index.js`

在 `data` 对象中新增 `exemptFilter`：

```js
data: {
    // ... 现有字段 ...
    exemptFilter: 'all',  // 新增: 'all' | 'exempt' | 'controlled'
},
```

在 `decorateMappingRow` 函数中追加房间名字段：

```js
function decorateMappingRow(row) {
  const cardStatus = normalizeCardStatus(row && row.cardStatus);
  const activeExempt = exemptUtil.isExemptActive(row);
  const freezeExemptFlag = activeExempt ? 1 : 0;
  const exemptStatusText = activeExempt ? exemptUtil.formatExemptStatus(row) : '';
  const exemptRoomNames = activeExempt ? exemptUtil.parseExemptRoomNames(row.freezeExemptRoomIds) : [];  // 新增
  return {
    ...(row || {}),
    cardStatus,
    freezeExemptFlag,
    exemptStatusText,
    exemptRoomNames: exemptRoomNames.length > 0 ? exemptRoomNames.join(', ') : '',  // 新增
    cardStatusLabel: cardStatus === 'FROZEN' ? '冻结' : '正常',
    cardStatusClass: cardStatus === 'FROZEN' ? 'status-frozen' : 'status-normal',
    controlLabel: freezeExemptFlag === 1 ? '豁免' : '受控',
    controlClass: freezeExemptFlag === 1 ? 'status-exempt' : 'status-controlled',
  };
}
```

在文件末尾（`Page({})` 内部）新增筛选切换方法：

```js
onExemptFilterTap(e) {
  const filter = e.currentTarget.dataset.filter;
  if (!filter) return;
  this.setData({ exemptFilter: filter, page: 1 });
  this.loadList({ silent: true });
},
```

修改 `loadList` 方法，在设置 list 数据后追加客户端筛选。找到 `this.setData({ list: ..., total: ... })` （约 L183），替换为：

```js
const rawList = (listData.list || []).map(decorateMappingRow);
const filter = this.data.exemptFilter || 'all';
const filteredList = filter === 'all' ? rawList : rawList.filter(function (item) {
  return filter === 'exempt' ? item.freezeExemptFlag === 1 : item.freezeExemptFlag !== 1;
});
this.setData({
  list: filteredList,
  total: Number(listData.total || 0),
});
```

- [ ] **Step 2: 在 WXML 中添加筛选按钮**

文件：`index.wxml`

在 `tool-row` 区域的搜索栏之后（第16行 `</button>` 后），第17行之前插入：

```xml
<view class="filter-pills">
  <view class="filter-pill {{exemptFilter==='all'?'filter-pill--active':''}}" data-filter="all" bindtap="onExemptFilterTap">全部</view>
  <view class="filter-pill {{exemptFilter==='exempt'?'filter-pill--active':''}}" data-filter="exempt" bindtap="onExemptFilterTap">已豁免</view>
  <view class="filter-pill {{exemptFilter==='controlled'?'filter-pill--active':''}}" data-filter="controlled" bindtap="onExemptFilterTap">未豁免</view>
</view>
```

**注意：** 筛选按钮样式（`.filter-pills`, `.filter-pill`, `.filter-pill--active`）需一并添加到对应的 wxss 文件中。此处由于截断长度的限制，CSS 样式需在对应页面的 wxss 文件中追加：

在 `dahuaIssue/index.wxss`（如无则检查全局样式文件）末尾追加：

```css
.filter-pills { display: flex; gap: 12rpx; padding: 12rpx 0; }
.filter-pill { padding: 10rpx 28rpx; border-radius: 32rpx; font-size: 26rpx; font-weight: 600; color: #666; background: #f5f5f5; transition: all 0.15s; }
.filter-pill--active { color: #fff; background: #1989fa; }
```

- [ ] **Step 3: 在 WXML 卡片中添加房间名行**

在卡片状态行下方（`status-row` `</view>` 闭合标签后），`btn-row` 之前插入：

```xml
<view wx:if="{{item.exemptRoomNames}}" class="exempt-rooms">房间: {{item.exemptRoomNames}}</view>
```

对应 wxss 追加：

```css
.exempt-rooms { font-size: 24rpx; color: #07c160; padding: 4rpx 0; font-weight: 500; }
```

- [ ] **Step 4: Commit**

```bash
git add aroapp/miniprogram/package-feature/pages/dahuaIssue/index.js aroapp/miniprogram/package-feature/pages/dahuaIssue/index.wxml
git commit -m "feat(miniprogram): dahuaIssue filter pills + exempt room names"
```

---

### Task 6: 小程序 — roomAudit 页面筛选器 + 房间名

**Files:**
- Modify: `aroapp/miniprogram/package-feature/pages/roomAudit/index.wxml`
- Modify: `aroapp/miniprogram/package-feature/pages/roomAudit/index.js`

- [ ] **Step 1: 在 JS 中新增 state 和筛选方法**

文件：`index.js`

在 `data` 对象中新增：

```js
data: {
    // ... 现有字段 ...
    exemptFilter: 'all',  // 新增
},
```

修改 `decoratePerson` 函数（约 L39），追加房间名：

```js
function decoratePerson(p) {
  const exemptStatusText = exemptUtil.formatExemptStatus(p);
  const exemptRoomNames = exemptUtil.parseExemptRoomNames(p.freezeExemptRoomIds);  // 新增
  return {
    ...p,
    entryTypeLabel: entryTypeLabel(p.entryType),
    exemptStatusText,
    exemptRoomNames: exemptRoomNames.length > 0 ? exemptRoomNames.join(', ') : '',  // 新增
  };
}
```

在 `Page({})` 内部新增方法：

```js
onExemptFilterTap(e) {
  const filter = e.currentTarget.dataset.filter;
  if (!filter) return;
  this.setData({ exemptFilter: filter });
},
```

在 `apiCampusesToTree` 函数（约 L48）处理 persons 时追加客户端过滤。在 `persons: rawPersons.map(decoratePerson)` 这一行之后，追加 filter 逻辑。找到这一行，改为：

```js
const decorated = rawPersons.map(decoratePerson);
const exemptFilter = this.data.exemptFilter || 'all';
const persons = exemptFilter === 'all'
  ? decorated
  : decorated.filter(function (p) { return exemptFilter === 'exempt' ? Number(p.freezeExemptFlag) === 1 : Number(p.freezeExemptFlag) !== 1; });
```

**注意：** `apiCampusesToTree` 需要用 `this.data.exemptFilter`，需将这个方法改为 Page 方法或传入 filter 参数。更好的做法是：在 `this.setData` 之前先做过滤。

实际改动策略：保持 `apiCampusesToTree` 不变，在 setData 时对 rooms 下 persons 做过滤。找到 `refreshAll` 和 `onFloorTap` 中构建 campusDisplayList 后的 setData 点，追加过滤步骤：

在 `this.setData({ campusDisplayList: ..., selectedCampus: ..., ... })` 调用之前，插入：

```js
const exemptFilter = this.data.exemptFilter || 'all';
displayList = displayList.map(function (campusNode) {
  return {
    ...campusNode,
    floors: (campusNode.floors || []).map(function (f) {
      const persons = exemptFilter === 'all'
        ? f.persons
        : f.persons.filter(function (p) { return exemptFilter === 'exempt' ? Number(p.freezeExemptFlag) === 1 : Number(p.freezeExemptFlag) !== 1; });
      return { ...f, persons: persons, floorPersonCount: persons.length };
    }),
  };
});
```

- [ ] **Step 2: 在 WXML 添加筛选按钮**

文件：`index.wxml`

在 `panel-head` 的 `panel-head-actions` 中（约 L37），`onOpenFreezeConfig` 之前插入：

```xml
<view class="filter-pills">
  <text class="filter-pill {{exemptFilter==='all'?'filter-pill--active':''}}" data-filter="all" bindtap="onExemptFilterTap">全部</text>
  <text class="filter-pill {{exemptFilter==='exempt'?'filter-pill--active':''}}" data-filter="exempt" bindtap="onExemptFilterTap">已豁免</text>
  <text class="filter-pill {{exemptFilter==='controlled'?'filter-pill--active':''}}" data-filter="controlled" bindtap="onExemptFilterTap">未豁免</text>
</view>
```

在卡状态行（约 L73）`免冻结` 文本后追加房间名：

当前 WXML（约 L73）：
```xml
<text class="k">卡状态</text><text class="v">{{ item.cardStatus }} · 免冻结 {{ item.freezeExemptFlag === 1 ? '开' : '关' }}<text wx:if="{{ item.exemptStatusText }}" class="exempt-detail"> · {{ item.exemptStatusText }}</text></text>
```

在其后追加：
```xml
<view wx:if="{{ item.exemptRoomNames }}" class="exempt-rooms">房间: {{ item.exemptRoomNames }}</view>
```

对应 wxss 追加与 Task 5 Step 3 相同样式。

- [ ] **Step 3: Commit**

```bash
git add aroapp/miniprogram/package-feature/pages/roomAudit/index.js aroapp/miniprogram/package-feature/pages/roomAudit/index.wxml
git commit -m "feat(miniprogram): roomAudit filter pills + exempt room names"
```

---

### Task 7: 端到端验证

- [ ] **Step 1: Web 端验证**

1. 启动前端 dev server：`cd frontend && npm run dev`
2. 浏览器访问 `/#/console/admin/dahua-issue`
3. 验证筛选器：「全部」显示所有行，「已豁免」只显示豁免行，「未豁免」显示其余行
4. 找一个已豁免且设了房间的人，验证行中显示「房间: xxx, xxx」
5. 给一个人设置豁免（选模式+选房间+确认），验证提交成功且列表刷新后房间名正确显示

- [ ] **Step 2: 小程序端验证**

1. 打开微信开发者工具，加载小程序项目
2. 进入「校园卡管理」(dahuaIssue) 页面
3. 验证筛选按钮切换正常
4. 验证豁免卡片显示房间名
5. 进入 roomAudit 页面，同样验证筛选 + 房间名

- [ ] **Step 3: 提交最终 commit（如有微调）**

```bash
git add -A
git commit -m "chore: final adjustments for exempt display + filter"
```
