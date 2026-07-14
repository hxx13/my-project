# 启动日志乱码修复 + 动画增强

- **日期**: 2026-07-14
- **状态**: 设计已确认，待实施
- **分支**: `feature/miniprogram-telemetry-ui-20260704`

## 背景

当前 Windows 终端（cmd / PowerShell）默认编码为 GBK，而项目全栈使用 UTF-8，导致控制台中文乱码。同时现有的赛博朋克启动动画虽架构完备（9 类协同），但在标题表现力、旋转器流畅度、进度条精细度上相比 Linux CLI 生态（Claude Code、Docker Build、systemd）仍有差距。

## 目标

1. **乱码根除**：Windows / Linux 双平台终端中文正常显示
2. **大字标题**：JFiglet 动态渲染 ASCII 艺术标题
3. **动画升级**：Spinner 多套方案、ProgressBar 8 级平滑细分 + 分段着色、CyberColor 渐变工具

## 不改的

- 不引入重量级终端框架（JLine / Lanterna），保持零外部终端依赖
- 不碰 `StickyFooter`、`LoadingSpinner`、`CyberBox` — 它们已经够好
- 不动 logback-spring.xml
- 不动任何业务代码

---

## 第 1 层：乱码修复

### 根因

`CyberColor` 终端检测读取 `sun.stdout.encoding` 判断是否 UTF-8。Windows CMD/PowerShell 默认 GBK → 检测为 false → box-drawing 回退 ASCII，但日志字节本身是 UTF-8 → GBK 终端直接误解字节序列 → 乱码。

### 方案

JVM 启动参数声明 UTF-8，三处同步：

```
-Dfile.encoding=UTF-8 -Dsun.stdout.encoding=UTF-8 -Dsun.stderr.encoding=UTF-8
```

| 场景 | 位置 |
|------|------|
| IDEA 测试 | `Run → Edit Configurations → VM options` |
| Windows 生产 | 新建 `startup.bat`，`java` 命令加参数 |
| Linux 生产 | 新建 `startup.sh`，`java` 命令加参数 |

加上后 `CyberColor.hasUnicode()` 和 `hasAnsi()` 检测自动走通，Unicode box-drawing 和 ANSI 全彩全部开启。**不修改任何 Java 源码。**

### 验收

Windows Terminal 启动后不再出现 `ç  å¼€å§` 型乱码，中文正常渲染。

---

## 第 2 层：动画增强

### 2.1 JFiglet 动态大标题

#### 依赖

```xml
<dependency>
    <groupId>com.github.lalyos</groupId>
    <artifactId>jfiglet</artifactId>
    <version>2.3.1</version>
</dependency>
```

JFiglet 是一个轻量级 Java 实现的 FIGlet（Frank, Ian & Glenn's Letters）ASCII 艺术字渲染器，jar 体积约 46KB。支持 200+ 内置字体（standard、big、block、bubble、lean、mini、script、shadow、slant、small、smslant 等）。

#### 新增文件：`FigletRenderer.java`

包路径 `com.example.demo.common.logging.banner`。

单一职责：包装 JFiglet `AsciiArt` API，提供：

```java
// 渲染为行列表（供调用方决定如何画框）
List<String> renderLines(String text, String fontName);

// 快捷方法：使用默认字体 "big"
List<String> renderLines(String text);
```

字符转换：`\` → 双重转义后输出（FIGlet 用 `\` 做换行转义），`$` → `\$`。字体不存在时 fallback 到标准纯文本。

#### 修改：`StartupPhaseRunner.java`

`run()` 方法末尾，替换 `PhaseFrame.banner("TWIN SYSTEM v2.0", "Neuro-Synced Infrastructure")`：

```
// 旧
PhaseFrame.banner("TWIN SYSTEM v" + appVersion, "Neuro-Synced Infrastructure")

