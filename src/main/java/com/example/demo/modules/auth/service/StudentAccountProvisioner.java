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

    @Scheduled(fixedDelay = 300_000)  // 每 5 分钟
    public void provision() {
        List<String> userIds = jdbcTemplate.queryForList(
                "SELECT user_id FROM aro_personnel", String.class
        );
        int created = 0;
        int skipped = 0;
        for (String userId : userIds) {
            try {
                User existing = userMapper.findById(userId);
                if (existing != null) {
                    skipped++;
                    continue;
                }
                User user = new User();
                user.setId(userId);
                user.setUsername(userId);
                user.setRole(RoleEnum.STUDENT);
                user.setStatus(1);
                user.setAuthProfile(AuthProfileConstants.WEB_PASSWORD);
                userMapper.insertUser(user);
                created++;
            } catch (Exception ex) {
                log.error("[special-channel] provision failed userId={}: {}", userId, ex.getMessage());
            }
        }
        if (created > 0 || skipped > 0) {
            log.info("[special-channel] account provision: created={} skipped={}", created, skipped);
        }
    }
}
