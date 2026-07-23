package com.example.demo.modules.dahua.mapper;

import com.example.demo.modules.dahua.entity.DahuaDoorGroupCache;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface DahuaDoorGroupCacheMapper {
    int upsert(DahuaDoorGroupCache item);

    List<DahuaDoorGroupCache> list(@Param("keyword") String keyword,
                                   @Param("offset") int offset,
                                   @Param("pageSize") int pageSize);

    int count(@Param("keyword") String keyword);
}
