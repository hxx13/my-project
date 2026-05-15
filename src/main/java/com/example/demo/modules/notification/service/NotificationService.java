package com.example.demo.modules.notification.service;

import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.auth.mapper.UserMapper;
import com.example.demo.modules.auth.service.UserDisplayNameService;
import com.example.demo.modules.policy.BizDomains;
import com.example.demo.modules.policy.entity.BizCapabilityPolicy;
import com.example.demo.modules.policy.service.CapabilityPolicyService;
import com.example.demo.modules.notification.dto.NotificationView;
import com.example.demo.modules.notification.dto.PublishNotificationEvent;
import com.example.demo.modules.notification.entity.Notification;
import com.example.demo.modules.notification.entity.NotifyRule;
import com.example.demo.modules.notification.entity.NotifyTemplate;
import com.example.demo.modules.notification.mapper.NotificationMapper;
import com.example.demo.modules.notification.mapper.NotificationSettingsMapper;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.*;

@Service
public class NotificationService {
    private final NotificationMapper notificationMapper;
    private final NotificationSettingsMapper settingsMapper;
    private final UserMapper userMapper;
    private final UserDisplayNameService userDisplayNameService;
    private final CapabilityPolicyService capabilityPolicyService;
    private final NotificationPushService notificationPushService;
    private final MiniProgramNotificationService miniProgramNotificationService;

    public NotificationService(NotificationMapper notificationMapper,
                               NotificationSettingsMapper settingsMapper,
                               UserMapper userMapper,
                               UserDisplayNameService userDisplayNameService,
                               CapabilityPolicyService capabilityPolicyService,
                               NotificationPushService notificationPushService,
                               MiniProgramNotificationService miniProgramNotificationService) {
        this.notificationMapper = notificationMapper;
        this.settingsMapper = settingsMapper;
        this.userMapper = userMapper;
        this.userDisplayNameService = userDisplayNameService;
        this.capabilityPolicyService = capabilityPolicyService;
        this.notificationPushService = notificationPushService;
        this.miniProgramNotificationService = miniProgramNotificationService;
    }

    public void publish(PublishNotificationEvent event) {
        if (event == null || !StringUtils.hasText(event.getEventType()) || !StringUtils.hasText(event.getBizType())) {
            return;
        }
        NotifyRule rule = settingsMapper.findRuleByEventAndBiz(event.getEventType().trim().toUpperCase(), event.getBizType().trim().toUpperCase());
        if (rule == null || rule.getEnabled() == null || rule.getEnabled() != 1) {
            return;
        }
        NotifyTemplate template = settingsMapper.findTemplateByKey(rule.getTemplateKey());
        if (template == null || template.getEnabled() == null || template.getEnabled() != 1) {
            return;
        }

        Map<String, String> variables = event.getVariables() == null ? new HashMap<>() : new HashMap<>(event.getVariables());
        variables.putIfAbsent("bizId", safe(event.getBizId()));
        variables.putIfAbsent("eventType", safe(event.getEventType()));
        variables.putIfAbsent("eventTypeZh", eventTypeZh(event.getEventType()));
        variables.putIfAbsent("bizTypeZh", bizTypeZh(event.getBizType()));
        enrichVariableDisplayNames(event, variables);
        String title = render(template.getTitleTpl(), variables);
        String content = render(template.getContentTpl(), variables);

        Set<String> recipients = new LinkedHashSet<>();
        String mode = rule.getRecipientMode() == null ? "HYBRID" : rule.getRecipientMode().trim().toUpperCase();
        if ("RELATED".equals(mode) || "HYBRID".equals(mode)) {
            collectRelatedRecipients(event, recipients);
        }
        if ("ROLE".equals(mode) || "HYBRID".equals(mode)) {
            Integer minLevel = rule.getMinRoleLevel() == null ? 3 : rule.getMinRoleLevel();
            List<User> users = userMapper.listEnabledUsersByMinRoleLevel(minLevel);
            for (User user : users) {
                if (user != null && StringUtils.hasText(user.getId())) {
                    recipients.add(user.getId());
                }
            }
        }
        mergeProcessCapableRecipientsForCreatedWorkOrder(event, recipients);
        boolean keepSender = "CREATED".equalsIgnoreCase(event.getEventType());
        if (!keepSender) {
            recipients.remove(event.getSenderId());
        }
        // 办结回执：处理人与申请人为同一人时 remove(sender) 会误删申请人，补回
        if ("COMPLETED".equalsIgnoreCase(event.getEventType()) && StringUtils.hasText(event.getApplicantId())) {
            recipients.add(event.getApplicantId().trim());
        }
        if (recipients.isEmpty()) {
            return;
        }

        Notification notification = new Notification();
        notification.setId("NTF_" + UUID.randomUUID().toString().replace("-", ""));
        notification.setEventType(event.getEventType().trim().toUpperCase());
        notification.setTitle(title);
        notification.setContent(content);
        notification.setSenderId(event.getSenderId());
        notification.setBizType(event.getBizType().trim().toUpperCase());
        notification.setBizId(event.getBizId());
        notification.setCreateTime(LocalDateTime.now());
        notificationMapper.insertNotification(notification);
        for (String recipient : recipients) {
            notificationMapper.insertRecipient(notification.getId(), recipient);
        }
        notificationPushService.pushToUsers(recipients, Map.of(
                "id", notification.getId(),
                "eventType", notification.getEventType(),
                "bizType", notification.getBizType(),
                "bizId", notification.getBizId()
        ));
        miniProgramNotificationService.dispatchAfterPersisted(notification.getId(), recipients, template, variables);
    }

