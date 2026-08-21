package com.example.demo.modules.cageshelf.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;
import java.util.Map;

/**
 * 笼位预约（booking）本地化表 Mapper。
 * 三张表：cage_booking_room / cage_booking_room_aup / cage_booking_aup_dict。
 * 读优先本地、同步手动 upsert、删除走软删（deleted=1 同步不复活）。
 */
@Mapper
public interface CageBookingMapper {

    // ── cage_booking_room ──

    List<Map<String, Object>> selectRooms();

    int upsertRooms(@Param("list") List<Map<String, Object>> rows);

    // ── cage_booking_room_aup ──

    List<Map<String, Object>> selectRoomAups(@Param("roomId") String roomId);

    /** 跨房间搜索：按 register_number / pi_name LIKE，排除软删 */
    List<Map<String, Object>> searchAups(@Param("keyword") String keyword);

    /** upsert AUP 明细（同步用）；ON DUPLICATE KEY UPDATE 不触碰 deleted，已软删不复活 */
    int upsertRoomAups(@Param("list") List<Map<String, Object>> rows);

    /** 本地新增/编辑：upsert 单条 AUP 分配 */
    int upsertRoomAup(@Param("aroId") String aroId,
                      @Param("roomId") String roomId,
                      @Param("name") String name,
                      @Param("piName") String piName,
                      @Param("registerNumber") String registerNumber,
                      @Param("aupId") String aupId,
                      @Param("rentNumber") Integer rentNumber,
                      @Param("memo") String memo);

    /** 本地软删：deleted=1（同步不复活） */
    int softDeleteRoomAup(@Param("aroId") String aroId);
}
