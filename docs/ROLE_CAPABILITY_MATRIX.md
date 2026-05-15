# 角色 × 业务能力矩阵（验收口径）

运行时以数据库表 `biz_capability_policy` 为准；本文档为产品与验收对照表。`RoleEnum.level`：STUDENT=1，STAFF=2，SENIOR=3，ADMIN=4，SUPER_ADMIN=5。

## 矩阵（默认种子 = 切换配置表前的线上行为）

| 能力 | STUDENT | STAFF | SENIOR | ADMIN | SUPER_ADMIN |
|------|---------|-------|--------|-------|-------------|
| 提交报修/采购申请 | 否 | 是 | 是 | 是 | 是 |
| 查看他人非公开报修/采购单详情 | 否 | 否 | 是 | 是 | 是 |
| 报修/采购接单、完成、回收站管理 | 否 | 否 | 是 | 是 | 是 |
| 报修/采购处理侧角标（全库待办） | — | — | 可见池 | 全量 | 全量 |
| 物资商城/提交领用 | 否 | 是 | 是 | 是 | 是 |
| 物资出库处理（待出库任务列表） | 否 | 否 | 是 | 是 | 是 |
| 物资处理侧角标（全库待出库） | — | — | 全量 | 全量 | 全量 |
| 物资后台（分类/库存维护等） | 否 | 否 | 否 | 是 | 是 |
| 通知未读角标 | 按 `sys_notify_rule` | 同左 | 同左 | 同左 | 同左 |

## 与配置字段对应关系

- **提交**：用户 `level >= min_role_submit`（域：`REPAIR` / `PURCHASE` / `SUPPLIES_CLAIM`）。
- **处理报修/采购单**：`level >= min_role_process`。
- **报修/采购处理侧计数是否全库**：`level >= min_role_view_all_pending` 时用全量待办，否则用可见池（与列表 `countVisible` / `countAll` 一致）。
- **物资领用处理与「看别人领用单」**：`level >= min_role_process`（`SUPPLIES_CLAIM`）；**待出库队列是否全库**：`level >= min_role_view_all_pending`（种子为 SENIOR，即与当前 `listPendingAll` 一致）。
- **物资后台管理能力**：`level >= min_role_process`（`SUPPLIES_ADMIN`，种子为 ADMIN）。

## 例外与说明

- 页面入口显隐仍受 `page_permission_item` 约束；接口鉴权以策略表为最终防线。
- `applicant_list_mode`：`VISIBLE_POOL` 表示申请人侧角标与默认列表 `onlyMine=false` 一致（可见池）；`ONLY_MINE` 预留仅统计本人单（当前种子均为 `VISIBLE_POOL`）。
