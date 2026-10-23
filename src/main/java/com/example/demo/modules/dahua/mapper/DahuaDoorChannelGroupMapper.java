package com.example.demo.modules.dahua.mapper;

import com.example.demo.modules.dahua.entity.DahuaDoorChannelGroup;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface DahuaDoorChannelGroupMapper {
    List<DahuaDoorChannelGroup> listAll();

    /** 同名覆盖 */
    int upsert(@Param("name") String name, @Param("channelCodes") String channelCodes);

    int deleteById(@Param("id") long id);
}
