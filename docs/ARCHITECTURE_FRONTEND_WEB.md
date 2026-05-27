# Twin System Web 前端底层架构规范

> **定位**：本文档为 React Web 前端的参考基础架构。开发时应优先遵循本文档约定，但可根据技术升级需要合理偏离，偏离需在 PR 中说明理由。
>
> **适用版本**：React 19 + Vite 8 + TypeScript 5.9
>
> **最后更新**：2026-05-27

---

## 一、技术栈基线

| 组件 | 选型 | 版本 | 备注 |
|------|------|------|------|
| 框架 | React | 19 | 函数组件 + Hooks |
| 构建 | Vite | 8 | `@vitejs/plugin-react` |
| 类型 | TypeScript | 5.9 | strict: true |
| 路由 | react-router-dom | v7 | `createBrowserRouter` |
| 服务端状态 | TanStack React Query | v5 | 异步数据缓存与自动刷新 |
| 客户端状态 | Zustand | latest | 轻量全局状态 |
| UI 组件 | shadcn/ui (Radix) | latest | `frontend/src/components/ui/` |
| 样式 | Tailwind CSS | v4 | utility-first |
| HTTP 客户端 | Axios | latest | 三个预配置实例 |
| 图表 | ECharts + Recharts | latest | ECharts 用于复杂可视化，Recharts 用于简单图表 |
| 图标 | Lucide React | latest | 全项目统一 |
| 实时通信 | Socket.IO Client | latest | 连接 `:9092` 通知推送 |
| 富文本 | Tiptap | latest | 站内信编辑器 |

---

## 二、目录结构

```
frontend/
├── vite.config.ts
├── tsconfig.json                    ← 引用 tsconfig.app.json + tsconfig.node.json
├── tsconfig.app.json                ← @/* → ./src/*
├── index.html
└── src/
    ├── App.tsx                      ← 根组件（QueryClientProvider + RouterProvider）
    ├── main.tsx                     ← 入口
    ├── api/
    │   ├── core/                    ← Axios 实例 + 拦截器
    │   │   ├── http.ts              ← BASE=/api/v1/twin, 15s 超时
    │   │   ├── authHttp.ts          ← BASE=/api, 20s 超时, 自动挂 Bearer
    │   │   └── adminHttp.ts         ← BASE=/api, 管理端专用
    │   ├── hooks/                   ← TanStack Query hooks
    │   └── domains/                 ← 按业务域拆分 API 函数
    │       ├── auth.api.ts
    │       ├── repair.api.ts
    │       └── ...
    ├── components/
    │   ├── ui/                      ← shadcn/ui 基础组件（button, dialog, table...）
    │   ├── admin/                   ← 管理端共享组件
    │   ├── markdown/                ← Markdown 渲染组件
    │   └── scanner/                 ← 扫码相关组件
    ├── features/                    ← 按功能模块组织
    │   ├── admin/                   ← 管理端导航注册
    │   ├── auth/                    ← 登录、authStorage
    │   ├── notification/            ← 通知、SSE 流
    │   └── ...
    ├── pages/                       ← 页面入口（路由直接引用的组件）
    ├── layouts/                     ← 布局组件（AdminLayout）
    ├── router/
    │   └── index.tsx                ← createBrowserRouter 配置
    ├── store/                       ← Zustand stores
    ├── hooks/                       ← 通用 Hooks
    ├── types/                       ← 共享 TS 类型
    ├── utils/                       ← 通用工具函数
    ├── lib/                         ← 第三方库初始化
    ├── config/                      ← 前端配置常量
    └── telemetry-view/              ← 遥测可视化库（楼层块、房间分组、门控轮询）
```

---

## 三、HTTP 客户端层

### 3.1 三个 Axios 实例

| 实例 | 文件 | baseURL | timeout | 用途 |
|------|------|---------|---------|------|
| `http` | `api/core/http.ts` | `/api/v1/twin` | 15s | 扫码引擎、看板实时流水 |
| `authHttp` | `api/core/authHttp.ts` | `/api` | 20s | 管理端 CRUD、门禁配置 |
| `adminHttp` | `api/core/adminHttp.ts` | `/api` | 20s | 管理端专用（额外管理鉴权逻辑） |

### 3.2 请求拦截器模板

```typescript
// authHttp.ts —— 自动挂载 Authorization 头
authHttp.interceptors.request.use((config) => {
  const token = authStorage.getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
```

### 3.3 响应拦截器模板

```typescript
authHttp.interceptors.response.use(
  (response) => response,
  (error: AxiosError<{ message?: string }>) => {
    const message = error.response?.data?.message ?? error.message ?? "请求失败";
    return Promise.reject(new Error(message));
  }
);
```

### 3.4 强制规则

