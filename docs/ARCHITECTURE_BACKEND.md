# Twin System 后端底层架构规范

> **定位**：本文档定义后端不可变的基础架构约定。所有模块开发必须遵循本文档，偏差即视为架构违规。
>
> **适用版本**：Spring Boot 3.5 + JDK 17 + MyBatis 3.x
>
> **最后更新**：2026-05-27

---

## 一、技术栈基线

| 组件 | 选型 | 备注 |
|------|------|------|
| 应用框架 | Spring Boot 3.5 | 非 Spring Cloud，单应用部署 |
| JDK | 17 | LTS，禁止使用更高版本语法特性 |
| ORM | MyBatis 3.0.3 (spring-boot-starter) | XML Mapper，非 MyBatis-Plus |
| 数据库 | MySQL 8.0 | 单库 `twin_system`，HikariCP 连接池 |
| JSON | fastjson2 2.0.40 | 统一序列化/反序列化 |
| API 文档 | springdoc-openapi 2.6.0 | 注解驱动，非手写 YAML |
| 实时推送 | netty-socketio 2.0.3 | 端口 9092，与 HTTP 8080 分离 |
| 密码加密 | spring-security-crypto BCrypt | 仅使用 PasswordEncoder，不引入 Spring Security 全套 |
| 构建 | Maven + spring-boot-maven-plugin | 单模块 POM |

---

## 二、包结构约定

```
com.example.demo
├── TwinSystemApplication.java       ← 启动类（@MapperScan, @EnableScheduling, @EnableAsync）
├── common/                           ← 全局基础设施，禁止放业务逻辑
│   ├── config/                       ← @Configuration 类（WebMvc、SocketIO、OpenAPI、Async）
│   ├── service/                      ← 全局 @Service（AuthContextService）
│   ├── dto/                          ← 全局 DTO（Result<T>）
│   ├── enums/                        ← 全局枚举（RoleEnum）
│   ├── exception/                    ← 全局异常（TwinBusinessException、ErrorCodeConstants）
│   ├── web/                          ← @ControllerAdvice、遗留路径兼容
│   └── component/                    ← 启动 Runner、通用组件
├── config/                           ← 外部客户端配置（AsyncConfig、AroRestTemplateConfig）
└── modules/                          ← 业务模块（每个模块一个子包）
    └── {module}/
        ├── controller/               ← @RestController
        ├── service/                  ← @Service（业务逻辑）
        ├── mapper/                   ← @Mapper 接口
        ├── entity/                   ← @Data POJO（DB 行映射）
        └── dto/                      ← 请求/响应 DTO
```

**强制规则**：
- `common/` 包不得依赖任何 `modules/` 下的类（单向依赖）。
- 模块间调用通过 `@Service` 注入，禁止跨模块直接 new 对象或调 Mapper。
- 每个模块自包含，`controller` → `service` → `mapper` + `entity` 调用链不跨越模块边界（共享的 entity 提取到 common）。

---

## 三、Controller 层规范

### 3.1 类级注解模板

```java
@RestController
@RequestMapping("/api/{module}")       // ← 全小写、短横线分隔
@CrossOrigin("*")
@Tag(name = "{模块中文名}", description = "{简述}")
public class XxxController {

    private final XxxService xxxService;
    private final AuthContextService authContextService;

    // 构造函数注入（Lombok @AllArgsConstructor 亦可）
    public XxxController(XxxService xxxService, AuthContextService authContextService) {
        this.xxxService = xxxService;
        this.authContextService = authContextService;
    }
}
```

### 3.2 方法级注解模板

```java
@GetMapping("/{id}")
@Operation(summary = "查询单条记录")
public Result<XxxView> getById(@PathVariable String id) {
    return Result.success(xxxService.findById(id));
}

@PostMapping
@Operation(summary = "创建记录")
public Result<?> create(@RequestBody @Valid CreateXxxRequest request) {
    User me = authContextService.resolveUserFromBearer(request.getHeader("Authorization"));
    xxxService.create(request, me);
    return Result.success();
}

@GetMapping("/list")
@Operation(summary = "分页列表")
public Result<PageResult<XxxView>> list(@RequestParam(defaultValue = "1") int page,
                                         @RequestParam(defaultValue = "20") int size) {
    return Result.success(xxxService.listPage(page, size));
}
```

