package com.example.demo.modules.chat;

import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.auth.mapper.UserMapper;
import com.example.demo.modules.auth.service.UserDisplayNameService;
import com.example.demo.modules.notification.service.NotificationPushService;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.security.MessageDigest;
import java.time.YearMonth;
import java.util.HexFormat;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

@Service
public class ChatService {

    private static final long MAX_ATTACHMENT_BYTES = 25L * 1024 * 1024;

    /** 与 scripts/chat_contact_groups.ddl.sql、schema.sql 中表定义一致 */
    public static final String MSG_CONTACT_GROUP_TABLES_MISSING =
            "通讯录分组表未创建：请在目标库执行 scripts/chat_contact_groups.ddl.sql（或 scripts/login_branding_invite_chat.ddl.sql 全量）。建表后通常约 1 分钟内自动生效，也可重启应用立即加载。";

    /** 与 scripts/chat_core_dm.ddl.sql、schema.sql 中 chat_conversation 等定义一致 */
    public static final String MSG_CHAT_CORE_TABLES_MISSING =
            "私聊核心表未创建：请在目标库执行 scripts/chat_core_dm.ddl.sql（或 scripts/login_branding_invite_chat.ddl.sql 全量），再重试打开会话。";

    /** 与 scripts/chat_user_conversation_prefs.ddl.sql、schema.sql 中表定义一致 */
    public static final String MSG_CHAT_USER_CONV_PREFS_TABLES_MISSING =
            "会话置顶/列表偏好表未创建：请在目标库执行 scripts/chat_user_conversation_prefs.ddl.sql。";

    private final ChatJdbcRepository chatJdbcRepository;
    private final UserMapper userMapper;
    private final UserDisplayNameService userDisplayNameService;
    private final AuthContextService authContextService;
    private final ChatObjectStorage chatObjectStorage;
    private final NotificationPushService notificationPushService;

    /** 与前端 StaffMessagesPage EventSource 监听名一致 */
    private static final String SSE_STAFF_CHAT = "staff_chat";

    public ChatService(ChatJdbcRepository chatJdbcRepository,
                       UserMapper userMapper,
                       UserDisplayNameService userDisplayNameService,
                       AuthContextService authContextService,
                       ChatObjectStorage chatObjectStorage,
                       NotificationPushService notificationPushService) {
        this.chatJdbcRepository = chatJdbcRepository;
        this.userMapper = userMapper;
        this.userDisplayNameService = userDisplayNameService;
        this.authContextService = authContextService;
        this.chatObjectStorage = chatObjectStorage;
        this.notificationPushService = notificationPushService;
    }

    public User requireChatUser(String authorization) {
        User u = authContextService.resolveUserFromBearer(authorization);
        if (u == null || u.getStatus() != null && u.getStatus() == 0) {
            return null;
        }
        RoleEnum r = u.getRole() == null ? RoleEnum.STUDENT : u.getRole();
        if (r.getLevel() < RoleEnum.STAFF.getLevel()) {
            return null;
        }
        return u;
    }

    public boolean isStaffUser(User u) {
        if (u == null) {
            return false;
        }
        RoleEnum r = u.getRole() == null ? RoleEnum.STUDENT : u.getRole();
        return r.getLevel() >= RoleEnum.STAFF.getLevel();
    }

    /**
     * 可与教职工站内信往来的对方：角色仍为教职工档，且非微信小程序「学号绑定」身份（mini_bind_type=STUDENT）。
     */
    public boolean isEligibleStaffMessengerPeer(User peer) {
        if (!isStaffUser(peer)) {
            return false;
        }
        String bt = peer.getMiniBindType();
        return bt == null || bt.isBlank() || !"STUDENT".equalsIgnoreCase(bt.trim());
    }

