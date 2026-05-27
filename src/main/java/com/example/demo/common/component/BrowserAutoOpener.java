package com.example.demo.common.component;

import com.example.demo.common.service.CommonAsyncService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

@Component
public class BrowserAutoOpener {

    private static final Logger log = LoggerFactory.getLogger(BrowserAutoOpener.class);

    @Autowired
    private CommonAsyncService commonAsyncService;

    @EventListener(ApplicationReadyEvent.class)
    public void openBrowser() {
        String url ="http://localhost:5173"; //
        log.info("[系统启动] 准备拉起浏览器，等待服务就绪...");
        commonAsyncService.openBrowserDelayed(url);
    }
}