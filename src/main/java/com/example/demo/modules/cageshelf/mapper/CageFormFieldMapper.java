package com.example.demo.modules.cageshelf.mapper;

import com.example.demo.modules.cageshelf.entity.CageFormField;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface CageFormFieldMapper {

    List<CageFormField> selectByTemplateId(@Param("templateId") Long templateId);

    List<CageFormField> selectByFieldId(@Param("fieldId") Long fieldId);

    int insert(CageFormField row);

    int deleteByTemplateId(@Param("templateId") Long templateId);
}
