package com.example.demo.modules.mp.mapper;

import com.example.demo.modules.mp.entity.MiniProgramAnnouncement;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface MiniProgramAnnouncementMapper {

    MiniProgramAnnouncement selectById(@Param("id") String id);

    List<MiniProgramAnnouncement> selectAllForAdmin();

    List<MiniProgramAnnouncement> selectPublishedEnabled();

    int insert(MiniProgramAnnouncement row);

    int update(MiniProgramAnnouncement row);

    int deleteById(@Param("id") String id);
}
