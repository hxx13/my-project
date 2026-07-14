package com.example.demo.common.support;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.classic.spi.IThrowableProxy;
import ch.qos.logback.classic.spi.StackTraceElementProxy;
import ch.qos.logback.core.AppenderBase;

/**
 * Logback Appender：将每条日志写入 {@link LogRingBuffer} 环形缓冲区。
 * 同时捕获异常堆栈（ThrowableProxy）完整写入消息体，带循环检测与内存上限保护。
 * 在 logback-spring.xml 中声明即可激活。
 */
public class RingBufferAppender extends AppenderBase<ILoggingEvent> {

    /** 单条日志消息最大长度（字符），超出截断 */
    private static final int MAX_MESSAGE_LENGTH = 8192;
    /** 单个异常最大堆栈帧数，超出截断 */
    private static final int MAX_STACK_FRAMES = 50;
    /** 异常 cause 链最大深度，超出截断（防循环引用） */
    private static final int MAX_CAUSE_DEPTH = 64;

    /** 可重入防护：防止 append() 内部日志调用触发无限递归 */
    private static final ThreadLocal<Boolean> APPENDING = ThreadLocal.withInitial(() -> false);

    @Override
    protected void append(ILoggingEvent event) {
        // ── 可重入防护 ──
        if (APPENDING.get()) return;
        APPENDING.set(true);
        try {
            appendToBuffer(event);
        } finally {
            APPENDING.set(false);
        }
    }

    private void appendToBuffer(ILoggingEvent event) {
        Level level = event.getLevel();
        if (level == null) return;

        String message = event.getFormattedMessage();
        if (message == null) message = "";

        // 追加异常堆栈
        IThrowableProxy tp = event.getThrowableProxy();
        if (tp != null) {
            StringBuilder sb = new StringBuilder(message);
            sb.append("\n");
            appendThrowable(sb, tp, "", 0);
            // 截断超长消息
            if (sb.length() > MAX_MESSAGE_LENGTH) {
                sb.setLength(MAX_MESSAGE_LENGTH);
                sb.append("\n[... 消息已截断，超出 ").append(MAX_MESSAGE_LENGTH).append(" 字符]");
            }
            message = sb.toString();
        }

        LogRingBuffer.append(
                level.toString(),
                event.getLoggerName(),
                message,
                event.getTimeStamp()
        );
    }

    private void appendThrowable(StringBuilder sb, IThrowableProxy tp, String indent, int depth) {
        // ── 深度上限（防循环）──
        if (depth >= MAX_CAUSE_DEPTH) {
            sb.append(indent).append("[... 异常链截断，已达最大深度 ").append(MAX_CAUSE_DEPTH).append("]\n");
            return;
        }

        sb.append(indent).append(tp.getClassName()).append(": ").append(tp.getMessage()).append("\n");

        // 安全判空：getStackTraceElementProxyArray() 可能返回 null
        StackTraceElementProxy[] steps = tp.getStackTraceElementProxyArray();
        if (steps != null) {
            int frameCount = 0;
            for (StackTraceElementProxy ste : steps) {
                if (frameCount >= MAX_STACK_FRAMES) {
                    sb.append(indent).append("    [... 堆栈截断，剩余 ").append(steps.length - frameCount).append(" 帧]\n");
                    break;
                }
                sb.append(indent).append("    at ").append(ste.toString()).append("\n");
                frameCount++;
            }
        }

        IThrowableProxy cause = tp.getCause();
        if (cause != null) {
            sb.append(indent).append("Caused by: ");
            appendThrowable(sb, cause, indent, depth + 1);
        }
    }
}
