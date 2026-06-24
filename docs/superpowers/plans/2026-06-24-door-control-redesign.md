# 门禁应用页面重设计 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 重设计小程序门禁应用页面，实现按分类分组、模式状态主视觉、内联操作反馈、Enter防抖搜索。

**Architecture:** 纯前端改造，后端 API 不变。利用已有 `/api/v1/dahua/meta/device-channels/remark-categories` 获取分类列表，`/api/v1/dahua/door-control/channels?remarkCategoryId=X` 按分类过滤。页面拆分为搜索栏、分类Tab、分组卡片列表、底部统计四个区域。

**Tech Stack:** WeChat 小程序原生 + Vant Weapp `van-action-sheet`

---

## File Structure

| 文件 | 职责 | 变更 |
|------|------|------|
| `package-feature/utils/doorControlApi.js` | API 封装 | 新增 `fetchRemarkCategories()` |
| `package-feature/pages/doorControl/index.js` | 页面逻辑 | 完整重构 |
| `package-feature/pages/doorControl/index.wxml` | 页面模板 | 完整重写 |
| `package-feature/pages/doorControl/index.wxss` | 页面样式 | 完整重写 |
| `package-feature/pages/doorControl/index.json` | 页面配置 | 不变 |

---

### Task 1: 扩展 API 层 — 新增分类列表接口

**Files:**
- Modify: `aroapp/miniprogram/package-feature/utils/doorControlApi.js`

- [ ] **Step 1: 新增 fetchRemarkCategories 函数**

在 `module.exports` 前插入：

```js
async function fetchRemarkCategories() {
  const res = await springAuth.springRequest({
    url: '/api/v1/dahua/meta/device-channels/remark-categories',
    method: 'GET',
    data: {},
  });
  const body = res.data && typeof res.data === 'object' ? res.data : {};
  if (body.success === true && Array.isArray(body.data)) return body.data;
  // 兼容直接返回数组
  if (Array.isArray(body)) return body;
  if (Array.isArray(res.data)) return res.data;
  return [];
}
```

- [ ] **Step 2: 导出新函数**

在 `module.exports` 中添加：

```js
module.exports = {
  fetchChannels,
  executeMode,
  queryStatus,
  fetchRemarkCategories,  // 新增
};
```

- [ ] **Step 3: Commit**

```bash
git add aroapp/miniprogram/package-feature/utils/doorControlApi.js
git commit -m "feat(doorControl): add fetchRemarkCategories API"
```

---

### Task 2: 重写页面 JS 逻辑（上）— 数据结构与加载

**Files:**
- Modify: `aroapp/miniprogram/package-feature/pages/doorControl/index.js`

- [ ] **Step 1: 定义操作模式常量**

```js
const springAuth = require('../../../utils/springAuth.js');
const pagePermission = require('../../../utils/pagePermission.js');
const api = require('../../utils/doorControlApi.js');

const MODE_LABEL = {
  STAY_OPEN: '常开',
  STAY_CLOSE: '常闭',
  NORMAL: '普通',
};

const MODE_OPTIONS = [
  { name: '常开', key: 'STAY_OPEN' },
  { name: '常闭', key: 'STAY_CLOSE' },
  { name: '普通', key: 'NORMAL' },
];

const SEARCH_DEBOUNCE_MS = 500;
```

- [ ] **Step 2: 定义初始 data**

```js
Page({
  data: {
    // 搜索
    keyword: '',

    // 分类
    categories: [],         // [{id, name, sortOrder}]
    activeCategoryId: null, // null = 全部

    // 列表
    loading: false,
    groupedList: [],        // [{categoryId, categoryName, onlineChannels:[], offlineChannels:[]}]
    totalOnline: 0,
    totalOffline: 0,

    // 状态
    statusByCode: {},       // { channelCode: { status, workMode, onlineStatus } }
    activeModeByCode: {},   // { channelCode: 'STAY_OPEN'|'STAY_CLOSE'|'NORMAL' }

    // 执行
    executingCode: '',
    executingMode: '',      // 'OPEN'|'CLOSE'|当前模式key

    // 内联结果动画
    resultByCode: {},       // { channelCode: { ok, mode, message, at, show: true } }

    // 模式切换 ActionSheet
    showModeSheet: false,
    modeSheetChannelCode: '',
    modeSheetActions: MODE_OPTIONS,
  },
```

