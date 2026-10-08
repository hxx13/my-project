package com.example.demo.common.support;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * /proc 解析的闸门。
 *
 * <p>为什么要它：这个探针的返回值直接决定监控页上「系统内存 88.7%」是真是假。
 * 一旦把「读不到」误判成 0，页面会显示内存耗尽；误判成某个大数则会显示内存充裕 ——
 * 两种都比「显示不适用」糟得多。所以 -1 的语义必须被钉住。
 */
class LinuxMemoryProbeTest {

    /** 真实的 /proc/meminfo 片段（值以 kB 计）。 */
    private static final List<String> MEMINFO = List.of(
            "MemTotal:       16000000 kB",
            "MemFree:         1700000 kB",
            "MemAvailable:    9500000 kB",
            "Buffers:          200000 kB",
            "Cached:          8000000 kB"
    );

    @Test
    void parsesMemAvailableInBytes() {
        // 9_500_000 kB → ×1024 字节
        assertEquals(9_500_000L * 1024L, LinuxMemoryProbe.parseKb(MEMINFO, "MemAvailable"));
        assertEquals(1_700_000L * 1024L, LinuxMemoryProbe.parseKb(MEMINFO, "MemFree"));
    }

    /** 字段不存在必须是 -1（拿不到），不能是 0（会被当成耗尽）。 */
    @Test
    void missingKeyReturnsMinusOne() {
        assertEquals(-1L, LinuxMemoryProbe.parseKb(MEMINFO, "VmRSS"));
        assertEquals(-1L, LinuxMemoryProbe.parseKb(List.of(), "MemAvailable"));
    }

    /** /proc/self/status 的 VmRSS 格式与 meminfo 一致，同一个解析器要能吃。 */
    @Test
    void parsesVmRssFromStatusFormat() {
        List<String> status = List.of(
                "Name:\tjava",
                "VmPeak:\t  12345678 kB",
                "VmRSS:\t   3145728 kB"
        );
        assertEquals(3_145_728L * 1024L, LinuxMemoryProbe.parseKb(status, "VmRSS"));
    }

    /** 前缀相同但不同键不能互相串（VmRSS 不能匹配到 VmPeak）。 */
    @Test
    void doesNotConfuseSimilarKeys() {
        List<String> status = List.of("VmPeak:\t  12345678 kB");
        assertEquals(-1L, LinuxMemoryProbe.parseKb(status, "VmRSS"));
    }

    /** 本机（Windows）取不到 /proc：必须返回 -1，而不是抛异常或返回 0。 */
    @Test
    void nonLinuxReturnsMinusOne() {
        if (System.getProperty("os.name", "").toLowerCase().contains("linux")) {
            assertTrue(LinuxMemoryProbe.memAvailableBytes() > 0, "Linux 上应能读到 MemAvailable");
            assertTrue(LinuxMemoryProbe.rssBytes() > 0, "Linux 上应能读到 VmRSS");
        } else {
            assertTrue(LinuxMemoryProbe.memAvailableBytes() < 0, "非 Linux 应为 -1");
            assertTrue(LinuxMemoryProbe.rssBytes() < 0, "非 Linux 应为 -1");
        }
    }
}
