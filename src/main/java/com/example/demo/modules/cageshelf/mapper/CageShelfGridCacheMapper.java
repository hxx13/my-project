package com.example.demo.modules.cageshelf.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.Map;

@Mapper
public interface CageShelfGridCacheMapper {

    /** Ensure cache table exists (idempotent). */
    void ensureTable();

    /** Get cached grid data for a shelf. */
    Map<String, Object> selectByShelveId(@Param("shelveId") String shelveId);

    /** Upsert cache row. */
    int upsert(@Param("shelveId") String shelveId,
               @Param("gridJson") String gridJson,
               @Param("shelfMetaJson") String shelfMetaJson,
               @Param("totalCells") int totalCells,
               @Param("filledCells") int filledCells);

    /** Delete cache older than N days. */
    int deleteOlderThan(@Param("cutoff") String cutoff);
}