- [ ] **Step 3: onShow 生命周期**

```js
  onShow() {
    const role = wx.getStorageSync(springAuth.KEYS.ROLE) || '';
    if (!pagePermission.guardPageOnShow(this, '/package-feature/pages/doorControl/index', role, 'SUPER_ADMIN')) return;
    this.loadCategories().then(() => this.loadList());
  },
```

- [ ] **Step 4: 加载分类列表**

```js
  async loadCategories() {
    try {
      const list = await api.fetchRemarkCategories();
      const sorted = (list || []).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
      this.setData({ categories: sorted });
    } catch (e) {
      // 分类加载失败不影响通道列表
      this.setData({ categories: [] });
    }
  },
```

- [ ] **Step 5: 加载通道列表（支持分类过滤）**

```js
  async loadList() {
    this.setData({ loading: true });
    try {
      const { keyword, activeCategoryId } = this.data;
      const kw = keyword.trim() || undefined;
      const all = [];
      let page = 1;
      const pageSize = 50;
      const MAX_PAGES = 50;
      while (page <= MAX_PAGES) {
        const data = await api.fetchChannels({
          page,
          pageSize,
          keyword: kw,
          remarkCategoryId: activeCategoryId || undefined,
        });
        const rows = data.list || [];
        all.push(...rows);
        if (rows.length < pageSize) break;
        page += 1;
      }
      this.setData({ list: all });
      this.refreshBatchStatusInChunks(all);
    } catch (e) {
      wx.showToast({ title: (e.message || '加载失败').slice(0, 18), icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },
```

- [ ] **Step 6: Commit**

```bash
git add aroapp/miniprogram/package-feature/pages/doorControl/index.js
git commit -m "feat(doorControl): rewrite data layer — categories + grouped list loading"
```

---

### Task 3: 重写页面 JS 逻辑（中）— 分组、搜索、状态

**Files:**
- Modify: `aroapp/miniprogram/package-feature/pages/doorControl/index.js` (继续)

- [ ] **Step 1: 通道分组方法**

在 `Page({...})` 内、现有方法之间插入：

