package com.example.demo.modules.agv.mapper;

import org.apache.ibatis.annotations.*;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@Mapper
public interface AgvStatsMapper {

    // ── Config CRUD ──

    @Select("SELECT * FROM agv_stats_config WHERE is_active = 1 ORDER BY id")
    List<Map<String, Object>> selectAllActiveConfigs();

    @Select("SELECT * FROM agv_stats_config WHERE id = #{id}")
    Map<String, Object> selectConfigById(@Param("id") Long id);

    @Select("SELECT * FROM agv_stats_config WHERE pipeline_slug = #{slug}")
    Map<String, Object> selectConfigBySlug(@Param("slug") String slug);

    @Insert("INSERT INTO agv_stats_config (name, config_type, definition_json, pipeline_slug, is_active) " +
            "VALUES (#{name}, #{configType}, #{definitionJson}, #{pipelineSlug}, 1)")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insertConfig(Map<String, Object> config);

    @Update("UPDATE agv_stats_config SET name = #{name}, config_type = #{configType}, " +
            "definition_json = #{definitionJson}, pipeline_slug = #{pipelineSlug} WHERE id = #{id}")
    int updateConfig(@Param("id") Long id, @Param("name") String name, @Param("configType") String configType,
                     @Param("definitionJson") String definitionJson, @Param("pipelineSlug") String pipelineSlug);

    @Update("UPDATE agv_stats_config SET is_active = #{active} WHERE id = #{id}")
    int toggleConfig(@Param("id") Long id, @Param("active") int active);

    @Delete("DELETE FROM agv_stats_config WHERE id = #{id}")
    int deleteConfig(@Param("id") Long id);

    // ── Snapshot CRUD ──

    @Select("SELECT * FROM agv_stats_snapshot WHERE config_id = #{configId}")
    List<Map<String, Object>> selectSnapshotsByConfigId(@Param("configId") Long configId);

    @Select("SELECT * FROM agv_stats_snapshot WHERE config_id = #{configId} AND metric_key = #{metricKey}")
    Map<String, Object> selectSnapshot(@Param("configId") Long configId, @Param("metricKey") String metricKey);

    @Insert("INSERT INTO agv_stats_snapshot (config_id, metric_key, current_value, trend, last_value, is_running, started_at) " +
            "VALUES (#{configId}, #{metricKey}, #{currentValue}, #{trend}, #{lastValue}, #{isRunning}, #{startedAt}) " +
            "ON DUPLICATE KEY UPDATE current_value = VALUES(current_value), trend = VALUES(trend), " +
            "last_value = VALUES(last_value), is_running = VALUES(isRunning), started_at = VALUES(startedAt)")
    int upsertSnapshot(Map<String, Object> snapshot);

    @Update("UPDATE agv_stats_snapshot SET current_value = #{currentValue}, trend = #{trend}, " +
            "last_value = #{lastValue}, is_running = #{isRunning}, started_at = #{startedAt} " +
            "WHERE id = #{id}")
    int updateSnapshot(@Param("id") Long id, @Param("currentValue") double currentValue,
                       @Param("trend") String trend, @Param("lastValue") Double lastValue,
                       @Param("isRunning") Boolean isRunning, @Param("startedAt") String startedAt);

    @Delete("DELETE FROM agv_stats_snapshot WHERE config_id = #{configId}")
    int deleteSnapshotsByConfigId(@Param("configId") Long configId);

    // ── Event Log ──

    @Insert("INSERT INTO agv_stats_event_log (robot_ip, event_type, event_target, event_at, metadata_json) " +
            "VALUES (#{robotIp}, #{eventType}, #{eventTarget}, #{eventAt}, #{metadataJson})")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insertEvent(Map<String, Object> event);

    @Select("SELECT * FROM agv_stats_event_log WHERE consumed = 0 ORDER BY event_at ASC LIMIT #{limit}")
    List<Map<String, Object>> selectUnconsumedEvents(@Param("limit") int limit);

    @Update("UPDATE agv_stats_event_log SET consumed = 1 WHERE id = #{id}")
    int markEventConsumed(@Param("id") Long id);

