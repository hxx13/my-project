package com.example.demo.modules.telemetry.service;

import com.example.demo.modules.ai.shot.PageScreenshotService;
import com.example.demo.modules.auth.entity.User;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 曲线导出 → A4 纵向 PDF。
 *
 * <p><b>做法</b>：让**无头 Chromium 去开这个页面自己的「打印视图」**（页面按注入的打印参数渲染成
 * 一天一页、一行两张），再 {@code page.pdf()} 按 A4 出字节。
 *
 * <p><b>为什么不自己画</b>：报表要的就是「页面上那种曲线」，前端那套图表组件只能在浏览器里跑；
 * 服务端手绘一套（PDFBox 在手边）等于把曲线渲染重写一遍，两边迟早长得不一样。
 * 复用运行时**已有的**无头浏览器与登录态注入，零新增依赖。
 *
 * <p><b>分页</b>：A4 纵向、一天一页、每天另起一页，全由页面的打印 CSS（{@code @page} /
 * {@code break-after}）控制 —— 多天合到同一份 PDF 里。
 */
@Service
public class TelemetryLongtermPdfService {

    /**
     * 打印视图的页面路由。后台页面都在 {@code #/console} 下
     * （裸 {@code /admin/x} 会命中顶层 legacy 重定向、整页闪一下）。
     */
    private static final String ROUTE = "/console/admin/telemetry-longterm";

    /** 页面读这个 localStorage key 决定进入打印视图；由后端在导航前注入。**与前端常量必须一致** */
    public static final String PRINT_SEED_KEY = "twin-longterm-print";

    /** 打印视图就绪判据（页面数据到位、图表画完后置 true） */
    private static final String READY_JS = "() => window.__longtermPrintReady === true";

    private static final ObjectMapper M = new ObjectMapper();

    private final PageScreenshotService screenshotService;

    public TelemetryLongtermPdfService(PageScreenshotService screenshotService) {
        this.screenshotService = screenshotService;
    }

    public byte[] renderPdf(User user, List<String> days, List<String> variables, String title) {
        try {
            Map<String, Object> print = new LinkedHashMap<>();
            print.put("days", days);
            print.put("variables", variables == null ? List.of() : variables);
            print.put("title", title);
            /*
             * 过期时间：页面读到即删（一次性消费），但万一这次渲染根本没读上（超时/排队丢弃），
             * 残留的 key 会让**用户下次正常打开本页时整页变成打印视图**——屏幕上就是一片空白。
             * 给个 5 分钟的窗口兜住这种残留（渲染本身 45 秒就超时了，5 分钟富余）。
             */
            print.put("exp", System.currentTimeMillis() + 5 * 60 * 1000L);
            /*
             * 用 ObjectMapper 生成**字符串字面量**（writeValueAsString 两次 = 引号包住的 JSON）：
             * 手写转义在标题里出现引号/反斜杠时必炸，而这种炸法是运行时才看得到的。
             */
            String json = M.writeValueAsString(print);
            String seed = "try{ localStorage.setItem(" + M.writeValueAsString(PRINT_SEED_KEY)
                    + "," + M.writeValueAsString(json) + "); }catch(e){}";
            return screenshotService.renderPanelPdf(user, ROUTE, seed, READY_JS);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("打印参数序列化失败: " + e.getMessage(), e);
        }
    }
}
