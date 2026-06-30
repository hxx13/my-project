# 检查维护页面改进 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 改进小程序检查维护页面的耗材/更换分区：记录按类型分组折叠展示、更换新增支持预设多选批量创建、时间选择器改为仅日期。

**Architecture:** 纯前端改动，不改 API / 后端 / 数据库。index.js 新增 groupBy 逻辑 + 批量创建逻辑，index.wxml 新增折叠面板 + checkbox 多选，index.wxss 新增折叠样式。`filter_type` 保持单值 VARCHAR，多选预设后逐条创建记录。

**Tech Stack:** 微信小程序原生框架 + Vant Weapp 组件库

---

### Task 1: 时间选择器改为仅日期

**Files:**
- Modify: `aroapp/miniprogram/package-feature/pages/facilityMaintenance/index.wxml:168-177`

- [ ] **Step 1: 将 van-datetime-picker 的 type 改为 date**

将第 169 行的 `type="datetime"` 改为 `type="date"`：

```wxml
<van-datetime-picker
  type="date"
  value="{{ timePickerValue }}"
  min-date="{{ pickerMinTs }}"
  max-date="{{ pickerMaxTs }}"
  bind:input="onTimePickerInput"
  bind:confirm="confirmTimePicker"
  bind:cancel="closeTimePicker"
/>
```

- [ ] **Step 2: 验证显示格式**

JS 中 `confirmTimePicker` 使用 `timestampToWallText` 生成文本，该函数返回 `"2026-06-29 14:30"` 格式。需要将其改为仅日期格式。

在 `index.js` 中新增一个辅助函数（放在 `todayStr` 后面），用于将 timestamp 转为 `YYYY-MM-DD` 字符串：

```js
function tsToDateStr(ts) {
  const d = new Date(ts);
  const z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}
```

修改 `confirmTimePicker` 方法（第 747-753 行），将 `timestampToWallText(ts)` 替换为 `tsToDateStr(ts)`：

```js
confirmTimePicker(e) {
  const ts = this._tsFromDatetimePickerDetail(e.detail != null ? e.detail : this.data.timePickerValue);
  const text = tsToDateStr(ts);
  const forKey = this.data.timePickerFor;
  if (forKey === 'cons') this.setData({ formConsOccurredAt: text, timePickerShow: false, timePickerFor: '' });
  else if (forKey === 'rep') this.setData({ formRepAt: text, timePickerShow: false, timePickerFor: '' });
  else this.setData({ timePickerShow: false, timePickerFor: '' });
},
```

- [ ] **Step 3: 调整卡片上的日期显示**

耗材卡片的 `item.occurredAtText` 和更换卡片的 `item.replacedAtText` 目前由 `formatBackendDateTimeForDisplay` 生成（格式 `"2026-06-29 14:30"`）。改为仅日期显示。

在 `index.js` 的 `loadActive` 方法中（第 616-620 行），将 `formatBackendDateTimeForDisplay` 替换为提取日期部分的逻辑。新增一个工具函数：

```js
function formatBackendDateOnly(dt) {
  if (!dt) return '';
  const s = String(dt);
  // "2026-06-29T14:30:00" or "2026-06-29 14:30:00" -> "2026-06-29"
  return s.slice(0, 10);
}
```

修改 `loadActive` 中的 decorated 逻辑（第 616-621 行）：

```js
const decorated = rows.map((r) => {
  const copy = { ...r };
  if (copy.occurredAt) copy.occurredAtText = formatBackendDateOnly(copy.occurredAt);
  if (copy.replacedAt) copy.replacedAtText = formatBackendDateOnly(copy.replacedAt);
  return copy;
});
```

同样修改 `mergeConsRow`（第 829-836 行）和 `mergeRepRow`（第 839-846 行）中的 `occurredAtText`/`replacedAtText` 赋值。

- [ ] **Step 4: 编辑弹窗回填也用日期格式**