    public Map<String, Object> listForUser(String userId, int page, int size, boolean onlyUnread,
                                           String bizType, String excludeBizType, String excludeBizTypesCsv) {
        int safePage = Math.max(page, 1);
        int safeSize = Math.min(Math.max(size, 1), 100);
        int offset = (safePage - 1) * safeSize;
        String bt = normalizeBizFilter(bizType);
        String ex = normalizeBizFilter(excludeBizType);
        List<String> exMulti = buildExcludeBizTypeList(excludeBizTypesCsv);
        List<NotificationView> rows = notificationMapper.listForUser(userId, onlyUnread, safeSize, offset, bt, ex, exMulti);
        int total = notificationMapper.countForUser(userId, onlyUnread, bt, ex, exMulti);
        Map<String, Object> data = new HashMap<>();
        data.put("data", rows);
        data.put("total", total);
        return data;
    }

    /**
     * 逗号分隔多个 biz_type，用于工作台将工单类通知与「纯通知」分栏。
     */
    private List<String> buildExcludeBizTypeList(String csv) {
        if (!StringUtils.hasText(csv)) {
            return null;
        }
        LinkedHashSet<String> set = new LinkedHashSet<>();
        for (String part : csv.split(",")) {
            String t = normalizeBizFilter(part);
            if (StringUtils.hasText(t)) {
                set.add(t);
            }
        }
        return set.isEmpty() ? null : new ArrayList<>(set);
    }

    public void markRead(String userId, String notificationId) {
        notificationMapper.markRead(userId, notificationId, LocalDateTime.now());
    }

    public void markAllRead(String userId) {
        notificationMapper.markAllRead(userId, LocalDateTime.now());
    }

    public int countUnread(String userId) {
        return notificationMapper.countUnread(userId);
    }

    /** 消息中心「已处理」Tab：办结回执类通知未读数（报修/采购/物资） */
    public int countUnreadCompletionReceipts(String userId) {
        if (!StringUtils.hasText(userId)) {
            return 0;
        }
        return notificationMapper.countUnreadCompletionReceipts(userId.trim());
    }

    public List<NotificationView> listUnreadCompletionReceipts(String userId, int limit) {
        if (!StringUtils.hasText(userId)) {
            return List.of();
        }
        int lim = Math.min(Math.max(limit, 1), 50);
        return notificationMapper.listUnreadCompletionReceipts(userId.trim(), lim);
    }

    /**
     * 侧栏/小程序角标：教职工排除工单类 biz（与列表 excludeBizTypes 一致），避免与处理队列角标重复；
     * 非教职工用户对工单类未读仅计入「本人作为申请人的单据」，避免 ROLE 广播通知误推手逗留在他人工单角标上。
     */
    public int countUnreadForSidebarBadge(String userId, RoleEnum role) {
        boolean staffPlus = role != null && role.getLevel() >= RoleEnum.STAFF.getLevel();
        List<String> ex = staffPlus ? List.of("REPAIR", "PURCHASE", "SUPPLIES_CLAIM") : null;
        return notificationMapper.countUnreadForSidebarBadge(userId, ex);
    }

    public boolean deleteForUser(String userId, String notificationId) {
        if (!StringUtils.hasText(userId) || !StringUtils.hasText(notificationId)) {
            return false;
        }
        return notificationMapper.deleteForUser(userId, notificationId) > 0;
    }

