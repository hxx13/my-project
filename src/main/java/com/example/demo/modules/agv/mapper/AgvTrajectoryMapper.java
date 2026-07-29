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

    /** 查询历史轨迹中所有不同的站点（用于自动生成空间元素候选项） */
    @Select("<script>SELECT DISTINCT station, map_name FROM agv_trajectory WHERE station IS NOT NULL AND station != ''" +
            "<if test='mapName != null'> AND map_name = #{mapName}</if>" +
            "ORDER BY station</script>")
    List<Map<String, Object>> selectDistinctStations(@Param("mapName") String mapName);

    /** 查询某站点最近的坐标样本（用于生成包围盒 polygon） */
    @Select("SELECT x, y FROM agv_trajectory WHERE station = #{station} AND x IS NOT NULL AND y IS NOT NULL ORDER BY recorded_at DESC LIMIT #{limit}")
    List<Map<String, Object>> selectStationCoords(@Param("station") String station, @Param("limit") int limit);
}
