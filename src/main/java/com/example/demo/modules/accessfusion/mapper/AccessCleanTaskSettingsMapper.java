package com.example.demo.modules.accessfusion.mapper;

import com.example.demo.modules.accessfusion.entity.AccessCleanTaskSettings;
import org.apache.ibatis.annotations.Param;

public interface AccessCleanTaskSettingsMapper {
    AccessCleanTaskSettings selectByTask(@Param("statsTaskId") long statsTaskId);

    int upsert(AccessCleanTaskSettings row);
}
