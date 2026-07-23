package com.example.demo.modules.twin.scan.delay.mapper;

import com.example.demo.modules.twin.scan.delay.entity.TwinScanDelayRoomCarrier;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface TwinScanDelayRoomCarrierMapper {
    List<TwinScanDelayRoomCarrier> listAll();

    List<TwinScanDelayRoomCarrier> listByRoomId(@Param("roomId") String roomId);

    List<TwinScanDelayRoomCarrier> listByRoomIds(@Param("roomIds") List<String> roomIds);

    int countByRoomAndCarrier(@Param("roomId") String roomId, @Param("carrierId") Long carrierId);

    int deleteByRoomId(@Param("roomId") String roomId);

    int deleteByCarrierId(@Param("carrierId") Long carrierId);

    int insert(TwinScanDelayRoomCarrier row);
}
