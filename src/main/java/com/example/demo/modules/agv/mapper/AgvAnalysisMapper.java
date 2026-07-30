package com.example.demo.modules.agv.mapper;

import com.example.demo.modules.agv.analysis.model.*;
import org.apache.ibatis.annotations.*;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@Mapper
public interface AgvAnalysisMapper {

    // ── Spatial Elements ──

    @Select("SELECT * FROM agv_spatial_element WHERE is_active = 1 ORDER BY id")
    List<AgvSpatialElement> selectAllSpatialElements();

    @Select("SELECT * FROM agv_spatial_element WHERE id = #{id}")
    AgvSpatialElement selectSpatialElementById(Long id);

    @Insert("INSERT INTO agv_spatial_element (name, map_name, element_type, station_pattern, polygon_json, poi_x, poi_y, poi_radius_m, semantic_tags, color, is_active, confidence, hit_count, source) " +
            "VALUES (#{name}, #{mapName}, #{elementType}, #{stationPattern}, #{polygonJson}, #{poiX}, #{poiY}, #{poiRadiusM}, #{semanticTags}, #{color}, #{isActive}, #{confidence}, #{hitCount}, #{source})")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insertSpatialElement(AgvSpatialElement e);

    @Update("UPDATE agv_spatial_element SET name=#{name}, map_name=#{mapName}, element_type=#{elementType}, " +
            "station_pattern=#{stationPattern}, polygon_json=#{polygonJson}, poi_x=#{poiX}, poi_y=#{poiY}, " +
            "poi_radius_m=#{poiRadiusM}, semantic_tags=#{semanticTags}, color=#{color}, is_active=#{isActive}, " +
            "confidence=#{confidence}, hit_count=#{hitCount}, source=#{source} WHERE id=#{id}")
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

    @Select("SELECT * FROM agv_activity_segment WHERE robot_ip = #{robotIp} AND activity_type = '未完成停靠' AND end_time >= DATE_SUB(NOW(), INTERVAL #{sinceMinutes} MINUTE) ORDER BY start_time")
    List<AgvActivitySegment> selectIncompleteVisits(@Param("robotIp") String robotIp, @Param("sinceMinutes") int sinceMinutes);

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

    // ── Spatial Zone Discovery ──

    /** Get all AUTO segments in a time window for spatial clustering */
    @Select("SELECT * FROM agv_activity_segment WHERE start_time BETWEEN #{from} AND #{to} AND source = 'AUTO' AND avg_x IS NOT NULL AND avg_y IS NOT NULL")
    List<AgvActivitySegment> selectSegmentsInWindow(@Param("from") LocalDateTime from, @Param("to") LocalDateTime to);

    /** Find existing BEHAVIOR zones of a given activity type near a point */
    @Select("SELECT * FROM agv_spatial_element WHERE source = 'BEHAVIOR' AND is_active = 1 AND semantic_tags LIKE CONCAT('%\"', #{tag}, '\"%')")
    List<AgvSpatialElement> selectBehaviorZonesByTag(@Param("tag") String tag);

    /** Increment hit_count + recalculate confidence for an existing zone */
    @Update("UPDATE agv_spatial_element SET hit_count = hit_count + #{deltaHits}, " +
            "confidence = LEAST(1.0, #{newConfidence}) WHERE id = #{id}")
    int incrementZoneConfidence(@Param("id") Long id, @Param("deltaHits") int deltaHits, @Param("newConfidence") double newConfidence);

    /** Decay confidence for BEHAVIOR zones NOT hit in the current window */
    @Update("UPDATE agv_spatial_element SET confidence = GREATEST(0.1, confidence * 0.95) " +
            "WHERE source = 'BEHAVIOR' AND is_active = 1 AND updated_at < #{before}")
    int decayUnhitZones(@Param("before") LocalDateTime before);

    // ── Routes ──

    @Select("SELECT * FROM agv_route WHERE enabled = 1 ORDER BY robot_ip, route_type, frequency DESC")
    List<AgvRoute> selectAllRoutes();

