package com.example.demo.modules.cageshelf.service;

import com.example.demo.modules.aro.dto.AroPersonnel;
import com.example.demo.modules.aro.mapper.AroPersonnelMapper;
import com.example.demo.modules.auth.entity.UserAroBinding;
import com.example.demo.modules.auth.mapper.UserAroBindingMapper;
import com.example.demo.modules.twin.common.util.PersonnelProjectGroupUtil;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * 解析账号所属课题组名（笼架域课题组判定共用）。
 *
 * <p>关键：STAFF_* 账号的 aro_personnel.user_id 存的是 ARO 人员编号，直接拿 STAFF_ id 去查
 * aro_personnel 必然查不到，课题组为空 → 被误判「不在该笼位的课题组范围内」。
 * 须先经 user_aro_binding 展开成 aro_user_id 再查。
 */
@Component
public class UserGroupNameResolver {

    private static final Logger log = LoggerFactory.getLogger(UserGroupNameResolver.class);

    private final AroPersonnelMapper aroPersonnelMapper;
    private final UserAroBindingMapper userAroBindingMapper;

    public UserGroupNameResolver(AroPersonnelMapper aroPersonnelMapper,
                                 UserAroBindingMapper userAroBindingMapper) {
        this.aroPersonnelMapper = aroPersonnelMapper;
        this.userAroBindingMapper = userAroBindingMapper;
    }

    public List<String> resolve(String userId) {
        try {
            AroPersonnel personnel = aroPersonnelMapper.findByUserId(personnelUserId(userId));
            if (personnel == null) {
                return List.of();
            }
            return PersonnelProjectGroupUtil.splitGroups(personnel.getResolvedProjectGroupNames());
        } catch (Exception e) {
            log.warn("[cage-group] 解析用户课题组失败 userId={} err={}", userId, e.getMessage());
            return List.of();
        }
    }

    /** STAFF_* → user_aro_binding.aro_user_id；非 STAFF_ 或无绑定时原样返回。 */
    private String personnelUserId(String userId) {
        if (userId == null || !userId.startsWith("STAFF_")) {
            return userId;
        }
        UserAroBinding binding = userAroBindingMapper.selectByUserId(userId);
        if (binding == null || binding.getAroUserId() == null || binding.getAroUserId().isBlank()) {
            return userId;
        }
        return binding.getAroUserId();
    }
}
