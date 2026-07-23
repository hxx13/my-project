package com.example.demo.modules.twin.dashboard.mapper;

import com.example.demo.modules.twin.dashboard.entity.ViolationTextTemplate;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface ViolationTextTemplateMapper {

    List<ViolationTextTemplate> selectAll();

    ViolationTextTemplate selectById(@Param("id") long id);

    int insert(ViolationTextTemplate row);

    int update(ViolationTextTemplate row);

    int deleteById(@Param("id") long id);
}
