package com.example.demo.modules.aup.mapper;

import com.example.demo.modules.aup.entity.AupSnapshot;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/**
 * 快照 mapper 只提供 insert/select，禁 update/delete（快照不可变）。
 */
@Mapper
public interface AupSnapshotMapper {

    int insert(AupSnapshot snapshot);

    AupSnapshot selectById(@Param("id") Long id);

    /** 校验快照归属计划（防跨计划回退） */
    AupSnapshot selectByIdAndAupId(@Param("id") Long id, @Param("aupId") Long aupId);

    /** 轻量列表（不返 data），倒序 */
    List<AupSnapshot> selectLightByAupId(@Param("aupId") Long aupId);

    Integer selectMaxVersionNo(@Param("aupId") Long aupId);

    int countByAupId(@Param("aupId") Long aupId);
}
