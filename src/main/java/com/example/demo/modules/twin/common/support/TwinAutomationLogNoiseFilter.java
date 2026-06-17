package com.example.demo.modules.twin.common.support;

import com.example.demo.modules.twin.common.service.JobExecutionRegistry;

import java.util.List;
import java.util.Set;

/**
 * 自动化日志列表默认隐藏的「高频定时轮询」任务（勾选「定时轮询日志」后才展示）。
 * 与 {@code TwinAutomationLogMapper.xml} 中 IN 列表保持一致。
 */
public final class TwinAutomationLogNoiseFilter {

    /** 窗口内按间隔重复执行的 SCHEDULER event_key */
    public static final Set<String> ROUTINE_POLL_EVENT_KEYS = Set.of(
            JobExecutionRegistry.JOB_ARO_PENETRATION_POLL,
            JobExecutionRegistry.JOB_DASHBOARD_RANKING_ACTIVITY,
            JobExecutionRegistry.JOB_DASHBOARD_RANKING_ANIMAL
    );

    public static final List<String> ROUTINE_POLL_EVENT_KEYS_ORDERED = List.copyOf(ROUTINE_POLL_EVENT_KEYS);

    private TwinAutomationLogNoiseFilter() {
    }
}
