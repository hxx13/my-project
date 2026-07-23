package com.example.demo.common.component;

import com.example.demo.common.logging.annotation.StartupPhase;
import com.example.demo.common.logging.model.StartupContext;
import com.example.demo.common.logging.model.StartupResult;
import com.example.demo.common.logging.model.StartupRunner;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import java.awt.*;
import java.net.URI;

/**
 * 本地开发环境：启动完成后自动打开浏览器。
 * 仅 local profile 激活，非 TTY 或无桌面环境静默跳过。
 */
@StartupPhase(
    name = "浏览器",
    order = 99,
    description = "自动打开开发前端页面 (local only)"
)
@Component
@Profile("local")
@ConditionalOnProperty(prefix = "app.browser", name = "auto-open", havingValue = "true", matchIfMissing = true)
public class BrowserAutoOpener implements StartupRunner {

    @Value("${app.browser.url:http://localhost:5173}")
    private String url;

    @Override
    public StartupResult run(StartupContext ctx) {
        // 等待服务就绪（带进度提示）
        long start = System.currentTimeMillis();
        int waitMs = 1500;
        while (System.currentTimeMillis() - start < waitMs) {
            int elapsed = (int) (System.currentTimeMillis() - start);
            ctx.progress(elapsed, waitMs, "打开 " + url + " 中…");
            try { Thread.sleep(250); } catch (InterruptedException e) { break; }
        }

        try {
            if (Desktop.isDesktopSupported() && Desktop.getDesktop().isSupported(Desktop.Action.BROWSE)) {
                Desktop.getDesktop().browse(new URI(url));
                return StartupResult.success(url);
            }

            String os = System.getProperty("os.name").toLowerCase();
            if (os.contains("win")) {
                Runtime.getRuntime().exec("rundll32 url.dll,FileProtocolHandler " + url);
                return StartupResult.success(url);
            } else if (os.contains("mac")) {
                Runtime.getRuntime().exec("open " + url);
                return StartupResult.success(url);
            } else {
                return StartupResult.success("请手动打开: " + url);
            }
        } catch (Exception e) {
            return StartupResult.success("跳过 (无桌面)");
        }
    }
}