    public Map<String, Object> listContacts(User me, String keyword, int page, int size) {
        int safePage = Math.max(page, 1);
        int safeSize = Math.min(Math.max(size, 1), 200);
        int offset = (safePage - 1) * safeSize;
        long total = chatJdbcRepository.countStaffContacts(me.getId(), keyword);
        List<Map<String, Object>> raw = chatJdbcRepository.listStaffContacts(me.getId(), keyword, safeSize, offset);
        Map<String, Integer> unreadByPeer = chatJdbcRepository.unreadDmCountsByPeerUserId(me.getId());
        List<Map<String, Object>> data = new ArrayList<>(raw.size());
        for (Map<String, Object> row : raw) {
            HashMap<String, Object> m = new HashMap<>(row);
            Object id = row.get("id");
            int u = 0;
            if (id instanceof String sid) {
                u = unreadByPeer.getOrDefault(sid, 0);
                m.put("displayName", userDisplayNameService.resolveDisplayName(sid));
            } else {
                m.put("displayName", "");
            }
            m.put("unreadFromPeer", u);
            data.add(m);
        }
        return Map.of("total", total, "data", data, "page", safePage, "size", safeSize);
    }

    /**
     * 将当前用户在某会话的已读游标推进到最后一条消息时间（用于角标清零）。
     */
    @Transactional(rollbackFor = Exception.class)
    public void markConversationRead(User me, String conversationId) {
        if (!chatJdbcRepository.areChatCoreTablesPresent() || !chatJdbcRepository.areChatReadTablesPresent()) {
            return;
        }
        Optional<Map<String, Object>> conv = chatJdbcRepository.getConversationIfMember(conversationId, me.getId());
        if (conv.isEmpty()) {
            throw new IllegalArgumentException("无权访问该会话");
        }
        Timestamp ts = chatJdbcRepository.maxMessageCreateTimeInConversation(conversationId);
        if (ts == null) {
            ts = new Timestamp(System.currentTimeMillis());
        }
        chatJdbcRepository.upsertConversationRead(me.getId(), conversationId, ts);
        String minId = (String) conv.get().get("minUserId");
        String maxId = (String) conv.get().get("maxUserId");
        String peerId = me.getId().equals(minId) ? maxId : minId;
        notificationPushService.pushEventToUsers(SSE_STAFF_CHAT, Set.of(peerId), Map.of(
                "kind", "read",
                "conversationId", conversationId,
                "readerUserId", me.getId()
        ));
    }

    public List<Map<String, Object>> listConversations(User me) {
        if (!chatJdbcRepository.areChatCoreTablesPresent()) {
            return Collections.emptyList();
        }
        if (chatJdbcRepository.areChatUserConversationPrefsTablesPresent()) {
            return chatJdbcRepository.listConversationsForUserWithPrefs(me.getId());
        }
        return chatJdbcRepository.listConversationsForUser(me.getId());
    }

    @Transactional(rollbackFor = Exception.class)
    public void setConversationPinned(User me, String conversationId, boolean pinned) {
        if (!chatJdbcRepository.areChatCoreTablesPresent()) {
            throw new IllegalArgumentException(MSG_CHAT_CORE_TABLES_MISSING);
        }
        if (!chatJdbcRepository.areChatUserConversationPrefsTablesPresent()) {
            throw new IllegalArgumentException(MSG_CHAT_USER_CONV_PREFS_TABLES_MISSING);
        }
        if (chatJdbcRepository.getConversationIfMember(conversationId, me.getId()).isEmpty()) {
            throw new IllegalArgumentException("无权访问该会话");
        }
        chatJdbcRepository.upsertConversationPinned(me.getId(), conversationId, pinned);
    }

    @Transactional(rollbackFor = Exception.class)
    public void hideConversationFromMyList(User me, String conversationId) {
        if (!chatJdbcRepository.areChatCoreTablesPresent()) {
            throw new IllegalArgumentException(MSG_CHAT_CORE_TABLES_MISSING);
        }
        if (!chatJdbcRepository.areChatUserConversationPrefsTablesPresent()) {
            throw new IllegalArgumentException(MSG_CHAT_USER_CONV_PREFS_TABLES_MISSING);
        }
        if (chatJdbcRepository.getConversationIfMember(conversationId, me.getId()).isEmpty()) {
            throw new IllegalArgumentException("无权访问该会话");
        }
        chatJdbcRepository.hideConversationFromUserList(me.getId(), conversationId);
    }

    public List<Map<String, Object>> listContactGroups(User me) {
        return chatJdbcRepository.listContactGroups(me.getId());
    }

