package com.example.demo.modules.cageshelf.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

/**
 * 笼位配额（quota）计数 Mapper。
 * 键：register_number 字符串（= aup_record.register_no = cage_cell_detail.aup_number），
 * 不用 aup_id（同步写 ARO id / 手工写本地 id，语义被污染）。
 */
@Mapper
public interface CageQuotaMapper {

    /** 某 AUP 在某房间的实际占用格位数（三跳 JOIN，走 shelf_index_id=id 本地主键路） */
    int countAupUsedInRoom(@Param("roomId") Long roomId, @Param("registerNo") String registerNo);

    /** 某 AUP 在某房间的配额（rent_number），无行返回 null */
    Integer selectRentNumber(@Param("roomId") Long roomId, @Param("registerNo") String registerNo);

    /** 某房间已切出的配额之和（deleted=0） */
    int sumRentNumber(@Param("roomId") Long roomId);

    /** 某房间上限（animal_cage_number），无行返回 null */
    Integer selectRoomCapacity(@Param("roomId") Long roomId);

    /** 某房间实际占用格位数（所有 AUP 汇总） */
    int countRoomUsed(@Param("roomId") Long roomId);
}
