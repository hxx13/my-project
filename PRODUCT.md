# Product

## Register

product

## Users

系统管理员（SUPER_ADMIN / ADMIN），在日常运维中监控服务器健康状态、JVM 资源占用、35 个定时任务执行状况和调度日志。在服务器上通过桌面浏览器访问，非移动端场景。

## Product Purpose

Twin System 是实验动物科学部的数字化管理平台。监控面板为运维人员提供统一的可观测性视图——替代分散的日志控制台和定时任务配置页，将健康检查、资源指标、任务状态和实时日志整合到一个只读面板中。

## Brand Personality

冷静、精确、可信。像医疗监护仪而非游戏仪表盘——运维人员在排查故障时需要快速定位问题，不需要视觉噪音。

## Anti-references

- 不要花哨的装饰动画（不是展示大屏）
- 不要 Datadog/Grafana 的复杂查询界面（不是全功能可观测平台）
- 不要游戏风格的霓虹灯效（不是 sci-fi 主题面板）
- 不要 emoji 作为状态指示器

## Design Principles

1. **一眼定位** — 异常状态必须瞬间可见（颜色 + 位置 + 动画），不需要滚动或点击
2. **数据密度合理** — 35 个任务一屏可见，不过度分页
3. **只读视图** — 监控和配置分离，操作按钮最小化（仅"立即执行"）
4. **一致性** — 复用现有 AdminPageShell/AdminTableShell 组件模式
5. **暗色友好** — 通过 CSS 令牌自动适配，零额外暗色代码

## Accessibility & Inclusion

- WCAG 2.2 AA 级别
- 状态指示器不单独依赖颜色（配合文字标签）
- 脉冲动画尊重 prefers-reduced-motion
- 表格行支持键盘导航
