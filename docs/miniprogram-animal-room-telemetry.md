# aroapp 小程序 · 动物房 Hub

小程序工程目录为仓库下的 **`aroapp/`** 目录（请用微信开发者工具打开该目录）。与 Twin 后端通信经 **云函数 `springProxy` + `springAuth.springRequest`**，动物房温湿度使用 **`GET /api/v1/telemetry/wincc/animal-room-hub`**（`aroapp/miniprogram/utils/animalRoomHubApi.js`）。

## 入口说明

- **底部 tab「概览」** → `pages/overview/index`：页顶两个入口 **「数据概览」**（饼图/曲线/榜单，原有逻辑）与 **「动物房温湿度」**（`animal-room-telemetry` + Hub，与 Web 温湿度同款服务端组装）；默认 **数据概览**。
- **主览 → 运行概览** → `pages/animalRoomRun/index`：仍为独立页（温湿度主区 + 房间概览子入口），逻辑不变。

完整接口契约见：**[`animal-room-hub.md`](./animal-room-hub.md)**。

## 在微信开发者工具中打开

1. **导入项目目录请选择 `aroapp/`**（使用其中的 `project.config.json`，勿再使用仓库根目录下已删除的独立 `miniprogram/` 工程）。
2. 登录与域名：按 aroapp 现有 `springAuth` / 云函数环境配置。

## 源码索引（aroapp）

- Hub 请求：`aroapp/miniprogram/utils/animalRoomHubApi.js`
- 概览 tab 双入口：`aroapp/miniprogram/pages/overview/index.*`
- 运行概览页：`aroapp/miniprogram/pages/animalRoomRun/index.*`
- 温湿度组件：`aroapp/miniprogram/components/animal-room-telemetry/`
- 后端组装：`src/main/java/.../telemetry/animalroom/`
