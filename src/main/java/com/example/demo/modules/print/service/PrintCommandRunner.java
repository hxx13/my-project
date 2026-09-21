package com.example.demo.modules.print.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 直发打印的命令执行器：按模板跑命令，并把两类输出解析出来。
 *
 * <p>从 {@code DirectPrintService} 里抽出来共用 —— 投递之外还要做队列查询（列作业、
 * 撤销某条、清空整台），这些动作都是「跑命令 + 解析输出」，抄三遍必然走样。
 *
 * <p>解析一律「认不出就当不知道」：返回空而非抛异常。查询/撤销是辅助动作，
 * 解析失败只代表掌握不到队列状态，不该把打印主链路炸掉。
 */
@Component
public class PrintCommandRunner {

    private static final Logger log = LoggerFactory.getLogger(PrintCommandRunner.class);

    /** 双引号内整体算一段（打印机名常含空格），其余按空白切。 */
    private static final Pattern TOKEN = Pattern.compile("\"([^\"]*)\"|(\\S+)");

    /** CUPS 的 {@code lp} 成功时 stdout 形如 {@code request id is <id> (1 file(s))}。 */
    private static final Pattern LP_JOB_ID = Pattern.compile("request id is\\s+(\\S+)");

    /**
     * 按模板跑一条命令。vars 填 {占位符}，替换后再切分。
     * 返回合并后的 stdout+stderr；非 0 退出或超时抛 IOException（消息里带输出）。
     *
     * <p><b>先替换再切分，顺序不能反</b>：占位符的值里可能带空格（生产上 {target} 是
     * CUPS 队列名、本地是打印机名），只有替换后再整体做引号感知的切分，
     * 模板里写的引号才能把带空格的值兜成一个参数。反过来先切分的话，
     * 展开出来的空格会被当成参数分隔符，命令直接散架。
     */
    public String run(String command, Map<String, String> vars, long timeoutSeconds)
            throws IOException, InterruptedException {
        String filled = command;
        if (vars != null) {
            for (Map.Entry<String, String> e : vars.entrySet()) {
                filled = filled.replace("{" + e.getKey() + "}", e.getValue());
            }
        }
        return exec(tokenize(filled), timeoutSeconds);
    }

    /**
     * 从 lp 的 stdout 抓 CUPS 作业号（形如 `request id is 172.22.138.6-125 (1 file(s))`）。认不出返回 empty，不抛。
     */
    public static Optional<String> parseLpJobId(String lpOutput) {
        if (lpOutput == null || lpOutput.isBlank()) return Optional.empty();
        Matcher m = LP_JOB_ID.matcher(lpOutput);
        return m.find() ? Optional.of(m.group(1)) : Optional.empty();
    }

    /**
     * 从 `lpstat -o <队列>` 的输出抓出队列里还在的作业号。
     * 每行第一个空白分隔的 token 就是作业号；空行跳过。
     * 这不是"没在队列里"的证明 —— 命令没跑起来时调用方必须保持原状，不能当成空队列。
     */
    public static Set<String> parseQueueJobIds(String lpstatOutput) {
        Set<String> ids = new LinkedHashSet<>();
        if (lpstatOutput == null || lpstatOutput.isBlank()) return ids;
        for (String line : lpstatOutput.split("\\R")) {
            String trimmed = line.trim();
            if (trimmed.isEmpty()) continue;
            int sp = indexOfWhitespace(trimmed);
            ids.add(sp < 0 ? trimmed : trimmed.substring(0, sp));
        }
        return ids;
    }

    private static int indexOfWhitespace(String s) {
        for (int i = 0; i < s.length(); i++) {
            if (Character.isWhitespace(s.charAt(i))) return i;
        }
        return -1;
    }

    /**
     * 跑命令并收输出。
     *
     * <p><b>输出重定向到临时文件，不走管道。</b>走管道的话子进程输出写满管道缓冲区就会
     * 阻塞在写、我们阻塞在读，双方都不动 —— 于是 {@code waitFor} 的超时永远轮不到执行，
     * 命令挂住多久我们就挂住多久。重定向到文件后，子进程不会因为没人读它的输出而卡住，
     * 超时才是真的超时。
     *
     * <p>这不是洁癖：本方法会被 {@code @Scheduled} 的打印机探测任务调用。调度池是
     * {@code spring.task.scheduling.pool.size=12}（不是单线程），但一条命令永不返回就是
     * 永久占住一个线程；探测每 60 秒一轮，累积到 12 条就把整个调度池占满，遥测告警、
     * 笼位告警、通知重试会一起停摆。{@code DirectPrintService} 那边还在 HTTP 请求线程上
     * 跑这条命令，挂住一样会占死 Tomcat 的工作线程。所以「超时真的生效」是必须的，
     * 不是为了好看。
     */
    private String exec(List<String> cmd, long timeoutSeconds) throws IOException, InterruptedException {
        if (cmd.isEmpty()) {
            throw new IOException("命令为空（模板没配或切分后没有 token）");
        }
        log.info("[print] 执行命令: {}", cmd);
        Path outFile = Files.createTempFile("print-cmd-", ".out");
        try {
            ProcessBuilder pb = new ProcessBuilder(cmd);
            pb.redirectErrorStream(true);
            pb.redirectOutput(outFile.toFile());
            Process proc = pb.start();

            boolean finished = proc.waitFor(timeoutSeconds, TimeUnit.SECONDS);
            // 读输出失败（含乱码等解码问题）一律按空处理：命令已经跑完了，
            // 不能因为读不懂它的输出就把它判成失败。
            String output = "";
            try {
                if (Files.exists(outFile)) {
                    output = new String(Files.readAllBytes(outFile));
                }
            } catch (IOException e) {
                log.warn("[print] 命令输出读取失败，按空处理: {}", e.getMessage());
            }

            if (!finished) {
                proc.destroyForcibly();
                // 等它真死掉再让 finally 去删输出文件：Windows 上进程还持有句柄时删不掉，
                // 而本方法每 60 秒被探测任务调一次，漏下的临时文件会一轮一轮堆起来。
                proc.waitFor(2, TimeUnit.SECONDS);
                throw new IOException("命令超时（" + timeoutSeconds + " 秒）：" + output.trim());
            }
            if (proc.exitValue() != 0) {
                throw new IOException("命令失败（退出码 " + proc.exitValue() + "）：" + output.trim());
            }
            log.debug("[print] 命令输出: {}", output.trim());
            return output;
        } finally {
            try {
                Files.deleteIfExists(outFile);
            } catch (IOException e) {
                log.warn("[print] 命令输出临时文件清理失败 {}: {}", outFile, e.getMessage());
            }
        }
    }

    /** 双引号内整体算一段（打印机名常含空格），其余按空白切。 */
    public static List<String> tokenize(String command) {
        List<String> out = new ArrayList<>();
        if (command == null || command.isBlank()) return out;
        Matcher m = TOKEN.matcher(command);
        while (m.find()) {
            out.add(m.group(1) != null ? m.group(1) : m.group(2));
        }
        return out;
    }
}
