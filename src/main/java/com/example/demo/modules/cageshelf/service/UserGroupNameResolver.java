package com.example.demo.modules.cageshelf.service;

import com.example.demo.modules.aro.dto.AroPersonnel;
import com.example.demo.modules.aro.mapper.AroPersonnelMapper;
import com.example.demo.modules.auth.entity.UserAroBinding;
import com.example.demo.modules.auth.mapper.UserAroBindingMapper;
import com.example.demo.modules.twin.common.util.PersonnelProjectGroupUtil;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
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
            AroPersonnel personnel = aroPersonnelMapper.findByUserId(canonicalUserId(userId));
            if (personnel == null) {
                return List.of();
            }
            List<String> groups = PersonnelProjectGroupUtil.splitGroups(personnel.getResolvedProjectGroupNames());
            /*
              行政组（如「DLAS-实验动物管理」）在笼位上没有同名 PI：设施笼位的 PI 是
              「DLAS-实验动物科学部管理组」、归属记在部门上，组名永远对不上。这类账号明明有课题组，
              基础可见范围却是空的 —— 「我的区域」按部门能识别、点开却被脱敏，就是这条不一致造成的。
              组名不是「…的课题组」形态时补一维人员部门；普通 PI 组与学生不受影响。
            */
            if (!groups.isEmpty() && groups.stream().noneMatch(g -> g.endsWith("课题组"))) {
                String dept = personnel.getDepartmentName() == null ? "" : personnel.getDepartmentName().trim();
                if (dept.length() >= 4 && !groups.contains(dept)) {
                    groups = new ArrayList<>(groups);
                    groups.add(dept);
                }
            }
            return groups;
        } catch (Exception e) {
            log.warn("[cage-group] 解析用户课题组失败 userId={} err={}", userId, e.getMessage());
            return List.of();
        }
    }

    /**
     * 账号规范化 —— 统一折算成 ARO 人员编号。
     *
     * <p>同一个人在本系统里有两种 id：STAFF_ 账号 id（sys_user 主键）和 ARO 人员编号
     * （aro_personnel.user_id）。选人弹窗给的是 `staffId || aroUserId`（优先 STAFF_），
     * 而学生自己登录时用的是 ARO 编号 —— 不折算就会出现「同一人两种 claimant_id」，
     * 认领记录、课题组判定、我的申请列表全对不上。
     *
     * <p>非 STAFF_ 或无绑定则原样返回。
     */
    public String canonicalUserId(String userId) {
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
