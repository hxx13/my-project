# 学生审核页 — 按人显示 + 物资合并 + 今天/历史分区

日期: 2026-06-24 | 范围: 前端 `MaterialReviewPage.tsx`

## 目标

将学生审核页从"全量展示"改为"按当前登录人自动过滤"，合并物资待审/已审为一个视图，并按时间分今天/历史区域。

## 当前状态

- 4 个顶层 tab：物资待审 / 延迟免冻结 / 物资全部（已审结） / 需求建议
- 延迟免冻结内有子 tab：待审核 / 历史记录
- 所有审核人看到全部记录，无过滤

## 目标状态

### Tab 结构

```
[物资审核 N]  [延迟免冻结 M]  [需求建议 K]
```

| Tab | 数据来源 | 过滤规则 |
|-----|---------|---------|
| 物资审核 | pending + finished 合并 | 物品 `reviewerIds` / `secondReviewerIds` 包含当前用户 |
| 延迟免冻结 | pending + history 合并 | option `reviewerUserIds` 包含当前用户；历史额外要求 `reviewedBy` 非空 |
| 需求建议 | 不变 | 不过滤，保持原样 |

### 每个 tab 内分区

按 `createdAt` 分为两个区域：

- **今天**：当天 00:00:00 至今
- **历史**：今天之前

每个区域显示计数标签，如 `今天 · 待审 3 · 已审 5`。

### 物资审核 tab

- 待审和已审在同一个列表中，按 `createdAt` 倒序排列
- 用状态标签（待审核/已通过/已拒绝等）区分
- 过滤逻辑：请求中的每条 line 的 `itemId` → 查找物品的 `reviewerIds` / `secondReviewerIds` → 包含当前用户即显示
- 已审记录同样按物品的 `reviewerIds` 过滤（不是按 `firstReviewerId`）

### 延迟免冻结 tab

- 待审和已审合并，同样分今天/历史
- 待审：option 的 `reviewerUserIds` 包含当前用户
- 历史：option 的 `reviewerUserIds` 包含当前用户 **且** `reviewedBy` 非空
- 历史记录卡片显示审核人姓名和处理时间

## 数据需求

需新增获取的数据（当前页面未加载）：

1. **物资物品列表**：`useAdminMaterialItems()` → 得到 `itemId → reviewerIds/secondReviewerIds` 映射
2. **延迟选项列表**：`fetchScanDelayOptions()` → 得到 `optionId → reviewerUserIds` 映射

两者均为已有 API，直接从现有 hook / api 函数引入即可。

## 当前用户获取

```ts
import { authStorage } from "@/features/auth/authStorage";
const currentUserId = authStorage.getUserId() || "";
```

## 不涉及

- 后端 API 不变
- 需求建议 tab 不变
- 自动审批面板不变
- 审核操作（通过/拒绝）逻辑不变
