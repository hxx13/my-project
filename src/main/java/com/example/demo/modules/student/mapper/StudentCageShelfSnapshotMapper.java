package com.example.demo.modules.student.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;
import java.util.Map;

@Mapper
public interface StudentCageShelfSnapshotMapper {

    /** Bulk insert snapshot rows */
    int batchInsert(@Param("list") List<Map<String, Object>> rows);

    /** Get all occupied grid cells for a shelf in the latest batch (unfiltered by groups). */
    List<Map<String, Object>> selectGridByShelve(
            @Param("shelveId") String shelveId,
            @Param("latestBatchId") String latestBatchId
    );

    /** Get grid cells for a shelf, filtered by project group names (for visible cells) */
    List<Map<String, Object>> selectGridByShelveAndGroups(
            @Param("shelveId") String shelveId,
            @Param("groupNames") List<String> groupNames,
            @Param("latestBatchId") String latestBatchId
    );

    /** Get latest snapshot batch ID for a shelf */
    String selectLatestBatchId(@Param("shelveId") String shelveId);

    /** Delete old snapshots for a shelf (keep only the latest batch) */
    int deleteOldBatches(@Param("shelveId") String shelveId, @Param("latestBatchId") String latestBatchId);

    /** Delete snapshots older than N days */
    int deleteOlderThan(@Param("cutoff") String cutoff);

    /** Distinct shelves that have been snapshotted (for filter options) */
    List<Map<String, Object>> selectDistinctShelves(@Param("groupNames") List<String> groupNames);

    /** Check if user has refreshed recently (within N hours) */
    int countRecentRefreshByUser(@Param("userId") String userId, @Param("since") String since);

    /** Count any existing snapshots refreshed by this user (for first-access detection) */
    int countByRefreshedBy(@Param("userId") String userId);

    /** Get cage type counts (animalCageType → count) per shelveId for latest batch */
    List<Map<String, Object>> selectCageTypeCountsByShelveIds(@Param("shelveIds") List<String> shelveIds);
}
