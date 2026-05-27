package com.example.demo.modules.twin.audit.mapper;

import com.example.demo.modules.twin.audit.entity.TwinAutomationDisplayMap;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface TwinAutomationDisplayMapMapper {

    List<TwinAutomationDisplayMap> selectAll();

    int insert(TwinAutomationDisplayMap row);

    int updateById(TwinAutomationDisplayMap row);

    int deleteById(@Param("id") Long id);
}
