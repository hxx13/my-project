package com.example.demo.modules.agv.mapper;

import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@Mapper
public interface AgvTrajectoryMapper {

    @Insert("INSERT INTO agv_trajectory (" +
            "robot_ip, ret_code, x, y, angle, battery, task_status, map_name, station, " +
            "charging, blocked, emergency, confidence, odo, vehicle_id, " +
            "reloc_status, loadmap_status, rssi, ssid, driver_emc, " +
            "fork_height, jack_enable, jack_error_code, jack_isFull, jack_mode, jack_state, " +
            "total_time, robot_note, " +
            "errors_json, fatals_json, warnings_json, notices_json, di_json, " +
            "create_on_agv, recorded_at) " +
            "VALUES (" +
            "#{ip}, #{retCode}, #{x}, #{y}, #{angle}, #{battery}, #{taskStatus}, #{mapName}, #{station}, " +
            "#{charging}, #{blocked}, #{emergency}, #{confidence}, #{odo}, #{vehicleId}, " +
            "#{relocStatus}, #{loadmapStatus}, #{rssi}, #{ssid}, #{driverEmc}, " +
            "#{forkHeight}, #{jackEnable}, #{jackErrorCode}, #{jackIsFull}, #{jackMode}, #{jackState}, " +
            "#{totalTime}, #{robotNote}, " +
            "#{errorsJson}, #{fatalsJson}, #{warningsJson}, #{noticesJson}, #{diJson}, " +
            "#{createOnAgv}, #{recordedAt})")
    int insert(@Param("ip") String ip,
               @Param("retCode") Integer retCode,
               @Param("x") Double x, @Param("y") Double y, @Param("angle") Double angle,
               @Param("battery") Double battery, @Param("taskStatus") Integer taskStatus,
               @Param("mapName") String mapName, @Param("station") String station,
               @Param("charging") Boolean charging, @Param("blocked") Boolean blocked,
               @Param("emergency") Boolean emergency, @Param("confidence") Double confidence,
               @Param("odo") Double odo, @Param("vehicleId") String vehicleId,
               @Param("relocStatus") Integer relocStatus, @Param("loadmapStatus") Integer loadmapStatus,
               @Param("rssi") Integer rssi, @Param("ssid") String ssid,
               @Param("driverEmc") Boolean driverEmc,
               @Param("forkHeight") Double forkHeight,
               @Param("jackEnable") Boolean jackEnable, @Param("jackErrorCode") Integer jackErrorCode,
               @Param("jackIsFull") Boolean jackIsFull, @Param("jackMode") Boolean jackMode,
               @Param("jackState") Integer jackState,
               @Param("totalTime") Long totalTime, @Param("robotNote") String robotNote,
               @Param("errorsJson") String errorsJson, @Param("fatalsJson") String fatalsJson,
               @Param("warningsJson") String warningsJson, @Param("noticesJson") String noticesJson,
               @Param("diJson") String diJson,
               @Param("createOnAgv") String createOnAgv,
               @Param("recordedAt") LocalDateTime recordedAt);

    @Select("SELECT * FROM agv_trajectory " +
            "WHERE robot_ip = #{ip} AND recorded_at BETWEEN #{from} AND #{to} " +
            "ORDER BY recorded_at DESC LIMIT #{limit}")
    List<Map<String, Object>> selectTrajectory(@Param("ip") String ip,
                                               @Param("from") LocalDateTime from,
                                               @Param("to") LocalDateTime to,
                                               @Param("limit") int limit);

    @Select("SELECT * FROM agv_trajectory " +
            "WHERE recorded_at BETWEEN #{from} AND #{to} " +
            "AND FIND_IN_SET(robot_ip, #{ips}) > 0 " +
            "ORDER BY recorded_at ASC LIMIT #{limit}")
    List<Map<String, Object>> selectReplay(@Param("ips") String ips,
                                           @Param("from") LocalDateTime from,
                                           @Param("to") LocalDateTime to,
                                           @Param("limit") int limit);

    @Select("SELECT DISTINCT robot_ip FROM agv_trajectory " +
            "WHERE recorded_at >= #{since} ORDER BY robot_ip")
    List<String> selectActiveRobots(@Param("since") LocalDateTime since);

    /** 升序查询（分析用） */
    @Select("SELECT * FROM agv_trajectory " +
            "WHERE robot_ip = #{ip} AND recorded_at BETWEEN #{from} AND #{to} " +
            "ORDER BY recorded_at ASC LIMIT #{limit}")
    List<Map<String, Object>> selectTrajectoryAsc(@Param("ip") String ip,
                                                  @Param("from") LocalDateTime from,
                                                  @Param("to") LocalDateTime to,
                                                  @Param("limit") int limit);

    /** 单机器人概要统计 */
    @Select("SELECT " +
            "COUNT(*) AS totalSamples, " +
            "MIN(recorded_at) AS firstSeen, MAX(recorded_at) AS lastSeen, " +
            "AVG(battery) AS avgBattery, MIN(battery) AS minBattery, MAX(battery) AS maxBattery, " +
            "SUM(CASE WHEN charging = 1 THEN 1 ELSE 0 END) AS chargingCount, " +
            "SUM(CASE WHEN blocked = 1 THEN 1 ELSE 0 END) AS blockedCount, " +
            "SUM(CASE WHEN emergency = 1 THEN 1 ELSE 0 END) AS emergencyCount, " +
            "MAX(odo) AS totalOdo, " +
            "COUNT(DISTINCT station) AS stationCount, " +
            "COUNT(DISTINCT map_name) AS mapCount " +
            "FROM agv_trajectory WHERE robot_ip = #{ip}")
    Map<String, Object> selectRobotSummary(@Param("ip") String ip);

