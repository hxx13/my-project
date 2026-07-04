package com.example.demo.modules.telemetry.mapper;

import com.example.demo.modules.telemetry.entity.TelemetryChartGroupRow;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface TelemetryChartGroupMapper {

    List<TelemetryChartGroupRow> selectAll();

    TelemetryChartGroupRow selectById(@Param("id") long id);

    int insert(TelemetryChartGroupRow row);

    int update(TelemetryChartGroupRow row);

    int deleteById(@Param("id") long id);
}
