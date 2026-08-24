package com.example.demo.modules.cageshelf.mapper;

import com.example.demo.modules.cageshelf.entity.CageFormSection;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface CageFormSectionMapper {

    List<CageFormSection> selectByTemplateId(@Param("templateId") Long templateId);

    int insert(CageFormSection row);

    int deleteByTemplateId(@Param("templateId") Long templateId);
}
