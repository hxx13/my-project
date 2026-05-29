package com.example.demo.common.support;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.AppenderBase;

/**
 * Logback Appender：将每条日志写入 {@link LogRingBuffer} 环形缓冲区。
 * 在 logback-spring.xml 中声明即可激活。
 */
public class RingBufferAppender extends AppenderBase<ILoggingEvent> {

    @Override
    protected void append(ILoggingEvent event) {
        Level level = event.getLevel();
        if (level == null) return;
        String formattedMessage = event.getFormattedMessage();
        if (formattedMessage == null) return;
        LogRingBuffer.append(
                level.toString(),
                event.getLoggerName(),
                formattedMessage,
                event.getTimeStamp()
        );
    }
}