```js
  buildGroupedList() {
    const list = this.data.list || [];
    const statusMap = this.data.statusByCode || {};
    const activeMap = this.data.activeModeByCode || {};
    const categories = this.data.categories || [];
    const activeCategoryId = this.data.activeCategoryId;

    // 如果选中了具体分类，所有通道归入该分类
    if (activeCategoryId) {
      const cat = categories.find(c => String(c.id) === String(activeCategoryId));
      const online = [];
      const offline = [];
      list.forEach(ch => {
        const code = String(ch.channelCode || '').trim();
        const st = statusMap[code];
        const isOffline = st && st.onlineStatus === 'OFF';
        const item = this.buildChannelItem(ch, st, activeMap[code]);
        if (isOffline) offline.push(item);
        else online.push(item);
      });
      const grouped = [{
        categoryId: activeCategoryId,
        categoryName: cat ? cat.name : '当前分类',
        onlineChannels: online,
        offlineChannels: offline,
      }];
      this.setData({
        groupedList: grouped,
        totalOnline: online.length,
        totalOffline: offline.length,
      });
      return;
    }

    // 全部模式：按分类分组，未分类的归入"未分类"
    const catMap = new Map();
    categories.forEach(c => catMap.set(String(c.id), { id: String(c.id), name: c.name, online: [], offline: [] }));

    const uncat = { id: '__uncat__', name: '未分类', online: [], offline: [] };
    let usedUncat = false;

    list.forEach(ch => {
      const code = String(ch.channelCode || '').trim();
      const st = statusMap[code];
      const isOffline = st && st.onlineStatus === 'OFF';
      const item = this.buildChannelItem(ch, st, activeMap[code]);
      const catId = ch.remarkCategoryId ? String(ch.remarkCategoryId) : null;
      const bucket = catId && catMap.has(catId) ? catMap.get(catId) : null;
      if (bucket) {
        if (isOffline) bucket.offline.push(item);
        else bucket.online.push(item);
      } else {
        usedUncat = true;
        if (isOffline) uncat.offline.push(item);
        else uncat.online.push(item);
      }
    });

    const grouped = [];
    categories.forEach(c => {
      const b = catMap.get(String(c.id));
      if (b && (b.online.length || b.offline.length)) {
        grouped.push({
          categoryId: b.id,
          categoryName: b.name,
          onlineChannels: b.online,
          offlineChannels: b.offline,
        });
      }
    });
    if (usedUncat) grouped.push({
      categoryId: '__uncat__',
      categoryName: '未分类',
      onlineChannels: uncat.online,
      offlineChannels: uncat.offline,
    });

    const totalOnline = grouped.reduce((s, g) => s + g.onlineChannels.length, 0);
    const totalOffline = grouped.reduce((s, g) => s + g.offlineChannels.length, 0);

    this.setData({ groupedList: grouped, totalOnline, totalOffline });
  },

  buildChannelItem(ch, statusInfo, activeMode) {
    const code = String(ch.channelCode || '').trim();
    const isOffline = statusInfo && statusInfo.onlineStatus === 'OFF';
    return {
      channelCode: code,
      channelName: ch.channelName || '未命名通道',
      channelType: ch.channelType || '',
      remarkCategoryId: ch.remarkCategoryId,
      isOffline,
      activeMode: activeMode || '',
      activeModeLabel: MODE_LABEL[activeMode] || (isOffline ? '离线' : '—'),
    };
  },
```

- [ ] **Step 2: 改造 refreshBatchStatusInChunks — 完成后触发 buildGroupedList**

在 `refreshBatchStatusInChunks` 末尾 `this.setData({ statusRefreshing: false })` 之后，添加：

```js
    this.buildGroupedList();
```

- [ ] **Step 3: 改造 refreshSingleStatus — 完成后触发 buildGroupedList**

在 `refreshSingleStatus` 的 `this.setData(...)` 之后添加：

```js
      this.buildGroupedList();
```

- [ ] **Step 4: 搜索相关方法 — 防抖 + Enter 键**

```js
  onKeywordInput(e) {
    const keyword = e.detail.value || '';
    this.setData({ keyword });
    // 防抖自动搜索
    if (this._searchTimer) clearTimeout(this._searchTimer);
    this._searchTimer = setTimeout(() => {
      this.doSearch();
    }, SEARCH_DEBOUNCE_MS);
  },

  onSearchConfirm(e) {
    // Enter 键触发
    if (this._searchTimer) clearTimeout(this._searchTimer);
    this.doSearch();
  },

  doSearch() {
    this.setData({ activeCategoryId: null });
    this.loadList();
  },
```

- [ ] **Step 5: 分类 Tab 切换**

```js
  onTapCategory(e) {
    const id = e.currentTarget.dataset.id;
    const newId = id === this.data.activeCategoryId ? null : id;
    this.setData({ activeCategoryId: newId });
    this.loadList();
  },
```

- [ ] **Step 6: Commit**

```bash
git add aroapp/miniprogram/package-feature/pages/doorControl/index.js
git commit -m "feat(doorControl): add grouping, debounce search, category tabs logic"
```

---

### Task 4: 重写页面 JS 逻辑（下）— 操作执行与内联反馈

**Files:**
- Modify: `aroapp/miniprogram/package-feature/pages/doorControl/index.js` (继续)

- [ ] **Step 1: 即时操作 — 开门/关门**