    private void requireContactGroupTablesForMutation() {
        if (!chatJdbcRepository.areContactGroupTablesPresent()) {
            throw new IllegalArgumentException(MSG_CONTACT_GROUP_TABLES_MISSING);
        }
    }

    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> createContactGroup(User me, String name) {
        requireContactGroupTablesForMutation();
        String trimmed = name == null ? "" : name.trim();
        if (!StringUtils.hasText(trimmed) || trimmed.length() > 64) {
            throw new IllegalArgumentException("分组名称须为 1～64 字");
        }
        String id = "CCG_" + UUID.randomUUID().toString().replace("-", "");
        int order = chatJdbcRepository.nextContactGroupSortOrder(me.getId());
        chatJdbcRepository.insertContactGroup(id, me.getId(), trimmed, order);
        return Map.of("id", id, "name", trimmed, "sortOrder", order);
    }

    @Transactional(rollbackFor = Exception.class)
    public void deleteContactGroup(User me, String groupId) {
        requireContactGroupTablesForMutation();
        if (!StringUtils.hasText(groupId)) {
            throw new IllegalArgumentException("分组无效");
        }
        int n = chatJdbcRepository.deleteContactGroupIfOwned(groupId.trim(), me.getId());
        if (n != 1) {
            throw new IllegalArgumentException("分组不存在或无权删除");
        }
    }

    @Transactional(rollbackFor = Exception.class)
    public void setPeerContactGroup(User me, String peerUserId, String groupIdOrEmpty) {
        requireContactGroupTablesForMutation();
        if (!StringUtils.hasText(peerUserId)) {
            throw new IllegalArgumentException("对方账号不合法");
        }
        User peer = userMapper.findById(peerUserId.trim());
        if (peer == null || peer.getStatus() != null && peer.getStatus() == 0) {
            throw new IllegalArgumentException("对方用户不存在或已禁用");
        }
        if (!isStaffUser(peer)) {
            throw new IllegalArgumentException("仅支持将教职工加入通讯录分组");
        }
        if (peer.getId().equals(me.getId())) {
            throw new IllegalArgumentException("不能给自己分组");
        }
        String gid = groupIdOrEmpty == null ? "" : groupIdOrEmpty.trim();
        if (!StringUtils.hasText(gid)) {
            chatJdbcRepository.clearContactGroupKeepAssignment(me.getId(), peer.getId());
            return;
        }
        if (!chatJdbcRepository.contactGroupOwnedBy(gid, me.getId())) {
            throw new IllegalArgumentException("分组不存在或无权使用");
        }
        chatJdbcRepository.upsertContactAssignment(me.getId(), peer.getId(), gid);
    }

    public Set<String> listBookmarkedPeerIds(User me) {
        return new HashSet<>(chatJdbcRepository.listBookmarkedPeerUserIds(me.getId()));
    }

    @Transactional(rollbackFor = Exception.class)
    public void addStaffContactBookmark(User me, String peerUserId) {
        requireContactGroupTablesForMutation();
        if (!StringUtils.hasText(peerUserId)) {
            throw new IllegalArgumentException("对方账号不合法");
        }
        User peer = userMapper.findById(peerUserId.trim());
        if (peer == null || peer.getStatus() != null && peer.getStatus() == 0) {
            throw new IllegalArgumentException("对方用户不存在或已禁用");
        }
        if (!isEligibleStaffMessengerPeer(peer)) {
            throw new IllegalArgumentException("仅支持将教职工账号（非学号绑定小程序身份）加入通讯录");
        }
        if (peer.getId().equals(me.getId())) {
            throw new IllegalArgumentException("不能添加自己");
        }
        chatJdbcRepository.ensureContactBookmark(me.getId(), peer.getId());
    }

    @Transactional(rollbackFor = Exception.class)
    public void removeStaffContactBookmark(User me, String peerUserId) {
        requireContactGroupTablesForMutation();
        if (!StringUtils.hasText(peerUserId)) {
            throw new IllegalArgumentException("对方账号不合法");
        }
        User peer = userMapper.findById(peerUserId.trim());
        if (peer == null) {
            throw new IllegalArgumentException("对方用户不存在");
        }
        chatJdbcRepository.deleteContactAssignment(me.getId(), peer.getId());
    }

