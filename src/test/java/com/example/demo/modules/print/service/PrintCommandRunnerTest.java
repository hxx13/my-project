package com.example.demo.modules.print.service;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 直发命令执行器与两条输出解析的契约。
 *
 * 解析一律「认不出就当不知道」，不抛异常 —— 队列查询/撤销是辅助动作，
 * 解析失败不该把打印主链路炸掉。
 */
class PrintCommandRunnerTest {

    @Test
    void 从lp输出里解析出作业号() {
        Optional<String> id = PrintCommandRunner.parseLpJobId(
                "request id is 172.22.138.6-125 (1 file(s))");
        assertEquals(Optional.of("172.22.138.6-125"), id);
    }

    @Test
    void lp输出认不出来时返回空而不是抛异常() {
        assertEquals(Optional.empty(), PrintCommandRunner.parseLpJobId(""));
        assertEquals(Optional.empty(), PrintCommandRunner.parseLpJobId("lp: Printer not found"));
        assertEquals(Optional.empty(), PrintCommandRunner.parseLpJobId(null));
    }

    @Test
    void 从lpstat输出里解析出队列中的作业号集合() {
        String out = "172.22.138.6-124 twin 140288 Mon 21 Sep 2026 12:33:01 PM CST\n"
                   + "172.22.138.6-125 twin   1024 Mon 21 Sep 2026 12:37:45 PM CST\n";
        assertEquals(Set.of("172.22.138.6-124", "172.22.138.6-125"),
                PrintCommandRunner.parseQueueJobIds(out));
    }

    @Test
    void 空队列返回空集合() {
        assertTrue(PrintCommandRunner.parseQueueJobIds("").isEmpty());
        assertTrue(PrintCommandRunner.parseQueueJobIds("   \n  \n").isEmpty());
        assertTrue(PrintCommandRunner.parseQueueJobIds(null).isEmpty());
    }

    @Test
    void 命令模板按空白切分_引号内整体算一段() {
        List<String> t = PrintCommandRunner.tokenize(
                "\"C:/Program Files/LibreOffice/program/soffice.exe\" --headless -pt \"{target}\"");
        assertEquals(List.of("C:/Program Files/LibreOffice/program/soffice.exe",
                "--headless", "-pt", "{target}"), t);
    }

    @Test
    void 能跑通一条真命令并拿到输出() throws Exception {
        // 用 JVM 自己当「一条真命令」：跨平台、立刻退出、输出稳定。
        // 顺带覆盖"带引号的路径"会被切成一个参数 —— java.home 可能落在带空格的目录里。
        String java = System.getProperty("java.home").replace('\\', '/')
                + "/bin/java" + (isWindows() ? ".exe" : "");
        String out = new PrintCommandRunner().run("\"" + java + "\" -version", Map.of(), 30);
        // java -version 写的是 stderr；收得到就同时证明了 redirectErrorStream(true) 生效
        assertTrue(out.toLowerCase().contains("version"), "应当收到 java 版本输出，实际：" + out);
    }

    @Test
    void 子进程不退出时超时真的生效() {
        // 判据是「1 秒左右就抛」，不是「最终抛了没」。
        // 旧写法（先 readAllBytes 再 waitFor）会一直阻塞到子进程自然结束才轮到超时判断，
        // 那样这里会等到 ~10 秒、断言 elapsed < 6000 失败。这条用例就是防那个写法回潮的 ——
        // 该方法会被 @Scheduled 任务调用，而全站 48 个定时任务共用单线程调度器。
        String cmd = isWindows() ? "ping -n 11 127.0.0.1" : "sleep 10";
        long t0 = System.currentTimeMillis();
        Exception ex = assertThrows(Exception.class,
                () -> new PrintCommandRunner().run(cmd, Map.of(), 1));
        long elapsed = System.currentTimeMillis() - t0;
        assertTrue(ex.getMessage() != null && ex.getMessage().contains("超时"),
                "应当是超时错误，实际：" + ex.getMessage());
        assertTrue(elapsed < 6000, "应当 1 秒左右就超时，实际耗时 " + elapsed + " ms");
    }

    private static boolean isWindows() {
        return System.getProperty("os.name", "").toLowerCase().contains("win");
    }
}
