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
}
