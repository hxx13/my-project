package com.example.demo.modules.accessfusion.mapper;

import com.example.demo.modules.accessfusion.entity.AccessCleanBatch;
import org.apache.ibatis.annotations.Param;

import java.util.List;

public interface AccessCleanBatchMapper {
    int insert(AccessCleanBatch row);

    int updateDone(AccessCleanBatch row);

    AccessCleanBatch selectById(@Param("id") long id);

    List<AccessCleanBatch> selectRecent(@Param("limit") int limit);
}
