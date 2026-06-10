package com.example.demo.modules.material.mapper;

import com.example.demo.modules.material.entity.MaterialCategory;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import java.util.List;

@Mapper
public interface MaterialCategoryMapper {
    List<MaterialCategory> selectEnabled();
    List<MaterialCategory> selectAll();
    MaterialCategory selectById(@Param("id") Long id);
    int insert(MaterialCategory category);
    int updateById(MaterialCategory category);
    int deleteById(@Param("id") Long id);
}