// 新
FigletRenderer.renderLines("TWIN")
→ 逐行包裹在 PhaseFrame 风格的 ╔═╗ 外框内
→ 底部一行显示版本号 + slogan
```

预期终端效果：

```
╔══════════════════════════════════╗
║   _____          _        ____   ║
║  |_   _|_      _(_)_ __  / ___|  ║
║    | | \ \ /\ / / | '_ \ \___ \  ║
║    | |  \ V  V /| | | | | ___) | ║
║    |_|   \_/\_/ |_|_| |_||____/  ║
║                                   ║
║        v2.0 · Neuro-Synced        ║
╚══════════════════════════════════╝
```

字体选 `"big"` — 原因是 FIGlet "big" 字体宽度适中，不会超出终端 80 列。

---

### 2.2 Spinner 升级

#### 修改：`Spinner.java`

| 项目 | 当前 | 升级后 |
|------|------|--------|
| 帧方案 | 硬编码 Braille `⠋-⠏` | 3 套枚举 + 构造参数选择 |
| ASCII 回退 | `\|/-` 4 帧 | 不变（ASCII 字符集限制） |
| 帧数 | 10 帧 | 视方案 5-10 帧 |

新增枚举 `SpinnerStyle`：

```java
public enum SpinnerStyle {
    CLASSIC,  // ⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏ (现有默认)
    DOTS,     // ⣾⣽⣻⢿⡿⣟⣯⣷ (更密集，Claude Code 风格)
    ARC       // ◜◝◞◟ (简洁弧形)
}
```

构造器保持无参 → 默认 `DOTS`。所有现有调用方（`StartupBanner`、`LoadingSpinner`）无需修改。

#### 修改：`StartupBanner.java`

`startAnimator()` 中 spinner 实例化时传入 `SpinnerStyle.DOTS`（或直接用默认）。

---

### 2.3 ProgressBar 升级

#### 修改：`ProgressBar.java`

**平滑填充**：用 Unicode 1/8 块字符 (`▏▎▍▌▋▊▉█`) 替代非满即空：

```java
// 旧：20 格整数填充
for (int i = 0; i < BAR_WIDTH; i++) {
    sb.append(i < filled ? FILL : EMPTY);
}

// 新：最后一格 8 级细分
int fullBlocks = filled / 8;
int remainder  = filled % 8; // 0-7
for (int i = 0; i < BAR_WIDTH; i++) {
    if (i < fullBlocks) sb.append('█');
    else if (i == fullBlocks && remainder > 0) sb.append(SUB_BLOCKS[remainder]);
    else sb.append('░');
}
```

**分段着色**：

| 进度 | 颜色 |
|------|------|
| 0-50% | `GREEN` (现有) |
| 50-80% | `AMBER` |
| 80-100% | `CYAN` |

**动态宽度**：保持现有 `BAR_WIDTH = 20`，不再动态调整（避免排版跳动）。每格代表 5%，加上 8 级细分后视觉精度从 5% 提升到 0.625%。

现有 API 签名不变：`render(int current, int total, String label)` → `String`。所有调用方无感知。

---

### 2.4 CyberColor 渐变工具

#### 修改：`CyberColor.java`

新增两个静态方法：

```java
/**
 * 在两种 24-bit 颜色间线性插值。
 * @param ratio 0.0 ~ 1.0
 * @return ANSI true-color 前缀字符串
 */
public static String blend(String fromHex, String toHex, double ratio);

/**
 * 用渐变色包裹单字符，供 ProgressBar 使用。
 */
public static String gradientChar(char c, double ratio);
```

`blend` 内部实现：`fromHex`/`toHex` 为 `"#RRGGBB"` 格式 → 逐通道 `(int)(from + (to - from) * ratio)` → 输出 `[38;2;R;G;Bm`。

进度条的 `AMBER` 色 (`#FFB000`) → `CYAN` 色 (`#00FFFF`) 之间平滑插值比硬切换更自然。

---

## 改动文件清单

| 文件 | 操作 | 风险等级 |
|------|------|---------|
| `pom.xml` | 加 `jfiglet` 依赖 | 极低 |
| `startup.bat` | 新建 | 无 |
| `startup.sh` | 新建 | 无 |
| `src/.../banner/FigletRenderer.java` | 新建 | 无 |
| `src/.../banner/Spinner.java` | 改 ~30 行 | 低 |
| `src/.../banner/ProgressBar.java` | 改 ~35 行 | 低 |
| `src/.../banner/CyberColor.java` | 加 2 方法 ~20 行 | 低 |
| `src/.../banner/StartupBanner.java` | 改 ~5 行（spinner 构造） | 低 |
| `src/.../config/StartupPhaseRunner.java` | 改 ~10 行（标题渲染） | 低 |

**零 API 不兼容、零数据库变更、零配置文件改动、零 logback 改动。**

---

## 验收标准

1. Windows Terminal 中 `mvn spring-boot:run` 或 `java -jar` 启动后中文正常显示
2. 启动画面出现 FIGlet 大字 "TWIN" 标题，青色 ╔═╗ 外框包裹
3. 旋转器默认使用 `⣾⣽⣻⢿⡿⣟⣯⣷` dots 方案
4. 进度条使用 1/8 块平滑填充 + 分段着色
5. Linux 环境 behavior 一致（验证 `startup.sh` 启动正常）

## 不实现

- JFiglet 字体运行时热切换（YAGNI：开发/运维不需要改字体）
- JLine / Lanterna 等重量级终端框架
- GUI 启动面板
- 启动火焰图/耗时分析（那是另一个独立需求）
