package com.example.demo.modules.cageshelf.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;
import java.util.Map;

@Mapper
public interface CageShelfCellSnapshotMapper {

    /** Ensure the snapshot table exists. */
    void ensureTable();

    /** Batch insert cell rows for a scan batch. */
    int batchInsert(@Param("rows") List<Map<String, Object>> rows);

    /**
     * Get the latest scan batch cells for a given room+shelf pair.
     * Returns 80 rows (or fewer if the shelf isn't full).
     */
    List<Map<String, Object>> selectLatestByRoomAndShelve(
            @Param("roomId") Long roomId,
            @Param("shelveId") Long shelveId);

    /**
     * Batch query: get latest cells for multiple room+shelf pairs.
     * Takes a list of [roomId, shelveId] maps.
     */
    List<Map<String, Object>> selectLatestByPairs(@Param("pairs") List<Map<String, Object>> pairs);

    /** Delete batches older than N days. */
    int deleteOlderThan(@Param("cutoff") String cutoff);

    /** Get all cells for a specific batch and shelf (for historical grid). */
    List<Map<String, Object>> selectByBatchAndShelve(
            @Param("scanBatchId") String scanBatchId,
            @Param("shelveId") Long shelveId);
}
