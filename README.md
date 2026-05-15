# Twin System（示例工程）

Spring Boot 后端 + React（Vite）前端 + 微信小程序等。详细模块说明见仓库内各子目录文档。

## 数据库：首次部署 / 新环境

- **默认（推荐无法库外跑 SQL 时）**：应用启动时会自动执行 `classpath:db/bootstrap-*.sql`（与 `scripts/login_branding_invite_chat.ddl.sql`、`scripts/admin_file_templates.ddl.sql` 同源），配置项为 **`app.schema.auto-ensure-embedded-core-ddl=true`**（`application.properties` 中已默认开启）。数据源用户需具备 **CREATE TABLE** 等权限。
- **详细清单与 DBA 手工脚本**：见 [`scripts/DEPLOY_DDL.md`](scripts/DEPLOY_DDL.md)。
- **权威表定义**：`src/main/resources/schema.sql`。

## 构建与运行

- 后端：使用项目自带的 `mvnw` / `mvnw.cmd`（例如 `mvnw -DskipTests compile`）。
- 前端：`cd frontend && npm install && npm run build`。

更多 Spring 默认说明见 [`HELP.md`](HELP.md)。
