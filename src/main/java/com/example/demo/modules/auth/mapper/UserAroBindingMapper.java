package com.example.demo.modules.auth.mapper;

import com.example.demo.modules.auth.entity.UserAroBinding;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface UserAroBindingMapper {
    UserAroBinding selectByUserId(@Param("userId") String userId);

    UserAroBinding selectByAroUserId(@Param("aroUserId") String aroUserId);

    List<UserAroBinding> selectAll();

    int insert(UserAroBinding binding);

    int deleteByUserId(@Param("userId") String userId);

    int deleteByAroUserId(@Param("aroUserId") String aroUserId);

    void updateCasToken(@Param("userId") String userId, @Param("casToken") String casToken, @Param("casTokenExp") Long casTokenExp);

    void updateCasTgc(@Param("userId") String userId, @Param("casTgc") String casTgc);

    void clearCasCredentials(@Param("userId") String userId);

    void updateCasCredentials(@Param("userId") String userId, @Param("casAccount") String casAccount, @Param("aroPassword") String aroPassword);

    void upsertCasBinding(@Param("userId") String userId, @Param("aroUserId") String aroUserId, @Param("casToken") String casToken, @Param("casTokenExp") Long casTokenExp, @Param("casAccount") String casAccount, @Param("aroPassword") String aroPassword);
}
