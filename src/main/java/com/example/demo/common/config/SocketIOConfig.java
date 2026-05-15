package com.example.demo.common.config;

import com.corundumstudio.socketio.Configuration;
import com.corundumstudio.socketio.SocketIOServer;
import com.corundumstudio.socketio.annotation.SpringAnnotationScanner;
import org.springframework.context.annotation.Bean;

import javax.annotation.PreDestroy;

@org.springframework.context.annotation.Configuration
public class SocketIOConfig {

    private SocketIOServer server;

    @Bean
    public SocketIOServer socketIOServer() {
        Configuration config = new Configuration();
        config.setHostname("0.0.0.0");
        config.setPort(9092);
        config.setAllowHeaders("*");
        config.setOrigin("*");
        config.setExceptionListener(new QuietSocketIoExceptionListener());

        this.server = new SocketIOServer(config);
        return this.server;
    }

    @Bean
    public SpringAnnotationScanner springAnnotationScanner(SocketIOServer socketServer) {
        return new SpringAnnotationScanner(socketServer);
    }

    @PreDestroy
    public void stop() {
        if (server != null) {
            server.stop();
        }
    }
}