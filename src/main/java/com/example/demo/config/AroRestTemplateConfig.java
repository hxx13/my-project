package com.example.demo.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestTemplate;

/**
 * ARO 官方出站专用 RestTemplate（读/连接超时），与默认无超时 Bean 分离，便于排查挂死。
 */
@Configuration
public class AroRestTemplateConfig {

    @Bean("aroRestTemplate")
    public RestTemplate aroRestTemplate(
            @Value("${app.aro.http.connect-timeout-ms:10000}") int connectTimeoutMs,
            @Value("${app.aro.http.read-timeout-ms:30000}") int readTimeoutMs) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Math.max(1000, connectTimeoutMs));
        factory.setReadTimeout(Math.max(3000, readTimeoutMs));
        return new RestTemplate(factory);
    }
}
