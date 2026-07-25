package com.example.demo.modules.notification.push.binding;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import java.util.List;

@Mapper
public interface UserPushBindingMapper {
    UserPushBinding findByUserAndChannel(@Param("userId") String userId, @Param("channelCode") String channelCode);
    List<UserPushBinding> findByUser(@Param("userId") String userId);
    List<UserPushBinding> findByUserIdsAndChannel(@Param("userIds") List<String> userIds, @Param("channelCode") String channelCode);
    int upsert(UserPushBinding binding);
    int updateVerified(@Param("userId") String userId, @Param("channelCode") String channelCode, @Param("isVerified") Integer isVerified);
    int deleteByUserAndChannel(@Param("userId") String userId, @Param("channelCode") String channelCode);
}
