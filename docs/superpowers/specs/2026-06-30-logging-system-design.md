# 服务器日志系统重构设计

> 状态：已确认 | 日期：2026-06-30

## 一、背景与目标

当前 Spring Boot 启动日志杂乱无章：~100 行输出中混合了 DDL 执行报告、时区迁移通知、SocketIO 状态、Hikari 连接池信息、MyBatis Bean 冲突警告等。正常启动的成功日志淹没了真正的异常信号。

### 目标

1. **沉默启动**：成功完全静默，只有 WARN/ERROR 才在控制台输出
2. **赛博朋克动画**：启动阶段用 Unicode 框线 + 霓虹色 + 旋转指示器 + 进度条呈现
3. **日志注册体系**：注解 + 编程 API + YAML 配置三位一体，新模块自动纳入管理
4. **多环境适配**：local(动画+颜色) / prod(纯文本+文件滚动) / docker(stdout JSON)
5. **调试通道分离**：控制台看问题，Web 管理端看详情，文件留审计

## 二、架构总览

```
common/logging/
├── banner/
│   ├── StartupBanner.java          ← 动画引擎核心
│   ├── PhaseFrame.java             ← Unicode 框线渲染
│   ├── ProgressBar.java            ← 进度条组件
│   ├── Spinner.java                ← ⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏ 旋转
│   └── CyberColor.java             ← 霓虹色板 (ANSI 256)
├── registry/
│   ├── LogCategoryRegistry.java    ← 分类注册中心
│   └── LogCategory.java            ← 日志分类实体
├── annotation/
│   ├── StartupPhase.java           ← 标注启动阶段
│   └── LogCategoryAnno.java        ← 标注日志分类
├── appender/
│   ├── CyberConsoleAppender.java   ← 赛博朋克控制台
│   ├── StructuredFileAppender.java  ← 结构化 JSON 文件
│   └── PlainConsoleAppender.java   ← 纯文本控制台 (prod/docker)
├── model/
│   ├── StartupRunner.java          ← 替代 ApplicationRunner
│   ├── StartupContext.java         ← 启动上下文
│   ├── StartupResult.java          ← 启动结果
│   └── PhaseResult.java            ← 阶段结果
└── config/
    ├── LoggingProfileConfig.java   ← profile 驱动配置
    └── StartupPhaseRunner.java     ← 扫描 @StartupPhase 自动调度
```

## 三、启动动画设计

### 3.1 完整启动效果

```
                    ╔══════════════════════════════════╗
                    ║     🧬 TWIN SYSTEM v2.0  🧬      ║
                    ║   Neuro-Synced Infrastructure   ║
                    ╚══════════════════════════════════╝

  ◴ 数据库迁移 ...................... ⠋ 3/28 脚本
  ✓ 数据库迁移 ...................... 28/28 就绪 (1.2s)

  ✓ JWT 密钥 ........................ Ed25519 已加载

  ◴ Socket.IO ....................... ⠋ 绑定端口
  ✓ Socket.IO ....................... :9092 已监听

  ◴ 人脸模型 ........................ ⠋ 加载 ultranet.zip
  ✓ 人脸模型 ........................ 2 模型 就绪 (3.8s)

  ┌─────────────────────────────────────────────────────┐
  │ ✓  TWIN SYSTEM READY  ·  :8081  ·  6.4s              │
  │    http://localhost:5173  ·  profile: local           │
  └─────────────────────────────────────────────────────┘
```

### 3.2 关键规则

| 规则 | 说明 |
|------|------|
| 输出目标 | stderr（stdout 留给管道/重定向） |
| 成功静默 | 只有阶段摘要行 + ✓，无内部细节 |
| 失败膨胀 | 自动展开子步骤 + ✗ + 异常摘要 |
| 旋转指示器 | `⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏`，80ms/帧 |
| 进度条 | 子步骤可计数时显示 `[████░░]` |
| 霓虹色板 | 青#00FFFF 标题、绿#00FF41 成功、品红#FF00FF 进度、红#FF0040 失败 |
| TTY 检测 | 非 TTY 自动剥离动画和颜色，输出纯文本 ✓/✗ |

## 四、日志注册体系

### 4.1 注解驱动

```java
@StartupPhase(name = "数据库迁移", order = 2, subtasks = true)
@Component
public class EmbeddedTwinSystemCoreDdlBootstrap implements StartupRunner {
    @Override
    public StartupResult run(StartupContext ctx) {
        ctx.subtask("login-branding", () -> runScript("db/bootstrap-login-branding..."));
        ctx.subtask("admin-template", () -> runScript("db/bootstrap-admin-file-template..."));
        return StartupResult.success("28/28 就绪");
    }
}
```

### 4.2 编程 API

```java
StartupBanner.phase("JWT 密钥")
    .run(() -> PhaseResult.ok("Ed25519 已加载"));
```

### 4.3 YAML 配置

