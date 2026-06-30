package com.example.demo.modules.material.mapper;

import com.example.demo.modules.material.entity.MaterialItem;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import java.util.List;

@Mapper
public interface MaterialItemMapper {
    List<MaterialItem> selectPublished(@Param("categoryId") Long categoryId);
    List<MaterialItem> selectAll(@Param("categoryId") Long categoryId);
    /** 按课题组过滤物品（仅返回有申领记录或库存流水的物品） */
    List<MaterialItem> selectByApplicantGroup(@Param("categoryId") Long categoryId, @Param("applicantGroup") String applicantGroup);
    MaterialItem selectById(@Param("id") Long id);
    int insert(MaterialItem item);
    int updateById(MaterialItem item);
    int softDelete(@Param("id") Long id, @Param("deletedBy") String deletedBy,
                   @Param("purgeAfterTime") java.time.LocalDateTime purgeAfterTime);
    int restore(@Param("id") Long id);
    int purge(@Param("id") Long id);
    List<MaterialItem> selectRecycle(@Param("offset") int offset, @Param("size") int size);
    int countRecycle();
    int updateStock(@Param("id") Long id, @Param("qty") int qty);
    /** 提交申领时预占库存：locked_qty += qty, stock_qty -= qty */
    int lockStock(@Param("id") Long id, @Param("qty") int qty);
    /** 拒绝/撤回时释放锁定：locked_qty -= qty, stock_qty += qty */
    int releaseLock(@Param("id") Long id, @Param("qty") int qty);
    /** 审核通过时确认扣减：locked_qty -= qty（stock_qty 已在 lockStock 扣过） */
    int applyLock(@Param("id") Long id, @Param("qty") int qty);
}
