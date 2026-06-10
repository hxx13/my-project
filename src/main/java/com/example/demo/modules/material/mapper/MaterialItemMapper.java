package com.example.demo.modules.material.mapper;

import com.example.demo.modules.material.entity.MaterialItem;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import java.util.List;

@Mapper
public interface MaterialItemMapper {
    List<MaterialItem> selectPublished(@Param("categoryId") Long categoryId);
    List<MaterialItem> selectAll(@Param("categoryId") Long categoryId);
    MaterialItem selectById(@Param("id") Long id);
    int insert(MaterialItem item);
    int updateById(MaterialItem item);
    int softDelete(@Param("id") Long id, @Param("deletedBy") String deletedBy,
                   @Param("purgeAfterTime") java.time.LocalDateTime purgeAfterTime);
    int restore(@Param("id") Long id);
    int purge(@Param("id") Long id);
    List<MaterialItem> selectRecycle(@Param("offset") int offset, @Param("size") int size);
    int countRecycle();
    int updateStock(@Param("id") Long id, @Param("qty") int qty);
}