    /** 全车队轨迹合并（热力图） */
    @Select("SELECT x, y FROM agv_trajectory " +
            "WHERE recorded_at >= #{since} AND x IS NOT NULL AND y IS NOT NULL")
    List<Map<String, Object>> selectFleetTrajectory(@Param("since") LocalDateTime since);

    /** 分析专用：只查 4 列，避免 SELECT * 拉 TEXT 大字段 */
    @Select("SELECT x, y, recorded_at, station FROM agv_trajectory " +
            "WHERE robot_ip = #{ip} AND recorded_at BETWEEN #{from} AND #{to} " +
            "AND x IS NOT NULL AND y IS NOT NULL " +
            "ORDER BY recorded_at ASC LIMIT #{limit}")
    List<Map<String, Object>> selectTrajectoryAnalytics(@Param("ip") String ip,
                                                         @Param("from") LocalDateTime from,
                                                         @Param("to") LocalDateTime to,
                                                         @Param("limit") int limit);

    /** 查询历史轨迹中所有不同的站点（用于自动生成空间元素候选项） */
    @Select("<script>SELECT DISTINCT station, map_name FROM agv_trajectory WHERE station IS NOT NULL AND station != ''" +
            "<if test='mapName != null'> AND map_name = #{mapName}</if>" +
            "ORDER BY station</script>")
    List<Map<String, Object>> selectDistinctStations(@Param("mapName") String mapName);

    /** 查询某站点最近的坐标样本（用于生成包围盒 polygon），含 robot_ip 以标记归属 */
    @Select("SELECT x, y, robot_ip FROM agv_trajectory WHERE station = #{station} AND x IS NOT NULL AND y IS NOT NULL ORDER BY recorded_at DESC LIMIT #{limit}")
    List<Map<String, Object>> selectStationCoords(@Param("station") String station, @Param("limit") int limit);

    /** 查询某站点出现次数最多的 robot_ip（用于 zone 归属标记） */
    @Select("SELECT robot_ip, COUNT(*) AS cnt FROM agv_trajectory WHERE station = #{station} AND robot_ip IS NOT NULL GROUP BY robot_ip ORDER BY cnt DESC LIMIT 1")
    Map<String, Object> selectDominantRobotIpForStation(@Param("station") String station);

    /** 检查某时间段内小车是否有叉臂抬升/降低动作 (fork_height > 0.001m) */
    @Select("SELECT COUNT(*) FROM agv_trajectory WHERE robot_ip = #{ip} AND recorded_at BETWEEN #{from} AND #{to} AND fork_height IS NOT NULL AND fork_height > 0.001")
    int countForkActiveInWindow(@Param("ip") String ip, @Param("from") LocalDateTime from, @Param("to") LocalDateTime to);

    // ── 小时级预聚合 ──

    @Select("SELECT * FROM agv_analytics_hourly WHERE robot_ip = #{ip} AND hour_bucket BETWEEN #{from} AND #{to} ORDER BY hour_bucket")
    List<Map<String, Object>> selectAnalyticsHourly(@Param("ip") String ip,
                                                     @Param("from") LocalDateTime from,
                                                     @Param("to") LocalDateTime to);

    @Select("SELECT * FROM agv_analytics_hourly WHERE robot_ip = #{ip} AND hour_bucket = #{hour}")
    Map<String, Object> selectAnalyticsHour(@Param("ip") String ip, @Param("hour") LocalDateTime hour);

    @Insert("INSERT INTO agv_analytics_hourly (robot_ip, hour_bucket, sample_count, moving_count, total_distance_m, " +
            "first_x, first_y, last_x, last_y, min_x, max_x, min_y, max_y, speed_bins_json, station_json, hop_json, accel_json) " +
            "VALUES (#{ip}, #{hour}, #{sampleCount}, #{movingCount}, #{totalDistanceM}, " +
            "#{firstX}, #{firstY}, #{lastX}, #{lastY}, #{minX}, #{maxX}, #{minY}, #{maxY}, " +
            "#{speedBinsJson}, #{stationJson}, #{hopJson}, #{accelJson}) " +
            "ON DUPLICATE KEY UPDATE sample_count=VALUES(sample_count), moving_count=VALUES(moving_count), " +
            "total_distance_m=VALUES(total_distance_m), first_x=VALUES(first_x), first_y=VALUES(first_y), " +
            "last_x=VALUES(last_x), last_y=VALUES(last_y), min_x=VALUES(min_x), max_x=VALUES(max_x), " +
            "min_y=VALUES(min_y), max_y=VALUES(max_y), speed_bins_json=VALUES(speed_bins_json), " +
            "station_json=VALUES(station_json), hop_json=VALUES(hop_json), accel_json=VALUES(accel_json)")
    int upsertAnalyticsHourly(@Param("ip") String ip,
                               @Param("hour") LocalDateTime hour,
                               @Param("sampleCount") int sampleCount,
                               @Param("movingCount") int movingCount,
                               @Param("totalDistanceM") double totalDistanceM,
                               @Param("firstX") Double firstX, @Param("firstY") Double firstY,
                               @Param("lastX") Double lastX, @Param("lastY") Double lastY,
                               @Param("minX") Double minX, @Param("maxX") Double maxX,
                               @Param("minY") Double minY, @Param("maxY") Double maxY,
                               @Param("speedBinsJson") String speedBinsJson,
                               @Param("stationJson") String stationJson,
                               @Param("hopJson") String hopJson,
                               @Param("accelJson") String accelJson);
}
