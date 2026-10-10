package com.example.demo.modules.telemetry.mapper;

import com.example.demo.modules.telemetry.entity.TelemetryLongtermSampleRow;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDateTime;
import java.util.List;

@Mapper
public interface TelemetryLongtermSampleMapper {

    int insertBatch(@Param("list") List<TelemetryLongtermSampleRow> list);

    long countByFilter(
            @Param("variableQ") String variableQ,
            @Param("from") LocalDateTime from,
            @Param("to") LocalDateTime to);

    List<TelemetryLongtermSampleRow> selectPageByFilter(
            @Param("variableQ") String variableQ,
            @Param("from") LocalDateTime from,
            @Param("to") LocalDateTime to,
            @Param("offset") int offset,
            @Param("limit") int limit);

    /** 导出：按区间取全量（带上限，防把整年拉进内存） */
    List<TelemetryLongtermSampleRow> selectForExport(
            @Param("variableNames") List<String> variableNames,
            @Param("from") LocalDateTime from,
            @Param("to") LocalDateTime to,
            @Param("limit") int limit);

    /** 月份下拉：已有哪些月份有数据 */
    List<String> selectDistinctMonths();

    /**
     * 区间内**有数据的日期**（{@code yyyy-MM-dd}，新的在前）。
     * 日历上标「哪天有数据」靠它；矩阵按天取数也先经它定位。
     */
    List<String> selectDistinctDays(@Param("from") LocalDateTime from,
                                    @Param("to") LocalDateTime to);
}
