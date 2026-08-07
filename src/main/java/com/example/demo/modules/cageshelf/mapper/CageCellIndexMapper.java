package com.example.demo.modules.cageshelf.mapper;

import com.example.demo.modules.cageshelf.entity.CageCellIndex;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;
import java.util.Map;

@Mapper
public interface CageCellIndexMapper {

    /** 创建表（Bootstrap） */
    int createTableIfNeeded();

    /** 批量 upsert 笼位索引 */
    int batchUpsert(@Param("list") List<CageCellIndex> list);

    /** 按架子查所有笼位 */
    List<CageCellIndex> selectByShelfIndexId(@Param("shelfIndexId") Long shelfIndexId);

    /** 按 shelveId 查所有笼位 */
    List<CageCellIndex> selectByShelveId(@Param("shelveId") Long shelveId);

    /** 单条更新 animalCageId（前端编辑用） */
    int updateAnimalCageId(@Param("shelfIndexId") Long shelfIndexId,
                           @Param("positionX") Integer positionX,
                           @Param("positionY") Integer positionY,
                           @Param("animalCageId") Long animalCageId);

    /** 全量笼位汇总：每个架子统计 synced/total */
    List<Map<String, Object>> shelfCellSummary(@Param("roomId") Long roomId,
                                                @Param("keyword") String keyword,
                                                @Param("limit") int limit,
                                                @Param("offset") int offset);

    int shelfCellSummaryCount(@Param("roomId") Long roomId,
                              @Param("keyword") String keyword);

    /** 清空指定 shelveId 的所有笼位索引（重新同步前） */
    int deleteByShelveId(@Param("shelveId") Long shelveId);

    /** 列出所有有索引的架子 shelveId */
    List<Long> selectIndexedShelveIds();

    /** 全局反查：根据 animalCageId 查所属架子+坐标 */
    Map<String, Object> lookupByAnimalCageId(@Param("animalCageId") Long animalCageId);

    /** 按 animalCageId 查单个笼位索引（含房间ID） */
    Map<String, Object> selectByAnimalCageId(@Param("animalCageId") Long animalCageId);
}
