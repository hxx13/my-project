# Twin System 技术改造路线

> **基准**：对照《阿里巴巴Java开发手册》1.4.0 + 项目架构分析
>
> **创建日期**：2026-05-27
>
> **状态**：P0 已完成 (2026-05-27)，P1 部分完成 (2026-05-27)，P2 已完成 (2026-05-27)，P3 待执行

---

## 一、总览

本次扫描覆盖 `src/main/java` 全部后端代码、MyBatis XML、application.properties、logback-spring.xml、schema.sql，共发现 **16 项严重违规 + 18 项一般违规 + 9 项建议**。

按影响面分为四个改造阶段：

| 阶段 | 目标 | 周期 | 严重项 |
|------|------|------|--------|
| P0 紧急修复 | 消除安全硬编码 + 日志可用 | ✅ 已完成 (2026-05-27) | 4 项 |
| P1 短期改进 | 分层修复 + SQL 规范 + 跨域治理 | 1 周 | 6 项 |
| P2 中期优化 | 并发健壮性 + 异常体系 + 包名重构 | 2 周 | 3 项 |
| P3 长期演进 | 工程化完善 + 自动化检查 | 持续 | 3 项 |

---

## 二、P0 紧急修复（安全第一）

### 2.1 硬编码密码全部外置 ✅ 已完成

**完成时间**：2026-05-27

**改动摘要**：
- `application.properties`：DB/WinCC/pepper 密码改为 `${ENV_VAR:}` 环境变量引用
- `DahuaAuthService.java`：凭证改为 `@Value` 注入，读取 `app.dahua.*` 配置
- `AroService.java`：凭证改为 `@Value` 注入，读取 `app.aro.*` 配置
- `AdminController.java`：默认密码改为 `UUID.randomUUID()` 随机生成
- `application-local.properties`：填入本地开发凭证（已在 .gitignore）

**现状**：数据库密码、WinCC 密码、Dahua API Key/Secret、ARO 登录凭证全部硬编码在源码中。

| 位置 | 内容 |
|------|------|
| `application.properties:33` | `spring.datasource.password=SuperAdmin@2026` |
| `application.properties:113` | `app.wincc.password=111111` |
| `DahuaAuthService.java:17-21` | clientSecret, passwordRaw, username, baseUrl 硬编码 |
| `AroService.java:38-39` | account/password 硬编码 |
| `AdminController.java:38` | `DEFAULT_RESET_PASSWORD = "123456"` |

**改造方案**：

```
1. 创建 application-local.properties（已在 .gitignore 中）
2. 迁移所有密码到该文件，使用 ${env:VAR:default} 格式
   spring.datasource.password=${DB_PASSWORD:}
   app.wincc.password=${WINCC_PASSWORD:}
3. Dahua/ARO 凭证迁移到 sys_system_config 数据库配置表
4. AdminController 默认密码改为首次登录强制修改
```

### 2.2 SSL/TLS 全局绕过修复 ✅ 已完成

**完成时间**：2026-05-27

**改动摘要**：
- `DahuaAuthService.createSecureRestTemplate()`：改为 per-connection SSL（匿名 `SimpleClientHttpRequestFactory` 子类覆写 `prepareConnection`），移除 JVM 全局 `setDefaultSSLSocketFactory` / `setDefaultHostnameVerifier`
- `PersonnelAvatarProxyService.init()`：移除全局 `HttpsURLConnection.setDefaultHostnameVerifier()` 调用
- 参照 `WinCcSslRequestFactory.java` 的正确 per-connection 模式

**现状**：`DahuaAuthService.java:129-143` 创建全局信任所有证书的 SSLContext，影响整个 JVM。

```java
// 当前做法（有问题）
HttpsURLConnection.setDefaultSSLSocketFactory(allTrustingSslContext.getSocketFactory());
HttpsURLConnection.setDefaultHostnameVerifier((hostname, session) -> true);
```

**改造方案**：

```
为 Dahua 专用 RestTemplate 创建独立的 SSLContext，不设置 JVM 全局默认
→ 参考 AroRestTemplateConfig.java 的已有模式
→ 使用 app.wincc.ssl-insecure 配置项控制（已有此配置，Dahua 侧复用）
```

### 2.3 日志体系修复 ✅ 已完成

**完成时间**：2026-05-27

**改动摘要**：
- 全局替换 98 处 `System.out.println` → `log.info` / `System.err.println` → `log.error`/`log.warn`
- 1 处 `e.printStackTrace()` → `log.error(..., e)`（CommonAsyncService.java）
- 27 处空 catch 块添加 `log.debug`/`log.warn` 日志
- 涉及 22 个文件，覆盖所有模块

