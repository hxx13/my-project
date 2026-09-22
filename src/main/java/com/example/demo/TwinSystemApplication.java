package com.example.demo;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
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
        "com.example.demo.modules.notification.push.recipient",
        "com.example.demo.modules.notification.push.digest",
        "com.example.demo.modules.notification.push.preference",
        "com.example.demo.modules.notification.push.binding"
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

    /**
     * 全局 HTTP 客户端（LLM / 推送渠道 / IAM / AGV 代理等共用）。
     *
     * <p>必须显式配超时：{@code new RestTemplate()} 的 connect/read 超时都是「无限」，
     * 对端不回包就永久阻塞。这个 bean 会被裸 {@code @Scheduled} 任务调用，
     * 2026-09-22 就是因为一次 LLM 请求不返回，把默认调度线程占死，
     * 连带三十个定时任务全停（表现为刷卡规则「只有触发、没有恢复」）。
     *
     * <p>read 给得宽（默认 300s）：同一个客户端要跑非流式 LLM 补全，max_tokens 上限 8192，
     * 慢供应商两三分钟很正常。宁可宽，也不能无限。
     */
    @Bean
    public RestTemplate restTemplate(
            @Value("${app.http.connect-timeout-ms:10000}") int connectTimeoutMs,
            @Value("${app.http.read-timeout-ms:300000}") int readTimeoutMs) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Math.max(1000, connectTimeoutMs));
        factory.setReadTimeout(Math.max(1000, readTimeoutMs));
        return new RestTemplate(factory);
    }
}
