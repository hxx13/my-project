package com.example.demo.modules.doortempunlock.mapper;

import com.example.demo.modules.doortempunlock.entity.DoorTempUnlockRule;
import org.apache.ibatis.annotations.*;

import java.util.List;

@Mapper
public interface DoorTempUnlockRuleMapper {

    @Select("""
            SELECT id, name, enabled,
                   channel_codes AS channelCodes,
                   threshold_count AS thresholdCount,
                   threshold_window_sec AS thresholdWindowSec,
                   unlock_duration_sec AS unlockDurationSec,
                   cooldown_sec AS cooldownSec,
                   created_at AS createdAt,
                   updated_at AS updatedAt
            FROM door_temp_unlock_rule
            WHERE enabled = 1
            """)
    List<DoorTempUnlockRule> findByEnabledTrue();

    @Select("""
            SELECT id, name, enabled,
                   channel_codes AS channelCodes,
                   threshold_count AS thresholdCount,
                   threshold_window_sec AS thresholdWindowSec,
                   unlock_duration_sec AS unlockDurationSec,
                   cooldown_sec AS cooldownSec,
                   created_at AS createdAt,
                   updated_at AS updatedAt
            FROM door_temp_unlock_rule
            ORDER BY enabled DESC, id ASC
            """)
    List<DoorTempUnlockRule> findAll();

    @Select("""
            SELECT id, name, enabled,
                   channel_codes AS channelCodes,
                   threshold_count AS thresholdCount,
                   threshold_window_sec AS thresholdWindowSec,
                   unlock_duration_sec AS unlockDurationSec,
                   cooldown_sec AS cooldownSec,
                   created_at AS createdAt,
                   updated_at AS updatedAt
            FROM door_temp_unlock_rule
            WHERE id = #{id}
            """)
    DoorTempUnlockRule findById(@Param("id") Long id);

    @Insert("""
            INSERT INTO door_temp_unlock_rule
                (name, enabled, channel_codes,
                 threshold_count, threshold_window_sec,
                 unlock_duration_sec, cooldown_sec)
            VALUES
                (#{name}, #{enabled}, #{channelCodes},
                 #{thresholdCount}, #{thresholdWindowSec},
                 #{unlockDurationSec}, #{cooldownSec})
            """)
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(DoorTempUnlockRule rule);

    @Update("""
            UPDATE door_temp_unlock_rule SET
                name = #{name},
                enabled = #{enabled},
                channel_codes = #{channelCodes},
                threshold_count = #{thresholdCount},
                threshold_window_sec = #{thresholdWindowSec},
                unlock_duration_sec = #{unlockDurationSec},
                cooldown_sec = #{cooldownSec}
            WHERE id = #{id}
            """)
    int update(DoorTempUnlockRule rule);

    @Delete("DELETE FROM door_temp_unlock_rule WHERE id = #{id}")
    int deleteById(@Param("id") Long id);
}