    @Transactional(rollbackFor = Exception.class)
    public String openOrGetConversation(User me, String peerUserId) {
        if (!StringUtils.hasText(peerUserId) || peerUserId.equals(me.getId())) {
            throw new IllegalArgumentException("对方账号不合法");
        }
        User peer = userMapper.findById(peerUserId.trim());
        if (peer == null || peer.getStatus() != null && peer.getStatus() == 0) {
            throw new IllegalArgumentException("对方用户不存在或已禁用");
        }
        if (!isEligibleStaffMessengerPeer(peer)) {
            throw new IllegalArgumentException("仅支持与教职工账号（非学号绑定小程序身份）发起会话");
        }
        if (!chatJdbcRepository.areChatCoreTablesPresent()) {
            throw new IllegalArgumentException(MSG_CHAT_CORE_TABLES_MISSING);
        }
        String a = me.getId();
        String b = peer.getId();
        String min = a.compareTo(b) < 0 ? a : b;
        String max = a.compareTo(b) < 0 ? b : a;
        Optional<String> existing = chatJdbcRepository.findConversationId(min, max);
        String cid;
        if (existing.isPresent()) {
            cid = existing.get();
        } else {
            String id = "CHC_" + UUID.randomUUID().toString().replace("-", "");
            try {
                chatJdbcRepository.insertConversation(id, min, max);
                cid = id;
            } catch (DataIntegrityViolationException e) {
                cid = chatJdbcRepository.findConversationId(min, max).orElseThrow();
            }
        }
        chatJdbcRepository.clearConversationHiddenForUser(me.getId(), cid);
        return cid;
    }

