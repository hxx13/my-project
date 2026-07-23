package com.example.demo.modules.twin.scan.delay.mapper;

import com.example.demo.modules.twin.scan.delay.entity.TwinScanDelayRoomOption;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface TwinScanDelayRoomOptionMapper {
    List<TwinScanDelayRoomOption> listAll();

    List<TwinScanDelayRoomOption> listByRoomId(@Param("roomId") String roomId);

    List<TwinScanDelayRoomOption> listByRoomIds(@Param("roomIds") List<String> roomIds);

    int deleteByRoomId(@Param("roomId") String roomId);

    int deleteByOptionId(@Param("optionId") Long optionId);

    int insert(TwinScanDelayRoomOption row);
}