```js
  async onInstantAction(e) {
    const mode = String(e.currentTarget.dataset.mode || ''); // 'OPEN' | 'CLOSE'
    const code = String(e.currentTarget.dataset.code || '');
    if (!mode || !code) return;
    this.setData({ executingCode: code, executingMode: mode });
    try {
      const result = await api.executeMode(mode, code);
      const ok = result && (result.success === true || result.success === "true");
      const upstream = result && result.upstream ? result.upstream : {};
      const msg = String((upstream && (upstream.errMsg || upstream.message)) || (ok ? '操作成功' : '操作失败'));
      this.showInlineResult(code, ok, mode, msg);
      await this.refreshSingleStatus(code);
    } catch (err) {
      const emsg = String(err && err.message ? err.message : '执行失败');
      this.showInlineResult(code, false, mode, emsg);
      await this.refreshSingleStatus(code);
    } finally {
      this.setData({ executingCode: '', executingMode: '' });
    }
  },
```

- [ ] **Step 2: 状态开关 — 点击模式标签弹出 ActionSheet**

```js
  onTapModeTag(e) {
    const code = String(e.currentTarget.dataset.code || '');
    if (!code) return;
    const item = this.findChannelInGrouped(code);
    if (item && item.isOffline) {
      wx.showToast({ title: '设备离线，无法切换', icon: 'none' });
      return;
    }
    this.setData({ showModeSheet: true, modeSheetChannelCode: code });
  },

  onCloseModeSheet() {
    this.setData({ showModeSheet: false });
  },

  async onSelectMode(e) {
    const { index } = e.detail;
    const mode = MODE_OPTIONS[index] ? MODE_OPTIONS[index].key : '';
    const code = this.data.modeSheetChannelCode;
    this.setData({ showModeSheet: false });
    if (!mode || !code) return;

    this.setData({ executingCode: code, executingMode: mode });
    try {
      const result = await api.executeMode(mode, code);
      const ok = result && (result.success === true || result.success === "true");
      const upstream = result && result.upstream ? result.upstream : {};
      const label = MODE_LABEL[mode] || mode;
      const msg = String((upstream && (upstream.errMsg || upstream.message)) || (ok ? `已切换至${label}` : '切换失败'));
      this.showInlineResult(code, ok, mode, msg);
      await this.refreshSingleStatus(code);
    } catch (err) {
      const emsg = String(err && err.message ? err.message : '切换失败');
      this.showInlineResult(code, false, mode, emsg);
      await this.refreshSingleStatus(code);
    } finally {
      this.setData({ executingCode: '', executingMode: '' });
    }
  },

  findChannelInGrouped(code) {
    const groups = this.data.groupedList || [];
    for (const g of groups) {
      for (const ch of g.onlineChannels || []) {
        if (ch.channelCode === code) return ch;
      }
      for (const ch of g.offlineChannels || []) {
        if (ch.channelCode === code) return ch;
      }
    }
    return null;
  },
```

- [ ] **Step 3: 内联结果动画**

```js
  showInlineResult(code, ok, mode, message) {
    const map = Object.assign({}, this.data.resultByCode || {});
    map[code] = { ok, mode, message, at: new Date().toLocaleTimeString(), show: true };
    this.setData({ resultByCode: map });
    // 3 秒后自动淡出
    if (ok) {
      setTimeout(() => {
        const m = Object.assign({}, this.data.resultByCode || {});
        if (m[code] && m[code].ok) {
          m[code] = Object.assign({}, m[code], { show: false });
          this.setData({ resultByCode: m });
        }
      }, 3000);
    }
  },

  onDismissResult(e) {
    const code = String(e.currentTarget.dataset.code || '');
    const map = Object.assign({}, this.data.resultByCode || {});
    if (map[code]) {
      map[code] = Object.assign({}, map[code], { show: false });
      this.setData({ resultByCode: map });
    }
  },
```

- [ ] **Step 4: 保留手动刷新状态**

```js
  onRefreshStatus() {
    this.refreshBatchStatusInChunks(this.data.list || []);
  },
```

- [ ] **Step 5: 删除旧的 onRunMode、onSearch 方法（已被新方法替代）**

确保不保留 `onRunMode` 和 `onSearch` 旧方法。