    /**
     * 将模板变量中的申请人/处理人等从裸 userId 补全为人员库姓名或账号名。
     */
    private void enrichVariableDisplayNames(PublishNotificationEvent event, Map<String, String> variables) {
        if (StringUtils.hasText(event.getApplicantId())) {
            String aid = event.getApplicantId().trim();
            String resolved = userDisplayNameService.resolveDisplayName(aid);
            String existing = variables.get("applicantName");
            if (!StringUtils.hasText(existing) || existing.trim().equals(aid)) {
                variables.put("applicantName", StringUtils.hasText(resolved) ? resolved : aid);
            }
        }
        if (StringUtils.hasText(event.getProcessorId())) {
            String pid = event.getProcessorId().trim();
            String resolved = userDisplayNameService.resolveDisplayName(pid);
            String existing = variables.get("processorName");
            if (!StringUtils.hasText(existing) || existing.trim().equals(pid)) {
                variables.put("processorName", StringUtils.hasText(resolved) ? resolved : pid);
            }
        }
        if (StringUtils.hasText(event.getSenderId())) {
            variables.putIfAbsent("senderName", userDisplayNameService.resolveDisplayName(event.getSenderId()));
        }
    }

    private void collectRelatedRecipients(PublishNotificationEvent event, Set<String> recipients) {
        if (StringUtils.hasText(event.getApplicantId())) recipients.add(event.getApplicantId());
        if (StringUtils.hasText(event.getProcessorId())) recipients.add(event.getProcessorId());
        if (event.getRelatedUserIds() != null) {
            recipients.addAll(event.getRelatedUserIds());
        }
    }

    /**
     * 工单「已创建」：在 notify_rule 的 RELATED / ROLE 之外，按业务能力策略 {@link BizCapabilityPolicy#getMinRoleProcess()}
     * 并入「具备处理权限」的账号，避免规则误配为仅申请人、或 min_role_level 过高时，超级管理员等处理角色收不到采购/报修/领用通知。
     */
    private void mergeProcessCapableRecipientsForCreatedWorkOrder(PublishNotificationEvent event, Set<String> recipients) {
        if (event == null || recipients == null || !StringUtils.hasText(event.getBizType())) {
            return;
        }
        if (!"CREATED".equalsIgnoreCase(event.getEventType())) {
            return;
        }
        String domain = bizTypeToPolicyDomain(event.getBizType());
        if (domain == null) {
            return;
        }
        BizCapabilityPolicy policy = capabilityPolicyService.resolve(domain);
        Integer mp = policy == null ? null : policy.getMinRoleProcess();
        int minLevel = mp != null && mp > 0 ? mp : RoleEnum.SUPER_ADMIN.getLevel();
        List<User> users = userMapper.listEnabledUsersByMinRoleLevel(minLevel);
        for (User user : users) {
            if (user != null && StringUtils.hasText(user.getId())) {
                recipients.add(user.getId());
            }
        }
    }

    private static String bizTypeToPolicyDomain(String bizType) {
        if (!StringUtils.hasText(bizType)) {
            return null;
        }
        return switch (bizType.trim().toUpperCase()) {
            case "REPAIR" -> BizDomains.REPAIR;
            case "PURCHASE" -> BizDomains.PURCHASE;
            case "SUPPLIES_CLAIM" -> BizDomains.SUPPLIES_CLAIM;
            default -> null;
        };
    }

    private String render(String tpl, Map<String, String> vars) {
        String output = tpl == null ? "" : tpl;
        for (Map.Entry<String, String> entry : vars.entrySet()) {
            output = output.replace("{" + entry.getKey() + "}", safe(entry.getValue()));
        }
        return output;
    }

    private String safe(String v) {
        return v == null ? "" : v;
    }

    private static String eventTypeZh(String eventType) {
        if (!StringUtils.hasText(eventType)) {
            return "";
        }
        String s = eventType.trim().toUpperCase();
        return switch (s) {
            case "CREATED" -> "已创建";
            case "STARTED" -> "已接单";
            case "COMPLETED" -> "已完成";
            case "WITHDRAWN" -> "已撤回";
            case "DELETED" -> "已删除";
            case "RESTORED" -> "已恢复";
            default -> eventType.trim();
        };
    }

    private static String bizTypeZh(String bizType) {
        if (!StringUtils.hasText(bizType)) {
            return "";
        }
        String s = bizType.trim().toUpperCase();
        return switch (s) {
            case "REPAIR" -> "报修";
            case "PURCHASE" -> "采购";
            case "SUPPLIES_CLAIM" -> "物资领用";
            default -> bizType.trim();
        };
    }

    /** 空串视为不按该维度筛选，避免 MyBatis 误判 */
    private static String normalizeBizFilter(String raw) {
        if (!StringUtils.hasText(raw)) {
            return null;
        }
        return raw.trim().toUpperCase();
    }
}
