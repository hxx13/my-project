package com.example.demo.common.support;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

/**
 * 只读 {@code /proc} 的小探针。
 *
 * <p>存在的理由：JDK 的 {@code OperatingSystemMXBean} 有两个给不出的东西，而监控页正需要它们 ——
 *
 * <ol>
 *   <li><b>可用内存</b>：{@code getFreeMemorySize()} 在 Linux 上取内核 {@code MemFree}，**不含
 *       page cache**。Linux 会把空闲 RAM 全用作文件缓存，所以 `(total - free)/total` 永远接近 100%，
 *       加内存也不会降。真实口径是 {@code MemAvailable}（MemFree + 可回收的缓存/slab）。</li>
 *   <li><b>进程 RSS</b>：MXBean 没有 RSS。{@code Runtime.totalMemory()} 是**已提交的堆**，
 *       不是进程占用 —— 之前监控页把后者当前者显示，卡片文案与数字互相矛盾。</li>
 * </ol>
 *
 * <p>非 Linux（本机开发是 Windows）返回 -1，调用方据此显示「不适用」而不是编一个数出来。
 */
public final class LinuxMemoryProbe {

    private LinuxMemoryProbe() {
    }

    /** {@code /proc/meminfo} 的 MemAvailable；非 Linux 或读取失败返回 -1。 */
    public static long memAvailableBytes() {
        return kbOrMinus1("/proc/meminfo", "MemAvailable");
    }

    /** {@code /proc/self/status} 的 VmRSS；非 Linux 或读取失败返回 -1。 */
    public static long rssBytes() {
        return kbOrMinus1("/proc/self/status", "VmRSS");
    }

    private static long kbOrMinus1(String path, String key) {
        try {
            return parseKb(Files.readAllLines(Path.of(path)), key);
        } catch (Exception ignored) {
            // 非 Linux / 无权限 / 文件不存在：一律当作「拿不到」
            return -1L;
        }
    }

    /**
     * 从 {@code /proc} 风格的内容里取 {@code Key:  1234 kB} 的字节数。
     * 单独拆出来是为了能测 —— 文件读不到时返回 -1 而不是 0（0 会被当成「内存用光了」）。
     */
    static long parseKb(List<String> lines, String key) {
        for (String line : lines) {
            if (line.startsWith(key + ":")) {
                String[] parts = line.substring(key.length() + 1).trim().split("\\s+");
                if (parts.length == 0 || parts[0].isEmpty()) {
                    return -1L;
                }
                return Long.parseLong(parts[0]) * 1024L;
            }
        }
        return -1L;
    }
}