    @Select("SELECT * FROM agv_route WHERE robot_ip = #{robotIp} AND enabled = 1 ORDER BY route_type, frequency DESC")
    List<AgvRoute> selectRoutesByRobot(@Param("robotIp") String robotIp);

    @Insert("INSERT INTO agv_route (robot_ip, name, route_type, path_json, color, from_station, to_station, frequency, enabled) " +
            "VALUES (#{robotIp}, #{name}, #{routeType}, #{pathJson}, #{color}, #{fromStation}, #{toStation}, #{frequency}, #{enabled})")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insertRoute(AgvRoute r);

    @Update("UPDATE agv_route SET enabled = #{enabled} WHERE id = #{id}")
    int toggleRoute(@Param("id") Long id, @Param("enabled") Integer enabled);

    @Delete("DELETE FROM agv_route WHERE robot_ip = #{robotIp}")
    int deleteRoutesByRobot(@Param("robotIp") String robotIp);

    /** Get trajectory points within a segment's time range for path extraction */
    @Select("SELECT x, y, recorded_at FROM agv_trajectory WHERE robot_ip = #{robotIp} AND recorded_at BETWEEN #{from} AND #{to} AND x IS NOT NULL AND y IS NOT NULL ORDER BY recorded_at LIMIT #{limit}")
    List<Map<String, Object>> selectTrajectoryPoints(@Param("robotIp") String robotIp, @Param("from") LocalDateTime from, @Param("to") LocalDateTime to, @Param("limit") int limit);

    // ── Route Discovery (full history, no time window) ──

    @Select("SELECT DISTINCT robot_ip FROM agv_activity_segment WHERE source = 'AUTO' AND activity_type IN ('TRANSPORT','NAVIGATING','REVERSE_MANEUVER')")
    List<String> selectDistinctRobotIps();

    @Select("SELECT * FROM agv_activity_segment WHERE robot_ip = #{robotIp} AND source = 'AUTO' AND activity_type IN ('TRANSPORT','NAVIGATING','REVERSE_MANEUVER') AND start_x IS NOT NULL AND end_x IS NOT NULL ORDER BY start_time")
    List<AgvActivitySegment> selectRoutableSegmentsByRobot(@Param("robotIp") String robotIp);

    // ── Analytics aggregation queries ──

    /** 活动时间分布：每种 activity_type 的总时长(秒)和次数 */
    @Select("SELECT activity_type, COUNT(*) AS cnt, SUM(TIMESTAMPDIFF(SECOND, start_time, end_time)) AS total_sec " +
            "FROM agv_activity_segment WHERE robot_ip = #{ip} AND start_time BETWEEN #{from} AND #{to} AND source = 'AUTO' " +
            "GROUP BY activity_type ORDER BY total_sec DESC")
    List<Map<String, Object>> selectActivityDistribution(@Param("ip") String ip,
                                                         @Param("from") LocalDateTime from,
                                                         @Param("to") LocalDateTime to);

    /** 异常统计 */
    @Select("SELECT activity_type, COUNT(*) AS cnt " +
            "FROM agv_activity_segment WHERE robot_ip = #{ip} AND start_time BETWEEN #{from} AND #{to} " +
            "AND activity_type IN ('EMERGENCY_STOP','BLOCKED_WAIT','RELOC_EVENT') GROUP BY activity_type")
    List<Map<String, Object>> selectAnomalyCounts(@Param("ip") String ip,
                                                   @Param("from") LocalDateTime from,
                                                   @Param("to") LocalDateTime to);

    /** 运输趟次 */
    @Select("SELECT COUNT(*) FROM agv_activity_segment WHERE robot_ip = #{ip} AND start_time BETWEEN #{from} AND #{to} AND activity_type = 'TRANSPORT'")
    int countTransportTrips(@Param("ip") String ip, @Param("from") LocalDateTime from, @Param("to") LocalDateTime to);

    /** 电量均值 */
    @Select("SELECT COALESCE(AVG(battery), 0) FROM agv_trajectory WHERE robot_ip = #{ip} AND recorded_at BETWEEN #{from} AND #{to} AND battery IS NOT NULL")
    double avgBattery(@Param("ip") String ip, @Param("from") LocalDateTime from, @Param("to") LocalDateTime to);
}
