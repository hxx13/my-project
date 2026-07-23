package com.example.demo.modules.telemetry.mapper;

import com.example.demo.modules.telemetry.entity.TelemetryMetricKindRow;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface TelemetryMetricKindMapper {

    List<TelemetryMetricKindRow> selectAllOrderBySort();

    TelemetryMetricKindRow selectByCode(@Param("code") String code);

    int insert(TelemetryMetricKindRow row);

    int updateByCode(TelemetryMetricKindRow row);

    int deleteByCode(@Param("code") String code);
}
