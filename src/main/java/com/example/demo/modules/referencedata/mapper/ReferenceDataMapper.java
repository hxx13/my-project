package com.example.demo.modules.referencedata.mapper;

import com.example.demo.modules.referencedata.entity.RefData;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface ReferenceDataMapper {

    int insert(RefData row);

    int update(RefData row);

    int deleteById(@Param("id") Long id);

    RefData findById(@Param("id") Long id);

    List<RefData> listByType(@Param("refType") String refType,
                             @Param("parentId") Long parentId,
                             @Param("status") Integer status,
                             @Param("keyword") String keyword,
                             @Param("limit") int limit,
                             @Param("offset") int offset);

    int countByType(@Param("refType") String refType,
                    @Param("parentId") Long parentId,
                    @Param("status") Integer status,
                    @Param("keyword") String keyword);

    /** Only purchasable items for dropdowns */
    List<RefData> listOptions(@Param("refType") String refType);

    int countChildren(@Param("parentId") Long parentId);

    /** Walk up parent_id chain from a leaf to root (inclusive). Leaf first, root last. */
    List<RefData> findAncestors(@Param("id") Long id);

    /** Max sort_order for a type+parent combo, returns 0 if no rows */
    int maxSortOrder(@Param("refType") String refType, @Param("parentId") Long parentId);
}
