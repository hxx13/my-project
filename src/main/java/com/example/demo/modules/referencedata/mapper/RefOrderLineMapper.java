package com.example.demo.modules.referencedata.mapper;

import com.example.demo.modules.referencedata.dto.OrderLineCycleUsage;
import com.example.demo.modules.referencedata.entity.RefOrderLine;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface RefOrderLineMapper {

    int insert(RefOrderLine row);

    int deleteByOrderId(@Param("orderId") Long orderId);

    List<RefOrderLine> listByOrderId(@Param("orderId") Long orderId);

    /** 某物品某规格在某到货周期的已下单行投影（数量 + 订单状态），REJECTED/CANCELLED 是否计入由服务层过滤。 */
    List<OrderLineCycleUsage> listCycleUsage(@Param("refDataId") Long refDataId,
                                             @Param("specOption") String specOption,
                                             @Param("cycle") java.time.LocalDate cycle);
}