### 3.3 强制规则

| 规则 | 说明 |
|------|------|
| 返回类型必须为 `Result<T>` | 特殊情况可用 `ResponseEntity<?>`，需评审 |
| 接口路径 `/api/{module}/...` | 不暴露 `/api/v1/` 之外的版本号（内部约定 v1） |
| 获取当前用户走 `AuthContextService` | 从 `Authorization: Bearer <token>` 解析，不自己查 token |
| 参数校验用 `@Valid` + JSR-303 | 复杂校验在 Service 层抛 `TwinBusinessException` |
| 每个 public 方法加 `@Operation` | 为 springdoc 生成准确 API 文档 |
| 不使用 `@Autowired` 字段注入 | 统一构造函数注入 |

---

## 四、Service 层规范

### 4.1 类模板

```java
@Service
public class XxxService {
    private final XxxMapper xxxMapper;
    private final NotificationService notificationService;  // 跨模块依赖

    public XxxService(XxxMapper xxxMapper, NotificationService notificationService) {
        this.xxxMapper = xxxMapper;
        this.notificationService = notificationService;
    }

    // 写操作加事务（仅涉及多表/多语句时）
    @Transactional
    public void create(CreateXxxRequest req, User operator) {
        // 1. 业务校验
        // 2. 落库
        // 3. 发通知
        notificationService.publish(...);
    }

    // 读操作不加 @Transactional
    public XxxView findById(String id) {
        XxxEntity entity = xxxMapper.findById(id);
        if (entity == null) {
            throw TwinBusinessException.of(ErrorCodeConstants.NOT_FOUND, "记录不存在");
        }
        return toView(entity);
    }
}
```

### 4.2 强制规则

| 规则 | 说明 |
|------|------|
| 构造函数注入 | 禁止 @Autowired 字段注入 |
| `@Transactional` 仅用于写操作 | 读方法不加事务，减少数据库开销 |
| 写操作返回 void/int | 不返回 entity 对象（避免 detached 对象隐患） |
| 业务异常统一用 `TwinBusinessException` | 带业务错误码，让 GlobalExceptionHandler 统一处理 |
| 跨模块通知走 `NotificationService.publish()` | 不在 Service 里直接调其他模块 Mapper |

---

## 五、Mapper 层规范

### 5.1 接口模板

```java
@Mapper
public interface XxxMapper {
    XxxEntity findById(@Param("id") String id);
    List<XxxEntity> listByCondition(@Param("status") String status,
                                     @Param("offset") int offset,
                                     @Param("limit") int limit);
    int insert(XxxEntity entity);
    int update(XxxEntity entity);
    int deleteById(@Param("id") String id);
    int countByCondition(@Param("status") String status);
}
```

### 5.2 XML 模板

```xml
<?xml version="1.0" encoding="UTF-8" ?>
<!DOCTYPE mapper PUBLIC "-//mybatis.org//DTD Mapper 3.0//EN"
        "http://mybatis.org/dtd/mybatis-3-mapper.dtd">
<mapper namespace="com.example.demo.modules.{module}.mapper.XxxMapper">

    <resultMap id="BaseResultMap" type="com.example.demo.modules.{module}.entity.XxxEntity">
        <id property="id" column="id"/>
        <result property="createTime" column="create_time"/>
        <!-- ... 所有字段映射 ... -->
    </resultMap>

    <sql id="Base_Column_List">
        id, column_name, create_time, update_time
    </sql>

    <select id="findById" resultMap="BaseResultMap">
        SELECT <include refid="Base_Column_List"/>
        FROM table_name
        WHERE id = #{id}
        LIMIT 1
    </select>

    <insert id="insert" parameterType="com.example.demo.modules.{module}.entity.XxxEntity">
        INSERT INTO table_name(column_name, create_time)
        VALUES (#{columnName}, NOW())
    </insert>

    <update id="update">
        UPDATE table_name
        SET column_name = #{columnName},
            update_time = NOW()
        WHERE id = #{id}
    </update>
</mapper>
```