在 `editCons`（第 802 行）和 `editRep`（第 810 行）中，回填时间字段时也使用 `formatBackendDateOnly`：

`editCons` 第 801 行：
```js
formConsOccurredAt: row.occurredAt ? formatBackendDateOnly(row.occurredAt) : '',
```

`editRep` 第 810 行：
```js
const ra = row.replacedAt ? formatBackendDateOnly(row.replacedAt) : '';
```

- [ ] **Step 5: 新增记录时也初始化为日期格式**

`openAddPopup` 方法（第 643-677 行）中 `formConsOccurredAt` 和 `formRepAt` 初始化为 `nowLocalWallTextPretty()`。将其替换为 `todayStr()`：

```js
formConsOccurredAt: todayStr(),
// ...
formRepAt: todayStr(),
```

- [ ] **Step 6: 提交时的日期格式兼容**

`submitAdd` 中调用的 `wallInputToApiLocalDateTime` 需要能处理日期格式 `"2026-06-29"`。确认 `datetimeBeijing.js` 中的该函数对纯日期格式的兼容性。如果不兼容，在 `submitAdd` 中直接拼接 `"T00:00:00"`：

耗材提交（第 874 行附近）：
```js
let occurredAtApi = wallInputToApiLocalDateTime(this.data.formConsOccurredAt);
if (!occurredAtApi) occurredAtApi = toLocalDateTimeNoTz(new Date());
```
替换为：
```js
const dateStr = this.data.formConsOccurredAt;
let occurredAtApi = dateStr ? dateStr + 'T00:00:00' : toLocalDateTimeNoTz(new Date());
```

更换提交同理（第 926 行附近）：
```js
const dateStrRep = this.data.formRepAt;
let replacedAtApi = dateStrRep ? dateStrRep + 'T00:00:00' : toLocalDateTimeNoTz(new Date());
```

---

### Task 2: 耗材 tab 记录按名称分组折叠

**Files:**
- Modify: `aroapp/miniprogram/package-feature/pages/facilityMaintenance/index.js`
- Modify: `aroapp/miniprogram/package-feature/pages/facilityMaintenance/index.wxml:72-91`
- Modify: `aroapp/miniprogram/package-feature/pages/facilityMaintenance/index.wxss`

- [ ] **Step 1: 在 data 中新增分组相关状态**

在 `index.js` 的 `data` 对象中新增：

```js
consGroups: [],          // [{ name, count, latestDate, rows, open: false }]
repGroups: [],           // [{ name, count, latestDate, rows, open: false }]
```

- [ ] **Step 2: 新增 groupBy 工具函数**

在 `index.js` 中 `buildDateSheetRows` 之后新增：

```js
function groupByKey(rows, keyFn) {
  const map = new Map();
  (rows || []).forEach((r) => {
    const k = keyFn(r) || '（未分类）';
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(r);
  });
  const groups = [];
  map.forEach((list, name) => {
    list.sort((a, b) => {
      const ta = new Date(a.occurredAt || a.replacedAt || 0).getTime();
      const tb = new Date(b.occurredAt || b.replacedAt || 0).getTime();
      return tb - ta;
    });
    const latest = list[0];
    const latestDate = (latest.occurredAtText || latest.replacedAtText || '').slice(0, 10);
    groups.push({ name, count: list.length, latestDate, rows: list, open: false });
  });
  return groups;
}
```

- [ ] **Step 3: 数据加载后计算分组**

在 `loadActive` 方法的 setData 中，加载完数据后计算分组。修改 setData 调用（第 624-635 行），加入分组计算：

耗材（第 624-628 行替换）：
```js
const consList = append ? this.data.consRows.concat(decorated) : decorated;
const consGroups = groupByKey(consList, (r) => r.consumableName || '未命名');
this.setData({
  total,
  page,
  consRows: consList,
  consGroups,
});
```

