package com.example.demo.modules.material.mapper;

import com.example.demo.modules.material.entity.MaterialRequestLine;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import java.util.List;

@Mapper
public interface MaterialRequestLineMapper {
    List<MaterialRequestLine> selectByRequestId(@Param("requestId") String requestId);
    int insertBatch(@Param("lines") List<MaterialRequestLine> lines);
    int updateFulfilledQty(@Param("id") Long id, @Param("qty") int qty);
    /** 合并明细时更新申请数量 */
    int updateQty(@Param("id") Long id, @Param("qty") int qty);
    int deleteByItemId(@Param("itemId") Long itemId);
    int deleteByRequestId(@Param("requestId") String requestId);
    List<String> selectRequestIdsByItemId(@Param("itemId") Long itemId);
    int deleteOrphan();
}