### 5.3 强制规则

| 规则 | 说明 |
|------|------|
| 接口用 `@Mapper` 注解 | 不要用 `@Repository` |
| 所有参数用 `@Param` | 包括单个参数 |
| XML 用 `<resultMap>` 映射 | 不依赖 `map-underscore-to-camel-case` 全局配置（它只兜底） |
| 写 `<sql>` 复用片段 | 每个 XML 至少定义一个 `Base_Column_List` |
| 单行查询加 `LIMIT 1` | 防止全表扫描 |
| `update_time = NOW()` | 每个 UPDATE 语句必备 |
| 动态 SQL 用 `<if>` 不用 `<choose>` | 除非多分支互斥 |
| XML 路径 `classpath:mapper/**/*.xml` | 由 `mybatis.mapper-locations` 统一指定 |

### 5.4 MapperScan 配置

启动类 `TwinSystemApplication` 上配置：

```java
@MapperScan({"com.example.demo.modules.*.mapper", "com.example.demo.modules.accessfusion.mapper"})
```

新模块的 mapper 包放在 `com.example.demo.modules.{module}.mapper` 即可被自动扫描。注意：`accessfusion` 因包路径非标准通配符匹配，需单独声明。

---

## 六、Entity 规范

### 6.1 模板

```java
package com.example.demo.modules.{module}.entity;

import lombok.Data;
import java.time.LocalDateTime;

@Data
public class XxxEntity {
    private String id;          // 业务主键（UUID 或有意义的字符串）
    private String name;
    private String status;
    private Integer deleted;    // 软删除标记：0=正常, 1=已删
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
    private LocalDateTime deletedTime;
    private String deletedBy;
    private LocalDateTime purgeAfterTime;  // 软删除后可物理清除时间
}
```

### 6.2 强制规则

| 规则 | 说明 |
|------|------|
| 必须使用 `@Data` (Lombok) | 不手写 getter/setter/toString |
| 不使用 JPA 注解 | `@Entity`、`@Table`、`@Column` 均是 JPA 概念，本项目不存在 |
| 字段驼峰命名 | 数据库列蛇形命名，映射在 XML `<resultMap>` 中完成 |
| 时间类型用 `LocalDateTime` | 不用 `Date`、`Timestamp` |
| 主键类型约定 | 人员/业务单据用 `String id`（UUID），系统内部表可用 `Long id`（自增） |
| 软删除字段三件套 | `deleted` + `deletedTime` + `purgeAfterTime`（需要回收站功能的表必须包含） |

---

## 七、DTO 规范

### 7.1 Request DTO

```java
@Data
public class CreateXxxRequest {
    @NotBlank(message = "名称不能为空")
    private String name;

    private String description;
    private List<String> imageUrls;  // 前端传 JSON 数组，fastjson 自动解析
}
```

### 7.2 Response / View DTO

```java
@Data
public class XxxView {
    private String id;
    private String name;
    private String status;
    private String applicantName;    // 来自关联查询的冗余字段
    private LocalDateTime createTime;
}
```

### 7.3 命名约定

| 后缀 | 用途 | 示例 |
|------|------|------|
| `Request` | 请求体 DTO | `CreateRepairOrderRequest` |
| `View` | 响应/列表 DTO | `RepairOrderView` |
| `Data` | 嵌套在 Result 中的核心数据 | `AuthData` |
| `Info` | 轻量信息载体 | `AuthUserInfo` |

---

## 八、统一响应体 Result\<T\>

### 8.1 结构

```json
{
  "code": 200,
  "success": true,
  "message": "操作成功",
  "data": { ... }
}
```

### 8.2 构造方式

