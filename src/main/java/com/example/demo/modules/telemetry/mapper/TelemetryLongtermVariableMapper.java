package com.example.demo.modules.telemetry.mapper;

import com.example.demo.modules.telemetry.entity.TelemetryLongtermVariableRow;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface TelemetryLongtermVariableMapper {

    List<TelemetryLongtermVariableRow> selectAllOrdered();

    int deleteAll();

    int insertBatch(@Param("list") List<TelemetryLongtermVariableRow> list);
}
