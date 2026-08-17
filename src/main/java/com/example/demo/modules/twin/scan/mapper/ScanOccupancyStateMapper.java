package com.example.demo.modules.twin.scan.mapper;

import com.example.demo.modules.twin.scan.state.ScanOccupancyState;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface ScanOccupancyStateMapper {

    ScanOccupancyState selectByUserId(@Param("userId") String userId);

    int upsert(ScanOccupancyState row);
}