- [ ] **Step 6: Commit**

```bash
git add aroapp/miniprogram/package-feature/pages/doorControl/index.js
git commit -m "feat(doorControl): inline result feedback + ActionSheet mode switch + instant actions"
```

---

### Task 5: 重写页面模板 WXML

**Files:**
- Modify: `aroapp/miniprogram/package-feature/pages/doorControl/index.wxml`

- [ ] **Step 1: 完整 WXML 模板**

```xml
<view class="page">
  <!-- 搜索栏 -->
  <view class="search-bar">
    <view class="search-box">
      <van-icon name="search" size="32rpx" color="#94a3b8" class="search-icon" />
      <input
        class="search-input"
        placeholder="搜索通道名称/编码"
        value="{{keyword}}"
        bindinput="onKeywordInput"
        bindconfirm="onSearchConfirm"
        confirm-type="search"
      />
      <view wx:if="{{keyword}}" class="search-clear" bindtap="onClearKeyword">
        <van-icon name="clear" size="28rpx" color="#94a3b8" />
      </view>
    </view>
  </view>

  <!-- 分类 Tab -->
  <scroll-view
    wx:if="{{categories.length > 0}}"
    class="tab-scroll"
    scroll-x
    enable-flex
    show-scrollbar="{{false}}"
  >
    <view class="tab-item {{activeCategoryId===null ? 'tab-item--active' : ''}}" bindtap="onTapCategory" data-id="{{null}}">
      <text class="tab-text">全部</text>
    </view>
    <view
      wx:for="{{categories}}"
      wx:key="id"
      class="tab-item {{activeCategoryId===item.id ? 'tab-item--active' : ''}}"
      bindtap="onTapCategory"
      data-id="{{item.id}}"
    >
      <text class="tab-text">{{item.name}}</text>
    </view>
  </scroll-view>

  <!-- 主列表 -->
  <scroll-view class="main-scroll" scroll-y enable-flex show-scrollbar="{{false}}">
    <view wx:if="{{loading}}" class="loading">加载中…</view>

    <block wx:for="{{groupedList}}" wx:key="categoryId" wx:for-item="group">
      <!-- 分类组标题 -->
      <view class="group-header">
        <text class="group-title">{{group.categoryName}}</text>
        <text class="group-count">{{group.onlineChannels.length + group.offlineChannels.length}} 通道</text>
      </view>

      <!-- 在线通道 -->
      <block wx:for="{{group.onlineChannels}}" wx:key="channelCode" wx:for-item="ch">
        <view class="channel-card channel-card--online">
          <!-- 模式标签 + 名称 -->
          <view class="channel-top">
            <view
              class="mode-tag mode-tag--{{ch.isOffline ? 'offline' : (ch.activeMode==='STAY_OPEN' ? 'stayopen' : (ch.activeMode==='STAY_CLOSE' ? 'stayclose' : 'normal'))}}"
              data-code="{{ch.channelCode}}"
              bindtap="onTapModeTag"
            >
              <text class="mode-tag-text">{{ch.activeModeLabel}}</text>
              <van-icon wx:if="{{!ch.isOffline}}" name="arrow-down" size="20rpx" color="currentColor" class="mode-tag-arrow" />
            </view>
            <view class="channel-name-wrap">
              <text class="channel-name">{{ch.channelName}}</text>
              <text wx:if="{{ch.channelType}}" class="channel-type">{{ch.channelType}}</text>
            </view>
          </view>

          <!-- 内联操作结果 -->
          <view
            wx:if="{{resultByCode[ch.channelCode] && resultByCode[ch.channelCode].show}}"
            class="result-banner result-banner--{{resultByCode[ch.channelCode].ok ? 'ok' : 'fail'}}"
          >
            <text class="result-banner-text">{{resultByCode[ch.channelCode].message}} · {{resultByCode[ch.channelCode].at}}</text>
            <view wx:if="{{!resultByCode[ch.channelCode].ok}}" class="result-dismiss" data-code="{{ch.channelCode}}" bindtap="onDismissResult">
              <van-icon name="cross" size="24rpx" color="#b91c1c" />
            </view>
          </view>

          <!-- 即时操作按钮 -->
          <view class="channel-actions">
            <button
              class="action-btn action-btn--open"
              size="mini"
              data-mode="OPEN"
              data-code="{{ch.channelCode}}"
              loading="{{executingCode===ch.channelCode && executingMode==='OPEN'}}"
              disabled="{{ch.isOffline}}"
              bindtap="onInstantAction"
            >开门</button>
            <button
              class="action-btn action-btn--close"
              size="mini"
              data-mode="CLOSE"
              data-code="{{ch.channelCode}}"
              loading="{{executingCode===ch.channelCode && executingMode==='CLOSE'}}"
              disabled="{{ch.isOffline}}"
              bindtap="onInstantAction"
            >关门</button>
          </view>
        </view>
      </block>

      <!-- 离线分隔 + 离线通道 -->
      <block wx:if="{{group.offlineChannels.length > 0}}">
        <view class="offline-sep">
          <view class="offline-sep-line"></view>
          <text class="offline-sep-text">离线 {{group.offlineChannels.length}} 通道</text>
          <view class="offline-sep-line"></view>
        </view>
        <block wx:for="{{group.offlineChannels}}" wx:key="channelCode" wx:for-item="ch">
          <view class="channel-card channel-card--offline">
            <view class="channel-top">
              <view class="mode-tag mode-tag--offline">
                <text class="mode-tag-text">离线</text>
              </view>
              <view class="channel-name-wrap">
                <text class="channel-name channel-name--offline">{{ch.channelName}}</text>
                <text wx:if="{{ch.channelType}}" class="channel-type">{{ch.channelType}}</text>
              </view>
            </view>
            <view class="channel-actions">
              <button class="action-btn action-btn--open" size="mini" disabled>开门</button>
              <button class="action-btn action-btn--close" size="mini" disabled>关门</button>
            </view>
          </view>
        </block>
      </block>
    </block>

    <view wx:if="{{!loading && groupedList.length===0}}" class="empty">暂无可控通道</view>

    <!-- 底部统计栏 -->
    <view wx:if="{{!loading && groupedList.length > 0}}" class="footer-bar">
      <text class="footer-text">在线 <text class="footer-num">{{totalOnline}}</text> 通道</text>
      <text class="footer-dot">·</text>
      <text class="footer-text">离线 <text class="footer-num">{{totalOffline}}</text> 通道</text>
    </view>
  </scroll-view>
</view>

<!-- 模式切换 ActionSheet -->
<van-action-sheet
  show="{{ showModeSheet }}"
  actions="{{ modeSheetActions }}"
  cancel-text="取消"
  bind:close="onCloseModeSheet"
  bind:cancel="onCloseModeSheet"
  bind:select="onSelectMode"
/>
```

