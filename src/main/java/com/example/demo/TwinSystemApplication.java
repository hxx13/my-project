package com.example.demo;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.web.client.RestTemplate;

import javax.annotation.PostConstruct;
import java.util.TimeZone;

@SpringBootApplication
@MapperScan({
        "com.example.demo.modules.*.mapper",
        "com.example.demo.modules.twin.*.mapper",
        "com.example.demo.modules.twin.*.*.mapper",
        "com.example.demo.modules.accessfusion.mapper",
        "com.example.demo.modules.notification.push.source",
        "com.example.demo.modules.notification.push.config",
        "com.example.demo.modules.notification.push.recipient"
})
@EnableScheduling
@EnableAsync
public class TwinSystemApplication {

    @PostConstruct
    void setDefaultTimezone() {
        System.setProperty("user.timezone", "Asia/Shanghai");
        TimeZone.setDefault(TimeZone.getTimeZone("Asia/Shanghai"));
    }

    public static void main(String[] args) {
        System.setProperty("user.timezone", "Asia/Shanghai");
        TimeZone.setDefault(TimeZone.getTimeZone("Asia/Shanghai"));
        // 禁用 DJL 模型加载进度条（避免 Loading: 100% 污染控制台）
        System.setProperty("ai.djl.disable_progress_bar", "true");
        System.setProperty("collect-memory", "false");
        SpringApplicationBuilder builder = new SpringApplicationBuilder(TwinSystemApplication.class);
        builder.headless(false);
        builder.run(args);
    }

    @Bean
    public RestTemplate restTemplate() {
        return new RestTemplate();
    }
}
