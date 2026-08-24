package com.example.demo.modules.aup.mapper;

import com.example.demo.modules.aup.entity.AupFolder;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface AupFolderMapper {
    int insert(AupFolder row);
    int update(AupFolder row);
    int updateParent(@Param("id") Long id, @Param("parentId") Long parentId);
    AupFolder findById(@Param("id") Long id);
    List<AupFolder> listByOwnerType(@Param("ownerType") String ownerType);
    List<AupFolder> listAll();
    int countChildren(@Param("parentId") Long parentId);
    int countByName(@Param("ownerType") String ownerType, @Param("parentId") Long parentId,
                    @Param("name") String name);
    int deleteById(@Param("id") Long id);
}
