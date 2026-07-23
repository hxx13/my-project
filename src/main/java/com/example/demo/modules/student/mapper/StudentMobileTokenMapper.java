package com.example.demo.modules.student.mapper;

import com.example.demo.modules.student.entity.StudentMobileToken;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface StudentMobileTokenMapper {

    /** 查活跃且未过期的 token */
    StudentMobileToken selectActiveByUserId(@Param("userId") String userId);

    /** 按 token 字符串查（不限状态） */
    StudentMobileToken selectByToken(@Param("token") String token);

    int insert(@Param("token") String token,
               @Param("userId") String userId,
               @Param("expiresAt") java.time.LocalDateTime expiresAt);

    /** 将某用户全部 token 置为失效 */
    int deactivateAllByUserId(@Param("userId") String userId);

    /** 记录首次访问 IP */
    int setLastIp(@Param("id") Long id, @Param("lastIp") String lastIp);

    /** 删除某用户全部 token */
    int deleteByUserId(@Param("userId") String userId);
}