- [ ] **Step 2: 补充 onClearKeyword 方法（在 index.js 中）**

```js
  onClearKeyword() {
    this.setData({ keyword: '' });
    this.doSearch();
  },
```

- [ ] **Step 3: Commit**

```bash
git add aroapp/miniprogram/package-feature/pages/doorControl/index.wxml
git commit -m "feat(doorControl): rewrite WXML — grouped cards, inline results, ActionSheet"
```

---

### Task 6: 重写页面样式 WXSS

**Files:**
- Modify: `aroapp/miniprogram/package-feature/pages/doorControl/index.wxss`

- [ ] **Step 1: 完整 WXSS 样式**

```css
/* ===== 页面 ===== */
.page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #f4f6fb;
}

/* ===== 搜索栏 ===== */
.search-bar {
  padding: 20rpx 24rpx;
  background: #fff;
  border-bottom: 1rpx solid #eef2f6;
}
.search-box {
  display: flex;
  align-items: center;
  background: #f1f5f9;
  border-radius: 16rpx;
  padding: 0 16rpx;
  height: 64rpx;
}
.search-icon {
  flex-shrink: 0;
  margin-right: 12rpx;
}
.search-input {
  flex: 1;
  font-size: 26rpx;
  color: #0f172a;
  line-height: 64rpx;
  min-height: 64rpx;
}
.search-clear {
  flex-shrink: 0;
  padding: 8rpx;
}

/* ===== 分类 Tab ===== */
.tab-scroll {
  white-space: nowrap;
  background: #fff;
  padding: 16rpx 24rpx;
  border-bottom: 1rpx solid #eef2f6;
}
.tab-item {
  display: inline-flex;
  align-items: center;
  padding: 12rpx 28rpx;
  margin-right: 16rpx;
  border-radius: 999rpx;
  background: #f1f5f9;
  border: 1rpx solid transparent;
}
.tab-item--active {
  background: #eff6ff;
  border-color: #3b82f6;
}
.tab-text {
  font-size: 24rpx;
  font-weight: 600;
  color: #64748b;
}
.tab-item--active .tab-text {
  color: #3b82f6;
}

/* ===== 主滚动区 ===== */
.main-scroll {
  flex: 1;
  padding: 16rpx 24rpx;
}

/* ===== 分组标题 ===== */
.group-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 24rpx 8rpx 12rpx;
  margin-top: 8rpx;
}
.group-title {
  font-size: 28rpx;
  font-weight: 800;
  color: #0f172a;
}
.group-count {
  font-size: 22rpx;
  color: #94a3b8;
}

/* ===== 通道卡片 ===== */
.channel-card {
  background: #fff;
  border-radius: 20rpx;
  padding: 24rpx;
  margin-bottom: 16rpx;
  border: 1rpx solid #e2e8f0;
  box-shadow: 0 4rpx 20rpx rgba(15, 23, 42, 0.04);
  transition: border-color 0.3s, box-shadow 0.3s;
}
.channel-card--offline {
  opacity: 0.75;
  background: #f8fafc;
}

/* ===== 通道顶部（模式标签 + 名称） ===== */
.channel-top {
  display: flex;
  align-items: center;
  gap: 16rpx;
  margin-bottom: 16rpx;
}
.mode-tag {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 4rpx;
  padding: 8rpx 18rpx;
  border-radius: 999rpx;
  font-weight: 700;
}
.mode-tag--stayopen {
  background: #ecfdf5;
  color: #059669;
  border: 1rpx solid #a7f3d0;
}
.mode-tag--stayclose {
  background: #fef2f2;
  color: #dc2626;
  border: 1rpx solid #fecaca;
}
.mode-tag--normal {
  background: #f1f5f9;
  color: #64748b;
  border: 1rpx solid #e2e8f0;
}
.mode-tag--offline {
  background: #f8fafc;
  color: #94a3b8;
  border: 1rpx solid #e2e8f0;
}
.mode-tag-text {
  font-size: 22rpx;
}
.mode-tag-arrow {
  opacity: 0.6;
}
.channel-name-wrap {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4rpx;
}
.channel-name {
  font-size: 28rpx;
  font-weight: 700;
  color: #0f172a;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.channel-name--offline {
  color: #94a3b8;
}
.channel-type {
  font-size: 20rpx;
  color: #94a3b8;
}

/* ===== 内联结果横幅 ===== */
.result-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10rpx 16rpx;
  border-radius: 12rpx;
  margin-bottom: 14rpx;
  animation: resultSlideIn 0.25s ease-out;
}
.result-banner--ok {
  background: #ecfdf5;
  border: 1rpx solid #a7f3d0;
}
.result-banner--fail {
  background: #fef2f2;
  border: 1rpx solid #fecaca;
}
.result-banner-text {
  font-size: 22rpx;
  color: #334155;
  flex: 1;
}
.result-dismiss {
  flex-shrink: 0;
  padding: 4rpx;
}
@keyframes resultSlideIn {
  from { opacity: 0; transform: translateY(-8rpx); }
  to { opacity: 1; transform: translateY(0); }
}

/* ===== 脉冲闪烁（成功时卡片边框） ===== */
.channel-card--flash-ok {
  animation: flashOk 0.6s ease-out;
}
@keyframes flashOk {
  0% { border-color: #10b981; box-shadow: 0 0 0 3rpx rgba(16, 185, 129, 0.3); }
  100% { border-color: #e2e8f0; box-shadow: 0 4rpx 20rpx rgba(15, 23, 42, 0.04); }
}
.channel-card--flash-fail {
  animation: flashFail 0.6s ease-out;
}
@keyframes flashFail {
  0% { border-color: #ef4444; box-shadow: 0 0 0 3rpx rgba(239, 68, 68, 0.3); }
  100% { border-color: #e2e8f0; box-shadow: 0 4rpx 20rpx rgba(15, 23, 42, 0.04); }
}

/* ===== 操作按钮 ===== */
.channel-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12rpx;
}
.action-btn {
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  width: 120rpx !important;
  height: 56rpx !important;
  line-height: 54rpx !important;
  font-size: 24rpx !important;
  font-weight: 700 !important;
  border-radius: 14rpx !important;
  border: 1rpx solid !important;
  padding: 0 !important;
  margin: 0 !important;
}
.action-btn::after {
  border: none !important;
}
.action-btn--open {
  background: #ecfdf5 !important;
  color: #059669 !important;
  border-color: #a7f3d0 !important;
}
.action-btn--close {
  background: #fef2f2 !important;
  color: #dc2626 !important;
  border-color: #fecaca !important;
}
button.action-btn[disabled] {
  background: #f8fafc !important;
  color: #cbd5e1 !important;
  border-color: #e2e8f0 !important;
}

/* ===== 离线分隔线 ===== */
.offline-sep {
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 8rpx 0 16rpx;
}
.offline-sep-line {
  flex: 1;
  height: 1rpx;
  background: #e2e8f0;
}
.offline-sep-text {
  font-size: 20rpx;
  color: #94a3b8;
  flex-shrink: 0;
}

/* ===== 底部统计 ===== */
.footer-bar {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 12rpx;
  padding: 28rpx 0 40rpx;
}
.footer-text {
  font-size: 22rpx;
  color: #94a3b8;
}
.footer-num {
  font-weight: 700;
  color: #64748b;
}
.footer-dot {
  color: #cbd5e1;
}

/* ===== 加载与空态 ===== */
.loading,
.empty {
  text-align: center;
  color: #94a3b8;
  font-size: 26rpx;
  padding: 48rpx 0;
}
```

