package com.example.demo.common.config;

import com.example.demo.common.time.BusinessTimeWindow;
import com.fasterxml.jackson.core.JsonGenerator;
import com.fasterxml.jackson.databind.JsonSerializer;
import com.fasterxml.jackson.databind.SerializerProvider;

import java.io.IOException;
import java.time.LocalDateTime;

/**
 * API 序列化 {@link LocalDateTime} 为北京时间墙钟字符串（yyyy-MM-dd HH:mm:ss）。
 * JVM 默认时区已设为 Asia/Shanghai，JDBC serverTimezone=Asia/Shanghai，
 * 无需偏移修正。
 */
public class WallClockLocalDateTimeSerializer extends JsonSerializer<LocalDateTime> {

    @Override
    public void serialize(LocalDateTime value, JsonGenerator gen, SerializerProvider serializers)
            throws IOException {
        if (value == null) {
            gen.writeNull();
            return;
        }
        gen.writeString(BusinessTimeWindow.toDisplayWallClock(value));
    }
}
