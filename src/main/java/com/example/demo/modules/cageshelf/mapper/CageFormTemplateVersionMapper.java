package com.example.demo.modules.cageshelf.mapper;

import com.example.demo.modules.cageshelf.entity.CageFormTemplateVersion;
import org.apache.ibatis.annotations.Param;

import java.util.List;

public interface CageFormTemplateVersionMapper {

    CageFormTemplateVersion selectLatest(@Param("formKey") String formKey);

    List<CageFormTemplateVersion> selectAllByFormKey(@Param("formKey") String formKey);

    int insert(CageFormTemplateVersion row);
}
