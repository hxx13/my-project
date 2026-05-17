# Twin System Skills 使用指南

## 自动引用

开发任务开始前，Agent 应：

1. 读 `skills/index.yaml` 确定模块。
2. 加载 `skills/design/*` 中与任务相关的规范。
3. 加载 `skills/modules/{module}/skill-*.yaml`。

## 场景索引

| 场景 | 文档 |
|------|------|
| 快速上手 | [quick-start.md](quick-start.md) |
| 新建表 + CRUD | [entity-implementation.md](entity-implementation.md) |
| 改造/重构 | [refactor-module.md](refactor-module.md) |

## 模块 Skill

| 模块 | 文件 |
|------|------|
| twin | [../modules/twin/skill-twin.yaml](../modules/twin/skill-twin.yaml) |
| telemetry | [../modules/telemetry/skill-telemetry.yaml](../modules/telemetry/skill-telemetry.yaml) |
| auth | [../modules/auth/skill-auth.yaml](../modules/auth/skill-auth.yaml) |
| dahua | [../modules/dahua/skill-dahua.yaml](../modules/dahua/skill-dahua.yaml) |
| accessrule | [../modules/accessrule/skill-accessrule.yaml](../modules/accessrule/skill-accessrule.yaml) |
| pagepermission | [../modules/pagepermission/skill-pagepermission.yaml](../modules/pagepermission/skill-pagepermission.yaml) |

## 外部参考

芋道原始 Skill（只读参考）：`d:\codex\verson.1.2\yudao-skill-pro-main\skills`
