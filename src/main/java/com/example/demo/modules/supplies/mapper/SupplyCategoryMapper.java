package com.example.demo.modules.supplies.mapper;

import com.example.demo.modules.supplies.entity.SupplyCategory;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface SupplyCategoryMapper {
    int insert(SupplyCategory row);

    int update(SupplyCategory row);

    int deleteById(@Param("id") Long id);

    SupplyCategory findById(@Param("id") Long id);

    List<SupplyCategory> listEnabledOrdered();

    List<SupplyCategory> listAllOrdered();
}
