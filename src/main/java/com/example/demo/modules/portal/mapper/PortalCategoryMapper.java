package com.example.demo.modules.portal.mapper;

import com.example.demo.modules.portal.entity.PortalCategory;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import java.util.List;

@Mapper
public interface PortalCategoryMapper {
    List<PortalCategory> listByScope(@Param("scope") String scope);
    List<PortalCategory> listAll();
    PortalCategory findById(@Param("id") Long id);
    int insert(PortalCategory row);
    int update(PortalCategory row);
    int deleteById(@Param("id") Long id);
}