更换（第 629-635 行替换）：
```js
const repList = append ? this.data.repRows.concat(decorated) : decorated;
const repGroups = groupByKey(repList, (r) => r.filterType || '未分类');
this.setData({
  total,
  page,
  repRows: repList,
  repGroups,
});
```

- [ ] **Step 4: 新增/编辑/删除后重建分组**

新增 `rebuildConsGroups` 和 `rebuildRepGroups` 方法，在增删改后调用：

```js
rebuildConsGroups() {
  const groups = groupByKey(this.data.consRows || [], (r) => r.consumableName || '未命名');
  this.setData({ consGroups: groups });
},
rebuildRepGroups() {
  const groups = groupByKey(this.data.repRows || [], (r) => r.filterType || '未分类');
  this.setData({ repGroups: groups });
},
```

在 `mergeConsRow`（第 829 行）末尾调用 `this.rebuildConsGroups();`
在 `mergeRepRow`（第 839 行）末尾调用 `this.rebuildRepGroups();`
在 `submitAdd` 中新增耗材后（第 917 行 setData 后）调用 `this.rebuildConsGroups();`
在 `submitAdd` 中新增更换后（第 962 行 setData 后）调用 `this.rebuildRepGroups();`
在 `runDeleteConfirm` 删除耗材后（第 1015 行）调用 `this.rebuildConsGroups();`
在 `runDeleteConfirm` 删除更换后（第 1019 行）调用 `this.rebuildRepGroups();`

- [ ] **Step 5: 新增折叠开关方法**

```js
toggleConsGroup(e) {
  const name = e.currentTarget.dataset.name;
  const groups = (this.data.consGroups || []).map((g) =>
    g.name === name ? { ...g, open: !g.open } : g,
  );
  this.setData({ consGroups: groups });
},
toggleRepGroup(e) {
  const name = e.currentTarget.dataset.name;
  const groups = (this.data.repGroups || []).map((g) =>
    g.name === name ? { ...g, open: !g.open } : g,
  );
  this.setData({ repGroups: groups });
},
```

- [ ] **Step 6: 重写耗材 tab 的 WXML 模板**