| 规则 | 说明 |
|------|------|
| 管理端接口用 `authHttp` | 自动挂 token，不在请求时手动传 |
| 公开接口可用裸 `axios` | 如看板大屏数据（无鉴权） |
| 禁止创建第 4 个 Axios 实例 | 三个实例覆盖所有场景 |
| Vite proxy 负责转发 `/api` → `localhost:8080` | 不在代码里硬编码后端地址 |

---

## 四、API Domain 文件规范

### 4.1 文件命名

```
frontend/src/api/domains/{moduleName}.api.ts
```

命名与后端模块对应：`repair.api.ts` ↔ `modules/repair/`，`supplies.api.ts` ↔ `modules/supplies/`。

### 4.2 文件内部结构

```typescript
// === 类型定义 ===
export interface XxxRow {
  id: string;
  name: string;
  status: string;
  createTime: string;
}

export interface XxxPageResponse {
  data: XxxRow[];
  total: number;
}

// === 通用解包工具（文件内私有） ===
const asData = <T>(payload: any, fallback: T): T => {
  if (payload && typeof payload === "object" && "data" in payload) {
    return (payload.data ?? fallback) as T;
  }
  return (payload ?? fallback) as T;
};

const asArrayData = (payload: any): any[] => {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.data)) return payload.data;
  return [];
};

// === API 函数 ===
export const fetchXxxPage = async (
  page: number,
  size: number,
  keyword: string = ""
): Promise<XxxPageResponse> => {
  const res = await authHttp.get("/v1/xxx/list", {
    params: { page, size, keyword },
  });
  return asData<XxxPageResponse>(res.data, { data: [], total: 0 });
};

export const createXxx = async (payload: CreateXxxPayload) => {
  const res = await authHttp.post("/v1/xxx", payload);
  return res.data;
};
```

### 4.3 强制规则

| 规则 | 说明 |
|------|------|
| TS 类型与 API 函数同文件 | 不拆到 types/ 再 import（减少跳转） |
| API 路径以 `/v1/` 或 `/api/v1/` 开头 | 不带尾部斜杠 |
| 使用 `asData<T>()` 兜底 | 防止后端返回 null data 时前端 crash |
| 分页返回值固定 `{ data, total }` | 所有分页 API 统一格式 |
| 不手动构造 mock 数据 | 前端只负责请求，数据来自后端 |

---

## 五、路由规范

### 5.1 路由配置

```typescript
// frontend/src/router/index.tsx
import { createBrowserRouter } from "react-router-dom";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <AdminLayout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: "admin/:section", element: <AdminSectionPage /> },
      { path: "access-fusion", element: <AccessFusionPage /> },
      // ...
    ],
  },
  { path: "/login", element: <LoginPage /> },
  { path: "/scan", element: <ScanPage /> },
]);
```

### 5.2 强制规则

| 规则 | 说明 |
|------|------|
| 管理端页面在 `AdminLayout` 的 children 中 | 共享侧边栏、顶栏 |
| 独立页面（登录、扫码）平级挂载 | 不使用 AdminLayout |
| 路由路径用 kebab-case | `/access-fusion` 而非 `/accessFusion` |
| 新增页面在 `page_permission_item` 中登记 | 不在路由文件里手写权限逻辑 |

---

## 六、状态管理规范

### 6.1 服务端数据 → TanStack React Query

```typescript
// api/hooks/useProfile.ts
import { useQuery } from "@tanstack/react-query";

export function useProfile() {
  return useQuery({
    queryKey: ["profile"],
    queryFn: fetchMyProfile,
    staleTime: 5 * 60 * 1000,  // 5 分钟内不重新请求
  });
}
```

**适用场景**：从后端获取的、需要缓存和自动刷新的数据。

### 6.2 客户端状态 → Zustand

```typescript
// store/xxxStore.ts
import { create } from "zustand";

interface XxxState {
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
}

export const useXxxStore = create<XxxState>((set) => ({
  selectedId: null,
  setSelectedId: (id) => set({ selectedId: id }),
}));
```

**适用场景**：UI 交互状态（侧栏开合、选中项、弹窗显隐）、全局偏好。

### 6.3 强制规则

| 规则 | 说明 |
|------|------|
| 后端数据走 Query | 不手写 useEffect + useState + fetch |
| UI 状态走 Zustand | 不在组件间通过 props 层层传递全局状态 |
| Query key 命名规范 | `["模块名", "操作", ...params]`，如 `["repair", "list", page, status]` |
| 禁止在 Zustand 里调 API | store 只存状态，API 调用在 hooks 或组件中 |

---

## 七、组件分层规范

### 7.1 三层模型

```
pages/            ← 路由入口，组装 features + components，处理页面级数据获取
features/         ← 功能模块，包含该功能的业务逻辑和特定 UI
components/       ← 可复用 UI 组件
  ├── ui/         ← shadcn/ui 基础组件（无业务逻辑）
  ├── admin/      ← 管理端复用组件（表格、表单、抽屉）
  └── scanner/    ← 扫码引擎相关组件
```

### 7.2 页面组件模板

