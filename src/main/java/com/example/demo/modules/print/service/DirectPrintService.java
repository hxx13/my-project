package com.example.demo.modules.print.service;

import com.example.demo.modules.print.entity.PrintJob;
import com.example.demo.modules.print.entity.PrintStation;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 「直发工位」（{@code mode=SERVER}）的执行方：后端自己把 PDF 交给本机打印队列，
 * 不等工位页来领。
 *
 * <p>只给一种场景用 —— 打印机所在网段没有任何常开的电脑可以挂工位页。
 * 其余工位一律走 KIOSK（浏览器渲染 + {@code window.print()}），那条路不占用后端。
 *
 * <p>命令是配置项而不是写死 {@code lp}：开发机是 Windows、生产是 Linux，两边能用的
 * 渲染器不同，而这条链路的其余部分完全一样。模板里的 {@code {target}} 用工位的
 * printer_ip 填充 —— 生产上 CUPS 队列名就用那个 IP。
 *
 * <p><b>这里不实现状态机</b>：领任务与回执都复用 {@link PrintJobService} 现成的原子操作，
 * 所以 attempts 计数、源文件清理、失败通知与 KIOSK 路径一字不差。
 *
 * <p>口径同 KIOSK：命令退出码 0 只代表**进了本机打印队列**，不代表纸出来了。
 * 界面与告警文案沿用「已提交打印队列」的说法，别写成"打印成功"。
 */
@Service
public class DirectPrintService {

    private static final Logger log = LoggerFactory.getLogger(DirectPrintService.class);

    /** 双引号内整体算一段（打印机名常含空格），其余按空白切。 */
    private static final Pattern TOKEN = Pattern.compile("\"([^\"]*)\"|(\\S+)");

    private final PrintJobService jobService;
    private final PrintSourceResolver sourceResolver;
    private final List<String> commandTemplate;
    private final long timeoutSeconds;

    public DirectPrintService(PrintJobService jobService,
                              PrintSourceResolver sourceResolver,
                              @Value("${app.print.direct-command:lp -d {target} -n {copies} {file}}") String command,
                              @Value("${app.print.direct-timeout-seconds:60}") long timeoutSeconds) {
        this.jobService = jobService;
        this.sourceResolver = sourceResolver;
        this.commandTemplate = tokenize(command);
        this.timeoutSeconds = Math.max(5, timeoutSeconds);
        if (this.commandTemplate.isEmpty()) {
            log.warn("[print] 未配置 app.print.direct-command，直发工位将全部失败");
        }
    }

    /**
     * 立刻把这条任务打出去。
     *
     * <p><b>不抛异常</b>：失败落到任务状态上（FAILED + 原因）并触发现成的失败通知。
     * 调用方是 HTTP 请求线程，不该因为一台打印机坏了就回 500 —— 任务已经建了，
     * 状态比异常码更能说明发生了什么。
     */
    public void printNow(PrintJob job, PrintStation station) {
        // 定向领取，不按"最早的待领"捞：直发明知道打的是哪一条，见 PrintJobService#claim
        var claimed = jobService.claim(job.getId(), station.getId());
        if (claimed.isEmpty()) {
            // 抢不到 = 已经被别处领走了。直发工位没有别处，真发生只可能是并发建单。
            log.warn("[print] 直发工位未领到任务 stationId={} jobId={}", station.getId(), job.getId());
            return;
        }

        String error = null;
        try {
            print(claimed.get(), station);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            error = "打印被中断";
        } catch (Exception e) {
            error = e.getMessage() == null || e.getMessage().isBlank() ? e.toString() : e.getMessage();
            log.warn("[print] 直发失败 jobId={} target={}: {}",
                    job.getId(), station.getPrinterIp(), error);
        }
        jobService.acknowledge(job.getId(), station.getId(), error == null, error);
    }

