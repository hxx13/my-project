package com.example.demo.modules.twin.dashboard.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDateTime;
import java.util.Map;

@Mapper
public interface StrandedViolationConfigMapper {

    /** 第一道：违规+公告（id=1） */
    Map<String, Object> selectConfig();

    /** 第二道：仅签退（id=2） */
    Map<String, Object> selectSignoutConfig();

    void updateExecutionResult(@Param("executedAt") LocalDateTime executedAt,
                               @Param("result") String result);

    void updateSignoutExecutionResult(@Param("executedAt") LocalDateTime executedAt,
                                      @Param("result") String result);

    void updateSignoutOnlyConfig(@Param("autoSignoutEnabled") Integer autoSignoutEnabled);

    /** 幂等：确保 id=2 第二道签退配置行存在（启动自动执行，无需手工跑 scripts） */
    void ensureSignoutConfigRow();

    void updateConfig(@Param("autoSignoutEnabled") Integer autoSignoutEnabled,
                      @Param("violationTextTpl") String violationTextTpl,
                      @Param("forbidEnter") Integer forbidEnter,
                      @Param("expireAfterDays") Integer expireAfterDays,
                      @Param("whitelistDepts") String whitelistDepts,
                      @Param("interactiveChallengeEnabled") Integer interactiveChallengeEnabled,
                      @Param("interactiveChallengePhrase") String interactiveChallengePhrase,
                      @Param("interactiveUnlockOnVerify") Integer interactiveUnlockOnVerify);
}