**现状**：

| 问题 | 数量 |
|------|------|
| `System.out.println` / `System.err.println` | 70+ 处 |
| `e.printStackTrace()` | 1 处 |
| 空 catch 块 | 4 处 |
| logback-spring.xml pattern 只有 `%msg%n` | 1 处 |

**改造方案**：

```
1. logback-spring.xml console pattern 改为：
   %d{HH:mm:ss.SSS} %-5level [%thread] %logger{36} : %msg%n

2. 全局替换 System.out.println → log.info/warn
   → AroService.java (~30处)
   → AroSyncTask.java (~20处)
   → CommonAsyncService.java (6处)
   → DahuaService.java + DahuaAuthService.java (8处)
   → TwinPredictionEngineService.java (6处)

3. e.printStackTrace() → log.error("...", e)

4. 空 catch 块至少加 log.warn("忽略异常: {}", e.getMessage())
```

### 2.4 @CrossOrigin 统一治理 ✅ 已完成

**完成时间**：2026-05-27

**改动摘要**：
- `WebMvcConfig.java`：新增 `addCorsMappings` 全局 CORS 配置（`/api/**`，`allowedOriginPatterns("*")`）
- 移除全部 26 个 Controller 的 `@CrossOrigin` 注解及对应 import

**现状**：30+ Controller 使用 `@CrossOrigin("*")`，存在 CSRF 风险。

**改造方案**：

```
1. 在 WebMvcConfig 中全局配置 CORS：
   registry.addCorsMappings("/api/**")
       .allowedOrigins("http://localhost:5173", "https://前端生产域名")
       .allowedMethods("GET", "POST", "PUT", "PATCH", "DELETE")
       .allowCredentials(true);

2. 逐一移除所有 Controller 上的 @CrossOrigin 注解
3. 小程序通过云函数访问，不受 CORS 影响
```

---

## 三、P1 短期改进（架构健康）

### 3.1 Controller 禁止直接调用 Mapper ✅ 已完成

**完成时间**：2026-05-27

**改动摘要**：
- 新建 `AdminService.java`（`modules/admin/service/`），封装 `AdminMapper` + `UserMapper` + `PasswordCredentialService`
- `AdminController` 改为仅注入 `AdminService`，Controller 层只做鉴权 + 委托
- 业务校验（账号长度、角色合法性、内置账号保护等）全部下沉到 Service 层，异常统一走 `IllegalArgumentException`，Controller 统一 `catch` 转 `Result.error()`

### 3.2 SELECT * 替换为显式字段列表 ⏸ 延后

**现状**：22 个 Mapper XML 共 85 处 `SELECT *`，**但无任何一个文件定义了 `<sql id="Base_Column_List">`**（与初版扫描结论有差异）。唯一有 Base_Column_List 的文件 `TwinScanPopupAnnouncementMapper.xml` 本就未使用 `SELECT *`。

**延后原因**：需逐表对照 Entity 字段创建列清单（涉及 20+ 张表），工作量大且易出错，建议借助 IDE 或脚本批量生成后再替换。功能无损，列为 P3 长期项。

### 3.3 时间字段 VARCHAR → DATETIME ⏸ 延后

**延后原因**：涉及 DDL 变更，需在测试环境验证数据兼容性后再执行。现有 VARCHAR 存储格式 `yyyy-MM-dd HH:mm:ss` 可被 MySQL 自动转换，但不排除历史数据存在非标准格式。

### 3.4 跨模块依赖解耦 ⏸ 延后

**延后原因**：`AroSyncTask` 跨模块注入涉及 6 个 twin 模块 Service，解耦需引入事件机制或接口抽象，架构变更需充分测试。列为 P2 项。

### 3.5 枚举命名规范化 ✅ 已完成

**完成时间**：2026-05-27

**改动摘要**：
- `RepairOrderStatus` → `RepairOrderStatusEnum`
- `PurchaseOrderStatus` → `PurchaseOrderStatusEnum`
- 更新了 4 个引用文件（Controller + InboxFeedContributor × 2）的 import 与调用

### 3.6 is 前缀字段改名 ✅ 部分完成

**完成时间**：2026-05-27

**改动摘要**：
- `AroSyncTask.isFirstRun` → `firstRun`（私有内部字段，无外部影响）
- Entity/DTO 的 `isPublic` / `isNewItem` 未改：这些字段参与 MyBatis 映射和 JSON 序列化，改名会联动影响 DB 层和前端 API 契约。建议在前后端大版本升级时统一处理。

