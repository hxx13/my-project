package com.example.demo.modules.material.mapper;

import com.example.demo.modules.material.entity.MaterialStockMovement;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import java.util.List;

@Mapper
public interface MaterialStockMovementMapper {
    int insert(MaterialStockMovement movement);
    List<MaterialStockMovement> selectByItemId(@Param("itemId") Long itemId, @Param("offset") int offset, @Param("size") int size);
    int countByItemId(@Param("itemId") Long itemId);
    /**
     * 按物品查询流水视图（含物品名称）。
     * 「按物品审计」页的筛选一律取交集：物品/分类/关键词/课题组/日期（单边日期也生效），
     * 与 {@code selectClaimLinesByItemId} 同口径，台账两侧才不会各说各话。
     */
    List<com.example.demo.modules.material.dto.MaterialStockMovementView> selectViewsByItemId(@Param("itemId") Long itemId, @Param("offset") int offset, @Param("size") int size,
                                                                                               @Param("applicantGroup") String applicantGroup,
                                                                                               @Param("categoryId") Long categoryId, @Param("keyword") String keyword,
                                                                                               @Param("from") String from, @Param("to") String to);
    int countViewsByItemId(@Param("itemId") Long itemId, @Param("applicantGroup") String applicantGroup,
                           @Param("categoryId") Long categoryId, @Param("keyword") String keyword,
                           @Param("from") String from, @Param("to") String to);
    int deleteByItemId(@Param("itemId") Long itemId);
    int deleteOrphan();

    List<java.util.Map<String, Object>> statsDailyMovements(@Param("from") String from, @Param("to") String to,
                                                             @Param("groupId") String groupId);

    List<java.util.Map<String, Object>> statsOutboundHeatmap(@Param("from") String from, @Param("to") String to,
                                                              @Param("groupId") String groupId);
}
