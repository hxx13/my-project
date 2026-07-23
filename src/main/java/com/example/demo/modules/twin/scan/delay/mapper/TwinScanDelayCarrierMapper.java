package com.example.demo.modules.twin.scan.delay.mapper;

import com.example.demo.modules.twin.scan.delay.entity.TwinScanDelayCarrier;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface TwinScanDelayCarrierMapper {
    List<TwinScanDelayCarrier> listAll();

    TwinScanDelayCarrier findById(@Param("id") Long id);

    int insert(TwinScanDelayCarrier row);

    int update(TwinScanDelayCarrier row);

    int deleteById(@Param("id") Long id);
}
