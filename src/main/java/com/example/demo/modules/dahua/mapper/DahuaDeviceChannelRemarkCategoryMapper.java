package com.example.demo.modules.dahua.mapper;

import com.example.demo.modules.dahua.entity.DahuaDeviceChannelRemarkCategory;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface DahuaDeviceChannelRemarkCategoryMapper {
    List<DahuaDeviceChannelRemarkCategory> listAll();

    DahuaDeviceChannelRemarkCategory findById(@Param("id") long id);

    int insert(DahuaDeviceChannelRemarkCategory row);

    int update(DahuaDeviceChannelRemarkCategory row);

    int deleteById(@Param("id") long id);
}
