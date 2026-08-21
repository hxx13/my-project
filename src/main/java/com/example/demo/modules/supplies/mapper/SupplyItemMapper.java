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

    /** 锁定库存：仅当可用库存（stock_qty - locked_qty）足够时成功，返回受影响行数 */
    int lockStockIfAvailable(@Param("id") Long id, @Param("qty") int qty);

    /** 强制锁定（回收站恢复用，允许超锁） */
    int lockStockForce(@Param("id") Long id, @Param("qty") int qty);

    /** 释放锁定，下限 0 */
    int releaseLockedStock(@Param("id") Long id, @Param("qty") int qty);

    /** 清零锁定量：stock_mode 由 QUANTIFIED 切为 FLAG 时调用，避免残留幽灵锁定压低可用库存 */
    int resetLockedQty(@Param("id") Long id);

    /**
     * 按未删除 PENDING 领用行重算锁定量（权威源）。用于修复幽灵锁定，以及软删/恢复/彻底删除后的校准。
     */
    int reconcileLockedQty(@Param("id") Long id);

    /** 全表重算 QUANTIFIED 物资的 locked_qty（启动迁移幂等修复） */
    int reconcileAllLockedQty();

    int increaseStock(@Param("id") Long id, @Param("qty") int qty);

    int adjustStock(@Param("id") Long id, @Param("newQty") int newQty);

    int touchInboundAt(@Param("id") Long id);

    /** 存在库存流水或已完成领用实发明细的物资 id（用于审计页物品下拉优先展示） */
    List<Long> selectItemIdsHavingAuditRecords(@Param("categoryId") Long categoryId);
}
