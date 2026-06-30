package com.example.demo.common.config;

import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.deser.LocalDateTimeDeserializer;
import org.springframework.boot.autoconfigure.jackson.Jackson2ObjectMapperBuilderCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.TimeZone;

/**
 * API 时间字段统一为北京时间墙钟 {@code yyyy-MM-dd HH:mm:ss}（无 Z / 偏移）。
 * JVM 默认时区已设为 Asia/Shanghai，JDBC serverTimezone=Asia/Shanghai，无需偏移修正。
 */
@Configuration
public class JacksonTimeConfig {

    public static final DateTimeFormatter WALL_CLOCK = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    @Bean
    public Jackson2ObjectMapperBuilderCustomizer jacksonTimeCustomizer() {
        return builder -> builder
                .timeZone(TimeZone.getTimeZone("Asia/Shanghai"))
                .simpleDateFormat("yyyy-MM-dd HH:mm:ss")
                .featuresToDisable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS)
                .serializerByType(LocalDateTime.class, new WallClockLocalDateTimeSerializer())
                .deserializerByType(LocalDateTime.class, new LocalDateTimeDeserializer(WALL_CLOCK));
    }
}
