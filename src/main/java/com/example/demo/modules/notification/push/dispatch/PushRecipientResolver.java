package com.example.demo.modules.notification.push.dispatch;

import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.auth.mapper.UserMapper;
import com.example.demo.modules.notification.push.PushConstants;
import com.example.demo.modules.notification.push.recipient.NotifySourceRecipient;
import com.example.demo.modules.notification.push.recipient.NotifySourceRecipientService;
import com.example.demo.modules.personnel.service.PersonnelService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 信息源接收人解析：把 notify_source_recipient 的行展开成"最终该发给谁"的账号 id 集合。
 *
 * <p>抽成独立服务是因为遥测报警调度器也要用同一套解析（否则双账号归并那段会出现第二份
 * 实现并逐渐漂移）。派发引擎与遥测调度器共用本类。
 */
@Service
public class PushRecipientResolver {

    private static final Logger log = LoggerFactory.getLogger(PushRecipientResolver.class);

    private final NotifySourceRecipientService recipientService;
    private final PersonnelService personnelService;
    private final UserMapper userMapper;

    public PushRecipientResolver(NotifySourceRecipientService recipientService,
                                 PersonnelService personnelService,
                                 UserMapper userMapper) {
        this.recipientService = recipientService;
        this.personnelService = personnelService;
        this.userMapper = userMapper;
    }

    /**
     * @param sourceId       信息源 id
     * @param dynamicUserIds 业务侧带入的临时接收人，可为 null
     * @return 去重后的账号 id 集合（同一个人双账号只留一个）
     */
    public Set<String> resolve(Long sourceId, Set<String> dynamicUserIds) {
        Set<String> result = new LinkedHashSet<>();
        if (dynamicUserIds != null) {
            result.addAll(dynamicUserIds);
        }
        for (NotifySourceRecipient rc : recipientService.listBySourceId(sourceId)) {
            if (PushConstants.PERSPECTIVE_ALL.equals(rc.getPerspective())) {
                if (PushConstants.SCOPE_ALL.equals(rc.getScopeType())) {
                    userMapper.listEnabledUsersByMinRoleLevel(0).forEach(u -> result.add(u.getId()));
                } else {
                    addByScope(rc, result);
                }
            } else if (PushConstants.PERSPECTIVE_STUDENT.equals(rc.getPerspective())) {
                // 学生视角下的"全部"只指 MEMBER，不含组长与专家
                if (PushConstants.SCOPE_ALL.equals(rc.getScopeType())) {
                    userMapper.findEnabledByRole(RoleEnum.MEMBER.getCode())
                            .forEach(u -> result.add(u.getId()));
                } else if (PushConstants.SCOPE_ROLE.equals(rc.getScopeType()) && rc.getScopeValue() != null) {
                    try {
                        RoleEnum role = RoleEnum.valueOf(rc.getScopeValue());
                        userMapper.findEnabledByRole(role.getCode()).forEach(u -> result.add(u.getId()));
                    } catch (IllegalArgumentException e) {
                        log.warn("[Push] 未知角色: {}", rc.getScopeValue());
                    }
                } else if (PushConstants.SCOPE_USER.equals(rc.getScopeType()) && rc.getScopeValue() != null) {
                    result.add(rc.getScopeValue().trim());
                }
            } else if (PushConstants.PERSPECTIVE_STAFF.equals(rc.getPerspective())) {
                if (PushConstants.SCOPE_ALL.equals(rc.getScopeType())) {
                    userMapper.listEnabledStaffUsers().forEach(u -> result.add(u.getId()));
                } else {
                    addByScope(rc, result);
                }
            }
        }
        return dedupByPersonnel(result);
    }

    private void addByScope(NotifySourceRecipient rc, Set<String> result) {
        if (PushConstants.SCOPE_ROLE.equals(rc.getScopeType()) && rc.getScopeValue() != null) {
            try {
                RoleEnum role = RoleEnum.valueOf(rc.getScopeValue());
                userMapper.findEnabledByRole(role.getCode()).forEach(u -> result.add(u.getId()));
            } catch (IllegalArgumentException e) {
                log.warn("[Push] 未知角色: {}", rc.getScopeValue());
            }
        } else if (PushConstants.SCOPE_USER.equals(rc.getScopeType()) && rc.getScopeValue() != null) {
            result.add(rc.getScopeValue().trim());
        }
    }

    /**
     * 同人（staff 与 student 双账号映射同一 personnel.id）去重：每个 personnel 保留一个代表账号 id；
     * 无 personnel 档案的落单账号原样保留（各自独立收件人）。
     */
    private Set<String> dedupByPersonnel(Set<String> accountIds) {
        if (accountIds == null || accountIds.isEmpty()) {
            return new LinkedHashSet<>();
        }
        Map<Long, String> representative = new LinkedHashMap<>();
        List<String> orphans = new ArrayList<>();
        for (String id : accountIds) {
            String pidStr = personnelService.resolveIdByAccount(id);
            if (pidStr != null) {
                try {
                    representative.putIfAbsent(Long.parseLong(pidStr), id);
                    continue;
                } catch (NumberFormatException ignore) {
                    // 非数字 personnel.id 视为落单
                }
            }
            orphans.add(id);
        }
        Set<String> result = new LinkedHashSet<>(representative.values());
        result.addAll(orphans);
        return result;
    }
}
