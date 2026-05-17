# Twin Skills 快速开始

## 1. 确定模块

在提示词中写明，例如：

```text
目标模块：twin
请阅读 skills/modules/twin/skill-twin.yaml 与 skills/design/api-designer.yaml
```

## 2. 常用提示词模板

**新增 API**

```text
在 twin 模块新增 XXX 接口：
- 遵循 skills/design/api-designer.yaml（Result、Bearer 鉴权）
- 若涉及新表，遵循 skills/design/db-designer.yaml 与 .cursor/rules/db-schema-ddl-mandatory.mdc
- 前端保存后仅合并当前行（post-save-no-full-refresh.mdc）
```

**定时任务**

```text
新增后台任务 JOB_XXX：
- 只通过 JobExecutionRegistry + JobSchedulerService 注册
- 参考 skills/modules/twin/skill-twin.yaml 的 job_keys 章节
- 不要新增裸 @Scheduled
```

## 3. 与芋道参考的差异（勿混淆）

| 项 | 芋道 yudao | Twin System |
|----|------------|-------------|
| 响应体 | CommonResult | Result |
| URL | /system/user/create | /api/... REST |
| 权限 | @PreAuthorize 菜单 | RoleEnum + pagepermission |
| 多租户 | tenant_id | 默认无 |
| ORM | MyBatis-Plus | MyBatis Mapper |

## 4. 目录

- 设计规范：`skills/design/`
- 模块 Skill：`skills/modules/`
- 索引：`skills/index.yaml`
