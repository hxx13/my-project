package com.example.demo.common.support;

import java.util.Arrays;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.locks.ReentrantReadWriteLock;

/**
 * 线程安全的环形日志缓冲区，保留最近 N 条日志供 Web 端查看。
 * 同时作为 Logback Appender 目标，配置在 logback-spring.xml。
 */
public final class LogRingBuffer {

    private static final int DEFAULT_CAPACITY = 5000;
    private static final DateTimeFormatter TS_FMT =
            DateTimeFormatter.ofPattern("MM-dd HH:mm:ss.SSS").withZone(ZoneId.systemDefault());

    private static volatile LogRingBuffer INSTANCE;

    private final LogEntry[] buffer;
    private final int capacity;
    private volatile long writeIndex;  // 2^63 写入 @10k/s ≈ 2900万年，永不溢出
    /** 环形缓冲区覆盖次数（每次写入覆盖一条旧条目时 +1） */
    private volatile long wrapCount;
    private final ReentrantReadWriteLock lock = new ReentrantReadWriteLock();

    private LogRingBuffer(int capacity) {
        this.capacity = capacity;
        this.buffer = new LogEntry[capacity];
    }

    public static LogRingBuffer getInstance() {
        if (INSTANCE == null) {
            synchronized (LogRingBuffer.class) {
                if (INSTANCE == null) {
                    INSTANCE = new LogRingBuffer(DEFAULT_CAPACITY);
                }
            }
        }
        return INSTANCE;
    }

    /** 供 Logback Appender 调用 */
    public static void append(String level, String loggerName, String message, long timestampMs) {
        getInstance().put(new LogEntry(level, loggerName, message, timestampMs));
    }

    private void put(LogEntry entry) {
        lock.writeLock().lock();
        try {
            if (writeIndex >= capacity && buffer[(int) (writeIndex % capacity)] != null) {
                wrapCount++;  // 该位置有旧数据即将被覆盖
            }
            buffer[(int) (writeIndex % capacity)] = entry;
            writeIndex++;
        } finally {
            lock.writeLock().unlock();
        }
    }

    /**
     * 返回最近 count 条日志（按时间升序）。可选的 level 过滤（如 DEBUG/INFO/WARN/ERROR）。
     * level 为 null 或空时不过滤。
     */
    public List<Map<String, Object>> recent(int count, String minLevel) {
        lock.readLock().lock();
        try {
            int total = (int) Math.min(writeIndex, capacity);
            int start = Math.max(0, total - count);
            List<Map<String, Object>> result = new ArrayList<>();
            long baseIdx = writeIndex - total;  // long, 避免 baseIdx 溢出

            for (int i = start; i < total; i++) {
                LogEntry entry = buffer[(int) ((baseIdx + i) % capacity)];
                if (entry == null) continue;
                if (minLevel != null && !minLevel.isEmpty() && !entry.passesMinLevel(minLevel)) {
                    continue;
                }
                Map<String, Object> map = new LinkedHashMap<>();
                map.put("ts", TS_FMT.format(Instant.ofEpochMilli(entry.timestampMs)));
                map.put("tsEpochMs", entry.timestampMs);
                map.put("level", entry.level);
                map.put("logger", entry.loggerName);
                map.put("message", entry.message);
                result.add(map);
            }
            return result;
        } finally {
            lock.readLock().unlock();
        }
    }

    public int size() {
        return (int) Math.min(writeIndex, capacity);
    }

    public void clear() {
        lock.writeLock().lock();
        try {
            writeIndex = 0;
            Arrays.fill(buffer, null);  // 释放 GC 引用，防止 40MB 泄漏
            // wrapCount 不清零 — 作为 JVM 生命周期计数器供监控使用
        } finally {
            lock.writeLock().unlock();
        }
    }

    /** 返回缓冲区运行时统计信息 */
    public Map<String, Object> stats() {
        lock.readLock().lock();
        try {
            Map<String, Object> s = new LinkedHashMap<>();
            s.put("capacity", capacity);
            s.put("currentSize", size());
            s.put("wraps", wrapCount);
            int total = (int) Math.min(writeIndex, capacity);
            if (total > 0) {
                long baseIdx = writeIndex - total;
                LogEntry oldest = buffer[(int) (baseIdx % capacity)];
                LogEntry newest = buffer[(int) ((writeIndex - 1) % capacity)];
                if (oldest != null) s.put("oldestEntryEpochMs", oldest.timestampMs);
                if (newest != null) s.put("youngestEntryEpochMs", newest.timestampMs);
            }
            return s;
        } finally {
            lock.readLock().unlock();
        }
    }

    private static final class LogEntry {
        final String level;
        final String loggerName;
        final String message;
        final long timestampMs;

        LogEntry(String level, String loggerName, String message, long timestampMs) {
            this.level = level;
            this.loggerName = loggerName;
            this.message = message;
            this.timestampMs = timestampMs;
        }

        boolean passesMinLevel(String minLevel) {
            return getLevelOrdinal(this.level) >= getLevelOrdinal(minLevel);
        }

        private static int getLevelOrdinal(String level) {
            return switch (level) {
                case "ERROR" -> 4;
                case "WARN" -> 3;
                case "INFO" -> 2;
                case "DEBUG" -> 1;
                case "TRACE" -> 0;
                default -> -1;
            };
        }
    }
}
