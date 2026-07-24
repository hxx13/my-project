# 后台 Web 壳层视觉规范（引用说明）

本阶段以 **Vercel 开发者平台** 的公开设计语言为参照，选用仓库内现成说明文档：

- `awesome-design-md-main/design-md/vercel/DESIGN.md`（[VoltAgent/awesome-design-md](https://github.com/VoltAgent/awesome-design-md) 集合中的 `vercel` 主题）

## 与实现的对齐方式（摘要）

| 设计意图（Vercel DESIGN.md） | 本仓库落地 |
| --- | --- |
| 近白画布 `#fafafa` / `#ffffff`、正文墨 `#171717` | 主内容区叠 **极淡蓝紫径向高光** + `#fafafa` 底色；顶栏半透明白 + 细阴影；正文 `neutral-900/950` |
| 细分割线 `#ebebeb`、弱阴影 | 顶栏与卡片 `border-neutral-200/90`、`ring-black/[0.02]`；表格/表单卡 `rounded-xl` |
| 品牌蓝 `#0070f3` 作链接/焦点 | 工作台装饰与 hover 边框、键盘焦点环 `ring-[#0070f3]/30` |
| 技术感、信息密度适中 | 侧栏 **深灰渐变** + 高亮项 **白/10 玻璃条**；`main` `max-w-[1600px]`；工作台 Hero + 分区卡片层次 |

## 不在此阶段改动的范围

- **左侧侧栏** DOM 结构、分组与入口链接（`AdminLayout` 内 `aside` 区块保持原样）。
- **侧栏一级入口对应的页面组件**（`src/pages/*` 中各业务页）：仅通过壳层与共享 token 间接统一观感，不修改其业务逻辑与布局文件。

## 业务模块 IA 与页内返回

- **`docs/admin-module-personnel-access-rules-supplies.md`**：人员授权、门禁规则、领用物资的路由层级、`location.state.returnTo` 约定，以及 `AdminSubPageHeader` 与全局壳层返回的互补关系。

## 二级导航（壳层）

壳层根据 `adminNavRegistry` + 权限 `sidebar` ENTRY 判定「一级入口」；其余 `/admin/*` 子路由在顶栏显示「返回」，默认回退见 `adminShellNavigation.ts`。