```tsx
// pages/repair/RepairListPage.tsx
export default function RepairListPage() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({
    queryKey: ["repair", "list", page],
    queryFn: () => fetchRepairList(page),
  });

  if (isLoading) return <Skeleton />;

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">报修管理</h1>
      <RepairTable data={data} />
    </div>
  );
}
```

### 7.3 强制规则

| 规则 | 说明 |
|------|------|
| `pages/` 只做数据获取和组装 | 不包含复杂业务逻辑 |
| `features/` 承载业务逻辑 | 按域拆分，如 `features/repair/` |
| `components/ui/` 纯展示 | 不引入业务类型、不调 API |
| 组件导出统一用 `export default function` | 非 `const Component = () => {}` |
| 路径别名用 `@/` | 不写 `../../../` 相对路径 |

---

## 八、UI 样式规范

### 8.1 Tailwind 优先

```tsx
<div className="flex items-center gap-4 p-6 bg-white rounded-lg shadow-sm">
  <span className="text-lg font-semibold text-gray-900">标题</span>
</div>
```

### 8.2 shadcn/ui 组件

所有基础 UI 组件从 `@/components/ui/` 引用，基于 Radix UI 原语 + Tailwind 样式：

```tsx
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableHeader, TableBody, TableRow, TableCell } from "@/components/ui/table";
```

### 8.3 强制规则

| 规则 | 说明 |
|------|------|
| Tailwind class 优先 | 非必要不写 `<style>` 或 CSS Module |
| shadcn/ui 组件直接使用 | 不做二次封装（除非系统级统一行为） |
| 间距用 Tailwind 尺度 | `p-4` `gap-2` `m-6`，不随手写 px |
| 禁止内联 `style={{}}` | 除非值是运行时动态计算的（如动画进度百分比） |

---

## 九、鉴权与登录流程

### 9.1 Token 存储

```typescript
// features/auth/authStorage.ts
export const authStorage = {
  getToken: () => localStorage.getItem("token"),
  setToken: (t: string) => localStorage.setItem("token", t),
  getRole: () => localStorage.getItem("role"),
  // ...
};
```

### 9.2 登录流程

```
LoginPage → POST /api/auth/login/web → 得到 { token, role, userInfo }
  → authStorage.setToken(token)
  → authStorage.setRole(role)
  → navigate("/")
  → authHttp 拦截器自动从 authStorage 读 token 挂到 Authorization 头
```

### 9.3 强制规则

| 规则 | 说明 |
|------|------|
| Token 统一从 `authStorage` 读写 | 不直接操作 localStorage |
| 管理端页面默认需登录 | 未登录跳 `/login` |
| 页面权限由 `page_permission_item` 控制 | 不写死 `if (role === 'ADMIN')` 展示组件 |

---

## 十、实时通信（Socket.IO）

### 10.1 连接配置

```typescript
// config/socketUrl.ts
export const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:9092";
```

连接后端 Netty Socket.IO 服务（端口 9092），用于：
- 通知实时推送
- SSE fallback（`GET /api/notifications/stream` 作为长连接备选）

### 10.2 强制规则

| 规则 | 说明 |
|------|------|
| Socket 连接仅用于监听通知 | 不发业务数据 |
| 断线自动重连 | 由 Socket.IO 客户端内置机制处理 |
| 不在 Socket 回调里做重操作 | 收到事件后更新 Zustand store，由组件响应式渲染 |

---

## 十一、新页面接入 Checklist

| # | 步骤 | 位置 |
|---|------|------|
| 1 | 创建 API domain 文件 | `api/domains/{module}.api.ts` |
| 2 | 创建 TanStack Query hook | `api/hooks/useXxx.ts` |
| 3 | 创建页面组件 | `pages/XxxPage.tsx` |
| 4 | 在 router 中注册路由 | `router/index.tsx` |
| 5 | 在管理端导航中登记 | `features/admin/adminNavRegistry.ts` |
| 6 | 在 `page_permission_item` 登记 | 管理端「页面权限」自动发现 |
| 7 | 如需 Zustand store | `store/xxxStore.ts` |

---

## 十二、禁止事项

1. **禁止在组件中直接操作 localStorage** — 通过 `authStorage` 等封装层。
2. **禁止手写 `useEffect + fetch`** — 服务端数据走 TanStack React Query。
3. **禁止创建第 4 个 Axios 实例** — `http`, `authHttp`, `adminHttp` 足够。
4. **禁止在 `components/ui/` 中引入业务类型或 API 调用** — 保持纯 UI。
5. **禁止在 API domain 文件中定义 mock 数据** — 后端是唯一数据源。
6. **禁止使用 CSS Module 或 styled-components** — Tailwind + shadcn/ui 为项目标准（历史遗留 styled-components 逐步迁移）。
7. **禁止相对路径跨三层以上** — 使用 `@/` 别名。
8. **禁止在渲染路径中硬编码权限判断** — 菜单/入口可见性从 `page_permission_item` 获取。
