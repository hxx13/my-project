package com.example.demo.common.logging.registry;

import ch.qos.logback.classic.Level;

/**
 * 日志分类实体：描述一个可动态控制级别的日志分组。
 */
public final class LogCategory {
    private final String key;
    private final String loggerName;
    private final String description;
    private final Level defaultLevel;

    public LogCategory(String key, String loggerName, String description, Level defaultLevel) {
        this.key = key;
        this.loggerName = loggerName;
        this.description = description;
        this.defaultLevel = defaultLevel;
    }

    public String key()          { return key; }
    public String loggerName()   { return loggerName; }
    public String description()  { return description; }
    public Level defaultLevel()  { return defaultLevel; }
}
