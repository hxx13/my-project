package com.example.demo.modules.aup.mapper;

import com.example.demo.modules.aup.entity.AupReviewItem;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface AupReviewItemMapper {

    int insertBatch(@Param("list") List<AupReviewItem> rows);

    List<AupReviewItem> selectByAupRound(@Param("aupId") long aupId, @Param("roundNo") int roundNo);

    List<AupReviewItem> selectByAupRoundFieldKey(@Param("aupId") long aupId,
                                                 @Param("roundNo") int roundNo,
                                                 @Param("fieldKey") String fieldKey);
}
