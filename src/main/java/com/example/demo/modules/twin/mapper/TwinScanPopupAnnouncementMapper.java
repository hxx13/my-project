package com.example.demo.modules.twin.mapper;

import com.example.demo.modules.twin.entity.TwinScanPopupAnnouncement;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface TwinScanPopupAnnouncementMapper {
    List<TwinScanPopupAnnouncement> selectActiveForScan(@Param("limit") int limit);

    List<TwinScanPopupAnnouncement> selectAllForAdmin(@Param("limit") int limit);

    TwinScanPopupAnnouncement selectById(@Param("id") long id);

    int insert(TwinScanPopupAnnouncement row);

    int updateById(TwinScanPopupAnnouncement row);

    int deleteById(@Param("id") long id);
}
