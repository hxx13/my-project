# 延迟免冻结审核：强提醒 + 自动审批 设计说明

> 状态：待确认后实施  
> 关联页面：Web `/#/admin/material/review?tab=scanDelay`、小程序 `studentReviewHub` 延迟 Tab  
> 数据同源：`ScanDelayRequestService.listPendingEnriched(reviewerUserId)`

---

## 1. 背景

- 提交需审核的延迟申请时，后端已发 `SCAN_DELAY` 站内通知（`notifyReviewer`）。
- 缺口：Web 强提醒弱（无横幅/灵动岛/OS 通知）；`countUnreadStaffWorkInbox` 未含 `SCAN_DELAY`。
- 新需求：审核人强提醒（A/B/C/D 四层）；Web/小程序延迟 Tab 增加「自动审批」；**按人规则必须手动配置**；历史通过次数仅作**建议**；**不同延迟选项（option）必须区分**。

---

## 2. 强提醒（审核人 Web 全局）

用户已选：**A + B + C + D**（不含声音/震动，可后续加 E）。

| 层级 | 行为 | 去重 |
|------|------|------|
| C | `SCAN_DELAY` 纳入 pending-badges / 待处理计数；SSE 刷新 | 按 requestId 未读 |
| B | 灵动岛胶囊：摘要 +「去审核」 | 同 requestId 仅首次 |
| A | 顶部横幅（参考 SwipeFailureBanner）：「去审核 / 稍后 15 分钟」 | 稍后 15min 内不重复 A |
| D | `Notification API`，页 hidden 时 OS 通知 | 需授权；同 requestId 一次 |

跳转：`#/admin/material/review?tab=scanDelay&requestId={id}`（可选高亮）。

---

## 3. 自动审批 — 产品原则

1. **永不因统计自动生效**：新人、老人均须管理员/审核人**显式配置**后才自动批。
2. **统计只建议**：展示「该用户在该延迟选项下历史通过 N 次」，一键**预填**配置表单，不自动写入。
3. **按延迟选项区分**：匹配键至少包含 `option_id`；同一用户在不同 option 下独立配置、独立统计。
4. **批量与按人独立**：两套规则表、两套开关、同一 Job 顺序执行但不互相覆盖配置。

---

## 4. 延迟「规则」粒度

申请单字段：`subject_user_id`, `room_id`, `option_id`, `reviewer_user_id`, `status`。

配置与匹配以 **`option_id` 为主键维度**（对应 `twin_scan_delay_option`：标签、免冻结模式、时长/延长至几点、审核人等）。

可选附加 `room_id` 约束（同一 option 绑多房间时进一步收窄）。

**禁止**：「按用户自动批所有延迟类型」的无 option 按人规则（批量规则也必须勾选 option 列表）。

---

## 5. 数据模型（新增）

### 5.1 按人信任规则 `twin_scan_delay_auto_trust`

| 字段 | 说明 |
|------|------|
| id | PK |
| owner_user_id | 配置人（通常为审核教职工） |
| subject_user_id | 被信任申请人 |
| option_id | **必填**，延迟选项 ID |
| room_id | 可选；空=该 option 下所有 room 申请 |
| enabled | 开关 |
| trigger_mode | `ON_SUBMIT` / `SCHEDULED` |
| schedule_cron | trigger_mode=SCHEDULED 时有效 |
| note | 备注 |
| created_at / updated_at | |

唯一约束建议：`(owner_user_id, subject_user_id, option_id, room_id)`。

### 5.2 批量规则 `twin_scan_delay_auto_batch`

| 字段 | 说明 |
|------|------|
| id | PK |
| owner_user_id | 配置人 |
| name | 规则名 |
| option_ids | JSON 数组，**至少一项** |
| room_ids | JSON 可选；空=不限房间 |
| enabled | 开关 |
| schedule_cron | 定时表达式 |
| max_per_run | 单次最多处理条数，默认 20 |
| only_if_reviewer_match | 默认 true：仅处理 reviewer=owner 的单 |
| created_at / updated_at | |

### 5.3 执行日志 `twin_scan_delay_auto_approve_log`

记录：rule_type(trust|batch)、rule_id、request_id、result、executed_at、operator(job/manual)。

---

## 6. 建议 API（只读，不写配置）

`GET /api/v1/twin/scan-delay/auto-approve/suggestions`

返回当前审核人视角下，按 `(subject_user_id, option_id[, room_id])` 聚合：

```json
{
  "items": [
    {
      "subjectUserId": "U001",
      "subjectDisplayName": "张三",
      "optionId": 3,
      "optionLabel": "延长至 18:00",
      "roomId": "R1",
      "roomName": "动物房A",
      "approvedCount": 5,
      "rejectedCount": 0,
      "lastApprovedAt": "2026-06-10T14:00:00",
      "alreadyTrusted": false
    }
  ]
}
```

UI：列表展示「已通过 5 次 · 建议添加自动审批」→ 打开按人配置表单并预填，**用户点保存才生效**。

---

## 7. 自动执行逻辑

Job：`JOB_SCAN_DELAY_AUTO_APPROVE`（`JobSchedulerService` + `JobExecutionRegistry`）。

单次运行顺序：

1. **按人信任（ON_SUBMIT 已在提交时同步尝试；定时任务扫 PENDING）**  
   - 匹配：`status=PENDING` AND `subject_user_id` AND `option_id` AND (`room_id` 或 room 不限) AND trust.enabled  
   - 调用已有 `reviewRequest(id, true, reviewerUserId, null)`

2. **批量规则**  
   - 匹配：`status=PENDING` AND `option_id IN (...)` AND room 条件 AND reviewer=owner（若 only_if_reviewer_match）  
   - 按 created_at 升序，最多 `max_per_run` 条

冲突：同一 request 只处理一次；信任规则优先于批量（同一 run 内标记已处理 id 集合）。

---

## 8. UI 入口

### Web `MaterialReviewPage` — 延迟 Tab 右上角

- 「自动审批」抽屉/侧栏，两 Tab：
  - **按人规则**：表格 CRUD；「从建议添加」子入口
  - **批量规则**：option 多选（必选）、room 可选、Cron、单次上限
- 展示下次定时执行时间（读 Job 配置）

### 小程序 `studentReviewHub` — 延迟 Tab

- 同等能力只读+简化编辑（或链到 Web 配置页，视屏幕复杂度定）

---

## 9. 与通知联动

- 自动审批成功后：发 `SCAN_DELAY` COMPLETED 通知给申请人/操作人（已有规则 bootstrap）。
- 不再对审核人弹 A/B 层（已处理）。

---

## 10. 实施分期

| 阶段 | 内容 |
|------|------|
| P1 | C 层角标 + SCAN_DELAY 纳入 work inbox 计数 |
| P2 | B 灵动岛 + A 横幅 + D OS 通知 |
| P3 | DDL + 信任/批量 CRUD API + 建议 API |
| P4 | Job + Web 自动审批 UI |
| P5 | 小程序自动审批入口 |

---

## 11. 已确认的产品决策

- 按人：**不**用「满 N 次自动开通」；统计仅建议，配置必须手动。
- 规则维度：**必须**区分 `option_id`（不同延迟选项独立配置与匹配）。
- 强提醒：A+B+C+D 全做。
