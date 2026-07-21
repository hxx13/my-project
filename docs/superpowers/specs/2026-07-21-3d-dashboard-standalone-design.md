# 3D Dashboard 独立原型 — 设计规格

## 目标

在独立文件夹 `frontend-3d-dashboard/` 搭建轻量 3D 楼盘数字孪生原型。Canvas 铺满背景展示 8 层建筑模型，GlassCard 浮层承载 Dashboard 信息。性能优先，每层模型控制在 ~300KB，总模型数据 < 3MB。

## 技术栈

| 层 | 选型 |
|----|------|
| 3D 引擎 | React Three Fiber 9 + @react-three/drei 10 + three.js 0.182 |
| 动画 | GSAP 3（摄像机过渡） |
| 状态 | Zustand 5（轻量） |
| 样式 | Tailwind CSS 4 + 玻璃拟态 CSS 变量 |
| 构建 | Vite 8 |

## 目录结构

```
frontend-3d-dashboard/
├── package.json / vite.config.js / index.html
├── public/models/         ← 8 个 GLB（1F.glb ~ 8F.glb，每个 ~300KB）
└── src/
    ├── main.jsx / App.jsx / App.css
    ├── store/useStore.js           ← Zustand: camera/focus/floors
    ├── components/
    │   ├── world/
    │   │   ├── SceneManager.jsx    ← R3F Canvas 入口
    │   │   ├── Building.jsx        ← 加载 8 层 GLB，垂直排列
    │   │   ├── CameraController.jsx← 轨道控制 + GSAP 动画
    │   │   └── Lights.jsx          ← 环境光 + 方向光（无阴影）
    │   └── ui/
    │       ├── LeftPanel.jsx       ← 事件流 / 热力图（占位）
    │       ├── RightPanel.jsx      ← 排行榜 / 饼图（占位）
    │       ├── TopBar.jsx          ← 总览卡片（在室人数等）
    │       └── BottomTimeline.jsx  ← 实时事件条
    └── css/
        ├── variables.css           ← 玻璃拟态令牌
        ├── layout.css              ← z-index 分层 + 面板定位
        └── components.css          ← 卡片/按钮样式
```

## 性能策略（从参考项目教训中提炼）

1. **模型压缩**：Blender 导出时启用 Draco + meshopt，目标 ≤300KB/层
2. **无逐帧遍历**：不在 useFrame 中遍历 mesh 操作 opacity
3. **材质共享**：8 层楼层共享同一份材质实例，不 clone
4. **无实时阴影**：方向光 shadowMap 关闭，依赖烘培纹理
5. **Suspense 按需加载**：每层单独 Suspense，先加载的先显示
6. **CameraControls dampening**：drei 内置阻尼，不自己写 useFrame 平滑
7. **面板 backdrop-filter GPU 加速**：不触发 repaint

## 两层架构

```
z-0   Canvas 满屏 → 3D 建筑模型（天空 + 光照 + 轨道控制）
z-10  DOM 浮层 → 左右面板 + 顶栏 + 底栏（absolute + pointer-events 控制）
```

- Canvas 与 DOM 互不干扰
- 面板用 `backdrop-filter: blur()` 实现玻璃拟态
- 后续联动时，WebSocket 事件 → Zustand store → 模型 emissive 切换

## Phoenix

| 阶段 | 内容 |
|------|------|
| **P1（本期）** | 项目脚手架 + 3D 场景 + 8 层模型加载 + 轨道摄像机 + 占位 UI 面板 |
| **P2（后续）** | 接入真实 Dashboard 数据 + 门禁事件高亮 + GSAP 摄像机推近动画 |
