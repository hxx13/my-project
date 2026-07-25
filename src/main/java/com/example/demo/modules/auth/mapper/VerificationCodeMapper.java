package com.example.demo.modules.auth.mapper;

import com.example.demo.modules.auth.entity.VerificationCode;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface VerificationCodeMapper {

    int insert(VerificationCode record);

    VerificationCode findLatestValid(
            @Param("email") String email,
            @Param("scene") String scene);

    int incrementFailCount(@Param("id") Long id);

    int markUsed(@Param("id") Long id, @Param("used") int used);

    int setResetToken(@Param("id") Long id, @Param("resetToken") String resetToken);

    /** Simultaneously set reset_token and userId to prevent TOCTOU rebinding */
    int setResetTokenAndUserId(@Param("id") Long id,
                               @Param("resetToken") String resetToken,
                               @Param("userId") String userId);

    VerificationCode findByResetToken(@Param("resetToken") String resetToken);

    int countRecent(@Param("email") String email,
                    @Param("scene") String scene,
                    @Param("since") String since);

    /** Count codes sent in the last hour for rate limiting */
    int countHourly(@Param("email") String email,
                    @Param("scene") String scene,
                    @Param("since") String since);

    /** After successful reset, invalidate all unconsumed codes for this email */
    int invalidateAllForEmail(@Param("email") String email,
                              @Param("scene") String scene);
}
