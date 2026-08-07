package com.example.demo.modules.referencedata.mapper;

import com.example.demo.modules.referencedata.entity.RefCart;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface RefCartMapper {

    int insert(RefCart row);

    int update(RefCart row);

    int deleteById(@Param("id") Long id);

    int deleteByGroupId(@Param("groupId") String groupId);

    RefCart findById(@Param("id") Long id);

    List<RefCart> listByGroupId(@Param("groupId") String groupId);
}
