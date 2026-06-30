package com.example.demo.modules.twin.scan.delay.mapper;

import com.example.demo.modules.twin.scan.delay.entity.TwinScanDelayCarrierOption;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface TwinScanDelayCarrierOptionMapper {
    List<Long> listOptionIdsByCarrierId(@Param("carrierId") Long carrierId);

    List<TwinScanDelayCarrierOption> listByCarrierIds(@Param("carrierIds") List<Long> carrierIds);

    int countByCarrierId(@Param("carrierId") Long carrierId);

    int deleteByCarrierId(@Param("carrierId") Long carrierId);

    int deleteByOptionId(@Param("optionId") Long optionId);

    int insert(TwinScanDelayCarrierOption row);
}