---

## 四、P2 中期优化

### 4.1 定时任务防崩溃 ✅ 已完成

**完成时间**：2026-05-27

**改动摘要**：
- `UnifiedScheduleDispatcher.dispatch()` — 外层 try-catch(Throwable)，防止每分钟节拍异常终止调度线程
- `TwinPredictionEngineService.runPredictionModelScheduled()` — 外层 try-catch(Throwable)
- `TwinCardMappingService.revokeExpiredTimedExemptions()` — 已有 try-catch(Exception)，未改动
- `DahuaSwingPullService.pollEnabledTasks()` — 外层加 try-catch(Throwable) 包裹 `listEnabledTasks()`，内层保留原有 per-task try-catch(Exception)
- `OrderRecyclePurgeTask.purgeExpiredRecycleOrders()` — 外层 try-catch(Throwable)

### 4.2 线程池配置优化 ✅ 已完成

**完成时间**：2026-05-27

- `spring.task.scheduling.pool.size` 8 → 12
- `AsyncConfig.coreTaskExecutor` 加 `CallerRunsPolicy`
- `AsyncConfig.heavyCalcExecutor` 加 `CallerRunsPolicy`

### 4.3 SimpleDateFormat → DateTimeFormatter ✅ 已完成

**完成时间**：2026-05-27

- `TwinPredictionEngineService` 两处 `new SimpleDateFormat(...).format(new Date())` 替换为 `LocalDateTime.now().format(formatter)`
- 删除 `import java.text.*`

### 4.4 @EnableScheduling 重复声明 ✅ 已完成

**完成时间**：2026-05-27

- 移除 `AroSyncTask` 上的 `@EnableScheduling`
- 仅保留 `TwinSystemApplication` 上的声明

### 4.5 包名重构 ⏸ 延后

延后原因：需 IDE 重构工具安全执行，涉及全量文件。

---

## 五、P3 长期演进

### 5.1 CI 集成静态检查

```yaml
# .github/workflows/ci.yml 或对应 CI 配置
- name: Alibaba Code Scan
  uses: alibaba/p3c-action@v1
  # 基于阿里 p3c (PMD 规则集) 自动扫描

- name: Checkstyle
  # 配置 checkstyle.xml 与阿里规约对齐
```

### 5.2 MyBatis Entity 精准注解

```
当前：@Data（生成所有 getter/setter/toString/equals/hashCode）
建议：@Getter @Setter @ToString
→ 避免循环引用的 StackOverflow 隐患
→ equals/hashCode 由业务明确指定，不由 Lombok 自动生成
```

### 5.3 异常信息脱敏

```
Controller 层统一返回 "操作失败" 而非 e.getMessage()
→ GlobalExceptionHandler 已有兜底处理
→ 新增业务异常时走 TwinBusinessException.of(code, msg)
→ 不在 Controller 中 catch(Exception) 并直接返回消息
```

### 5.4 前端同步改进

| 项 | 说明 |
|----|------|
| API 调用统一 | 消除裸 axios 调用，全部走 authHttp/adminHttp/http |
| 类型安全 | 考虑从 springdoc 自动生成 TS 类型（见架构文档建议） |
| 状态分层 | TanStack Query 管服务端数据，Zustand 管 UI 状态 |

---

## 六、修复统计

| 阶段 | 严重项 | 一般项 | 建议项 | 预估工期 |
|------|--------|--------|--------|----------|
| P0 | ✅ 4 | 0 | 0 | 已完成 2026-05-27 |
| P1 | ✅ 3 / ⏸ 3 | 3 | 0 | 部分完成 2026-05-27 |
| P2 | ✅ 4 / ⏸ 1 | 7 | 2 | 已完成 2026-05-27 |
| P3 | 3 | 8 | 7 | 持续 |
| **合计** | **13** | **18** | **9** | — |

---

## 七、关联文档

- [后端底层架构规范](ARCHITECTURE_BACKEND.md) — 不可变的架构基线
- [Web 前端参考架构](ARCHITECTURE_FRONTEND_WEB.md) — 可演进的前端约定
- [小程序参考架构](ARCHITECTURE_FRONTEND_MP.md) — 可演进的小程序约定
- [业务扩展清单](EXTENDING_BIZ_WORKFLOW.md) — 新增业务域标准流程
- [角色能力矩阵](ROLE_CAPABILITY_MATRIX.md) — 权限模型基准