    private void print(PrintJob job, PrintStation station) throws IOException, InterruptedException {
        if (commandTemplate.isEmpty()) {
            throw new IOException("未配置 app.print.direct-command");
        }
        String target = station.getPrinterIp();
        if (target == null || target.isBlank()) {
            throw new IOException("这个直发工位没有配打印机 IP（它就是投递目标）");
        }
        byte[] bytes = sourceResolver.resolve(job).orElseThrow(
                () -> new IOException("文件不存在或已被清理"));

        // 扩展名按**内容**定，不能按 file_name：Word 转出来的 PDF 名字仍然是 .docx，
        // 而图片是原样存的（不转换），扩展名写成 .pdf 会让按扩展名选导入器的
        // soffice 直接失败。判据与前端 sniffBlobKind 一致。
        String ext = sniffExt(bytes);
        // ASCII 文件名：中文名进命令行参数会被按本地代码页转换，Windows 上实测毁成问号
        //（同一个坑在 OfficeToPdfConverter 和 curl 上都踩过）。job id 本身就是 ASCII。
        Path file = Files.createTempFile("print-" + job.getId() + "-", ext);
        try {
            Files.write(file, bytes);

            List<String> cmd = new ArrayList<>();
            for (String part : commandTemplate) {
                cmd.add(part.replace("{target}", target)
                        .replace("{copies}", String.valueOf(job.getCopies()))
                        .replace("{file}", file.toAbsolutePath().toString()));
            }
            exec(cmd);
        } finally {
            try {
                Files.deleteIfExists(file);
            } catch (IOException e) {
                log.warn("[print] 临时文件清理失败 {}: {}", file, e.getMessage());
            }
        }
    }

    /**
     * 按魔数定扩展名。上传白名单只收 PDF/PNG/JPEG 三类内容（Office 在上传时已转成 PDF），
     * 认不出就拒绝 —— 别把一段谁也认不得的字节当 PDF 塞给打印机，那是废纸不是报错。
     */
    private static String sniffExt(byte[] b) throws IOException {
        if (b.length >= 5 && b[0] == '%' && b[1] == 'P' && b[2] == 'D' && b[3] == 'F' && b[4] == '-') {
            return ".pdf";
        }
        if (b.length >= 4 && (b[0] & 0xFF) == 0x89 && b[1] == 'P' && b[2] == 'N' && b[3] == 'G') {
            return ".png";
        }
        if (b.length >= 2 && (b[0] & 0xFF) == 0xFF && (b[1] & 0xFF) == 0xD8) {
            return ".jpg";
        }
        throw new IOException("这个文件的内容不是 PDF / PNG / JPEG，直发打印机打不了");
    }

    /**
     * 照 {@code OfficeToPdfConverter} 的范式：**先读掉输出再 waitFor**，
     * 否则缓冲区满了子进程会卡住，超时了都等不到。
     */
    private void exec(List<String> cmd) throws IOException, InterruptedException {
        log.info("[print] 直发命令: {}", cmd);
        ProcessBuilder pb = new ProcessBuilder(cmd);
        pb.redirectErrorStream(true);
        Process proc = pb.start();
        String output = new String(proc.getInputStream().readAllBytes());

        if (!proc.waitFor(timeoutSeconds, TimeUnit.SECONDS)) {
            proc.destroyForcibly();
            throw new IOException("打印命令超时（" + timeoutSeconds + " 秒）");
        }
        if (proc.exitValue() != 0) {
            throw new IOException("打印命令失败（退出码 " + proc.exitValue() + "）：" + output.trim());
        }
        log.debug("[print] 直发命令输出: {}", output.trim());
    }

    private static List<String> tokenize(String command) {
        List<String> out = new ArrayList<>();
        if (command == null || command.isBlank()) return out;
        Matcher m = TOKEN.matcher(command);
        while (m.find()) {
            out.add(m.group(1) != null ? m.group(1) : m.group(2));
        }
        return out;
    }
}
