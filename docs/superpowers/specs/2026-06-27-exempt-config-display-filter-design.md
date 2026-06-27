# 豁免配置展示 + 豁免筛选器 — 设计规格

| 属性 | 值 |
|------|-----|
| 版本 | 1.0 |
| 日期 | 2026-06-27 |
| 工作流 | ① 新功能开发 |
| 状态 | 设计已批准 |

## 1. 需求概述

当前 dahua-issue 列表行已显示豁免状态（已豁免/受控）+ 剩余时间。但缺少：
- **豁免配置详情展示**：看不出来豁免了哪些房间
- **豁免筛选器**：无法快速过滤已豁免/未豁免的人

本次改动在 Web 和小程序两端同步补齐这两个能力。

## 2. 存储格式变更

`freezeExemptRoomIds` 从纯 ID 数组改为含名称的对象数组：

```json
// 旧
["room_pd_301", "room_px_102"]

// 新
[{"roomId":"room_pd_301","roomName":"301会议室"},{"roomId":"room_px_102","roomName":"102研讨室"}]
```

字段类型不变（TEXT/JSON），仅序列化内容不同。**无需后端 DDL 变更。**

## 3. Web 前端改动

### 3.1 列表行 — 豁免房间名展示

**文件：** `DebugCardMappingPage.tsx`

在豁免状态行下方新增房间名展示：

```
房间: 301会议室, 102研讨室
```

仅当 `freezeExemptFlag=1` 且 `freezeExemptRoomIds` 有值且豁免未过期时显示。

### 3.2 筛选器 — 分段按钮

**文件：** `DebugCardMappingPage.tsx`

在搜索栏右侧新增三态分段按钮：

```
[ 全部 ] [ 已豁免 ] [ 未豁免 ]
```

- 默认选中「全部」，不做过滤
- 「已豁免」：`freezeExemptFlag=1 且未过期`
- 「未豁免」：其余行
- 筛选与关键词搜索独立叠加：前端对 `displayData` 再过滤

### 3.3 豁免提交 — 格式适配

**文件：** `DebugCardMappingPage.tsx` — `submitExemptConfig()`

提交时 `roomIds` 参数改为新格式 `JSON.stringify([{roomId, roomName}, ...])`。

### 3.4 工具函数

**文件：** `exemptDurationPresets.ts`

新增：
```ts
export function parseExemptRoomNames(roomIdsJson?: string | null): string[] {
    // 解析 freezeExemptRoomIds JSON，返回房间名数组
    // 兼容旧格式 ["id1","id2"] 和新格式 [{"roomId":"x","roomName":"y"}]
}
```

## 4. 小程序改动

### 4.1 dahuaIssue 页面 — 筛选器 + 房间名

**文件：** `package-feature/pages/dahuaIssue/index.wxml`

搜索栏旁新增三个筛选按钮（全部/已豁免/未豁免），点击切换 `exemptFilter` state。

列表卡片中 `status-row` 下方新增房间名行：
```xml
<view wx:if="{{item.exemptRoomNames}}" class="exempt-rooms">
  房间: {{item.exemptRoomNames}}
</view>
```

**文件：** `package-feature/pages/dahuaIssue/index.js`

- 新增 `data.exemptFilter: 'all'`
- `decorateMappingRow()` 中调用 `parseExemptRoomNames()` 计算 `exemptRoomNames` 字段
- 列表渲染前按 `exemptFilter` 过滤

### 4.2 roomAudit 页面 — 同步

**文件：** `package-feature/pages/roomAudit/index.wxml` + `index.js`

与 dahuaIssue 页面相同的改动：筛选按钮 + 房间名行。

### 4.3 exempt-setup-panel 组件 — 提交格式

**文件：** `package-feature/components/exempt-setup-panel/index.js`

提交时 `roomIds` 改为新格式。

### 4.4 工具函数

**文件：** `package-feature/utils/exemptDurationPresets.js`

新增 `parseExemptRoomNames(roomIdsJson)` 函数，兼容新旧格式。

## 5. 兼容性

- `parseExemptRoomNames()` 同时兼容旧格式（纯 ID 数组，显示 ID 兜底）和新格式（对象数组，显示 name）
- 存量数据 `freezeExemptRoomIds` 为旧格式或 NULL 时正常降级
- 筛选器默认「全部」，对现有用户无感知影响
- 小程序端同样兼容旧格式数据

## 6. 文件清单

| 文件 | 改动类型 |
|------|----------|
| `frontend/src/pages/DebugCardMappingPage.tsx` | 修改 — 房间名展示 + 筛选器 + 提交格式 |
| `frontend/src/constants/exemptDurationPresets.ts` | 修改 — 新增 parseExemptRoomNames |
| `aroapp/miniprogram/package-feature/pages/dahuaIssue/index.wxml` | 修改 — 筛选按钮 + 房间名行 |
| `aroapp/miniprogram/package-feature/pages/dahuaIssue/index.js` | 修改 — 筛选逻辑 + decorateMappingRow |
| `aroapp/miniprogram/package-feature/pages/roomAudit/index.wxml` | 修改 — 筛选按钮 + 房间名行 |
| `aroapp/miniprogram/package-feature/pages/roomAudit/index.js` | 修改 — 筛选逻辑 + 数据装饰 |
| `aroapp/miniprogram/package-feature/utils/exemptDurationPresets.js` | 修改 — 新增 parseExemptRoomNames |
| `aroapp/miniprogram/package-feature/components/exempt-setup-panel/index.js` | 修改 — 提交格式 |

## 7. 自审清单

- [x] 无 TBD/TODO 占位
- [x] 存储格式兼容方案明确
- [x] 所有文件路径和改动范围明确
- [x] 筛选与搜索叠加逻辑明确
- [x] 小程序与 Web 改动对称
