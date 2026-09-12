package com.example.demo.common.logging.banner;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.io.ByteArrayOutputStream;
import java.io.PrintStream;
import java.nio.charset.StandardCharsets;
import java.util.regex.Pattern;

import static org.junit.jupiter.api.Assertions.*;

class StartupDashboardTest {

    @Test
    @DisplayName("CJK 名称按 2 列宽补齐，中英混排后可见宽度一致")
    void padAlignsCjkNames() {
        assertEquals(18, StartupDashboard.visWidth(StartupDashboard.pad("Socket.IO", 18)));
        assertEquals(18, StartupDashboard.visWidth(StartupDashboard.pad("违规模块迁移", 18)));
    }

    @Test
    @DisplayName("visWidth 忽略 ANSI 转义序列")
    void visWidthIgnoresAnsi() {
        assertEquals(5, StartupDashboard.visWidth("\033[38;2;0;255;65mabcde\033[0m"));
        assertEquals(10, StartupDashboard.visWidth("数据库迁移"));
    }

    @Test
    @DisplayName("clip 中英混排不超预算并以省略号收尾")
    void clipRespectsBudget() {
        String clipped = StartupDashboard.clip("192/192 就绪 全部就绪 (4.2s) 尾巴", 20);
        assertTrue(StartupDashboard.visWidth(clipped) <= 20, clipped);
        assertTrue(clipped.endsWith("…"), clipped);
    }

    @Test
    @DisplayName("clip 未超预算时原样返回")
    void clipKeepsShortText() {
        assertEquals("就绪", StartupDashboard.clip("就绪", 20));
    }

    @Test
    @DisplayName("整段运行：只有一行是活的、永久行数==完成阶段数+警告数（不重复刷屏）")
    void endToEndSmoke() throws Exception {
        ByteArrayOutputStream buf = new ByteArrayOutputStream();
        PrintStream ps = new PrintStream(buf, true, StandardCharsets.UTF_8);
        StartupDashboard dash = new StartupDashboard(ps, Spinner.SpinnerStyle.DOTS);

        StartupDashboard.Row a = dash.declare("违规模块迁移");
        StartupDashboard.Row b = dash.declare("数据库迁移");
        StartupDashboard.Row c = dash.declare("Socket.IO");
        boolean live = dash.isLive();

        dash.open();
        dash.begin(a);
        for (int i = 1; i <= 12; i++) {
            dash.progress(a, i, 12, i + "/12 脚本已同步");
            Thread.sleep(10);
        }
        dash.complete(a, true, "192/192 就绪 (0.2s)");

        dash.begin(b);
        dash.progress(b, 0, 0, null);          // total 未知 → 彗星扫掠
        Thread.sleep(80);
        dash.complete(b, true, ":9092 已监听 (0.2s)");

        dash.begin(c);
        dash.note("  ! Socket.IO: 端口被占用，已重试");
        Thread.sleep(40);
        dash.complete(c, false, "端口占用");
        dash.close();

        String out = buf.toString(StandardCharsets.UTF_8);
        long newlines = out.chars().filter(ch -> ch == '\n').count();
        assertEquals(4, newlines, "只应有 3 条落定阶段行 + 1 条警告行，多出来的就是重复刷屏");

        if (live) {
            assertTrue(out.contains("\033[2K"), "须清行再写");
            assertFalse(
                    Pattern.compile("\033\\[[0-9]+A").matcher(out).find(),
                    "不得使用光标上移 —— IntelliJ Run 控制台会吞掉它，导致每帧被追加成重复块");
            assertTrue(out.contains("\033[?25h"), "结束须恢复光标");
        }
    }
}
