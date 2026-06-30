package com.example.demo.common.component;

import com.corundumstudio.socketio.SocketIOServer;
import com.example.demo.common.logging.annotation.StartupPhase;
import com.example.demo.common.logging.model.StartupContext;
import com.example.demo.common.logging.model.StartupResult;
import com.example.demo.common.logging.model.StartupRunner;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@StartupPhase(
    name = "Socket.IO",
    order = 5,
    description = "启动 Netty Socket.IO 实时推送服务"
)
@Component
public class SocketIOStartupRunner implements StartupRunner {

    @Autowired
    private SocketIOServer socketIOServer;

    @Value("${app.socketio.port:9092}")
    private int socketIoPort;

    @Override
    public StartupResult run(StartupContext ctx) {
        if (socketIOServer == null) {
            return StartupResult.failed("SocketIOServer Bean 为空", null);
        }
        try {
            socketIOServer.start();
            return StartupResult.success(":" + socketIoPort + " 已监听");
        } catch (Exception e) {
            return StartupResult.failed(e.getMessage(), e);
        }
    }
}
