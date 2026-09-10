package com.example.demo.modules.animalorder.config;

import org.springframework.boot.web.client.RestTemplateBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestTemplate;

import java.time.Duration;

/**
 * 节假日 CDN 拉取专用 RestTemplate，短超时避免外网不可达时挂起（同步方法在事务内，久等会占住连接）。
 */
@Configuration
public class HolidayRestTemplateConfig {

    @Bean(name = "holidayRestTemplate")
    public RestTemplate holidayRestTemplate(RestTemplateBuilder builder) {
        return builder
                .connectTimeout(Duration.ofSeconds(5))
                .readTimeout(Duration.ofSeconds(15))
                .build();
    }
}
