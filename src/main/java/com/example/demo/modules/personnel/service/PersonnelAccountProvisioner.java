package com.example.demo.modules.personnel.service;

import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.util.StudentIdGenerator;
import com.example.demo.modules.auth.AuthProfileConstants;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.auth.entity.UserAuthBinding;
import com.example.demo.modules.auth.mapper.UserAuthBindingMapper;
import com.example.demo.modules.auth.mapper.UserMapper;
import com.example.demo.modules.auth.service.PasswordCredentialService;
import com.example.demo.modules.auth.service.PasswordPolicyValidator;
import com.example.demo.modules.personnel.entity.Personnel;
import com.example.demo.modules.personnel.mapper.PersonnelMapper;
import lombok.Builder;
import lombok.Data;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

/**
 * 全新人员的建号内核：一次事务写 aro_personnel + personnel + sys_user（+ 可选统一认证绑定）。
 *
 * <p>四张表必须一起写：personnel 是派生自 aro_personnel 的统一人员表，而学生端个人信息页
 * 直接读 aro_personnel（StudentProfileService）。只写其中一张，人会在另一个视角"不存在"。
 *
 * <p>19 位 id 由 {@link StudentIdGenerator} 签发，是系统字段、不向用户展示（登录名另算）。
 */
@Service
public class PersonnelAccountProvisioner {

    private final UserMapper userMapper;
    private final PersonnelMapper personnelMapper;
    private final UserAuthBindingMapper userAuthBindingMapper;
    private final PasswordCredentialService passwordCredentialService;
    private final StudentIdGenerator studentIdGenerator;
    private final JdbcTemplate jdbcTemplate;

    public PersonnelAccountProvisioner(UserMapper userMapper,
                                       PersonnelMapper personnelMapper,
                                       UserAuthBindingMapper userAuthBindingMapper,
                                       PasswordCredentialService passwordCredentialService,
                                       StudentIdGenerator studentIdGenerator,
                                       JdbcTemplate jdbcTemplate) {
        this.userMapper = userMapper;
        this.personnelMapper = personnelMapper;
        this.userAuthBindingMapper = userAuthBindingMapper;
        this.passwordCredentialService = passwordCredentialService;
        this.studentIdGenerator = studentIdGenerator;
        this.jdbcTemplate = jdbcTemplate;
    }

    @Transactional(rollbackFor = Exception.class)
    public String provision(NewPersonSpec spec) {
        // ── 校验（全部在写之前，失败则一张表都不写）──
        if (spec == null) {
            throw new IllegalStateException("开户信息不能为空");
        }
        String username = trimToNull(spec.getUsername());
        if (username == null) {
            throw new IllegalStateException("用户名不能为空");
        }
        if (username.length() < 3 || username.length() > 64) {
            throw new IllegalStateException("用户名长度需在3-64个字符之间");
        }
        String accountSource = trimToNull(spec.getAccountSource());
        if (accountSource == null) {
            throw new IllegalStateException("账号来源(accountSource)不能为空");
        }

        String rawPassword = trimToNull(spec.getRawPassword());
        String hash = null;
        String encryptedPlain = null;
        if (rawPassword != null) {
            String pwError = PasswordPolicyValidator.validate(rawPassword);
            if (pwError != null) {
                throw new IllegalStateException(pwError);
            }
            hash = passwordCredentialService.encodeForStorage(rawPassword);
            encryptedPlain = passwordCredentialService.encryptPlaintext(rawPassword);
        }

        if (userMapper.findByUsername(username) != null) {
            throw new IllegalStateException("用户名已被占用");
        }

        String idpUid = trimToNull(spec.getIdpUid());
        if (idpUid != null && userAuthBindingMapper.findActiveByIdpUid(idpUid) != null) {
            throw new IllegalStateException("该统一认证身份已绑定过账号");
        }

        // ── 建号 ──
        String id = studentIdGenerator.nextId();
        // name 可空，但 personnel.name 非空 → 回落登录名作为占位姓名（不是 19 位 id，
        // 以免命中「job_number IS NULL AND name = user_id」占位行清理）。
        String name = trimToNull(spec.getName());
        if (name == null) {
            name = username;
        }
        String jobNumber = trimToNull(spec.getJobNumber());
        String mobilePhone = trimToNull(spec.getMobilePhone());
        String email = trimToNull(spec.getEmail());
        String departmentName = trimToNull(spec.getDepartmentName());

        // 1. aro_personnel（学生端个人信息页直读此表）
        jdbcTemplate.update(
                "INSERT INTO aro_personnel (user_id, name, job_number, gender, mobile_phone, email, department_name) "
                        + "VALUES (?,?,?,?,?,?,?)",
                id, name, jobNumber, spec.getGender(), mobilePhone, email, departmentName);

        // 2. personnel（派生自 aro_personnel 的统一人员表）
        Personnel p = new Personnel();
        p.setName(name);
        p.setAroUserId(id);
        p.setJobNumber(jobNumber);
        p.setDepartmentName(departmentName);
        p.setGender(spec.getGender());
        p.setMobilePhone(mobilePhone);
        p.setEmail(email);
        p.setHasOfficialRoomPermission(0);
        personnelMapper.insert(p);

        // 3. sys_user（登录账号）
        User user = new User();
        user.setId(id);
        user.setUsername(username);
        user.setPassword(hash);
        user.setRole(RoleEnum.MEMBER);
        user.setStatus(1);
        user.setPasswordResetRequired(0);
        user.setAuthProfile(rawPassword != null ? AuthProfileConstants.WEB_PASSWORD : AuthProfileConstants.IAM_OAUTH);
        user.setAccountSource(accountSource);
        userMapper.insertUser(user);
        if (rawPassword != null) {
            userMapper.updatePasswordWithPlainById(id, hash, encryptedPlain, 0);
        }
        // 手机号同时写进 sys_user：手机号登录走 UserMapper.findByMobilePhone，查的是这张表。
        // syncProfileToSysUser 虽然会把 aro_personnel 的资料刷回来，但那是定时任务 ——
        // 不能等到它跑完才让用户能用手机号登录。
        if (mobilePhone != null) {
            jdbcTemplate.update("UPDATE sys_user SET mobile_phone = ? WHERE id = ?", mobilePhone, id);
        }

        // 4. user_auth_binding（可选统一认证绑定）
        if (idpUid != null) {
            UserAuthBinding binding = new UserAuthBinding();
            binding.setUserId(id);
            binding.setIdpUid(idpUid);
            binding.setIdpUserName(username);
            userAuthBindingMapper.insert(binding);
        }

        return id;
    }

    private static String trimToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }

    /** 建号入参。只有 username / accountSource 必填，其余按入口能力可空。 */
    @Data
    @Builder
    public static class NewPersonSpec {
        /** 姓名（可空；空则回落 username 作占位） */
        private String name;
        /** 工号/学号（可空） */
        private String jobNumber;
        /** 手机号（可空） */
        private String mobilePhone;
        /** 性别（可空，Integer） */
        private Integer gender;
        /** 邮箱（可空） */
        private String email;
        /** 部门名称（可空） */
        private String departmentName;
        /** 登录名（必填，3-64 字符） */
        private String username;
        /** 明文密码（可空 —— IAM 建号无本地密码） */
        private String rawPassword;
        /** 账号来源（必填，"IAM" 或 "OUTSIDER"） */
        private String accountSource;
        /** 统一认证稳定标识（可空；非空则写 user_auth_binding 且先查重） */
        private String idpUid;
    }
}
