# 手机版学生中心 — 布局修复与功能移植

**日期**: 2026-06-24
**分支**: feature/face-verification
**范围**: 仅前端，无后端改动

## 目标

1. 修复手机版房间页面的布局排版问题
2. 将桌面学生中心的「申领物品」完整购物车功能移植到手机版
3. 将桌面学生中心的「出入记录」完整功能（含违规记录）移植到手机版

## 文件拆分

当前 `MobileStudentCenterPage.tsx`（536行）拆分为：

```
pages/mobile/
├── MobileStudentCenterPage.tsx   ← 壳（~200行）：数据加载、Tab 切换、底部导航、WebSocket
├── MobileHomeTab.tsx             ← 首页（~120行，基本不动）
├── MobileRoomsTab.tsx            ← 房间（~150行，修复布局）
├── MobileMaterialTab.tsx         ← 申领（~350行，完整购物车）
├── MobileRecordsTab.tsx          ← 出入记录+违规（~350行）
├── MobileMineTab.tsx             ← 我的（~80行，基本不动）
└── useMobileSocket.ts            ← 不变
```

## 一、房间 Tab — 布局修复

### 当前问题
- `flex h-full` + `min-h-screen` 高度计算冲突
- `flex-wrap -mx-1` 负边距可能产生横向溢出
- 左侧栏无独立滚动，校区/楼层多时无法触达底部
- 右侧面板滚动行为不可控
- `pb-24` 硬编码底部留白

### 修复方案
- 外层容器：`h-[calc(100vh-var(--tabbar-height,56px))]` 替代 `min-h-screen`
- 物品网格：`grid grid-cols-2 gap-2` 替代 `flex-wrap -mx-1 + w-1/2 px-1`
- 左侧栏：加 `overflow-y-auto`，保持 90px 宽度
- 右侧面板：`flex-1 overflow-y-auto` 独立滚动
- 底部留白：由父级容器高度控制，移除硬编码 pb-24
- 卡片样式：统一圆角、间距，提升触控区域

## 二、申领 Tab — 完整购物车

### 数据流
```
localStorage (cart state) → MobileMaterialTab → createMaterialRequestWithToken (提交)
```

### 组件结构
```
MobileMaterialTab
├── 分类侧栏 (80px, 同现有)
├── 物品网格 (2列 grid)
│   └── MaterialItemCard (物品名、单位、库存、+/-按钮)
├── 底部购物车栏 (固定, BottomTabBar上方)
│   ├── 件数显示
│   └── "提交申领" 按钮
├── 购物车弹窗 (底部 Sheet)
│   ├── 物品列表 + 数量调整
│   └── 关闭按钮
└── 需求建议入口 (可折叠 textarea)
```

### 关键交互
- **+/- 按钮**：直接在物品卡片上操作，加减数量
- **购物车栏**：始终可见，显示 "已选 N 件" + 提交按钮
- **购物车弹窗**：点击购物车栏展开，底部滑出 Sheet
- **提交**：调用 `POST /api/material/requests` (bearer token)，成功后 Toast + 清空购物车
- **需求建议**：底部可折叠输入框，调用 `POST /material/demands`

### localStorage 键名
`mobile_material_cart_{token前8位}` — 存储 `Record<number, number>` (itemId → qty)

### API 端点
| 操作 | 方法 | 端点 | 认证 |
|------|------|------|------|
| 获取分类/物品 | GET | `/public/mobile-center/:token/materials` | token |
| 提交申领 | POST | `/api/material/requests` | bearer token |
| 提交需求建议 | POST | `/material/demands` | bearer token |

## 三、出入记录 Tab — 完整功能

### 组件结构
```
MobileRecordsTab
├── Tab 切换 ("出入记录" | "违规记录 (N)")
├── 日期范围筛选
│   ├── 开始日期 <input type="date">
│   └── 结束日期 <input type="date">
├── 记录列表 (按日期分组)
│   ├── DateGroupHeader (日期 + 星期)
│   └── RecordCard (图标 + 类型Badge + 时间 + 房间名)
└── 分页 (上一页/下一页)
```

### 关键交互
- **Tab 切换**：出入记录 / 违规记录(N)
- **日期筛选**：客户端过滤（一次拉取 200 条）+ 客户端分页（50条/页）
- **日期分组**：按日期分组，显示星期标签
- **记录卡片**：进入=绿色 LogIn 图标，离开=橙色 LogOut 图标
- **违规卡片**：红色 AlertTriangle 图标 + 状态 Badge + 扣分
- **分页**：简单上一页/下一页

### API 端点
| 操作 | 方法 | 端点 | 认证 |
|------|------|------|------|
| 出入记录 | GET | `/public/mobile-center/:token/access-records` | token |
| 违规记录 | GET | `/public/mobile-center/:token/violations` | token（需新增） |

### 关于违规记录 API
桌面端违规记录调用 `/student/violations`（需登录）。手机版需要对应的 token 公开接口。如果后端尚未提供，前端先 Mock 空数据 + "暂无违规记录" 提示，接口就绪后直接对接。

## 不变项
- 配色方案 (`#ac1736`, `#4f46e5`, `#eef0f6`)
- 底部 TabBar 样式和交互
- 水印 Logo、HeroBanner
- WebSocket 实时提醒
- Token 机制 (`/m/sc/:token`)
- 首页、我的 Tab 内容