```yaml
twin.logging.startup.phases:
  - name: "数据库迁移"
    class: com.example.demo.common.bootstrap.EmbeddedTwinSystemCoreDdlBootstrap
    order: 2
    enabled: true
```

### 4.4 日志分类注册

```java
@LogCategoryAnno(key = "face", loggerName = "com.example.demo.modules.face",
    description = "人脸识别模块", defaultLevel = WARN)
```

替代 `DebugToggleService.LOG_CATEGORIES` 硬编码，启动时自动扫描注册到 DB + Logback。

### 4.5 核心接口契约

```java
interface StartupRunner {
    StartupResult run(StartupContext ctx);
}
interface StartupContext {
    void subtask(String label, Runnable task);
    void progress(int current, int total, String detail);
    void warn(String message);
}
record StartupResult(boolean success, String summary, Throwable error) {
    static StartupResult success(String msg) { ... }
    static StartupResult failed(String msg, Throwable e) { ... }
}
record PhaseResult(boolean ok, String message) {
    static PhaseResult ok(String msg) { ... }
    static PhaseResult fail(String msg) { ... }
}
```

## 五、多环境适配

### 5.1 Profile → Appender 映射

| 维度 | local | prod | docker |
|------|-------|------|--------|
| 输出流 | stderr | stderr | stdout |
| 动画/颜色 | ✅ 全开 | ❌ 纯文本 | ❌ 纯文本 |
| 最小级别 | WARN | WARN | INFO |
| 文件日志 | ❌ | ✅ /var/log/twin/ | ❌ |
| 文件格式 | - | JSON 结构化 | - |
| 滚动策略 | - | 按天 + 50MB 上限 | - |
| 保留天数 | - | 30 天 | - |
| journald | ❌ | 可选 | ❌ |
| RingBuffer | ✅ | ✅ | ✅ |

### 5.2 文件目录结构

```
/var/log/twin/
├── twin.log              ← 当前
├── twin.2026-06-29.log   ← 昨天
├── twin.2026-06-28.log.gz ← 压缩（30天保留）
├── error.log             ← ERROR 单独分离
└── trace/                ← DEBUG/TRACE（默认关闭）
```

### 5.3 环境切换

```bash
# 开发：动画 + 颜色
java -jar demo.jar --spring.profiles.active=local

# 生产：纯文本 + 文件滚动
java -jar demo.jar --spring.profiles.active=prod

# 容器：stdout JSON 一行
java -jar demo.jar --spring.profiles.active=docker
```

## 六、运行时日志策略

### 三级漏斗

```
所有日志 → 启动阶段(成功则静默) / 运行时:
  ERROR/WARN → stderr（立即可见）
  INFO/DEBUG  → 文件 + RingBuffer（按需查看）
```

### 调试模式

```bash
java -jar demo.jar --twin.logging.startup.verbose=true  # 恢复详细启动日志
export TWIN_STARTUP_VERBOSE=true                         # 环境变量方式
```

### 运行时查询

```bash
# Web 管理端
curl http://localhost:8081/api/admin/logging/recent?count=200&minLevel=DEBUG

# Linux 文件
tail -f /var/log/twin/twin.log | grep "人脸"

# journald
journalctl -u twin --since today -p debug
```

## 七、迁移清单

### 新建文件 (~14 个)

```
common/logging/banner/StartupBanner.java
common/logging/banner/PhaseFrame.java
common/logging/banner/ProgressBar.java
common/logging/banner/Spinner.java
common/logging/banner/CyberColor.java
common/logging/registry/LogCategoryRegistry.java
common/logging/registry/LogCategory.java
common/logging/annotation/StartupPhase.java
common/logging/annotation/LogCategoryAnno.java
common/logging/model/StartupRunner.java
common/logging/model/StartupContext.java
common/logging/model/StartupResult.java
common/logging/model/PhaseResult.java
common/logging/config/StartupPhaseRunner.java
```

### 修改文件 (~6 个)

```
logback-spring.xml              ← 完整重写
application.properties          ← 加 logging 配置项
EmbeddedTwinSystemCoreDdlBootstrap.java  ← 改 implements StartupRunner
TimezoneWallClockFinalFix.java   ← 改 implements StartupRunner
SocketIOStartupRunner.java      ← 改 implements StartupRunner
BrowserAutoOpener.java          ← 改 implements StartupRunner
LoggingConfigSeed.java          ← 改 @LogCategoryAnno 扫描
DebugToggleService.java         ← 从 Registry 拉分类列表
CommonAsyncService.java         ← 移除 startup log 语句
TwinViolationSchemaMigrator.java ← 改为 StartupRunner subtask
```

### 移除/降级

- 所有 `[embedded-ddl]` log.info/warn → 改为 subtask 回调
- 框架噪音 logger（Hikari、MyBatis、Spring BeanPostProcessor）→ logback OFF
- Mapper 重复定义 → 修根因（MyBatis 扫描路径重复），而非抑制警告
