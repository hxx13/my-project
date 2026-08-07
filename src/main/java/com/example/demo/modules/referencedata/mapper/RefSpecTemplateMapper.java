package com.example.demo.modules.referencedata.mapper;

import com.example.demo.modules.referencedata.entity.RefSpecTemplate;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface RefSpecTemplateMapper {

    int insert(RefSpecTemplate row);

    int update(RefSpecTemplate row);

    int deleteById(@Param("id") Long id);

    RefSpecTemplate findById(@Param("id") Long id);

    List<RefSpecTemplate> listAll();
}