    public List<Map<String, Object>> listMessages(User me, String conversationId, String afterMessageId, int limit) {
        if (!chatJdbcRepository.areChatCoreTablesPresent()) {
            throw new IllegalArgumentException(MSG_CHAT_CORE_TABLES_MISSING);
        }
        Optional<Map<String, Object>> conv = chatJdbcRepository.getConversationIfMember(conversationId, me.getId());
        if (conv.isEmpty()) {
            throw new IllegalArgumentException("无权访问该会话");
        }
        int lim = Math.min(Math.max(limit, 1), 200);
        String minId = (String) conv.get().get("minUserId");
        String maxId = (String) conv.get().get("maxUserId");
        String peerId = me.getId().equals(minId) ? maxId : minId;
        Timestamp peerReadAt = chatJdbcRepository.findLastReadAt(peerId, conversationId).orElse(null);
        List<Map<String, Object>> raw = chatJdbcRepository.listMessagesAfter(conversationId, afterMessageId, lim);
        List<Map<String, Object>> out = new ArrayList<>(raw.size());
        for (Map<String, Object> row : raw) {
            HashMap<String, Object> m = new HashMap<>(row);
            String senderId = (String) row.get("senderId");
            boolean outbound = me.getId().equals(senderId);
            boolean readByPeer = false;
            if (outbound && peerReadAt != null) {
                String iso = (String) row.get("createTime");
                if (StringUtils.hasText(iso)) {
                    Instant msgT = Instant.parse(iso);
                    readByPeer = !msgT.isAfter(peerReadAt.toInstant());
                }
            }
            m.put("readByPeer", readByPeer);
            out.add(m);
        }
        return out;
    }

    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> postMessage(User me, String conversationId, String body, String attachmentId) {
        if (!chatJdbcRepository.areChatCoreTablesPresent()) {
            throw new IllegalArgumentException(MSG_CHAT_CORE_TABLES_MISSING);
        }
        Optional<Map<String, Object>> convOpt = chatJdbcRepository.getConversationIfMember(conversationId, me.getId());
        if (convOpt.isEmpty()) {
            throw new IllegalArgumentException("无权访问该会话");
        }
        String b = body == null ? "" : body.trim();
        String att = attachmentId == null ? "" : attachmentId.trim();
        if (!StringUtils.hasText(b) && !StringUtils.hasText(att)) {
            throw new IllegalArgumentException("消息内容或附件至少填一项");
        }
        if (StringUtils.hasText(att)) {
            Optional<Map<String, Object>> attRow = chatJdbcRepository.findAttachmentInConversation(att, conversationId);
            if (attRow.isEmpty()) {
                throw new IllegalArgumentException("附件不存在或不属于本会话");
            }
        }
        String mid = "CHM_" + UUID.randomUUID().toString().replace("-", "");
        String attSql = StringUtils.hasText(att) ? att : null;
        String bodySql = StringUtils.hasText(b) ? b : null;
        chatJdbcRepository.insertMessage(mid, conversationId, me.getId(), bodySql, attSql);
        chatJdbcRepository.touchConversationTime(conversationId);
        String minId = (String) convOpt.get().get("minUserId");
        String maxId = (String) convOpt.get().get("maxUserId");
        notificationPushService.pushEventToUsers(SSE_STAFF_CHAT, Set.of(minId, maxId), Map.of(
                "kind", "message",
                "conversationId", conversationId,
                "messageId", mid,
                "senderUserId", me.getId()
        ));
        return Map.of("id", mid);
    }

    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> uploadAttachment(User me, String conversationId, MultipartFile file) throws IOException {
        if (!chatJdbcRepository.areChatCoreTablesPresent()) {
            throw new IllegalArgumentException(MSG_CHAT_CORE_TABLES_MISSING);
        }
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("文件为空");
        }
        if (file.getSize() > MAX_ATTACHMENT_BYTES) {
            throw new IllegalArgumentException("单文件不超过 25MB");
        }
        if (chatJdbcRepository.getConversationIfMember(conversationId, me.getId()).isEmpty()) {
            throw new IllegalArgumentException("无权访问该会话");
        }
        String orig = sanitizeFileName(file.getOriginalFilename());
        String ym = YearMonth.now().toString();
        String id = "CHA_" + UUID.randomUUID().toString().replace("-", "");
        String storageKey = ym + "/" + id + "_" + orig;
        byte[] bytes = file.getBytes();
        String sha = sha256Hex(bytes);
        chatObjectStorage.put(storageKey, bytes);
        String mime = file.getContentType() == null ? "application/octet-stream" : file.getContentType();
        chatJdbcRepository.insertAttachment(id, conversationId, storageKey, orig, mime, bytes.length, sha, me.getId());
        chatJdbcRepository.touchConversationTime(conversationId);
        return Map.of("attachmentId", id, "originalName", orig, "sizeBytes", bytes.length);
    }

    public org.springframework.core.io.Resource downloadAttachment(User me, String attachmentId) throws IOException {
        if (!chatJdbcRepository.areChatCoreTablesPresent()) {
            throw new IllegalArgumentException(MSG_CHAT_CORE_TABLES_MISSING);
        }
        Map<String, Object> row = chatJdbcRepository.findAttachmentForMember(attachmentId, me.getId())
                .orElseThrow(() -> new IllegalArgumentException("附件不存在或无权下载"));
        String storageKey = (String) row.get("storageKey");
        if (!chatObjectStorage.exists(storageKey)) {
            throw new IOException("文件已丢失");
        }
        return new org.springframework.core.io.InputStreamResource(chatObjectStorage.openStream(storageKey));
    }

    public String downloadFilename(String attachmentId, User me) {
        if (!chatJdbcRepository.areChatCoreTablesPresent()) {
            return "download.bin";
        }
        return chatJdbcRepository.findAttachmentForMember(attachmentId, me.getId())
                .map(r -> (String) r.get("originalName"))
                .orElse("download.bin");
    }

    public String downloadMime(String attachmentId, User me) {
        if (!chatJdbcRepository.areChatCoreTablesPresent()) {
            return "application/octet-stream";
        }
        return chatJdbcRepository.findAttachmentForMember(attachmentId, me.getId())
                .map(r -> (String) r.get("mimeType"))
                .filter(StringUtils::hasText)
                .orElse("application/octet-stream");
    }

    private static String sanitizeFileName(String name) {
        if (!StringUtils.hasText(name)) {
            return "file.bin";
        }
        String n = name.replace("\\", "_").replace("/", "_").trim();
        if (n.length() > 120) {
            n = n.substring(n.length() - 120);
        }
        return n.isEmpty() ? "file.bin" : n;
    }

    private static String sha256Hex(byte[] data) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(md.digest(data));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}
