# 动物房 Hub（telemetry.animalroom）

**Web 与微信小程序同源**：统一入口 `GET /api/v1/telemetry/wincc/animal-room-hub`。

扁平页数据另见 `GET /api/v1/telemetry/wincc/animal-room`（支持 `telemetrySummaryOnly` / `telemetryTabKey` 分块）。

- **`GET /animal-room-with-tab?telemetryTabKey=…`**：一次响应内同时返回「全 tab 摘要」与「指定 tab 明细」字段（`summary` + `tabDetail`），服务端只刷新 WinCC、只 assemble 一次，适合小程序替代连续两次 `animal-room` 请求。
- **`GET /snapshot?sync=true&variableNames=a,b`**：`sync=true` 时仅对列出的变量定点读 WinCC 并合并内存快照（非全量 `refreshFromWinCc`），响应 `items` 仅含这些变量，供写入后轮询校验。

## 依赖配置（不在此模块重复定义）

- `app.wincc.*`：WinCC 开关与连接（`src/main/resources/application.properties`）
- 定时表 `twin_job_schedule_config` 中任务标识 **`TELEMETRY_WINCC_UI`**：程序坞轮询开关、间隔、时间窗（由 `JobSchedulerService` 读取）
- 运行状态房间数据：`TwinDashboardAggregationService#getWechatMiniProgramData`（与 `GET /api/v1/twin/dashboard/wechat-overview` 同源）

## 包内主要类型

- `dto/AnimalRoomHubDto`：聚合响应
- `dto/AnimalRoomSummaryWithTabDto`：`animal-room-with-tab` 合并响应壳
- `dto/Mp*.java`：温湿度结构化视图块（仅供 JSON 序列化形状稳定）
- `AnimalRoomHubAssembler`：组装逻辑