- [ ] **Step 2: Commit**

```bash
git add aroapp/miniprogram/package-feature/pages/doorControl/index.wxss
git commit -m "feat(doorControl): rewrite styles — cards, tags, animations, footer bar"
```

---

### Task 7: 最终验证与收尾

- [ ] **Step 1: 检查完整 JS 文件，确保旧方法已清除**

确认 `index.js` 中不残留 `onRunMode`、`onSearch` 等方法。

- [ ] **Step 2: 验证 JSON 配置无需修改**

`index.json` 内容保持 `{ "navigationBarTitleText": "门禁应用" }`，不需要注册新组件（`van-action-sheet` 已全局注册）。

- [ ] **Step 3: 提交最终版本**

```bash
git add aroapp/miniprogram/package-feature/pages/doorControl/
git commit -m "chore(doorControl): final cleanup — remove legacy methods"
```

- [ ] **Step 4: 推送**

```bash
git push origin feature/face-verification
```

---

## 变更摘要

| 文件 | 行数变化 | 说明 |
|------|---------|------|
| `doorControlApi.js` | +15 | 新增 `fetchRemarkCategories` |
| `doorControl/index.js` | ~150 行 → ~300 行 | 完整重构：分组/搜索/反馈/模式切换 |
| `doorControl/index.wxml` | 49 行 → ~130 行 | 完整重写：分类Tab+卡片+结果横幅 |
| `doorControl/index.wxss` | 214 行 → ~220 行 | 完整重写：新视觉+动画 |
| `doorControl/index.json` | 0 | 无需修改 |
