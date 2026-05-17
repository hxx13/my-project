---
references:
  design:
    - skills/design/api-designer.yaml
    - skills/design/entity-designer.yaml
    - skills/design/db-designer.yaml
  module_guide:
    prompt: "请指定要改造的模块"
    mapping:
      twin: skills/modules/twin/skill-twin.yaml
      telemetry: skills/modules/telemetry/skill-telemetry.yaml
      auth: skills/modules/auth/skill-auth.yaml
      dahua: skills/modules/dahua/skill-dahua.yaml
      accessrule: skills/modules/accessrule/skill-accessrule.yaml
---

# 改造模块指南（Twin System）

## 改造前

1. 阅读对应 `skills/modules/*/skill-*.yaml` 的 **cautions** 与 **architecture**。
2. 列出受影响 API（Web + aroapp）。
3. 评估 DDL 是否向后兼容。

## 本仓库高频改造主题

| 主题 | 参考 |
|------|------|
| 收敛 @Scheduled 到 JobScheduler | skill-twin.yaml `new_scheduled_work` |
| 认证 mock → JWT | skill-auth.yaml `security_roadmap` |
| WinCC 性能/并发 | skill-telemetry.yaml `cautions` |
| 大华渠道扩展 | skill-dahua.yaml `pattern_recommendation` |

## 分析输出格式（建议）

```yaml
impact:
  files: []
  apis: []
  ddl: []
risks: []
rollback: []
```

## 外部参考

芋道改造提示词模板（通用思路）：  
`d:\codex\verson.1.2\yudao-skill-pro-main\skills\usage\refactor-module.md`  
实现时仍以 **本仓库 skills/design** 为准。
