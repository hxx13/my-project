package com.example.demo.modules.mp.mapper;

import com.example.demo.modules.mp.entity.MiniProgramRelease;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface MiniProgramReleaseMapper {

    MiniProgramRelease selectSplash();

    List<MiniProgramRelease> selectAllPublished();

    MiniProgramRelease selectById(@Param("id") String id);

    int insert(MiniProgramRelease row);

    int update(MiniProgramRelease row);

    int deleteById(@Param("id") String id);

    int clearShowOnLaunch();

    int setShowOnLaunch(@Param("id") String id);
}
