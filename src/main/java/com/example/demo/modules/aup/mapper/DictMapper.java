package com.example.demo.modules.aup.mapper;

import com.example.demo.modules.aup.entity.Dict;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface DictMapper {
    int insert(Dict row);
    int update(Dict row);
    Dict findByKey(@Param("dictKey") String dictKey);
    Dict findById(@Param("id") Long id);
    int deleteById(@Param("id") Long id);
    List<Dict> listByKeyword(@Param("keyword") String keyword,
                             @Param("category") String category,
                             @Param("limit") int limit, @Param("offset") int offset);
    int countByKeyword(@Param("keyword") String keyword, @Param("category") String category);
}
