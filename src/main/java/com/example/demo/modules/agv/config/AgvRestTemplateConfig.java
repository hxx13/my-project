package com.example.demo.modules.agv.config;

import org.springframework.boot.web.client.RestTemplateBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestTemplate;

import java.time.Duration;

/**
 * AGV 上位机通信专用 RestTemplate，短超时避免阻塞采集线程。
 */
@Configuration
public class AgvRestTemplateConfig {

    @Bean(name = "agvRestTemplate")
    public RestTemplate agvRestTemplate(RestTemplateBuilder builder) {
        return builder
                .connectTimeout(Duration.ofSeconds(3))
                .readTimeout(Duration.ofSeconds(30))
                .build();
    }
}
