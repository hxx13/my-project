package com.example.demo.modules.aup.mapper;

import com.example.demo.modules.aup.entity.FormSection;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface FormSectionMapper {
    int insert(FormSection row);
    List<FormSection> listByTemplateId(@Param("templateId") Long templateId);
    int deleteByTemplateId(@Param("templateId") Long templateId);
}
