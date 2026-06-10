package com.example.demo.modules.material.mapper;

import com.example.demo.modules.material.entity.MaterialCart;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface MaterialCartMapper {
    MaterialCart selectByUserId(@Param("userId") String userId);
    int insertOrUpdate(@Param("userId") String userId, @Param("linesJson") String linesJson);
}
