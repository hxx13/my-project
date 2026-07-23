package com.example.demo.modules.accessfusion.mapper;

import com.example.demo.modules.accessfusion.entity.AccessVisitRound;
import org.apache.ibatis.annotations.Param;

import java.util.List;

public interface AccessVisitRoundMapper {
    int insert(AccessVisitRound row);

    int deleteByBatchId(@Param("batchId") long batchId);
}
