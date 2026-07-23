package com.example.demo.modules.supplies.mapper;

import com.example.demo.modules.supplies.dto.SupplyInventoryMovementRowView;
import com.example.demo.modules.supplies.entity.SupplyInventoryMovement;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface SupplyInventoryMovementMapper {
    int insert(SupplyInventoryMovement row);

    int countByItemId(@Param("itemId") long itemId);

    List<SupplyInventoryMovementRowView> listRowsByItemId(
            @Param("itemId") long itemId,
            @Param("limit") int limit,
            @Param("offset") int offset);

    List<SupplyInventoryMovement> listByClaimId(@Param("claimId") String claimId);
}
