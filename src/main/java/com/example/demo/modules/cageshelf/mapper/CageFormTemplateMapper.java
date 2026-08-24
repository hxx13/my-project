package com.example.demo.modules.cageshelf.mapper;

import com.example.demo.modules.cageshelf.entity.CageFormTemplate;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface CageFormTemplateMapper {

    List<CageFormTemplate> selectAll();

    CageFormTemplate selectByFormKey(@Param("formKey") String formKey);

    CageFormTemplate selectById(@Param("id") Long id);

    int insert(CageFormTemplate row);

    int update(CageFormTemplate row);

    int deleteById(@Param("id") Long id);
}
