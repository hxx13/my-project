package com.example.demo.modules.supplies.mapper;

import com.example.demo.modules.supplies.entity.SupplyItem;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface SupplyItemMapper {
    int insert(SupplyItem row);

    int update(SupplyItem row);

    int deleteById(@Param("id") Long id);

    int restoreById(@Param("id") Long id);

    int hardDeleteById(@Param("id") Long id);

    int hardDeleteByIds(@Param("ids") List<Long> ids);

    SupplyItem findById(@Param("id") Long id);

    SupplyItem findRecycleById(@Param("id") Long id);

    List<SupplyItem> listOnShelf(@Param("categoryId") Long categoryId);

    List<SupplyItem> listAllForAdmin(@Param("categoryId") Long categoryId);

    List<SupplyItem> listRecycle(@Param("limit") int limit, @Param("offset") int offset);

    int countRecycle();

    int decreaseStockIfEnough(@Param("id") Long id, @Param("qty") int qty);

    int increaseStock(@Param("id") Long id, @Param("qty") int qty);

    int adjustStock(@Param("id") Long id, @Param("newQty") int newQty);

    int touchInboundAt(@Param("id") Long id);

    /** 存在库存流水或已完成领用实发明细的物资 id（用于审计页物品下拉优先展示） */
    List<Long> selectItemIdsHavingAuditRecords(@Param("categoryId") Long categoryId);
}
