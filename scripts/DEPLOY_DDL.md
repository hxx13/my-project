# 数据库 DDL 部署说明（`twin_system`）

## 应用内自动建表（无需在库外执行 SQL）

默认 **`app.schema.auto-ensure-embedded-core-ddl=true`** 时，Spring 启动后会用 `ResourceDatabasePopulator` 在**当前数据源指向的库**内执行：

- `classpath:db/bootstrap-login-branding-invite-chat.sql`（与 `scripts/login_branding_invite_chat.ddl.sql` 同源）
- `classpath:db/bootstrap-admin-file-template.sql`（与 `scripts/admin_file_templates.ddl.sql` 同源）

须保证 **`spring.datasource` 用户具备 CREATE TABLE 等 DDL 权限**。若生产禁止应用建表，将该配置改为 **`false`**，改由 DBA 执行 `scripts/` 下脚本；修改 SQL 时请**同时**更新 `scripts/*.ddl.sql`、`src/main/resources/db/bootstrap-*.sql` 与 `schema.sql`（见仓库规则 `db-schema-ddl-mandatory.mdc`）。

---

### 若关闭应用内迁移，或需与 DBA 脚本对账时（手工执行）

当 **`app.schema.auto-ensure-embedded-core-ddl=false`**，或需在库外重复执行/审计时：

1. **`scripts/login_branding_invite_chat.ddl.sql`** — 含 `sys_site_config`、`registration_invite`、全套 `chat_*` 及默认登录轮播等。
2. **`scripts/admin_file_templates.ddl.sql`** — 后台「文件模板下载」表 `admin_file_template`。

完整清单见下文表格；权威表定义见 **`src/main/resources/schema.sql`**。

## 缺表 500 标准修复（登录轮播 / 推荐码 / 站内信）

若已开启应用内迁移仍缺表，请检查数据源 **DDL 权限**与启动日志 `[embedded-ddl]`。若关闭内置迁移后出现缺表：

1. 在目标库执行 **`scripts/login_branding_invite_chat.ddl.sql`**（与 `schema.sql` 中相关定义一致，一次性覆盖上述对象及默认 `login_branding` 行）。
2. 若仅需站内信核心三表且**不含**前两表，可改用 `scripts/chat_core_dm.ddl.sql`（**不能**替代 `sys_site_config` / `registration_invite`）。

应用启动前或首次访问相关功能前执行即可。

## 首次部署 / 增量脚本检查清单

| 脚本 | 用途 |
|------|------|
| `login_branding_invite_chat.ddl.sql` | 站点配置、注册推荐码、站内信全套表 |
| `chat_core_dm.ddl.sql` | 仅站内信 DM 核心表（不含站点/邀请） |
| `chat_contact_groups.ddl.sql` | 站内信通讯录分组（若未包含在已执行的全量脚本中） |
| `facility_maintenance.ddl.sql` | 检查维护（facility maintenance）相关表 |
| `mini_program_release.ddl.sql` | 小程序发版/配置相关表 |
| `admin_file_templates.ddl.sql` | 后台「文件模板下载」功能表 `admin_file_template` |

权威全量定义见 **`src/main/resources/schema.sql`**；增量以 `scripts/*.ddl.sql` 为准便于 DBA 单文件执行。