    @Update("UPDATE agv_stats_event_log SET consumed = 1 WHERE id IN " +
            "(SELECT id FROM (SELECT id FROM agv_stats_event_log WHERE consumed = 0 ORDER BY event_at ASC LIMIT #{limit}) tmp)")
    int markEventsConsumedBatch(@Param("limit") int limit);

    @Delete("DELETE FROM agv_stats_event_log WHERE consumed = 1 AND created_at < #{before}")
    int deleteConsumedEvents(@Param("before") LocalDateTime before);

    // ── Station list (for config UI) ──

    @Select("SELECT DISTINCT station FROM agv_trajectory WHERE station IS NOT NULL AND station != '' ORDER BY station")
    List<String> selectDistinctStations();

    // ── Odo delta for a robot in time window ──

    @Select("SELECT MAX(odo) - MIN(odo) AS odo_delta FROM agv_trajectory " +
            "WHERE robot_ip = #{ip} AND recorded_at BETWEEN #{from} AND #{to} AND odo IS NOT NULL")
    Double selectOdoDelta(@Param("ip") String ip, @Param("from") LocalDateTime from, @Param("to") LocalDateTime to);

    // ── Event log stats (for monitoring) ──

    @Select("SELECT COUNT(*) FROM agv_stats_event_log WHERE consumed = 0")
    int countUnconsumedEvents();

    @Select("SELECT event_type, COUNT(*) AS cnt FROM agv_stats_event_log " +
            "WHERE created_at >= #{since} GROUP BY event_type ORDER BY cnt DESC")
    List<Map<String, Object>> selectEventTypeCounts(@Param("since") LocalDateTime since);

    // ── Config: list all (including inactive) ──

    @Select("SELECT * FROM agv_stats_config ORDER BY id")
    List<Map<String, Object>> selectAllConfigs();

    @Select("<script>SELECT * FROM agv_stats_config WHERE is_active = 1" +
            "<if test='type != null'> AND config_type = #{type}</if>" +
            " ORDER BY id</script>")
    List<Map<String, Object>> selectActiveConfigsByType(@Param("type") String type);

    // ── Trajectory: for event interceptor ──

    @Select("SELECT robot_ip, recorded_at, station, task_status, odo " +
            "FROM agv_trajectory " +
            "WHERE robot_ip = #{ip} AND recorded_at > #{since} " +
            "ORDER BY recorded_at ASC LIMIT #{limit}")
    List<Map<String, Object>> selectTrajectoryAfter(@Param("ip") String ip,
                                                     @Param("since") LocalDateTime since,
                                                     @Param("limit") int limit);

    @Select("SELECT DISTINCT robot_ip FROM agv_trajectory WHERE recorded_at >= #{since} ORDER BY robot_ip")
    List<String> selectActiveRobotIps(@Param("since") LocalDateTime since);

    // ── Event log: history queries ──

    @Select("<script>SELECT * FROM agv_stats_event_log " +
            "WHERE event_at BETWEEN #{from} AND #{to} " +
            "<if test='eventType != null'> AND event_type = #{eventType}</if>" +
            "<if test='eventTargets != null and eventTargets.size() > 0'>" +
            "AND event_target IN <foreach item='t' collection='eventTargets' open='(' separator=',' close=')'>#{t}</foreach>" +
            "</if>" +
            "ORDER BY event_at ASC</script>")
    List<Map<String, Object>> selectEventsInRange(@Param("from") LocalDateTime from,
                                                   @Param("to") LocalDateTime to,
                                                   @Param("eventType") String eventType,
                                                   @Param("eventTargets") List<String> eventTargets);

    // ── Batch mark consumed by IDs (for compute engine) ──

    @Update("<script>UPDATE agv_stats_event_log SET consumed = 1 WHERE id IN " +
            "<foreach item='id' collection='ids' open='(' separator=',' close=')'>#{id}</foreach></script>")
    int markEventsConsumedByIds(@Param("ids") List<Long> ids);

}
