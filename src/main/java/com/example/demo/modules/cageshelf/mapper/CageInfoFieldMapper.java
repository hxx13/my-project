package com.example.demo.modules.cageshelf.mapper;

import com.example.demo.modules.cageshelf.entity.CageInfoField;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface CageInfoFieldMapper {

    /** 按 sort 升序列出全部字段字典 */
    List<CageInfoField> selectAll();

    /** 按本地规范字段名查单个字段字典 */
    CageInfoField selectByCanonical(@Param("canonical") String canonical);

    /** 按角色过滤字段字典（role 默认 VALUE） */
    List<CageInfoField> selectByRole(@Param("role") String role);
}
