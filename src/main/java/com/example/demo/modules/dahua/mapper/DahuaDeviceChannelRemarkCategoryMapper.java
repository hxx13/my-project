package com.example.demo.modules.dahua.mapper;

import com.example.demo.modules.dahua.entity.DahuaDeviceChannelRemarkCategory;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface DahuaDeviceChannelRemarkCategoryMapper {
    List<DahuaDeviceChannelRemarkCategory> listAll();

    DahuaDeviceChannelRemarkCategory findById(@Param("id") long id);

    DahuaDeviceChannelRemarkCategory findByName(@Param("name") String name);

    DahuaDeviceChannelRemarkCategory findByParentAndName(@Param("parentId") Long parentId,
                                                         @Param("name") String name);

    List<DahuaDeviceChannelRemarkCategory> listByParent(@Param("parentId") Long parentId);

    int insert(DahuaDeviceChannelRemarkCategory row);

    int update(DahuaDeviceChannelRemarkCategory row);

    int updateSortOrder(@Param("id") long id, @Param("sortOrder") int sortOrder);

    int deleteById(@Param("id") long id);
}
