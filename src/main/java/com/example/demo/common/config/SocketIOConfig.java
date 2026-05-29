package com.example.demo.common.config;

import com.corundumstudio.socketio.AuthorizationListener;
import com.corundumstudio.socketio.Configuration;
import com.corundumstudio.socketio.SocketIOServer;
import com.corundumstudio.socketio.annotation.SpringAnnotationScanner;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;

import javax.annotation.PreDestroy;

@org.springframework.context.annotation.Configuration
public class SocketIOConfig {

    private static final Logger log = LoggerFactory.getLogger(SocketIOConfig.class);

    private SocketIOServer server;

    @Value("${app.socketio.port:9092}")
    private int socketioPort;

    private final JwtTokenService jwtTokenService;

    public SocketIOConfig(JwtTokenService jwtTokenService) {
        this.jwtTokenService = jwtTokenService;
    }

    @Bean
    public SocketIOServer socketIOServer() {
        Configuration config = new Configuration();
        config.setHostname("0.0.0.0");
        config.setPort(socketioPort);
        config.setAllowHeaders("*");
        config.setOrigin("*");
        config.setExceptionListener(new QuietSocketIoExceptionListener());

        config.setAuthorizationListener(new AuthorizationListener() {
            @Override
            public boolean isAuthorized(com.corundumstudio.socketio.HandshakeData data) {
                String token = data.getSingleUrlParam("token");
                if (token == null || token.isEmpty()) {
                    log.warn("[SocketIO] 连接被拒：未携带 token，来源 {}", data.getAddress());
                    return false;
                }
                if (jwtTokenService.validateTokenAndResolveUser(token) != null) {
                    return true;
                }
                log.warn("[SocketIO] 连接被拒：token 无效，来源 {}", data.getAddress());
                return false;
            }
        });

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