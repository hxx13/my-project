package com.example.demo.modules.personnel.service;

import com.example.demo.modules.personnel.entity.Personnel;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

/**
 * 本人完善资料（子系统 3 收尾）：任意登录者只改自己，字段非空才落库。
 *
 * <p>两处同写：personnel（统一人员表）与 aro_personnel（学生端个人信息页直读源）。
 * 部门同时解析 department_id（id 是权威）并写文本快照。绝不触碰 job_number / role / 课题组。
 */
@Service
public class PersonnelProfileService {

    private final PersonnelService personnelService;
    private final JdbcTemplate jdbcTemplate;

    public PersonnelProfileService(PersonnelService personnelService, JdbcTemplate jdbcTemplate) {
        this.personnelService = personnelService;
        this.jdbcTemplate = jdbcTemplate;
    }

    @Transactional(rollbackFor = Exception.class)
    public void updateMyProfile(String accountId, String name, String mobilePhone, Integer gender, String departmentName) {
        Personnel p = personnelService.resolveByAccount(accountId);
        if (p == null) {
            throw new RuntimeException("未找到人员档案");
        }
        Long pid = p.getId();
        String aroUid = trimToNull(p.getAroUserId());

        if (StringUtils.hasText(name)) {
            String v = name.trim();
            jdbcTemplate.update("UPDATE personnel SET name = ? WHERE id = ?", v, pid);
            if (aroUid != null) {
                jdbcTemplate.update("UPDATE aro_personnel SET name = ? WHERE user_id = ?", v, aroUid);
            }
        }
        if (StringUtils.hasText(mobilePhone)) {
            String v = mobilePhone.trim();
            // 手机号是登录入口，不能让两个账号共用（改自己的号时排除自己）
            Integer dup = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM sys_user WHERE mobile_phone = ? AND id <> ?", Integer.class, v, accountId);
            if (dup != null && dup > 0) {
                throw new IllegalStateException("该手机号已被其他账号绑定，请换一个");
            }
            jdbcTemplate.update("UPDATE personnel SET mobile_phone = ? WHERE id = ?", v, pid);
            // sys_user 也要写：手机号登录走 UserMapper.findByMobilePhone，查的是这张表
            jdbcTemplate.update("UPDATE sys_user SET mobile_phone = ? WHERE id = ?", v, accountId);
            if (aroUid != null) {
                jdbcTemplate.update("UPDATE aro_personnel SET mobile_phone = ? WHERE user_id = ?", v, aroUid);
            }
        }
        if (gender != null) {
            jdbcTemplate.update("UPDATE personnel SET gender = ? WHERE id = ?", gender, pid);
            if (aroUid != null) {
                jdbcTemplate.update("UPDATE aro_personnel SET gender = ? WHERE user_id = ?", gender, aroUid);
            }
        }
        if (StringUtils.hasText(departmentName)) {
            String v = departmentName.trim();
            Long deptId = resolveDepartmentId(v);
            jdbcTemplate.update("UPDATE personnel SET department_name = ?, department_id = ? WHERE id = ?", v, deptId, pid);
            if (aroUid != null) {
                jdbcTemplate.update("UPDATE aro_personnel SET department_name = ? WHERE user_id = ?", v, aroUid);
            }
        }
    }

    private Long resolveDepartmentId(String name) {
        try {
            return jdbcTemplate.queryForObject(
                    "SELECT id FROM department WHERE name = ? LIMIT 1", Long.class, name);
        } catch (EmptyResultDataAccessException e) {
            return null;
        }
    }

    private static String trimToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
