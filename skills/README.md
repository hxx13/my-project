# Twin System Skills

本目录为 **Twin System（20260416）** 的 AI/团队开发知识库，组织方式参考外部参考项目 `d:\codex\verson.1.2\yudao-skill-pro-main\skills`（芋道 ruoyi-vue-pro 提取规范），但**内容完全贴合本仓库**的技术栈与业务域。

## 快速开始

1. 阅读 [`index.yaml`](index.yaml) 查看模块索引与设计规范路径。
2. 新功能开发：[`usage/entity-implementation.md`](usage/entity-implementation.md)。
3. 改造现有模块：[`usage/refactor-module.md`](usage/refactor-module.md)。

## 目录

| 目录 | 说明 |
|------|------|
| `design/` | 数据库、实体、API、CRUD 全局规范 |
| `modules/` | 各业务模块 Skill（twin、telemetry、auth 等） |
| `usage/` | 场景化提示词与流程 |
| `templates/` | 新增模块 Skill 的模板 |

## 与 Cursor Rules 的关系

- 强制规则仍在 `.cursor/rules/*.mdc`（如 DDL、保存后禁止整表刷新）。
- `skills/` 提供**模块上下文与代码风格**；Agent 开发对应模块时应同时加载相关 Skill。

## 参考项目位置

芋道完整源码与原始 Skill 位于仓库外：

`d:\codex\verson.1.2\yudao-skill-pro-main`

本仓库 **不** 依赖该路径编译运行；仅作模式参考。
