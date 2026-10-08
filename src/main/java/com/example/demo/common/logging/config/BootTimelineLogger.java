package com.example.demo.common.logging.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.boot.context.event.ApplicationStartedEvent;
import org.springframework.boot.web.context.WebServerInitializedEvent;
import org.springframework.context.event.EventListener;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.lang.management.ManagementFactory;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;

/**
 * 启动时间线打点：回答「后端已经拉起，nginx 却还 502 很久」到底有多久、耗在哪一段。
 *
 * <p>打三行，把启动拆成三段：
 * <ol>
 *   <li>{@link WebServerInitializedEvent}（Tomcat 已 start，端口开始 accept）
 *       → 「JVM 启动 → 端口监听」，<b>这一段就是 nginx 502 的窗口</b>，端口一通 nginx 立刻恢复；</li>
 *   <li>{@link ApplicationStartedEvent}（上下文刷新完成，ApplicationRunner 即将开始）
 *       → 「JVM 启动 → 上下文就绪」；</li>
 *   <li>{@link ApplicationReadyEvent}（所有 ApplicationRunner 跑完）
 *       → 「JVM 启动 → 应用就绪」，并单独报出 ApplicationRunner 阶段的耗时。</li>
 * </ol>
 *
 * <p><b>为什么统一用 log.warn，而不是 info/debug</b>：生产 logback 的
 * {@code <root level="WARN">} 加上 {@code <logger name="org.springframework.boot" level="WARN">}，
 * 再加 application.properties 的 {@code logging.level.com.example.demo=WARN} ——
 * INFO/DEBUG 会在源头被丢弃，打点等于没打（2026-09-29 就因为这个白忙过一轮）。
 * WARN 在任何一种配置下都能落盘：
 *   jar.log（systemd stdout，无时间戳）、twin.log（logback FILE，带毫秒时间戳）、
 *   以及管理端日志查看器的 RingBuffer。
 *
 * <p>同时给出 JVM 启动时刻，这样不需要再去对照 {@code systemctl show twin -p ExecMainStartTimestamp}。
 * 脚本批次的耗时另有 {@code EmbeddedTwinSystemCoreDdlBootstrap} 结尾那行 {@code [ddl] ...} WARN。
 */
@Component
public class BootTimelineLogger {

    private static final Logger log = LoggerFactory.getLogger("twin.boot");

    private static final DateTimeFormatter TS =
            DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss.SSS").withZone(ZoneId.systemDefault());

    /** 端口就绪时刻，用于把第二段单独算出来；未收到事件时为 0。 */
    private volatile long portReadyMs;

    /** ApplicationStartedEvent 时刻（上下文刷新完、ApplicationRunner 即将开始）。 */
    private volatile long startedMs;

    @EventListener
    public void onWebServerInitialized(WebServerInitializedEvent event) {
        long jvmStart = ManagementFactory.getRuntimeMXBean().getStartTime();
        long now = System.currentTimeMillis();
        portReadyMs = now;
        int port = event.getWebServer().getPort();
        log.warn("[boot] JVM 启动 -> Web 端口 {} 已监听，共 {} 秒（JVM 起于 {}，端口就绪于 {}）",
                port, seconds(jvmStart, now), TS.format(Instant.ofEpochMilli(jvmStart)),
                TS.format(Instant.ofEpochMilli(now)));
    }

    /**
     * ApplicationStartedEvent 在「上下文刷新完成」之后、所有 ApplicationRunner 开始之前发布。
     * 有了它就能把 ApplicationRunner 阶段单独量出来 —— 2026-09-29 本地实测发现：
     * 端口 22.5s 就绪，但到 ApplicationReadyEvent 要 139.8s，中间 112 秒全在这批 runner 里
     * （StartupPhaseRunner 是 HIGHEST_PRECEDENCE，它那张「6 phases · 5.1s」的仪表盘只是最开头，
     * 后面还有上百个 @Order(102…135) 的 SchemaMigrator/Seed 不在仪表盘覆盖范围内）。
     */
    @EventListener
    public void onStarted(ApplicationStartedEvent event) {
        long jvmStart = ManagementFactory.getRuntimeMXBean().getStartTime();
        long now = System.currentTimeMillis();
        startedMs = now;
        log.warn("[boot] JVM 启动 -> 上下文刷新完成（ApplicationRunner 即将开始），共 {} 秒（于 {}）",
                seconds(jvmStart, now), TS.format(Instant.ofEpochMilli(now)));
    }

    /**
     * {@code HIGHEST_PRECEDENCE} 是必须的：ApplicationReadyEvent 的监听器按 @Order 顺序同步执行，
     * 若本监听器排在后面，别的 ready 监听器的耗时会被算进「应用就绪」时间里（那 117.3 秒就是这么来的）。
     * 本类只负责报时，必须第一个跑。
     */
    @EventListener
    @Order(Ordered.HIGHEST_PRECEDENCE)
    public void onReady(ApplicationReadyEvent event) {
        long jvmStart = ManagementFactory.getRuntimeMXBean().getStartTime();
        long now = System.currentTimeMillis();
        long portMs = portReadyMs;
        long startMs = startedMs;
        String runnerPhase = startMs > 0
                ? "；其中 ApplicationRunner 阶段（上下文刷新完成 -> 就绪）用了 " + seconds(startMs, now) + " 秒"
                : "";
        String tail = portMs > 0
                ? "，端口就绪后另有 " + seconds(portMs, now) + " 秒"
                : "";
        log.warn("[boot] JVM 启动 -> 应用就绪，共 {} 秒{}{}（就绪于 {}）",
                seconds(jvmStart, now), tail, runnerPhase, TS.format(Instant.ofEpochMilli(now)));
    }

    private static String seconds(long fromMs, long toMs) {
        return String.format("%.1f", (toMs - fromMs) / 1000.0);
    }
}
