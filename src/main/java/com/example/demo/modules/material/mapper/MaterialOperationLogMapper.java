package com.example.demo.modules.material.mapper;

import com.example.demo.modules.material.entity.MaterialOperationLog;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import java.util.List;

@Mapper
public interface MaterialOperationLogMapper {
    int insert(MaterialOperationLog log);
    List<MaterialOperationLog> selectByTarget(@Param("targetType") String targetType, @Param("targetId") String targetId);
}
