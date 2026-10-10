package com.example.demo.modules.telemetry.mapper;

import com.example.demo.modules.telemetry.entity.TelemetryLongtermSampleLogRow;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface TelemetryLongtermSampleLogMapper {

    int insert(TelemetryLongtermSampleLogRow row);

    List<TelemetryLongtermSampleLogRow> selectRecent(@Param("limit") int limit);
}
