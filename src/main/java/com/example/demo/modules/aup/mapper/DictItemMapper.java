package com.example.demo.modules.aup.mapper;

import com.example.demo.modules.aup.entity.DictItem;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface DictItemMapper {
    int insert(DictItem row);
    int update(DictItem row);
    DictItem findById(@Param("id") Long id);
    /** 按稳定码 value 精确取项（克隆草稿 / 去重用）。 */
    DictItem findByDictIdAndCode(@Param("dictId") Long dictId, @Param("code") String code);
    List<DictItem> listByDictId(@Param("dictId") Long dictId);
    int deleteById(@Param("id") Long id);
    int deleteByDictId(@Param("dictId") Long dictId);
    int countByDictId(@Param("dictId") Long dictId);
    int countByDictIdAndValue(@Param("dictId") Long dictId, @Param("value") String value);
    int countByDictIdAndValueExclude(@Param("dictId") Long dictId, @Param("value") String value,
                                     @Param("excludeItemId") Long excludeItemId);
    int updateSortOrder(@Param("id") Long id, @Param("sortOrder") int sortOrder);
    /** 逐项校对四态。 */
    int updateVerdict(@Param("id") Long id, @Param("verdict") String verdict,
                      @Param("verdictNote") String verdictNote);
}
