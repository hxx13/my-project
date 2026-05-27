package com.example.demo.common.service;

import com.corundumstudio.socketio.SocketIOServer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.awt.*;
import java.net.URI;

@Service
public class CommonAsyncService {

    private static final Logger log = LoggerFactory.getLogger(CommonAsyncService.class);

    @Async("coreTaskExecutor")
    public void openBrowserDelayed(String url) {
        try {
            Thread.sleep(3000);
            if (Desktop.isDesktopSupported() && Desktop.getDesktop().isSupported(Desktop.Action.BROWSE)) {
                Desktop.getDesktop().browse(new URI(url));
                log.info("[成功] 已通过 Desktop API 打开: {}", url);
                return;
            }

            String os = System.getProperty("os.name").toLowerCase();
            if (os.contains("win")) {
                Runtime.getRuntime().exec("rundll32 url.dll,FileProtocolHandler " + url);
                log.info("[成功] 已通过 Windows 命令打开: {}", url);
            } else if (os.contains("mac")) {
                Runtime.getRuntime().exec("open " + url);
            } else {
                log.warn("无法识别操作系统，请手动打开: {}", url);
            }
        } catch (Exception e) {
            log.error("浏览器拉起失败: {}", e.getMessage(), e);
        }
    }

    @Async("coreTaskExecutor")
    public void startSocketServerDelayed(SocketIOServer server) {
        try {
            Thread.sleep(1000);
            log.info("[SocketIO] 正在启动 9092 端口...");
            if (server == null) {
                log.warn("[SocketIO] 启动失败：SocketIOServer Bean 为空，跳过启动。");
                return;
            }
            server.start();
            log.info("[SocketIO] 启动成功，前端可以连接了。");
        } catch (Exception e) {
            log.error("[SocketIO] 启动失败，请检查端口: {}", e.getMessage(), e);
        }
    }
}
