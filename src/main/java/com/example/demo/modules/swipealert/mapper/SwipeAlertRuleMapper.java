package com.example.demo.modules.swipealert.mapper;

import com.example.demo.modules.swipealert.entity.SwipeAlertRule;
import org.apache.ibatis.annotations.*;

import java.util.List;

@Mapper
public interface SwipeAlertRuleMapper {

    @Select("""
            SELECT id, name, enabled,
                   channels, departments,
                   open_types AS openTypes,
                   title_template AS titleTemplate,
                   body_template AS bodyTemplate,
                   threshold_count AS thresholdCount,
                   threshold_window_sec AS thresholdWindowSec,
                   banner_duration_sec AS bannerDurationSec,
                   min_role_level AS minRoleLevel,
                   cooldown_sec AS cooldownSec,
                   notify_site AS notifySite,
                   notify_push AS notifyPush,
                   notify_user_ids AS notifyUserIds,
                   notify_cardholder AS notifyCardholder,
                   created_at AS createdAt,
                   updated_at AS updatedAt
            FROM swipe_alert_rule
            WHERE enabled = 1
            """)
    List<SwipeAlertRule> findByEnabledTrue();

    @Select("""
            SELECT id, name, enabled,
                   channels, departments,
                   open_types AS openTypes,
                   title_template AS titleTemplate,
                   body_template AS bodyTemplate,
                   threshold_count AS thresholdCount,
                   threshold_window_sec AS thresholdWindowSec,
                   banner_duration_sec AS bannerDurationSec,
                   min_role_level AS minRoleLevel,
                   cooldown_sec AS cooldownSec,
                   notify_site AS notifySite,
                   notify_push AS notifyPush,
                   notify_user_ids AS notifyUserIds,
                   notify_cardholder AS notifyCardholder,
                   created_at AS createdAt,
                   updated_at AS updatedAt
            FROM swipe_alert_rule
            ORDER BY enabled DESC, id ASC
            """)
    List<SwipeAlertRule> findAll();

    @Select("""
            SELECT id, name, enabled,
                   channels, departments,
                   open_types AS openTypes,
                   title_template AS titleTemplate,
                   body_template AS bodyTemplate,
                   threshold_count AS thresholdCount,
                   threshold_window_sec AS thresholdWindowSec,
                   banner_duration_sec AS bannerDurationSec,
                   min_role_level AS minRoleLevel,
                   cooldown_sec AS cooldownSec,
                   notify_site AS notifySite,
                   notify_push AS notifyPush,
                   notify_user_ids AS notifyUserIds,
                   notify_cardholder AS notifyCardholder,
                   created_at AS createdAt,
                   updated_at AS updatedAt
            FROM swipe_alert_rule
            WHERE id = #{id}
            """)
    SwipeAlertRule findById(@Param("id") Long id);

    @Insert("""
            INSERT INTO swipe_alert_rule
                (name, enabled, channels, departments,
                 open_types, title_template, body_template,
                 threshold_count, threshold_window_sec,
                 banner_duration_sec, min_role_level, cooldown_sec,
                 notify_site, notify_push, notify_cardholder)
            VALUES
                (#{name}, #{enabled}, #{channels}, #{departments},
                 #{openTypes}, #{titleTemplate}, #{bodyTemplate},
                 #{thresholdCount}, #{thresholdWindowSec},
                 #{bannerDurationSec}, #{minRoleLevel}, #{cooldownSec},
                 #{notifySite}, #{notifyPush}, #{notifyCardholder})
            """)
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(SwipeAlertRule rule);

    @Update("""
            UPDATE swipe_alert_rule SET
                name = #{name},
                enabled = #{enabled},
                channels = #{channels},
                departments = #{departments},
                open_types = #{openTypes},
                title_template = #{titleTemplate},
                body_template = #{bodyTemplate},
                threshold_count = #{thresholdCount},
                threshold_window_sec = #{thresholdWindowSec},
                banner_duration_sec = #{bannerDurationSec},
                min_role_level = #{minRoleLevel},
                cooldown_sec = #{cooldownSec},
                notify_site = #{notifySite},
                notify_push = #{notifyPush},
                notify_cardholder = #{notifyCardholder}
            WHERE id = #{id}
            """)
    int update(SwipeAlertRule rule);

    @Delete("DELETE FROM swipe_alert_rule WHERE id = #{id}")
    int deleteById(@Param("id") Long id);

    @Select("SELECT notify_user_ids FROM swipe_alert_rule WHERE id = #{id}")
    String findNotifyUserIdsById(@Param("id") Long id);

    @Update("UPDATE swipe_alert_rule SET notify_user_ids = #{userIds} WHERE id = #{id}")
    int updateNotifyUserIds(@Param("id") Long id, @Param("userIds") String userIds);
}
