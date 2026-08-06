package com.example.demo.modules.referencedata.mapper;

import com.example.demo.modules.referencedata.entity.RefOrderLog;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface RefOrderLogMapper {

    int insert(RefOrderLog row);

    List<RefOrderLog> listByOrderId(@Param("orderId") Long orderId);
}
