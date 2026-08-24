package com.example.demo.common.config;

import org.springframework.boot.autoconfigure.jackson.Jackson2ObjectMapperBuilderCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.math.BigInteger;

/**
 * 全局雪花 ID 安全序列化：Long / long / BigInteger 超过 2^53-1 时转字符串，
 * 避免前端 JSON 精度丢失。一次配置全局生效，无需逐接口手动 stringify。
 */
@Configuration
public class JacksonSafeLongConfig {

    @Bean
    public Jackson2ObjectMapperBuilderCustomizer jacksonSafeLongCustomizer() {
        return builder -> builder
                .serializerByType(Long.class, new SafeLongSerializer())
                .serializerByType(Long.TYPE, new SafeLongSerializer())
                .serializerByType(BigInteger.class, new SafeLongSerializer());
    }
}
