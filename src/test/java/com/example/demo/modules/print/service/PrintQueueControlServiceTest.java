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

    private static PrintQueueControlService service(String list, String cancelJob, String cancelQueue) {
        return new PrintQueueControlService(new PrintCommandRunner(), list, cancelJob, cancelQueue, 30);
    }

    @Test
    void 清队列命令没配时抛出带配置项名的IOException() {
        // 命令模板留空 → 明确报「哪个配置项没配」，而不是 NPE 或静默成功
        PrintQueueControlService svc = service(OK_COMMAND, FAIL_COMMAND, "");
        IOException ex = assertThrows(IOException.class, () -> svc.clearQueue("172.22.138.6"));
        assertTrue(ex.getMessage() != null && ex.getMessage().contains("app.print.cancel-queue-command"),
                "报错应点名缺的配置项，实际：" + ex.getMessage());
    }

    @Test
    void 撤销单条作业命令失败时吞掉不抛() {
        // 目标状态是「这条别再打」——命令失败等于它已经不在队列，按已达目标处理
        PrintQueueControlService svc = service(OK_COMMAND, FAIL_COMMAND, OK_COMMAND);
        assertDoesNotThrow(() -> svc.cancelJob("172.22.138.6-125"));
    }

    @Test
    void 清队列命令失败时抛出() {
        // 列队列用成功命令（它在清之前先跑，失败会先抛）、清空用失败命令 → 必须是清这条抛
        PrintQueueControlService svc = service(OK_COMMAND, OK_COMMAND, FAIL_COMMAND);
        IOException ex = assertThrows(IOException.class, () -> svc.clearQueue("172.22.138.6"));
        assertTrue(ex.getMessage() != null && ex.getMessage().contains("命令失败"),
                "应当是命令失败往上抛，实际：" + ex.getMessage());
    }

    @Test
    void 撤销单条作业命令没配时仍然抛出() {
        // 吞失败只针对「命令跑了但没成」，配置缺失是能力问题，照抛
        PrintQueueControlService svc = service(OK_COMMAND, "", OK_COMMAND);
        IOException ex = assertThrows(IOException.class, () -> svc.cancelJob("172.22.138.6-125"));
        assertTrue(ex.getMessage() != null && ex.getMessage().contains("app.print.cancel-job-command"),
                "报错应点名缺的配置项，实际：" + ex.getMessage());
    }

    @Test
    void 队列名留空时抛出带说明的IOException() throws Exception {
        PrintQueueControlService svc = service(OK_COMMAND, OK_COMMAND, OK_COMMAND);
        IOException listEx = assertThrows(IOException.class, () -> svc.listQueuedJobIds("  "));
        assertTrue(listEx.getMessage() != null && listEx.getMessage().contains("printer_ip"),
                "报错应说清 target 是什么，实际：" + listEx.getMessage());
        assertThrows(IOException.class, () -> svc.clearQueue(null));
    }

    /** java 可执行文件路径。反斜杠换正斜杠：Windows 路径进命令行参数会被当转义符吃掉。 */
    private static String javaExe() {
        String home = System.getProperty("java.home", "").replace('\\', '/');
        return home + "/bin/java" + (System.getProperty("os.name", "").toLowerCase().contains("win") ? ".exe" : "");
    }
}
