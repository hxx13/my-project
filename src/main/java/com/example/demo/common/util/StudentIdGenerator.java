package com.example.demo.common.util;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * 学生视角 19 位编码生成器（雪花算法）。
 *
 * <p>与外部 ARO 系统同族算法、同起始纪元，但 worker 段独占保留区间 1000–1023 ——
 * ARO 实测仅占用 {0..31, 61, 705, 712, 724, 840}，两者数值域可证不交。
 * 生成结果仅作系统内部标识，不向学生展示。
 */
@Component
public class StudentIdGenerator {

    /** 与 ARO 一致的起始纪元（2010-11-04T01:42:54.657Z）。 */
    static final long EPOCH = 1288834974657L;

    /** 本系统保留的 worker 号区间（含两端）。 */
    static final long RESERVED_WORKER_MIN = 1000L;
    static final long RESERVED_WORKER_MAX = 1023L;

    private static final long SEQUENCE_BITS = 12L;
    private static final long WORKER_BITS = 10L;
    private static final long MAX_SEQUENCE = (1L << SEQUENCE_BITS) - 1L;

    private final long workerId;
    private long lastTimestamp = -1L;
    private long sequence = 0L;

    public StudentIdGenerator(@Value("${app.student-id.worker:1000}") long workerId) {
        if (workerId < RESERVED_WORKER_MIN || workerId > RESERVED_WORKER_MAX) {
            throw new IllegalArgumentException(
                    "workerId 必须落在系统保留区间 " + RESERVED_WORKER_MIN + "-" + RESERVED_WORKER_MAX + "，实际 " + workerId);
        }
        this.workerId = workerId;
    }

    /** 生成下一个 19 位数字编码（字符串形态，避免超出 JS 安全整数）。 */
    public synchronized String nextId() {
        long ts = System.currentTimeMillis();
        if (ts < lastTimestamp) {
            ts = lastTimestamp;
        }
        if (ts == lastTimestamp) {
            sequence = (sequence + 1L) & MAX_SEQUENCE;
            if (sequence == 0L) {
                ts = waitNextMillis(lastTimestamp);
            }
        } else {
            sequence = 0L;
        }
        lastTimestamp = ts;
        long id = ((ts - EPOCH) << (WORKER_BITS + SEQUENCE_BITS))
                | (workerId << SEQUENCE_BITS)
                | sequence;
        return String.valueOf(id);
    }

    private long waitNextMillis(long last) {
        long ts = System.currentTimeMillis();
        while (ts <= last) {
            ts = System.currentTimeMillis();
        }
        return ts;
    }
}
