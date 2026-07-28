package com.example.demo.modules.notification.push.source;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import java.util.List;

@Mapper
public interface NotifySourceMapper {
    NotifySource findByCode(@Param("sourceCode") String sourceCode);
    NotifySource findById(@Param("id") Long id);
    List<NotifySource> findAll();
    int insert(NotifySource source);
    int insertOrIgnore(NotifySource source);
    int updateEnabled(@Param("id") Long id, @Param("enabled") Integer enabled);
    int updateVisibleTo(@Param("id") Long id, @Param("visibleTo") String visibleTo);
}
