package com.example.demo.modules.cageshelf.config;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 每条配置都必须写「定义行 + 运行值行」：设置中心按运行值行的 id 更新，
 * 只写定义行会让面板显示「配置项未初始化」而存不了。
 *
 * <p><b>加配置项时要同步改 {@link #CONFIG_KEYS}</b> —— 2026-09-18 加「转移审核通知」那个二级开关时
 * 漏改，只在全量跑里才暴露（当时只挑了相关测试类跑，恒绿）。
 */
@ExtendWith(MockitoExtension.class)
class CageTransferApprovalConfigSeedTest {

    /** 与 {@link CageTransferApprovalConfigSeed} 里 def(...) 的调用条数一一对应。 */
    private static final int CONFIG_KEYS = 3;

    @Mock private JdbcTemplate jdbc;

    @Test
    void 首次启动_每条配置各写一行定义与一行运行值() {
        // 定义行与运行值行的存在性查询都返回 0 = 全新库
        when(jdbc.queryForObject(any(String.class), eq(Integer.class), any(), any())).thenReturn(0);

        new CageTransferApprovalConfigSeed(jdbc).run(null);

        // CONFIG_KEYS 条配置 ×（1 条 def INSERT + 1 条 runtime INSERT）
        verify(jdbc, times(CONFIG_KEYS)).update(contains("INSERT INTO sys_system_config_def"), any(), any(), any(), any(), any(), any());
        verify(jdbc, times(CONFIG_KEYS)).update(contains("INSERT INTO sys_system_config "), any(), any(), any());
    }

    @Test
    void 已存在_不重复写() {
        when(jdbc.queryForObject(any(String.class), eq(Integer.class), any(), any())).thenReturn(1);

        new CageTransferApprovalConfigSeed(jdbc).run(null);

        verify(jdbc, org.mockito.Mockito.never()).update(contains("INSERT INTO sys_system_config_def"), any(), any(), any(), any(), any(), any());
        verify(jdbc, org.mockito.Mockito.never()).update(contains("INSERT INTO sys_system_config "), any(), any(), any());
    }
}
