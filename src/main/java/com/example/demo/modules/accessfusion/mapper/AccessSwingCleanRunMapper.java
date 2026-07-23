package com.example.demo.modules.accessfusion.mapper;

import com.example.demo.modules.accessfusion.entity.AccessSwingCleanRun;
import org.apache.ibatis.annotations.Param;

import java.util.List;

public interface AccessSwingCleanRunMapper {
    int insert(AccessSwingCleanRun row);

    int updateDone(AccessSwingCleanRun row);

    int markSuperseded(@Param("id") long id, @Param("supersededByRunId") long supersededByRunId);

    AccessSwingCleanRun selectById(@Param("id") long id);

    List<AccessSwingCleanRun> selectByChannel(
            @Param("channelCode") String channelCode, @Param("limit") int limit);

    int deleteById(@Param("id") long id);
}
