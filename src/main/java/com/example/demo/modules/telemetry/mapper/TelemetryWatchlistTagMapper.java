package com.example.demo.modules.telemetry.mapper;

import com.example.demo.modules.telemetry.entity.TelemetryWatchlistTagRow;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDateTime;
import java.util.List;

@Mapper
public interface TelemetryWatchlistTagMapper {

    int deleteByBundleId(@Param("bundleId") Long bundleId);

    int insertBatch(@Param("list") List<TelemetryWatchlistTagRow> list);

    /** 同一 bundle 下同名变量则更新列（用于多次导入合并，不整表删除） */
    int upsertOne(TelemetryWatchlistTagRow row);

    /** 所有分区中已启用的变量，按分区 id、行顺序，供 WinCC 合并拉取与展示映射 */
    List<TelemetryWatchlistTagRow> selectAllEnabledTagsJoinedBundlesOrdered();

    int countByBundleId(@Param("bundleId") Long bundleId);

    List<TelemetryWatchlistTagRow> selectPageByBundle(
            @Param("bundleId") Long bundleId,
            @Param("offset") int offset,
            @Param("limit") int limit,
            @Param("q") String q);

    List<TelemetryWatchlistTagRow> selectAllByBundleForWincc(@Param("bundleId") Long bundleId);

    List<TelemetryWatchlistTagRow> selectAllByBundleForDisplay(@Param("bundleId") Long bundleId);

    List<String> selectWinccNamesByBundleId(@Param("bundleId") Long bundleId);

    /** 管理端表格全量加载（套内行数建议 &lt; 5000） */
    List<TelemetryWatchlistTagRow> selectAllByBundleId(@Param("bundleId") Long bundleId);

    TelemetryWatchlistTagRow selectByBundleIdAndVariableName(@Param("bundleId") Long bundleId,
                                                             @Param("variableName") String variableName);

    TelemetryWatchlistTagRow selectById(@Param("id") Long id);

    int updateAlarmOverridesById(@Param("id") Long id,
                                 @Param("bundleId") Long bundleId,
                                 @Param("min") String min,
                                 @Param("max") String max);

    int mergeCachedAlarmLimitsByVariableName(@Param("parentVar") String parentVar,
                                             @Param("minVal") String minVal,
                                             @Param("maxVal") String maxVal,
                                             @Param("at") LocalDateTime at);

    List<TelemetryWatchlistTagRow> selectCachedAlarmLimitsForSnapshotMerge();
}
