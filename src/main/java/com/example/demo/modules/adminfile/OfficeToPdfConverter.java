package com.example.demo.modules.adminfile;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.TimeUnit;

/**
 * 用 LibreOffice headless 把 Office 文档转成 PDF。
 *
 * <p>为什么必须转：工位页是靠浏览器渲染的，只能吃 PDF 和图片。Word 渲染不了，
 * 硬派给工位只会卡住。转成 PDF 之后，**打印链路一行都不用改**。
 *
 * <p>为什么在「上传时」转：成本只付一次，而且转坏了当场就能看见，不用等打印时才暴露。
 *
 * <p><b>中文字体是这条路最容易翻车的地方</b>：转换机器上没装中文的话，字体会被
 * 静默替换，行宽和分页跟着变 —— 表现不是报错，是排版悄悄跑掉。
 * Linux 上装 {@code fonts-noto-cjk} 或 {@code wqy-zenhei-fonts}；
 * 本机验证过 7 个中文字体都会内嵌进产出的 PDF，下游不再依赖系统字体。
 *
 * <p>临时文件一律用 **ASCII 文件名**：中文文件名进命令行参数会被按本地代码页转换，
 * 在 Windows 上实测会毁成问号（同一个坑在 curl 上踩过）。
 */
@Service
public class OfficeToPdfConverter {

    private static final Logger log = LoggerFactory.getLogger(OfficeToPdfConverter.class);

    /** 能转的扩展名。别加图片/PDF —— 那些本来就能直接打，转一遍是白费 */
    private static final Set<String> OFFICE_EXT = Set.of(
            "doc", "docx", "xls", "xlsx", "ppt", "pptx", "odt", "ods", "odp", "rtf");

    private final Path sofficePath;
    private final long timeoutSeconds;

    public OfficeToPdfConverter(
            @Value("${app.office.soffice-path:}") String configuredPath,
            @Value("${app.office.convert-timeout-seconds:120}") long timeoutSeconds) {
        this.sofficePath = resolveSoffice(configuredPath);
        this.timeoutSeconds = Math.max(10, timeoutSeconds);
    }

    public static boolean isOfficeExt(String ext) {
        return ext != null && OFFICE_EXT.contains(ext.toLowerCase(Locale.ROOT));
    }

    /**
     * 按操作系统猜 LibreOffice 的位置；配置项优先。
     * 猜错不抛异常 —— 由第一次转换时给出明确的报错。
     */
    private static Path resolveSoffice(String configured) {
        if (configured != null && !configured.isBlank()) {
            return Path.of(configured.trim());
        }
        List<String> candidates = new ArrayList<>();
        if (isWindows()) {
            candidates.add("C:/Program Files/LibreOffice/program/soffice.exe");
            candidates.add("C:/Program Files (x86)/LibreOffice/program/soffice.exe");
        } else {
            candidates.add("/usr/bin/soffice");
            candidates.add("/usr/local/bin/soffice");
            candidates.add("/opt/libreoffice/program/soffice");
        }
        for (String c : candidates) {
            if (Files.isRegularFile(Path.of(c))) return Path.of(c);
        }
        // 交给 PATH 解析（Linux 上一般都能找到）
        return Path.of("soffice");
    }

    private static boolean isWindows() {
        return System.getProperty("os.name", "").toLowerCase(Locale.ROOT).contains("win");
    }

    /** 转换。失败时抛带明确原因的 IOException —— 不做静默降级。 */
    public byte[] convert(byte[] source, String ext) throws IOException {
        Path work = Files.createTempDirectory("officetopdf-");
        try {
            // ASCII 文件名，见类注释
            Path in = work.resolve("src." + ext.toLowerCase(Locale.ROOT));
            Files.write(in, source);
            Path outDir = work.resolve("out");
            Files.createDirectories(outDir);

            List<String> cmd = new ArrayList<>();
            cmd.add(sofficePath.toString());
            cmd.add("--headless");
            cmd.add("--norestore");
            // 用一个独立的用户配置目录：并行调用时共用默认 profile 会互相锁死
            cmd.add("-env:UserInstallation=file:///" + work.resolve("profile").toAbsolutePath()
                    .toString().replace('\\', '/'));
            cmd.add("--convert-to");
            cmd.add("pdf");
            cmd.add("--outdir");
            cmd.add(outDir.toAbsolutePath().toString());
            cmd.add(in.toAbsolutePath().toString());

            ProcessBuilder pb = new ProcessBuilder(cmd);
            pb.redirectErrorStream(true);
            Process proc = pb.start();
            // 必须把输出读掉，否则缓冲区满了子进程会卡住
            String output = new String(proc.getInputStream().readAllBytes());

            if (!proc.waitFor(timeoutSeconds, TimeUnit.SECONDS)) {
                proc.destroyForcibly();
                throw new IOException("转换超时（" + timeoutSeconds + " 秒），文档可能过于复杂");
            }
            if (proc.exitValue() != 0) {
                throw new IOException("转换失败（soffice 退出码 " + proc.exitValue() + "）：" + output.trim());
            }

            Path produced = outDir.resolve("src.pdf");
            if (!Files.isRegularFile(produced)) {
                throw new IOException("转换没有产出 PDF：" + output.trim());
            }
            byte[] pdf = Files.readAllBytes(produced);
            if (pdf.length == 0) {
                throw new IOException("转换产出了空文件");
            }
            return pdf;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IOException("转换被中断");
        } finally {
            deleteRecursively(work);
        }
    }

    private static void deleteRecursively(Path dir) {
        try (var walk = Files.walk(dir)) {
            walk.sorted((a, b) -> b.getNameCount() - a.getNameCount())
                    .forEach(p -> {
                        try {
                            Files.deleteIfExists(p);
                        } catch (IOException ignored) {
                            // best-effort
                        }
                    });
        } catch (IOException e) {
            log.warn("[office-convert] 临时目录清理失败 {}: {}", dir, e.getMessage());
        }
    }

    /** 给「上传时立刻给出明确报错」用的可用性判断。 */
    public boolean isAvailable() {
        if (sofficePath.isAbsolute()) return new File(sofficePath.toString()).isFile();
        // 非绝对路径 = 指望 PATH，这里没法可靠判断，交给实际调用
        return true;
    }
}