```java
// 成功 — 无数据
Result.success();

// 成功 — 带数据
Result.success(data);

// 成功 — 带提示文案
Result.success(data, "导入完成，共 120 条");

// 业务失败 — 带错误码
Result.fail(ErrorCodeConstants.BAD_REQUEST, "房间名称不能重复");

// 通用失败 — 500
Result.error("操作失败");
```

### 8.3 强制规则

- 前端判断逻辑统一为 `response.data.code === 200` 或 `response.data.success === true`。
- 后端 Controller 永远不返回裸 `Result` 之外的 JSON。
- 错误码使用 `ErrorCodeConstants` 常量，禁止手写数字。

---

## 九、认证与授权模型

### 9.1 Token 机制

```
登录 → 后端生成 "jwt_mock_token_{userId}" → 前端存 storage → 每次请求带 Authorization: Bearer jwt_mock_token_{userId}
解析 → AuthContextService 截取 userId → UserMapper.findById(userId) → 返回 User 对象
```

**当前为模拟 JWT**（无签名/无过期），生产环境需替换为真正的 JWT 或 Session 机制。

### 9.2 两层鉴权

| 层级 | 组件 | 作用 |
|------|------|------|
| 路径拦截 | `AdminAuthInterceptor` | 拦截 `/api/admin/**`，要求 `role.level >= STAFF(2)` |
| API 鉴权 | `CapabilityPolicyService.requireXxx()` | 业务操作级鉴权，检查 `biz_capability_policy` 表 |
| 页面可见 | `page_permission_item` 表 | 前端路由显隐，小程序入口可见性 |

### 9.3 角色体系

```
STUDENT(1) < STAFF(2) < SENIOR(3) < ADMIN(4) < SUPER_ADMIN(5) < PLATFORM_OWNER(6)
```

- 鉴权以 `level` 数字比较为准：`user.getRole().getLevel() >= RoleEnum.ADMIN.getLevel()`
- 角色名以 `EnumTypeHandler` 存入数据库（存 `SUPER_ADMIN` 字符串，不存数字）

---

## 十、异常处理体系

### 10.1 异常层次

```
RuntimeException
└── TwinBusinessException  (code + message)
    └── 各模块可定义子类（但当前直接用静态工厂 TwinBusinessException.of(code, msg)）
```

### 10.2 全局处理器

`GlobalExceptionHandler` (`@RestControllerAdvice`) 处理：

| 异常类型 | HTTP 语义 | 前端看到的 code |
|----------|-----------|----------------|
| `TwinBusinessException` | 业务失败 | `ex.getCode()` |
| `MethodArgumentNotValidException` / `BindException` | 参数校验失败 | 400 |
| `IllegalArgumentException` | 非法参数 | 400 |
| `HttpRequestMethodNotSupportedException` | 方法不允许 | 405 |
| `AsyncRequestTimeoutException` | SSE 超时 | 503 |
| `NoResourceFoundException` | 资源不存在 | 404 |
| `Exception`（兜底） | 未知异常 | 500 |

### 10.3 强制规则

- 业务层抛异常只用 `TwinBusinessException.of(code, msg)`。
- 不在 Controller 里 try-catch 业务异常（交给全局处理器）。
- 未知异常兜底文案为"服务繁忙，请稍后重试"，不暴露堆栈给前端。

---

## 十一、配置与调度

### 11.1 配置源优先级

```
application.properties（内置默认值）
  → 数据库配置表（运行时热更新，如 site_config、twin_dahua_rule_config）
  → 环境变量（生产敏感信息，如 app.wincc.password）
```

### 11.2 定时任务

```java
@Component
public class XxxScheduler {
    @Scheduled(fixedDelayString = "${app.xxx.interval-ms:60000}")
    public void runPeriodically() {
        // 业务逻辑
    }
}
```

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `spring.task.scheduling.pool.size` | 8 | 主调度线程池 |
| `app.wincc.scheduler.pool-size` | 1 | WinCC 遥测独立线程池 |
| `app.wincc.refresh-interval-ms` | 60000 | 遥测快照刷新间隔 |

### 11.3 异步任务

