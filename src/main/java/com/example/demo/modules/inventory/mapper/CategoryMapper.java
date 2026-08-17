package com.example.demo.modules.inventory.mapper;

import com.example.demo.modules.inventory.entity.InvCategory;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import java.util.List;

@Mapper
public interface CategoryMapper {
    List<InvCategory> selectAll();
    InvCategory selectById(@Param("id") Long id);
    int insert(InvCategory category);
    int updateById(InvCategory category);
    int softDelete(@Param("id") Long id);
    int countChildren(@Param("parentId") Long parentId);
    int countItemsInCategory(@Param("categoryId") Long categoryId);
}
