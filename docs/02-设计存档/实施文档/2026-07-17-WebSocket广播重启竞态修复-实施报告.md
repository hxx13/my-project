# WebSocket 广播重启竞态修复 — 实施报告

> **日期**: 2026-07-17 | **状态**: 已实施，编译通过，双 agent 复核通过
> **前置文档**: `docs/02-设计存档/计划文档/2026-07-14-WebSocket房间广播重设计-设计计划.md`（v2.1）
> **关联实施**: `docs/02-设计存档/实施文档/2026-07-14-WebSocket房间广播-实施报告.md`

## 1. 问题

Room 重构上线后仍有反馈：后端重启后，部分电脑收不到任何广播（进出流水、饼图、reload 指令都没有），刷新页面才恢复。哪些电脑中招不固定。

## 2. 根因

启动时序竞态。实际的启动顺序是：

1. Spring context refresh 完成（所有 Bean 构造完毕，`@PostConstruct` 已执行）
2. `StartupPhaseRunner`（`ApplicationRunner`）按 order 跑启动阶段
3. order=5 的 `SocketIOStartupRunner` 调用 `socketIOServer.start()`，9092 端口开始接受连接
4. 后续阶段继续跑（order=99 浏览器拉起、order=111 定时任务表迁移等）
5. 全部跑完后 Spring 才发出 `ApplicationReadyEvent`
6. `SocketRoomAssigner` 原来在这一步才 `addConnectListener`

第 3 步到第 6 步之间有几秒到几十秒的窗口。前端重连配置是无限重试、间隔最长 15 秒，后端宕机期间所有浏览器都在持续重试。端口一开，最快的那批客户端立即完成握手（认证在 server config 里，照常通过），但 room 分配监听器还没注册。这些连接状态正常、永不报错，却不属于任何 room。重构后所有广播都按 room 定向投递，不在 room 里就永远收不到。

重构前用 `getBroadcastOperations()` 全体投递，不依赖 room 成员资格，这个竞态一直存在但无害。重构把它变成了致命问题。症状特征（只在重启后出现、只影响部分电脑、不稳定复现）全部由"重连定时器是否恰好落在窗口内"解释。

## 3. 修复架构：三层防线

### 第一层：消除竞态（根因修复）

`SocketRoomAssigner` 的监听器注册从 `@EventListener(ApplicationReadyEvent.class)` 改为 `@PostConstruct`。Bean 构造期严格早于任何 `ApplicationRunner`，监听器先上岗、端口后开门，窗口不再存在。netty-socketio 允许在 `start()` 前注册监听器（构造函数即创建 namespace，`start()` 只绑定端口），仓库内 `SwipeAlertEngine` 已有同样先例。

### 第二层：ROOM_ACK 握手确认（连接级自愈）

设计取舍：不轮询业务数据（代价高），只确认"room 成员资格是否健康"（每次连接一来一回两个小帧，稳态零流量）。

- 服务端把 room 分配抽成幂等的 `assignRooms(client)`；分配完成后向客户端推送 `ROOM_ACK`
- 服务端注册 `ROOM_RESYNC` 事件处理器，收到即重跑 `assignRooms` 再发 ACK；每 session 2 秒冷却，防高频 emit 放大 token 校验开销
- 前端在共享 socket 上：`connect` 后启动 5 秒看门狗，未收到 ACK 就 emit `ROOM_RESYNC`，重试 2 次仍无响应则强制重建连接（60 秒冷却防重连风暴）

### 第三层：bootId 轮询比对（进程级兜底，零新增请求）

复用已有的 15 秒 `GET /api/client-version` 轮询：

- 服务端响应新增 `bootId`（进程启动时间戳，进程生命周期内不变）
- 前端记录最近一次 `ROOM_ACK` 携带的 bootId；轮询发现服务端 bootId 变了、而 socket 自认为一直连着，说明服务端重启过、连接的 room 成员资格不可信，强制重连

这一层覆盖未来任何"连接活着但 room 丢了"的场景，不局限于本次竞态。

## 4. 接口契约

### 新增 Socket.IO 事件

| 事件 | 方向 | 载荷 | 说明 |
|------|------|------|------|
| `ROOM_ACK` | 服务端 → 客户端 | `{bootId: string, rooms: string[], at: ISO时间}` | room 分配完成的确认。`rooms` 为该连接的实际成员资格（`client.getAllRooms()` 过滤默认空 room），不是本次分配的增量 |
| `ROOM_RESYNC` | 客户端 → 服务端 | 空对象 | 请求重新分配 room。幂等，服务端每 session 2s 冷却 |

