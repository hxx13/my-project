package com.example.demo.modules.print.service;

import org.junit.jupiter.api.Test;

import java.io.IOException;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 队列控制服务的「谁吞谁抛」契约。
 *
 * <p>不引 Mockito —— 用真跑命令验：命令都指向本机的 java，跨平台且立刻退出，
 * 成功/失败只差一个参数。这里守的是三条命令故意不一致的失败口径（见服务类注释）。
 */
class PrintQueueControlServiceTest {

    /** 本机必然存在、必然 0 退出的命令：java -version（版本信息走 stderr，恰好也证明输出是合并收的）。 */
    private static final String OK_COMMAND = "\"" + javaExe() + "\" -version";

    /** 本机必然存在、必然非 0 退出的命令：给 java 一个不认识的选项。 */
    private static final String FAIL_COMMAND = "\"" + javaExe() + "\" -zz-not-a-real-option";

    private static PrintQueueControlService service(String list, String cancelJob) {
        return new PrintQueueControlService(new PrintCommandRunner(), list, cancelJob, 30);
    }

    /**
     * 本机必然存在、0 退出、且**输出固定一行**的命令，用来模拟「队列里确实有这条作业」。
     * 不能用 java -version 冒充：那串版本信息被 parseQueueJobIds 切出来是一堆谁也认不得的
     * 词，恰好「不在队列」，测不到「还在队列就抛」那条分支。
     */
    private static String queueHolding(String jobId) {
        return isWindows() ? "cmd /c echo " + jobId : "echo " + jobId;
    }

    @Test
    void 列队列命令没配时清队列抛出带配置项名的IOException() {
        // 命令模板留空 → 明确报「哪个配置项没配」，而不是 NPE 或静默成功
        PrintQueueControlService svc = service("", OK_COMMAND);
        IOException ex = assertThrows(IOException.class, () -> svc.clearQueue("172.22.138.6"));
        assertTrue(ex.getMessage() != null && ex.getMessage().contains("app.print.queue-list-command"),
                "报错应点名缺的配置项，实际：" + ex.getMessage());
    }

    @Test
    void 撤销命令没配时清队列抛出带配置项名的IOException() {
        // 列队列能跑（队列里有作业）、撤单条的能力缺失 → 必须点名撤不了，不能当清空成功
        PrintQueueControlService svc = service(OK_COMMAND, "");
        IOException ex = assertThrows(IOException.class, () -> svc.clearQueue("172.22.138.6"));
        assertTrue(ex.getMessage() != null && ex.getMessage().contains("app.print.cancel-job-command"),
                "报错应点名缺的配置项，实际：" + ex.getMessage());
    }

    @Test
    void 撤销命令报错但作业已不在队列时不抛() {
        // 目标状态是「这条别再打」—— 回查队列确实没有它，等于已达成，报错可以吞
        PrintQueueControlService svc = service(OK_COMMAND, FAIL_COMMAND);
        assertDoesNotThrow(() -> svc.cancelJob("172.22.138.6", "172.22.138.6-125"));
    }

    @Test
    void 撤销命令报错且作业仍在队列时抛出() {
        // Forbidden / cancel 不在 PATH 都落进这条 catch —— 回查发现它还排着，绝不能说"撤了"
        PrintQueueControlService svc = service(queueHolding("172.22.138.6-125"), FAIL_COMMAND);
        IOException ex = assertThrows(IOException.class,
                () -> svc.cancelJob("172.22.138.6", "172.22.138.6-125"));
        assertTrue(ex.getMessage() != null && ex.getMessage().contains("仍排在队列里"),
                "应当明说它还排在队列里，实际：" + ex.getMessage());
    }

    @Test
    void 撤销命令报错且队列也问不到时抛出() {
        // 回查失败 = 不知道它在不在 → 按"还在"处理，宁可报错也不能假报撤成功
        PrintQueueControlService svc = service("", FAIL_COMMAND);
        assertThrows(IOException.class, () -> svc.cancelJob("172.22.138.6", "172.22.138.6-125"));
    }

    @Test
    void 清队列撤不掉时抛出() {
        // 撤销命令"成功"了，但队列里那条还在 → 再列一次拦住，不能因为命令退 0 就回一句已清空
        PrintQueueControlService svc = service(queueHolding("172.22.138.6-125"), OK_COMMAND);
        IOException ex = assertThrows(IOException.class, () -> svc.clearQueue("172.22.138.6"));
        assertTrue(ex.getMessage() != null && ex.getMessage().contains("撤不掉"),
                "应当是撤不掉往上抛，实际：" + ex.getMessage());
    }

    @Test
    void 撤销单条作业命令没配时仍然抛出() {
        // 吞失败只针对「命令跑了但没成」，配置缺失是能力问题，照抛
        PrintQueueControlService svc = service(OK_COMMAND, "");
        IOException ex = assertThrows(IOException.class, () -> svc.cancelJob("172.22.138.6", "172.22.138.6-125"));
        assertTrue(ex.getMessage() != null && ex.getMessage().contains("app.print.cancel-job-command"),
                "报错应点名缺的配置项，实际：" + ex.getMessage());
    }

    @Test
    void 队列名留空时抛出带说明的IOException() throws Exception {
        PrintQueueControlService svc = service(OK_COMMAND, OK_COMMAND);
        IOException listEx = assertThrows(IOException.class, () -> svc.listQueuedJobIds("  "));
        assertTrue(listEx.getMessage() != null && listEx.getMessage().contains("printer_ip"),
                "报错应说清 target 是什么，实际：" + listEx.getMessage());
        assertThrows(IOException.class, () -> svc.clearQueue(null));
    }

    private static boolean isWindows() {
        return System.getProperty("os.name", "").toLowerCase().contains("win");
    }

    /** java 可执行文件路径。反斜杠换正斜杠：Windows 路径进命令行参数会被当转义符吃掉。 */
    private static String javaExe() {
        String home = System.getProperty("java.home", "").replace('\\', '/');
        return home + "/bin/java" + (isWindows() ? ".exe" : "");
    }
}
