package com.example.demo.modules.twin.rpg.config;

import org.springframework.stereotype.Component;

import java.time.LocalDate;

/**
 * RPG 经验计算截止日期（后端内置默认，不参与启动阶段、不物理删库）。
 * 2025-06-01 00:00:00 之前的 aro_access_log 不参与经验计算与对账。
 */
@Component
public class RpgExpCutoffProperties {

    private static final LocalDate DEFAULT_CUTOFF = LocalDate.of(2025, 6, 1);

    public LocalDate cutoffDate() {
        return DEFAULT_CUTOFF;
    }

    public String cutoffStartForQuery() {
        return DEFAULT_CUTOFF + " 00:00:00";
    }

    public boolean isOnOrAfterCutoff(LocalDate date) {
        return date != null && !date.isBefore(DEFAULT_CUTOFF);
    }
}
