package com.example.demo.modules.referencedata.mapper;

import com.example.demo.modules.referencedata.entity.RefOrderLine;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface RefOrderLineMapper {

    int insert(RefOrderLine row);

    int deleteByOrderId(@Param("orderId") Long orderId);

    List<RefOrderLine> listByOrderId(@Param("orderId") Long orderId);
}
