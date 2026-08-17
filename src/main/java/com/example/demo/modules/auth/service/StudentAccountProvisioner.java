package com.example.demo.modules.auth.service;

import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.auth.AuthProfileConstants;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.auth.mapper.UserMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class StudentAccountProvisioner {

    private static final Logger log = LoggerFactory.getLogger(StudentAccountProvisioner.class);
    private final JdbcTemplate jdbcTemplate;
    private final UserMapper userMapper;

    public StudentAccountProvisioner(JdbcTemplate jdbcTemplate, UserMapper userMapper) {
        this.jdbcTemplate = jdbcTemplate;
        this.userMapper = userMapper;
    }

    @Scheduled(cron = "0 30 3 * * *")  // 每天 03:30 扫一次
    public void provision() {
        List<String> userIds = jdbcTemplate.queryForList(
                "SELECT user_id FROM aro_personnel", String.class
        );
        int created = 0;
        for (String userId : userIds) {
            if (provisionOne(userId)) created++;
        }
        if (created > 0) {
            log.info("[special-channel] account provision: created={}", created);
        }
    }

    /** 现场补建单个学生账号（幂等：已存在则跳过）。返回是否新建。 */
    public boolean provisionOne(String userId) {
        if (userId == null || userId.isBlank()) {
            return false;
        }
        try {
            User existing = userMapper.findById(userId);
            if (existing != null) {
                return false;
            }
            User user = new User();
            user.setId(userId);
            user.setUsername(userId);
            user.setRole(RoleEnum.MEMBER);
            user.setStatus(1);
            user.setAuthProfile(AuthProfileConstants.WEB_PASSWORD);
            user.setAccountSource("STUDENT");
            userMapper.insertUser(user);
            return true;
        } catch (Exception ex) {
            log.error("[special-channel] provision failed userId={}: {}", userId, ex.getMessage());
            return false;
        }
    }
}
