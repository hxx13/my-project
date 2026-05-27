# Twin System 技术改造路线

> **基准**：对照《阿里巴巴Java开发手册》1.4.0 + 项目架构分析
>
> **创建日期**：2026-05-27
>
> **状态**：初步路线，供后续补充执行

---

## 一、总览

本次扫描覆盖 `src/main/java` 全部后端代码、MyBatis XML、application.properties、logback-spring.xml、schema.sql，共发现 **16 项严重违规 + 18 项一般违规 + 9 项建议**。

按影响面分为四个改造阶段：

| 阶段 | 目标 | 周期 | 严重项 |
|------|------|------|--------|
| P0 紧急修复 | 消除安全硬编码 + 日志可用 | 1-2 天 | 4 项 |
| P1 短期改进 | 分层修复 + SQL 规范 + 跨域治理 | 1 周 | 6 项 |
| P2 中期优化 | 并发健壮性 + 异常体系 + 包名重构 | 2 周 | 3 项 |
| P3 长期演进 | 工程化完善 + 自动化检查 | 持续 | 3 项 |

---

## 二、P0 紧急修复（安全第一）

### 2.1 硬编码密码全部外置

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

### 2.2 SSL/TLS 全局绕过修复

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

### 2.3 日志体系修复

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

### 2.4 @CrossOrigin 统一治理

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

### 3.1 Controller 禁止直接调用 Mapper

**现状**：`AdminController` 直接注入 `AdminMapper`、`UserMapper`，绕过 Service 层。

| 文件 | 行号 | 违规次数 |
|------|------|----------|
| `modules/admin/controller/AdminController.java` | 40-41, 64, 86, 112, 148, 167, 256 | 8 次 |

**改造方案**：

```
1. 创建 AdminService，封装 AdminMapper + UserMapper 调用
2. AdminController 改为注入 AdminService
3. 提取 UserService（如果尚未独立），从 AuthService 剥离用户 CRUD
```

### 3.2 SELECT * 替换为显式字段列表

**现状**：约 15 个 Mapper XML 文件使用 `SELECT *`。

| 影响最大的文件 | 出现次数 |
|---------------|----------|
| `TwinDashboardMapper.xml` | 7 处 |
| `SupplyClaimOrderMapper.xml` | 12 处 |
| `AssetMapper.xml` | 8 处 |
| `RepairOrderMapper.xml` | 6 处 |

**改造方案**：

```
每个 XML 已定义了 <sql id="Base_Column_List">，将 SELECT * 替换为
SELECT <include refid="Base_Column_List"/>

优先修复：TwinDashboardMapper（看板查询频繁）、SupplyClaimOrderMapper（物资查询频繁）
```

### 3.3 时间字段 VARCHAR → DATETIME

**现状**：`schema.sql` 中多个核心表使用 `VARCHAR(30)` 存时间。

| 表 | 字段 |
|----|------|
| `aro_access_log` | `create_time` |
| `aro_animal_order` | `create_time`, `arrival_date` |
| `aro_personnel` | `update_time` |
| `twin_card_mapping` | `last_modified_time` |

**改造方案**：

```
1. 新建 DDL 脚本：
   ALTER TABLE aro_access_log MODIFY create_time DATETIME(3);
   -- 如果现有数据格式为 'yyyy-MM-dd HH:mm:ss'，MySQL 可自动转换
   -- 非标准格式需先清洗再 ALTER

2. 对应 Java Entity 字段保持 LocalDateTime
3. ARO 外部接口返回的字符串时间在 Service 层统一转换
```

### 3.4 跨模块依赖解耦

**现状**：`AroSyncTask` (modules/aro) 注入了 6 个 modules/twin 的 Mapper 和 Service。

**改造方案**：

```
方案 A（推荐，工作量小）：
  AroSyncTask 改为发布 Spring ApplicationEvent
  → twin 模块的 Listener 消费事件并执行各自的数据同步

方案 B（长期）：
  在 common/ 中定义接口 IAroSyncCallback
  → twin 模块实现该接口
  → aro 模块只依赖接口，不依赖具体实现
```

### 3.5 枚举命名规范化

| 当前 | 修改为 |
|------|--------|
| `RepairOrderStatus` | `RepairOrderStatusEnum` |
| `PurchaseOrderStatus` | `PurchaseOrderStatusEnum` |

### 3.6 is 前缀字段改名

| 文件 | 当前字段 | 建议改名 |
|------|---------|---------|
| `RepairOrder.java` | `isPublic` | `publicFlag` |
| `PurchaseOrder.java` | `isPublic` | `publicFlag` |
| `CreateRepairOrderRequest.java` | `isPublic` | `publicFlag` |
| `SupplyItemView.java` | `isNewItem` | `newItemFlag` |
| `AroSyncTask.java` | `isFirstRun` | `firstRun` |

---

## 四、P2 中期优化

### 4.1 定时任务防崩溃

在所有 @Scheduled 方法最外层加 try-catch(Throwable)：

```
涉及文件：
  - UnifiedScheduleDispatcher.java (每分钟)
  - TwinPredictionEngineService.java (每天凌晨2点)
  - TwinCardMappingService.java (每60秒)
  - DahuaSwingPullService.java (每15秒)
  - OrderRecyclePurgeTask.java (每30分钟)
```

### 4.2 线程池配置优化

| 配置项 | 当前值 | 建议值 | 原因 |
|--------|--------|--------|------|
| `spring.task.scheduling.pool.size` | 8 | 12 | 10+ 定时任务竞争 8 线程 |
| AsyncConfig coreTaskExecutor | 无 RejectedPolicy | 加 CallerRunsPolicy | 任务队列满时不丢失 |
| AsyncConfig heavyCalcExecutor | 无 RejectedPolicy | 加 CallerRunsPolicy | 同上 |

### 4.3 SimpleDateFormat → DateTimeFormatter

```
TwinPredictionEngineService.java:
  new SimpleDateFormat("yyyy-MM-dd HH:mm:ss").format(new Date())
  → DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss").format(LocalDateTime.now())
```

### 4.4 @EnableScheduling 重复声明

```
移除 AroSyncTask.java 上的 @EnableScheduling
→ 仅保留 TwinSystemApplication.java 上的声明
```

### 4.5 包名重构（慎重）

```
com.example.demo → com.shsmu.twin (或其他业务域名)
```

此项涉及全量文件移动 + import 重写 + Mapper XML namespace 更新 + MapperScan 路径更新。建议使用 IDE 的 Refactor → Rename 安全执行。放在 P2 是因为影响面大，需在测试环境充分验证。

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
| P0 | 4 | 0 | 0 | 1-2 天 |
| P1 | 6 | 3 | 0 | 1 周 |
| P2 | 3 | 7 | 2 | 2 周 |
| P3 | 3 | 8 | 7 | 持续 |
| **合计** | **16** | **18** | **9** | — |

---

## 七、关联文档

- [后端底层架构规范](ARCHITECTURE_BACKEND.md) — 不可变的架构基线
- [Web 前端参考架构](ARCHITECTURE_FRONTEND_WEB.md) — 可演进的前端约定
- [小程序参考架构](ARCHITECTURE_FRONTEND_MP.md) — 可演进的小程序约定
- [业务扩展清单](EXTENDING_BIZ_WORKFLOW.md) — 新增业务域标准流程
- [角色能力矩阵](ROLE_CAPABILITY_MATRIX.md) — 权限模型基准
