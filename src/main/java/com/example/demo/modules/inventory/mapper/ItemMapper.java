package com.example.demo.modules.inventory.mapper;

import com.example.demo.modules.inventory.entity.InvItem;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import java.util.List;

@Mapper
public interface ItemMapper {
    InvItem selectById(@Param("id") Long id);
    InvItem selectByRfidCode(@Param("rfidCode") String rfidCode);

    /** 分页查询；spaceIds=待过滤空间集合（含后代），null/空=不过滤空间；hasCode=是否有码 */
    List<InvItem> selectList(@Param("keyword") String keyword,
                             @Param("spaceIds") List<Long> spaceIds,
                             @Param("categoryId") Long categoryId,
                             @Param("granularity") String granularity,
                             @Param("status") String status,
                             @Param("hasCode") Boolean hasCode,
                             @Param("offset") int offset,
                             @Param("size") int size);

    int countList(@Param("keyword") String keyword,
                  @Param("spaceIds") List<Long> spaceIds,
                  @Param("categoryId") Long categoryId,
                  @Param("granularity") String granularity,
                  @Param("status") String status,
                  @Param("hasCode") Boolean hasCode);

    int insert(InvItem item);
    int updateById(InvItem item);
    int updateSpace(@Param("id") Long id, @Param("spaceId") Long spaceId);
    int updateStatus(@Param("id") Long id, @Param("status") String status);
    int updateLastScannedAt(@Param("id") Long id);
    int updateQty(@Param("id") Long id, @Param("qty") Integer qty);
    int softDelete(@Param("id") Long id);

    /** 某空间（含后代）下在册物品，用于盘点 diff */
    List<InvItem> selectBySpaceIds(@Param("spaceIds") List<Long> spaceIds);
}
