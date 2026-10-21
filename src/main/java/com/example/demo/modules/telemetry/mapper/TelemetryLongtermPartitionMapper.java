package com.example.demo.modules.telemetry.mapper;

import com.example.demo.modules.telemetry.entity.TelemetryLongtermPartitionRow;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface TelemetryLongtermPartitionMapper {

    List<TelemetryLongtermPartitionRow> selectAllOrdered();

    TelemetryLongtermPartitionRow selectById(@Param("id") Long id);

    int insert(TelemetryLongtermPartitionRow row);

    int updateName(@Param("id") Long id, @Param("name") String name);

    int deleteById(@Param("id") Long id);

    /** 删除分区前把其变量归入「未分区」。 */
    int unassignVariables(@Param("id") Long id);
}
