package com.example.demo.modules.material.mapper;

import com.example.demo.modules.material.entity.MaterialCategory;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import java.util.List;

@Mapper
public interface MaterialCategoryMapper {
    List<MaterialCategory> selectEnabled();
    List<MaterialCategory> selectAll();
    /** 按课题组过滤分类（仅返回该组有记录的物品所属分类） */
    List<MaterialCategory> selectByApplicantGroup(@Param("applicantGroup") String applicantGroup);
    MaterialCategory selectById(@Param("id") Long id);
    int insert(MaterialCategory category);
    int updateById(MaterialCategory category);
    int deleteById(@Param("id") Long id);
}
