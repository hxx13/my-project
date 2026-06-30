package com.example.demo.modules.twin.scan.delay.mapper;

import com.example.demo.modules.twin.scan.delay.entity.TwinScanDelayOption;
import com.example.demo.modules.twin.scan.delay.entity.TwinScanDelayRequest;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface TwinScanDelayOptionMapper {
    List<TwinScanDelayOption> listAll();

    List<TwinScanDelayOption> listEnabledByRoomIds(@Param("roomIds") List<String> roomIds);

    TwinScanDelayOption findById(@Param("id") Long id);

    List<TwinScanDelayOption> listByCarrierId(@Param("carrierId") Long carrierId);

    int countByCarrierId(@Param("carrierId") Long carrierId);

    int insert(TwinScanDelayOption row);

    int update(TwinScanDelayOption row);

    int deleteById(@Param("id") Long id);
}
