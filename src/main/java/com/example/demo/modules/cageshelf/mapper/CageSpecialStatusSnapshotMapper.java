package com.example.demo.modules.cageshelf.mapper;

import com.example.demo.modules.cageshelf.entity.CageSpecialStatusSnapshot;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;
import java.util.Map;

@Mapper
public interface CageSpecialStatusSnapshotMapper {

    /** Ensure the snapshot table exists (idempotent DDL). */
    void ensureTable();

    /** Add campus_name column to existing table (no-op if already exists). */
    void addCampusColumnIfMissing();

    /** Batch insert/upsert snapshot rows. */
    int batchInsert(@Param("list") List<CageSpecialStatusSnapshot> rows);

    /** Delete all rows from a previous scan batch. */
    int deleteByScanBatchId(@Param("scanBatchId") String scanBatchId);

    /** Get the latest scan batch ID and its timestamp. */
    Map<String, Object> selectLatestBatchInfo();

    /** Group snapshot rows by status_code for the latest batch. */
    List<Map<String, Object>> selectGroupedByStatus(@Param("scanBatchId") String scanBatchId);

    /** Get all rows for the latest batch (paginated for export). */
    List<CageSpecialStatusSnapshot> selectByBatchId(
            @Param("scanBatchId") String scanBatchId,
            @Param("statusCode") String statusCode,
            @Param("offset") int offset,
            @Param("limit") int limit);

    /** Get ALL rows for a batch (used by diff engine). */
    List<CageSpecialStatusSnapshot> selectAllByBatchId(@Param("scanBatchId") String scanBatchId);
}
