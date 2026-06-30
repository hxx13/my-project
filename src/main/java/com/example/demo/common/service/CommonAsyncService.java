package com.example.demo.common.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.awt.*;
import java.net.URI;

/**
 * 通用异步服务（保留兼容旧调用方）。
 * 启动阶段报告已迁移至 {@link com.example.demo.common.logging.banner.StartupBanner}。
 */
@Service
public class CommonAsyncService {

    private static final Logger log = LoggerFactory.getLogger(CommonAsyncService.class);

    @Async("coreTaskExecutor")
    public void openBrowserDelayed(String url) {
        try {
            Thread.sleep(3000);
            if (Desktop.isDesktopSupported() && Desktop.getDesktop().isSupported(Desktop.Action.BROWSE)) {
                Desktop.getDesktop().browse(new URI(url));
                return;
            }
            String os = System.getProperty("os.name").toLowerCase();
            if (os.contains("win")) {
                Runtime.getRuntime().exec("rundll32 url.dll,FileProtocolHandler " + url);
            } else if (os.contains("mac")) {
                Runtime.getRuntime().exec("open " + url);
            }
        } catch (Exception e) {
            log.error("浏览器拉起失败: {}", e.getMessage(), e);
        }
    }

    @Async("coreTaskExecutor")
    public void startSocketServerDelayed(com.corundumstudio.socketio.SocketIOServer server) {
        try {
            Thread.sleep(1000);
            if (server == null) {
                log.error("SocketIOServer 为空，跳过启动");
                return;
            }
            server.start();
        } catch (Exception e) {
            log.error("SocketIO 启动失败: {}", e.getMessage(), e);
        }
    }
}
