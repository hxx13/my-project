package com.example.demo.modules.supplies.mapper;

import com.example.demo.modules.supplies.dto.SupplyAuditRestoredRow;
import com.example.demo.modules.supplies.entity.SupplyClaimLine;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface SupplyClaimLineMapper {
    int insert(SupplyClaimLine row);

    List<SupplyClaimLine> listByOrderId(@Param("orderId") String orderId);

    int updateFulfilledQty(@Param("id") Long id, @Param("fulfilledQty") int fulfilledQty);

    int deleteByOrderId(@Param("orderId") String orderId);

    /** 某物资已出库的领用明细（用于历史清单部分恢复） */
    List<SupplyAuditRestoredRow> listFulfilledHistoryByItemId(@Param("itemId") long itemId, @Param("limit") int limit, @Param("offset") int offset);

    int countFulfilledHistoryByItemId(@Param("itemId") long itemId);
}