```java
@Async("coreTaskExecutor")
public void doAsync(Runnable task) { ... }

@Async("heavyCalcExecutor")
public void doHeavyCalc(Runnable task) { ... }
```

两个线程池：`coreTaskExecutor` (4-10 线程) 和 `heavyCalcExecutor` (2-4 线程)，通过 `AsyncConfig` 配置。

---

## 十二、数据库约定

### 12.1 表命名

| 前缀/模式 | 含义 | 示例 |
|-----------|------|------|
| `sys_` | 系统核心表 | `sys_user`, `sys_notify_rule` |
| 无前缀（业务名） | 业务表 | `repair_order`, `purchase_order` |
| `access_` | 门禁清洗融合 | `access_raw_event`, `access_clean_*` |
| `telemetry_` | 遥测相关 | `telemetry_value_archive` |
| `twin_` | 孪生核心 | `twin_card_mapping`, `twin_dahua_rule_config` |

### 12.2 字段约定

- 主键：`id`（VARCHAR 或 BIGINT），单列主键。
- 时间戳：`create_time`、`update_time`、`delete_time`（全部 `DATETIME`，MySQL NOW()）。
- 软删除：`deleted INT DEFAULT 0`。
- JSON 存储：复杂嵌套结构用 `TEXT` 列存 JSON 字符串（如 `request_images_json`）。
- 编码：全部 `utf8mb4` + `utf8mb4_unicode_ci`。

### 12.3 DDL 管理

```
src/main/resources/schema.sql              ← 权威建表语句
src/main/resources/db/bootstrap-*.sql      ← 启动时自动执行（由 app.schema.auto-ensure-embedded-core-ddl 控制）
scripts/*.ddl.sql                          ← 增量变更脚本（带时间戳，手动执行）
*SchemaMigrator                            ← 模块级 Java 迁移器（启动时检测并 ALTER）
```

---

## 十三、新模块接入 Checklist

新增一个业务域（如"设备巡检"）时，严格按以下步骤：

| # | 步骤 | 文件/位置 |
|---|------|-----------|
| 1 | 在 `BizDomains` 中定义域常量 | `modules/policy/BizDomains.java` |
| 2 | 创建包 `modules.inspection/` | controller, service, mapper, entity, dto |
| 3 | 编写 Entity + Mapper 接口 + XML | `modules/inspection/entity/`, `mapper/`, `src/main/resources/mapper/` |
| 4 | 编写 Service + Controller | 遵循第三、四章模板 |
| 5 | 在 `biz_capability_policy` 插入策略行 | 管理端「业务能力策略」或 SQL |
| 6 | 在 `sys_notify_rule` 配置通知规则 | 管理端或 SQL |
| 7 | 在 `page_permission_item` 登记页面 | 管理端「页面权限」自动发现或 SQL |
| 8 | 实现 `PendingBadgeContributor` | 如需待办角标 |
| 9 | 实现 `InboxFeedContributor` | 如需聚合收件箱 |
| 10 | 编写 SQL DDL，加入 `scripts/` | 带日期前缀，如 `20260527_inspection.ddl.sql` |

---

## 十四、禁止事项

1. **禁止在 Controller 中写业务逻辑** — 只做参数接收、鉴权、调用 Service、返回 Result。
2. **禁止在 Mapper 接口中写实现** — 只用接口 + XML，不用 `@Select` / `@Insert` 注解 SQL。
3. **禁止跨模块直接调 Mapper** — 必须通过目标模块的 Service 暴露的方法。
4. **禁止返回裸 entity** — Controller 返回的必须是 DTO/View，不是数据库实体。
5. **禁止在 common/ 包依赖 modules/** — 全局基础设施不感知业务模块。
6. **禁止引入 Spring Security 完整框架** — 当前轻量鉴权足够，引入全套 Security 会打破现有过滤器体系。
7. **禁止使用 JPA / Hibernate** — 项目使用 MyBatis，混用两套 ORM 是隐患。
8. **禁止硬编码业务规则** — `biz_capability_policy` 表已存在，新业务域必须配置化，不在代码里写 `if (role == ADMIN)` 分支。
