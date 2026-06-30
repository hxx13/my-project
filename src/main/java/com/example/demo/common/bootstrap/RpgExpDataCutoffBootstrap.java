package com.example.demo.common.bootstrap;

import com.example.demo.common.logging.annotation.StartupPhase;
import com.example.demo.common.logging.model.StartupContext;
import com.example.demo.common.logging.model.StartupResult;
import com.example.demo.common.logging.model.StartupRunner;
import com.example.demo.modules.twin.rpg.config.RpgExpCutoffProperties;
import com.example.demo.modules.twin.rpg.service.RpgExpCutoffService;
import org.springframework.stereotype.Component;

import java.util.Map;

/**
 * 启动时按 {@code twin.rpg.exp.cutoff.*} 截断截止日前的进出流水与经验流水。
 */
@StartupPhase(
        name = "RPG 经验数据截断",
        order = 3,
        description = "删除截止日期前的 aro_access_log / twin_exp_record 并重算经验"
)
@Component
public class RpgExpDataCutoffBootstrap implements StartupRunner {

    private final RpgExpCutoffProperties properties;
    private final RpgExpCutoffService cutoffService;

    public RpgExpDataCutoffBootstrap(RpgExpCutoffProperties properties,
                                     RpgExpCutoffService cutoffService) {
        this.properties = properties;
        this.cutoffService = cutoffService;
    }

    @Override
    public StartupResult run(StartupContext ctx) {
        if (!properties.isEnabled() || !properties.isApplyOnStartup()) {
            return StartupResult.success("RPG 经验截断未启用或未配置启动执行");
        }

        Map<String, Object> summary = cutoffService.applyPhysicalCutoff();
        int access = intVal(summary.get("accessLogsDeleted"));
        int exp = intVal(summary.get("expRecordsDeleted"));
        String cutoff = String.valueOf(summary.get("cutoff"));

        if (access == 0 && exp == 0) {
            return StartupResult.success("RPG 截断检查完成，无 " + cutoff + " 之前的数据需删除");
        }

        return StartupResult.success(
                "已截断 " + cutoff + " 前数据：进出流水 " + access + " 条，经验流水 " + exp + " 条");
    }

    private static int intVal(Object v) {
        if (v instanceof Number n) {
            return n.intValue();
        }
        return 0;
    }
}
