package com.example.demo.modules.agv.mapper;

import com.example.demo.modules.agv.analysis.model.*;
import org.apache.ibatis.annotations.*;

import java.time.LocalDateTime;
import java.util.List;

@Mapper
public interface AgvAnalysisMapper {

    // ── Spatial Elements ──

    @Select("SELECT * FROM agv_spatial_element WHERE is_active = 1 ORDER BY id")
    List<AgvSpatialElement> selectAllSpatialElements();

    @Select("SELECT * FROM agv_spatial_element WHERE id = #{id}")
    AgvSpatialElement selectSpatialElementById(Long id);

    @Insert("INSERT INTO agv_spatial_element (name, map_name, element_type, station_pattern, polygon_json, poi_x, poi_y, poi_radius_m, semantic_tags, color, is_active) " +
            "VALUES (#{name}, #{mapName}, #{elementType}, #{stationPattern}, #{polygonJson}, #{poiX}, #{poiY}, #{poiRadiusM}, #{semanticTags}, #{color}, #{isActive})")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insertSpatialElement(AgvSpatialElement e);

    @Update("UPDATE agv_spatial_element SET name=#{name}, map_name=#{mapName}, element_type=#{elementType}, " +
            "station_pattern=#{stationPattern}, polygon_json=#{polygonJson}, poi_x=#{poiX}, poi_y=#{poiY}, " +
            "poi_radius_m=#{poiRadiusM}, semantic_tags=#{semanticTags}, color=#{color}, is_active=#{isActive} WHERE id=#{id}")
    int updateSpatialElement(AgvSpatialElement e);

    @Delete("UPDATE agv_spatial_element SET is_active = 0 WHERE id = #{id}")
    int softDeleteSpatialElement(Long id);

    // ── Activity Rules ──

    @Select("SELECT * FROM agv_activity_rule ORDER BY priority DESC")
    List<AgvActivityRule> selectAllRules();

    @Select("SELECT * FROM agv_activity_rule WHERE id = #{id}")
    AgvActivityRule selectRuleById(Long id);

    @Insert("INSERT INTO agv_activity_rule (name, activity_type, spatial_cond, primitive_cond, state_cond, min_duration_sec, max_duration_sec, priority, confidence_base, enabled) " +
            "VALUES (#{name}, #{activityType}, #{spatialCond}, #{primitiveCond}, #{stateCond}, #{minDurationSec}, #{maxDurationSec}, #{priority}, #{confidenceBase}, #{enabled})")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insertRule(AgvActivityRule r);

    @Update("UPDATE agv_activity_rule SET name=#{name}, activity_type=#{activityType}, spatial_cond=#{spatialCond}, " +
            "primitive_cond=#{primitiveCond}, state_cond=#{stateCond}, min_duration_sec=#{minDurationSec}, " +
            "max_duration_sec=#{maxDurationSec}, priority=#{priority}, confidence_base=#{confidenceBase}, enabled=#{enabled} WHERE id=#{id}")
    int updateRule(AgvActivityRule r);

    @Update("UPDATE agv_activity_rule SET enabled = #{enabled} WHERE id = #{id}")
    int toggleRule(@Param("id") Long id, @Param("enabled") Integer enabled);

    // ── Activity Segments ──

    @Select("SELECT * FROM agv_activity_segment WHERE robot_ip = #{robotIp} AND start_time BETWEEN #{from} AND #{to} ORDER BY start_time")
    List<AgvActivitySegment> selectSegments(@Param("robotIp") String robotIp, @Param("from") LocalDateTime from, @Param("to") LocalDateTime to);

    @Select("SELECT * FROM agv_activity_segment WHERE id = #{id}")
    AgvActivitySegment selectSegmentById(Long id);

    @Insert("INSERT INTO agv_activity_segment (robot_ip, start_time, end_time, activity_type, zone_id, start_x, start_y, end_x, end_y, avg_x, avg_y, distance_m, battery_delta, source, confidence, rule_id, metadata_json) " +
            "VALUES (#{robotIp}, #{startTime}, #{endTime}, #{activityType}, #{zoneId}, #{startX}, #{startY}, #{endX}, #{endY}, #{avgX}, #{avgY}, #{distanceM}, #{batteryDelta}, #{source}, #{confidence}, #{ruleId}, #{metadataJson})")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insertSegment(AgvActivitySegment seg);

    @Update("UPDATE agv_activity_segment SET activity_type=#{activityType}, source='CORRECTED', correction_id=#{correctionId}, confidence=1.0 WHERE id=#{id}")
    int updateSegmentCorrection(@Param("id") Long id, @Param("activityType") String activityType, @Param("correctionId") Long correctionId);

    @Delete("DELETE FROM agv_activity_segment WHERE robot_ip = #{robotIp} AND start_time BETWEEN #{from} AND #{to} AND source = 'AUTO'")
    int deleteAutoSegmentsInWindow(@Param("robotIp") String robotIp, @Param("from") LocalDateTime from, @Param("to") LocalDateTime to);

    // ── Corrections ──

    @Insert("INSERT INTO agv_correction (segment_id, original_type, corrected_type, corrected_by, correction_note, coordinate_snapshot) " +
            "VALUES (#{segmentId}, #{originalType}, #{correctedType}, #{correctedBy}, #{correctionNote}, #{coordinateSnapshot})")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insertCorrection(AgvCorrection c);

    @Select("SELECT COUNT(*) FROM agv_correction WHERE corrected_type = #{activityType} AND feedback_applied = 0")
    int countUnappliedCorrectionsForType(@Param("activityType") String activityType);

    @Update("UPDATE agv_correction SET feedback_applied = 1, applied_rule_id = #{ruleId} WHERE id IN " +
            "(SELECT id FROM (SELECT id FROM agv_correction WHERE corrected_type = #{activityType} AND feedback_applied = 0 LIMIT #{limit}) tmp)")
    int markCorrectionsApplied(@Param("activityType") String activityType, @Param("ruleId") Long ruleId, @Param("limit") int limit);
}
