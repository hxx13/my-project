package com.example.demo.modules.twin.dashboard.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDateTime;
import java.util.Map;

@Mapper
public interface StrandedViolationConfigMapper {

    Map<String, Object> selectConfig();

    void updateExecutionResult(@Param("executedAt") LocalDateTime executedAt,
                               @Param("result") String result);

    void updateConfig(@Param("autoSignoutEnabled") Integer autoSignoutEnabled,
                      @Param("violationTextTpl") String violationTextTpl,
                      @Param("forbidEnter") Integer forbidEnter,
                      @Param("expireAfterDays") Integer expireAfterDays,
                      @Param("whitelistDepts") String whitelistDepts,
                      @Param("interactiveChallengeEnabled") Integer interactiveChallengeEnabled,
                      @Param("interactiveChallengePhrase") String interactiveChallengePhrase);
}