替换 [index.wxml:72-91](aroapp/miniprogram/package-feature/pages/facilityMaintenance/index.wxml#L72-L91) 的耗材列表部分：

```wxml
<van-tab title="耗材" name="cons">
  <view class="ledger-head">
    <text class="ledger-title">耗材登记</text>
    <view class="fm-pill fm-pill-sm fm-pill-ghost {{ exportBusy ? 'fm-disabled' : '' }}" bindtap="exportConsExcel">导出</view>
  </view>
  <view class="list-pad">
    <van-empty wx:if="{{ !loading && consRows.length === 0 }}" description="暂无耗材记录" />
    <block wx:for="{{ consGroups }}" wx:key="name">
      <view class="group-card">
        <view class="group-head" data-name="{{ item.name }}" bindtap="toggleConsGroup">
          <text class="group-arrow">{{ item.open ? '▼' : '▶' }}</text>
          <text class="group-title-ellipsis">{{ item.name }}</text>
          <text class="group-meta">× {{ item.count }} · 最近 {{ item.latestDate }}</text>
        </view>
        <view wx:if="{{ item.open }}" class="group-body">
          <view wx:for="{{ item.rows }}" wx:for-item="r" wx:key="id" class="card card--sub">
            <view class="card-head-row">
              <text class="card-title-ellipsis">{{ r.consumableName }} × {{ r.qty }} {{ r.unit || '' }}</text>
              <view class="card-inline-actions">
                <view class="fm-chip fm-chip-xs fm-chip-ghost" data-id="{{ r.id }}" catchtap="editCons">编辑</view>
                <view class="fm-chip fm-chip-xs fm-chip-danger" data-id="{{ r.id }}" catchtap="onDeleteCons">删除</view>
              </view>
            </view>
            <view class="card-sub">{{ r.occurredAtText }} · {{ r.siteName || '' }}{{ r.note ? ' · ' + r.note : '' }}</view>
          </view>
        </view>
      </view>
    </block>
  </view>
</van-tab>
```

- [ ] **Step 7: 重写更换 tab 的 WXML 模板**

替换 [index.wxml:93-117](aroapp/miniprogram/package-feature/pages/facilityMaintenance/index.wxml#L93-L117) 的更换列表部分：

```wxml
<van-tab title="更换" name="rep">
  <view class="ledger-head">
    <text class="ledger-title">更换记录</text>
    <view class="fm-pill fm-pill-sm fm-pill-ghost {{ exportBusy ? 'fm-disabled' : '' }}" bindtap="exportRepExcel">导出</view>
  </view>
  <view class="list-pad">
    <van-empty wx:if="{{ !loading && repRows.length === 0 }}" description="暂无更换记录" />
    <block wx:for="{{ repGroups }}" wx:key="name">
      <view class="group-card">
        <view class="group-head" data-name="{{ item.name }}" bindtap="toggleRepGroup">
          <text class="group-arrow">{{ item.open ? '▼' : '▶' }}</text>
          <text class="group-title-ellipsis">{{ item.name }}</text>
          <text class="group-meta">× {{ item.count }} · 最近 {{ item.latestDate }}</text>
        </view>
        <view wx:if="{{ item.open }}" class="group-body">
          <view wx:for="{{ item.rows }}" wx:for-item="r" wx:key="id" class="card card--sub">
            <view class="card-head-row">
              <text class="card-title-ellipsis">{{ r.filterType }} · {{ r.replacedAtText }}</text>
              <view class="card-inline-actions">
                <view class="fm-chip fm-chip-xs fm-chip-ghost" data-id="{{ r.id }}" catchtap="editRep">编辑</view>
                <view class="fm-chip fm-chip-xs fm-chip-danger" data-id="{{ r.id }}" catchtap="onDeleteRep">删除</view>
              </view>
            </view>
            <view class="card-sub">{{ r.siteName || '' }} · 距上次 {{ r.daysSincePrevious != null ? r.daysSincePrevious : '-' }} 天</view>
          </view>
        </view>
      </view>
    </block>
  </view>
</van-tab>
```

- [ ] **Step 8: 新增分组折叠样式**

在 `index.wxss` 末尾追加：

```css
/* 分组折叠 */
.group-card {
  margin-bottom: 16rpx;
  background: #fff;
  border-radius: 22rpx;
  box-shadow: 0 6rpx 22rpx rgba(15, 23, 42, 0.06);
  border: 1rpx solid #eef2f7;
  overflow: hidden;
}
.group-head {
  display: flex;
  align-items: center;
  padding: 20rpx 24rpx;
  gap: 12rpx;
}
.group-arrow {
  font-size: 22rpx;
  color: #969799;
  flex-shrink: 0;
  width: 32rpx;
  text-align: center;
}
.group-title-ellipsis {
  flex: 1;
  min-width: 0;
  font-size: 28rpx;
  font-weight: 600;
  color: #323233;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.group-meta {
  font-size: 22rpx;
  color: #969799;
  flex-shrink: 0;
}
.group-body {
  border-top: 1rpx solid #f0f0f0;
  padding: 8rpx 16rpx 16rpx;
}
.card--sub {
  margin-bottom: 12rpx;
  box-shadow: 0 2rpx 8rpx rgba(15, 23, 42, 0.04);
  border: 1rpx solid #f5f6f8;
}
.card--sub:last-child {
  margin-bottom: 0;
}
```

---

### Task 3: 更换新增弹窗支持预设类型多选

**Files:**
- Modify: `aroapp/miniprogram/package-feature/pages/facilityMaintenance/index.wxml:144-158`
- Modify: `aroapp/miniprogram/package-feature/pages/facilityMaintenance/index.js`

- [ ] **Step 1: 新增 data 字段**

在 `index.js` 的 `data` 中新增：

```js
repSelectedPresets: [],   // checkbox 选中的预设 label 数组
```

- [ ] **Step 2: 替换弹窗中更换区域的 WXML**

将 [index.wxml:144-158](aroapp/miniprogram/package-feature/pages/facilityMaintenance/index.wxml#L144-L158) 替换为：

```wxml
<view wx:else>
  <view wx:if="{{ presetNames.length }}" class="preset-checkbox-block">
    <text class="fm-select-label" style="margin-bottom:12rpx;display:block;">预设类型（可多选）</text>
    <checkbox-group bindchange="onRepPresetsChange">
      <label wx:for="{{ presetNames }}" wx:key="*this" class="preset-checkbox-line">
        <checkbox value="{{ item }}" checked="{{ repSelectedPresets.indexOf(item) > -1 }}" />
        <text class="preset-checkbox-label">{{ item }}</text>
      </label>
    </checkbox-group>
  </view>
  <view wx:if="{{ repSelectedPresets.length }}" class="preset-selected-row">
    <text class="fm-select-label">已选：</text>
    <text wx:for="{{ repSelectedPresets }}" wx:key="*this" class="preset-tag">{{ item }}</text>
  </view>
  <van-cell title="更换日期" value="{{ formRepAt }}" is-link border="{{ false }}" bind:click="openRepAtPicker" />
  <van-field label="备注" type="textarea" autosize="{{ true }}" value="{{ formRepNote }}" placeholder="选填" bind:change="onRepNote" />
</view>
```

- [ ] **Step 3: 新增 checkbox change 处理方法**

在 `index.js` 中新增：

```js
onRepPresetsChange(e) {
  this.setData({ repSelectedPresets: e.detail.value || [] });
},
```

- [ ] **Step 4: 移除旧的预设 picker/chip 相关方法**

移除弹窗内不再需要的：
- 删除 WXML 中旧的 `picker mode="selector" range="{{ presetNames }}"` 区域（已被替换）
- 删除 WXML 中旧的 `fm-preset-scroll` 区域（已被替换）
- 删除 WXML 中旧的 `<van-field label="类型" ...>` （已被替换）

保留 `tapPreset` 方法（tab 层的快速类型 chip 仍在使用），但简化 `openAddPopup` 初始化逻辑。

- [ ] **Step 5: 修改 openAddPopup 初始化多选状态**

在 `openAddPopup` 的 setData 中（第 660-676 行），新增 `repSelectedPresets` 初始化：

```js
this.setData({
  addPopup: true,
  editingId: '',
  popupSiteSheetShow: false,
  popupSitePickerIndex,
  popupSiteName,
  formConsName: '',
  formConsQty: '',
  formConsUnit: '',
  formConsNote: '',
  formConsOccurredAt: todayStr(),
  formRepType: keepType ? this.data.formRepType : '',
  formRepNote: '',
  formRepAt: todayStr(),
  catalogPickerIndex: 0,
  repPresetPickerIndex: keepType ? this.data.repPresetPickerIndex : 0,
  repSelectedPresets: keepType ? this.data.repSelectedPresets : [],  // 新增
});
```

- [ ] **Step 6: 修改 submitAdd 更换部分为批量创建**

将 `submitAdd` 中第 919-963 行的更换提交逻辑替换为批量创建：

```js
} else {
  const selectedPresets = this.data.repSelectedPresets || [];
  // 兼容：如果 checkbox 没选但表单类型字段有值，则作为单条创建
  const types = selectedPresets.length > 0
    ? selectedPresets
    : (this.data.formRepType || '').trim() ? [this.data.formRepType.trim()] : [];
  if (types.length === 0) {
    wx.hideLoading();
    wx.showToast({ title: '请选择至少一个过滤器类型', icon: 'none' });
    return;
  }
  const dateStrRep = this.data.formRepAt;
  let replacedAtApi = dateStrRep ? dateStrRep + 'T00:00:00' : toLocalDateTimeNoTz(new Date());
  const note = (this.data.formRepNote || '').trim() || undefined;
  if (editingId) {
    // 编辑模式仍为单条更新
    await fmApi.patchReplacement(editingId, {
      siteId,
      filterType: types[0],
      replacedAt: replacedAtApi,
      note,
    });
    const siteNameRep = (sites[this.data.popupSitePickerIndex] || {}).name || '';
    this.mergeRepRow(editingId, {
      siteId,
      siteName: siteNameRep,
      filterType: types[0],
      replacedAt: replacedAtApi,
      note,
    });
  } else {
    // 新增模式：批量创建
    const newRows = [];
    for (const ft of types) {
      const created = await fmApi.createReplacement({
        siteId,
        filterType: ft,
        replacedAt: replacedAtApi,
        note,
      });
      const sid = this.data.sites.find((s) => s.id === siteId);
      newRows.push({
        id: created && created.id,
        siteId,
        siteName: sid ? sid.name : '',
        filterType: ft,
        replacedAt: replacedAtApi,
        note,
        replacedAtText: formatBackendDateOnly(replacedAtApi),
        daysSincePrevious: null,
      });
    }
    this.setData({ repRows: newRows.concat(this.data.repRows || []) });
    this.rebuildRepGroups();
  }
}
```

**重要**：编辑模式仍然只更新单条（因为编辑时不允许改类型为多个）。只有新增时走批量创建。

- [ ] **Step 7: 编辑更换记录时设置 repSelectedPresets**

在 `editRep`（第 806-827 行）的 setData 中，附加初始化：

```js
repSelectedPresets: ft ? [ft] : [],
```

- [ ] **Step 8: 新增 preset checkbox 样式**

在 `index.wxss` 末尾追加：

```css
.preset-checkbox-block {
  margin-bottom: 16rpx;
}
.preset-checkbox-line {
  display: inline-flex;
  align-items: center;
  margin-right: 24rpx;
  margin-bottom: 12rpx;
}
.preset-checkbox-label {
  font-size: 26rpx;
  color: #323233;
  margin-left: 8rpx;
}
.preset-selected-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10rpx;
  margin-bottom: 16rpx;
  padding: 12rpx 16rpx;
  background: #f7f8fa;
  border-radius: 12rpx;
}
.preset-tag {
  display: inline-block;
  padding: 4rpx 16rpx;
  font-size: 22rpx;
  color: #ac1736;
  background: rgba(172, 23, 54, 0.08);
  border-radius: 6rpx;
}
```

---

### Task 4: 清理与验证

**Files:** (无新建文件)

- [ ] **Step 1: 移除 datatime picker 不再使用的导入或引用**

确认 `index.json` 中的 `van-datetime-picker` 仍需要（日期模式仍用它），不做删除。

- [ ] **Step 2: 确认 export/refresh 等其他操作不受影响**

- 导出功能 (`exportConsExcel` / `exportRepExcel`)：不依赖前端分组，无影响
- 下拉刷新 (`onPullDownRefresh`)：调用 `loadActive(true)`，数据更新后会重新计算分组
- 分页加载 (`onReachBottom`)：调用 `loadActive(false, next)`，追加数据后重新计算分组

- [ ] **Step 3: 自查代码一致性**

- 所有 `occurredAtText` / `replacedAtText` 的赋值点已统一为 `formatBackendDateOnly`
- 所有 `rebuildConsGroups` / `rebuildRepGroups` 的调用点在增删改后都有触发
- `groupByKey` 对空数组返回 `[]`

- [ ] **Step 4: 提交**

```bash
git add aroapp/miniprogram/package-feature/pages/facilityMaintenance/index.wxml
git add aroapp/miniprogram/package-feature/pages/facilityMaintenance/index.js
git add aroapp/miniprogram/package-feature/pages/facilityMaintenance/index.wxss
git commit -m "feat(facility-maintenance): 耗材/更换记录分组折叠 + 更换预设多选批量创建 + 日期替代日期时间"
```
