package com.example.demo.modules.inventory.mapper;

import com.example.demo.modules.inventory.entity.InvSpace;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import java.util.List;

@Mapper
public interface SpaceMapper {
    List<InvSpace> selectAll();
    InvSpace selectById(@Param("id") Long id);
    InvSpace selectByCode(@Param("code") String code);
    int insert(InvSpace space);
    int updateById(InvSpace space);
    int softDelete(@Param("id") Long id);
    int countChildren(@Param("parentId") Long parentId);
    int countItemsInSpace(@Param("spaceId") Long spaceId);
}
