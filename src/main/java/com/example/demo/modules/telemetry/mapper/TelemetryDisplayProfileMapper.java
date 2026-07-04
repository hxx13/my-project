package com.example.demo.modules.telemetry.mapper;

import com.example.demo.modules.telemetry.entity.TelemetryDisplayProfileRow;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface TelemetryDisplayProfileMapper {

    List<TelemetryDisplayProfileRow> selectAll();

    TelemetryDisplayProfileRow selectByCode(@Param("code") String code);

    int upsert(TelemetryDisplayProfileRow row);
}
