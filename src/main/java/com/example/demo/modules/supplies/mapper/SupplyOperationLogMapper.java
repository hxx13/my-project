package com.example.demo.modules.supplies.mapper;

import com.example.demo.modules.supplies.entity.SupplyOperationLog;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface SupplyOperationLogMapper {
    int insert(SupplyOperationLog row);

    List<SupplyOperationLog> listPaged(@Param("opType") String opType,
                                        @Param("limit") int limit,
                                        @Param("offset") int offset);

    int countAll(@Param("opType") String opType);
}
