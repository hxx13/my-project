package com.example.demo.common.config;

import org.springframework.stereotype.Component;

/** 额外 HTTPS 端口（供前端生成摄像头安全访问链接）；未启用时为 -1。 */
@Component
public class HttpsExtraPortRegistry {

    private volatile int activePort = -1;

    public void setActivePort(int port) {
        this.activePort = port;
    }

    public int getActivePort() {
        return activePort;
    }

    public boolean isEnabled() {
        return activePort > 0;
    }
}
