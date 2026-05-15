package com.example.demo.common.service;

import com.corundumstudio.socketio.SocketIOServer;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.awt.*;
import java.net.URI;

@Service
public class CommonAsyncService {

    @Async("coreTaskExecutor")
    public void openBrowserDelayed(String url) {
        try {
            Thread.sleep(3000);
            if (Desktop.isDesktopSupported() && Desktop.getDesktop().isSupported(Desktop.Action.BROWSE)) {
                Desktop.getDesktop().browse(new URI(url));
                System.out.println("🌐 [成功] 已通过 Desktop API 打开: " + url);
                return;
            }

            String os = System.getProperty("os.name").toLowerCase();
            if (os.contains("win")) {
                Runtime.getRuntime().exec("rundll32 url.dll,FileProtocolHandler " + url);
                System.out.println("🌐 [成功] 已通过 Windows 命令打开: " + url);
            } else if (os.contains("mac")) {
                Runtime.getRuntime().exec("open " + url);
            } else {
                System.err.println("❌ 无法识别操作系统，请手动打开: " + url);
            }
        } catch (Exception e) {
            System.err.println("❌ 浏览器拉起失败: " + e.getMessage());
            e.printStackTrace();
        }
    }

    @Async("coreTaskExecutor")
    public void startSocketServerDelayed(SocketIOServer server) {
        try {
            Thread.sleep(1000);
            System.out.println("🔌 [SocketIO] 正在启动 9092 端口...");
            if (server == null) {
                System.err.println("❌ [SocketIO] 启动失败：SocketIOServer Bean 为空，跳过启动。");
                return;
            }
            server.start();
            System.out.println("✅ [SocketIO] 启动成功，前端可以连接了。");
        } catch (Exception e) {
            System.err.println("❌ [SocketIO] 启动失败，请检查端口: " + e.getMessage());
        }
    }
}
