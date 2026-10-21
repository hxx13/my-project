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

    /** 某自定义分区下已启用变量的 WinCC 点名；partitionId=null 且 unassigned=false 时返回全部。 */
    List<String> selectEnabledNamesByPartition(@Param("partitionId") Long partitionId,
                                               @Param("unassigned") boolean unassigned);
}
