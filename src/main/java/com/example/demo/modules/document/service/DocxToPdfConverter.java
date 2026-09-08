package com.example.demo.modules.document.service;

import com.example.demo.common.exception.TwinBusinessException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

/**
 * docx → PDF：调用 LibreOffice 无头转换。
 * 单线程串行 + 每次独立 UserInstallation（多实例共用用户配置会互相锁死）。
 */
@Service
public class DocxToPdfConverter {

    private static final Logger log = LoggerFactory.getLogger(DocxToPdfConverter.class);

    private final String sofficePath;
    private final long timeoutMs;
    private final ExecutorService single = Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "docx-to-pdf");
        t.setDaemon(true);
        return t;
    });

    public DocxToPdfConverter(@Value("${app.document.soffice-path:soffice}") String sofficePath,
                              @Value("${app.document.convert-timeout-ms:60000}") long timeoutMs) {
        this.sofficePath = sofficePath;
        this.timeoutMs = timeoutMs;
    }

    /** 转换失败抛异常，绝不返回坏 PDF。超时/失败自动重试一次。 */
    public byte[] convert(byte[] docx) {
        if (docx == null || docx.length == 0) {
            throw TwinBusinessException.of(400, "文档内容为空，无法转换");
        }
        try {
            return single.submit(() -> {
                try {
                    return convertOnce(docx);
                } catch (Exception first) {
                    log.warn("[docx2pdf] 首次转换失败，重试一次: {}", first.getMessage());
                    return convertOnce(docx);
                }
            }).get(timeoutMs + 10_000, TimeUnit.MILLISECONDS);
        } catch (TimeoutException e) {
            throw TwinBusinessException.of(504, "文档转换超时，请稍后重试");
        } catch (ExecutionException e) {
            Throwable cause = e.getCause() == null ? e : e.getCause();
            throw TwinBusinessException.of(500, "文档转换失败：" + cause.getMessage());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw TwinBusinessException.of(500, "文档转换被中断");
        }
    }

    private byte[] convertOnce(byte[] docx) throws Exception {
        Path work = Files.createTempDirectory("docx2pdf-");
        Path profile = Files.createTempDirectory("lo-profile-");
        try {
            Path in = work.resolve("in.docx");
            Files.write(in, docx);
            Path out = work.resolve("in.pdf");
            run(in, profile);
            if (!Files.exists(out)) {
                throw new IllegalStateException("soffice 未产出 PDF");
            }
            return Files.readAllBytes(out);
        } finally {
            deleteQuietly(work);
            deleteQuietly(profile);
        }
    }

    private void run(Path in, Path profile) throws Exception {
        ProcessBuilder pb = new ProcessBuilder(
                sofficePath,
                "-env:UserInstallation=" + profile.toUri(),
                "--headless", "--norestore", "--nolockcheck",
                "--convert-to", "pdf",
                "--outdir", in.getParent().toString(),
                in.toString());
        pb.redirectErrorStream(true);
        Process p = pb.start();
        String output = new String(p.getInputStream().readAllBytes());
        if (!p.waitFor(timeoutMs, TimeUnit.MILLISECONDS)) {
            p.destroyForcibly();
            throw new IllegalStateException("转换超时（" + timeoutMs + "ms）");
        }
        if (p.exitValue() != 0) {
            log.warn("[docx2pdf] soffice 输出: {}", output);
            throw new IllegalStateException("soffice 退出码 " + p.exitValue());
        }
    }

    /** 启动自检：探测不到只告警，不阻断启动。 */
    @EventListener(ApplicationReadyEvent.class)
    public void selfCheck() {
        try {
            Process p = new ProcessBuilder(sofficePath, "--version").redirectErrorStream(true).start();
            String version = new String(p.getInputStream().readAllBytes()).trim();
            p.waitFor(20, TimeUnit.SECONDS);
            log.info("[docx2pdf] LibreOffice 可用: {}", version);
        } catch (Exception e) {
            log.warn("[docx2pdf] 未探测到 LibreOffice（{}）：健康报告 PDF 生成会失败，请安装后设置 app.document.soffice-path", e.getMessage());
        }
    }

    private static void deleteQuietly(Path dir) {
        try (var walk = Files.walk(dir)) {
            walk.sorted(Comparator.reverseOrder()).forEach(p -> {
                try {
                    Files.deleteIfExists(p);
                } catch (IOException ignore) {
                    // 临时目录清理失败不影响主流程
                }
            });
        } catch (IOException ignore) {
            // 同上
        }
    }
}