### `GET /api/client-version` 响应变更

新增字段 `bootId: string`（可选，旧客户端忽略即可）。前端 `ClientVersionResponse` 类型同步加了可选字段，对旧后端回滚兼容：`bootId` 缺失时比对逻辑短路跳过。

### 防风暴参数

| 参数 | 值 | 位置 |
|------|-----|------|
| ACK 看门狗超时 | 5s | 前端 socketUrl.ts |
| RESYNC 最大重试 | 2 次 | 前端 socketUrl.ts |
| 强制重连冷却 | 60s（全局共享，看门狗与轮询两条路径合用） | 前端 socketUrl.ts |
| RESYNC 服务端冷却 | 2s / session | 后端 SocketRoomAssigner |

最坏情况下强制重连不超过每 60 秒一次。

## 5. 改动清单

| 文件 | 改动 |
|------|------|
| `common/component/SocketRoomAssigner.java` | 注册时机改 `@PostConstruct`；抽幂等 `assignRooms()`；ROOM_ACK 推送；ROOM_RESYNC 处理器（带冷却） |
| `modules/twin/common/service/ClientVersionService.java` | 新增 `bootId` 字段与 getter，`/api/client-version` 响应透出 |
| `frontend/src/config/socketUrl.ts` | ROOM_ACK 看门狗状态机、`forceSocketReconnect()`（带冷却）、`getLastAckBootId()` |
| `frontend/src/hooks/useClientVersionPoll.ts` | 轮询成功路径加 bootId 一致性守卫 |
| `frontend/src/api/domains/clientVersion.api.ts` | `ClientVersionResponse` 加可选 `bootId` |

后端 `mvnw compile` 通过，前端 `tsc --noEmit` 无错误。

## 6. 复核结论

两个子 agent 独立复核，均无必须修的问题。

**后端复核**（含 netty-socketio 2.0.3 字节码反编译核实）：
- `@PostConstruct` 早于 `ApplicationRunner` 的时序确认成立；`start()` 前注册监听器合法
- `joinRoom` 底层是 ConcurrentHashMap Set，重复调用幂等；无循环依赖
- mobile 未认证连接发 RESYNC 只会走 mobile 分支，不可能加入 web room
- 两条建议已采纳：ACK 报实际成员资格、RESYNC 加 session 冷却

**前端复核**：
- ACK 帧不会先于 `connect` 处理器执行（socket.io-client 先同步派发 connect 监听再 flush 接收缓冲），无竞态
- 旧后端回滚场景有双重短路（`response.bootId` 与 `lastAckBootId` 任一缺失即跳过），不会形成轮询触发的重连循环
- 手动 `disconnect()` 后显式 `connect()` 可恢复自动重连，socket.io-client 标准行为

## 7. 遗留事项

1. **既有问题，另开任务**：`App.tsx` GlobalSocketListener 的 effect cleanup 会对共享 socket 调 `disconnect()`，且注册的监听器未在 cleanup 中 off，StrictMode 或重挂载会累积重复监听器。与 `useSocket.ts` 中"不断开共享 socket"的约定矛盾。非本次引入。
2. **数据补偿不在本次范围**：room 广播不排队，客户端断线期间的事件永久丢失。瀑布流已有 60 秒轮询兜底，其他 console 数据依赖重连后用户操作刷新。如需严格不丢，需要事件序号 + 重连补拉，另行立项。
3. **多实例部署注意**：bootId 比对假设 Socket.IO 与 HTTP API 同进程。未来若拆分或多实例负载均衡，两者 bootId 会天然不一致，需改为集群共享标识。当前单机部署无此问题。

## 8. 验证方法

1. 重启后端，观察一台之前复现过问题的电脑：控制台应出现 `[SharedSocket] ROOM_ACK bootId=...`，之后广播恢复正常
2. 服务端日志应有 `[RoomAssigner] 已注册（@PostConstruct，早于 Socket.IO start）`，且时间戳早于 `Socket.IO :9092 已监听`
3. 兜底路径验证：用 DevTools 手动 `emit('ROOM_RESYNC')`，2 秒内应收到新的 ROOM_ACK；2 秒内连发两次，第二次应被服务端冷却拦截（无响应）
4. 回归：管理员"同步在线页"在 `#/console` 与非 console 路由均弹出刷新横幅；mobile 通道收不到 `CLIENT_FORCE_RELOAD`
