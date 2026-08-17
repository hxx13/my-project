package com.example.demo.modules.referencedata.mapper;

import com.example.demo.modules.referencedata.entity.RefOrder;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface RefOrderMapper {

    int insert(RefOrder row);

    int updateStatus(@Param("id") Long id,
                     @Param("status") String status,
                     @Param("submittedAt") java.time.LocalDateTime submittedAt);

    RefOrder findById(@Param("id") Long id);

    List<RefOrder> listByGroupId(@Param("groupId") String groupId);

    List<RefOrder> listByStatus(@Param("status") String status,
                                @Param("limit") int limit,
                                @Param("offset") int offset);

    int countByStatus(@Param("status") String status);

    List<RefOrder> listAll(@Param("limit") int limit,
                           @Param("offset") int offset);

    int countAll();
}
