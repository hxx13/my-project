# 动物房 Hub（Web 与微信小程序同源）

动物房 **运行状态** 与 **温湿度** 共用单一聚合接口，路径与 DTO 命名保持客户端中性（不使用 miniprogram 专属对外名）。

## 主接口（唯一推荐契约）

| 用途 | 方法 | 路径 | 说明 |
|------|------|------|------|
| Hub 聚合 | GET | `/api/v1/telemetry/wincc/animal-room-hub` | Query：`sync`、`soloWidthPx`（主栏逻辑像素，单间均分行；默认 360）、`campus`（可选，与 `wechat-overview` 一致）。返回 `snapshot`、`dockPollConfig`、`structuredTabs[]`（每 tab 已含 `viewChunks`）、`clientPollIntervalMs`、`runningStatusRooms`（与 `GET /api/v1/twin/dashboard/wechat-overview` **同源服务**） |

### 兼容（已废弃）

- `GET /api/v1/telemetry/wincc/miniprogram-hub`：内部转调 `animal-room-hub`，Swagger 标记 deprecated；请迁移到上表路径。

### 其他只读接口（非 Hub）

- `GET /api/v1/telemetry/wincc/snapshot` — 仅快照  
- `GET /api/v1/telemetry/wincc/dock-poll-config` — 程序坞轮询配置  

## 服务端实现

- 组装：`AnimalRoomHubAssembler`（`modules/telemetry/animalroom`）
- DTO：`AnimalRoomHubDto`、`MpStructuredTabDto` 等（同包 `dto`）
- 控制器：`TelemetryController` → `animalRoomHub`
- 运行状态列表：`TwinDashboardAggregationService#getWechatMiniProgramData(campus)`，与 twin `wechat-overview` 一致

## 客户端

- **小程序（aroapp）**：`aroapp/miniprogram/utils/animalRoomHubApi.js` → `fetchAnimalRoomHub`。底部 tab **「概览」**（`pages/overview/index`）页顶 **数据概览 | 动物房温湿度** 两入口切换；温湿度模式使用 `animal-room-telemetry` + Hub 的 `structuredTabs`/`viewChunks`。另保留 **`pages/animalRoomRun/index`**（主览「运行概览」入口）。
- **Web**：动物房温湿度页仍为 `#/animal-room-telemetry`，使用 `snapshot` + `shared/telemetry-view` 在浏览器内组装（未接 Hub 壳页）。

## 配置依赖（运维）

见 `application.properties` 中 **动物房 Hub** 注释块，以及 `modules/telemetry/animalroom/README.md`。

## 与 shared/telemetry-view 的关系

小程序 Hub 展示以 **服务端组装 JSON**（`structuredTabs` / `viewChunks`）为权威。Web 动物房页仍以 `shared/telemetry-view` 在本地 `buildFloorChunks`；两套语义在组装器侧与 Java `AnimalRoomHubAssembler` 对齐。

## 延伸阅读

- 小程序接入细节（开发者工具、域名）：[`miniprogram-animal-room-telemetry.md`](./miniprogram-animal-room-telemetry.md)
