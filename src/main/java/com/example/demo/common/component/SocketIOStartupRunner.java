package com.example.demo.common.component;

import com.corundumstudio.socketio.SocketIOServer;
import com.example.demo.common.service.CommonAsyncService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

@Component
public class SocketIOStartupRunner {

    @Autowired
    private CommonAsyncService commonAsyncService;

    @Autowired
    private SocketIOServer socketIOServer;

    @EventListener(ApplicationReadyEvent.class)
    public void onApplicationReady() {
        commonAsyncService.startSocketServerDelayed(socketIOServer);
    }
}
