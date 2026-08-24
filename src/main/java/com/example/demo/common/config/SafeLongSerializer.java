package com.example.demo.common.config;

import com.fasterxml.jackson.core.JsonGenerator;
import com.fasterxml.jackson.databind.JsonSerializer;
import com.fasterxml.jackson.databind.SerializerProvider;

import java.io.IOException;
import java.math.BigInteger;

/**
 * 雪花 ID 安全序列化器。
 *
 * 后端 BIGINT 雪花 ID（19 位，约 2e18）超过 JavaScript {@code Number.MAX_SAFE_INTEGER}（2^53-1），
 * 若按 JSON 数字下发，前端 JSON.parse 会四舍五入丢失精度（如 …852994 → …853000）。
 * 本序列化器：绝对值 &gt; 2^53-1 的 Long/BigInteger 转字符串，否则保持数字（向后兼容
 * positionX、count、分页等小整数）。
 */
public class SafeLongSerializer extends JsonSerializer<Object> {

    /** JS Number.MAX_SAFE_INTEGER = 2^53 - 1 */
    private static final long MAX_SAFE_INTEGER = 9007199254740991L;
    private static final BigInteger MAX_SAFE_BIG = BigInteger.valueOf(MAX_SAFE_INTEGER);

    @Override
    public void serialize(Object value, JsonGenerator gen, SerializerProvider serializers) throws IOException {
        if (value == null) {
            gen.writeNull();
            return;
        }
        if (value instanceof BigInteger bi) {
            if (bi.abs().compareTo(MAX_SAFE_BIG) > 0) {
                gen.writeString(bi.toString());
            } else {
                gen.writeNumber(bi.longValue());
            }
            return;
        }
        long v = ((Number) value).longValue();
        if (Math.abs(v) > MAX_SAFE_INTEGER) {
            gen.writeString(String.valueOf(v));
        } else {
            gen.writeNumber(v);
        }
    }
}
