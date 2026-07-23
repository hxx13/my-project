package com.example.demo.modules.cageshelf.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;
import java.util.Map;

@Mapper
public interface CageShelfGridCacheMapper {

    /** Ensure cache table exists (idempotent). */
    void ensureTable();

    /** Add type count columns if missing (for existing tables). */
    void addTypeCountColumns();

    /** Get cached grid data for a shelf. */
    Map<String, Object> selectByShelveId(@Param("shelveId") String shelveId);

    /** Upsert cache row. */
    int upsert(@Param("shelveId") String shelveId,
               @Param("gridJson") String gridJson,
               @Param("shelfMetaJson") String shelfMetaJson,
               @Param("totalCells") int totalCells,
               @Param("filledCells") int filledCells,
               @Param("type1Count") int type1Count,
               @Param("type2Count") int type2Count,
               @Param("type3Count") int type3Count,
               @Param("type4Count") int type4Count);

    /** Update type counts for an existing cache row (backfill). */
    int updateTypeCounts(@Param("shelveId") String shelveId,
                         @Param("type1Count") int type1Count,
                         @Param("type2Count") int type2Count,
                         @Param("type3Count") int type3Count,
                         @Param("type4Count") int type4Count);

    /** All cache rows with grid_json (for backfill). */
    List<Map<String, Object>> selectAllForBackfill();

    /** Delete cache older than N days. */
    int deleteOlderThan(@Param("cutoff") String cutoff);

    /** 有占用笼位的缓存行（用于课题组可见笼架判定） */
    List<Map<String, Object>> selectAllWithFilledCells();
}
