package com.example.demo.modules.twin.rpg.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import java.time.LocalDate;

/**
 * RPG 经验/进出流水截止日期：该日 00:00:00 之前的数据不参与计算并可被物理删除。
 */
@Component
@ConfigurationProperties(prefix = "twin.rpg.exp.cutoff")
public class RpgExpCutoffProperties {

    /** 是否启用截止日期（查询过滤 + 可选启动截断） */
    private boolean enabled = true;

    /** 保留数据的起始日（含当日），此前数据视为截断范围 */
    private LocalDate date = LocalDate.of(2025, 6, 1);

    /** 应用启动时自动删除截止日前的 aro_access_log / twin_exp_record */
    private boolean applyOnStartup = true;

    /** 截断后自动全量重算经验（写入 twin_exp_record + 更新 personnel） */
    private boolean autoRecalc = true;

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    public LocalDate getDate() {
        return date;
    }

    public void setDate(LocalDate date) {
        this.date = date;
    }

    public boolean isApplyOnStartup() {
        return applyOnStartup;
    }

    public void setApplyOnStartup(boolean applyOnStartup) {
        this.applyOnStartup = applyOnStartup;
    }

    public boolean isAutoRecalc() {
        return autoRecalc;
    }

    public void setAutoRecalc(boolean autoRecalc) {
        this.autoRecalc = autoRecalc;
    }

    /** SQL 下界：{@code yyyy-MM-dd 00:00:00}；未启用时返回 null */
    public String cutoffStartInclusive() {
        if (!enabled || date == null) {
            return null;
        }
        return date + " 00:00:00";
    }
}
