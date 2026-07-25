package com.example.demo.modules.notification.push.digest;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import java.util.List;

@Mapper
public interface NotifyDigestDefaultConfigMapper {
    NotifyDigestDefaultConfig findBySourceCode(@Param("sourceCode") String sourceCode);
    List<NotifyDigestDefaultConfig> findAll();
    int insert(NotifyDigestDefaultConfig config);
    int update(NotifyDigestDefaultConfig config);
    int delete(@Param("id") Long id);
}
