package com.example.demo.modules.chat;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.util.StringUtils;
import org.springframework.jdbc.core.ResultSetExtractor;

import java.sql.Timestamp;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Repository
public class ChatJdbcRepository {

    private final JdbcTemplate jdbc;

    /** -1=未探测；0=当前无表；1=两表齐全 */
    private volatile int contactGroupTablesState = -1;

    /** 当 state=0 时，在此时间戳之前跳过 information_schema 探测（减轻压力；到期后自动重试以便热建表） */
    private volatile long contactGroupTablesRecheckAfterMs;

    /** -1=未探测；0=当前无齐套；1=chat_conversation + chat_message + chat_attachment 三表齐全 */
    private volatile int chatCoreTablesState = -1;

    private volatile long chatCoreTablesRecheckAfterMs;

    /** -1=未探测；0=无表；1=chat_conversation_read 已建 */
    private volatile int chatReadTablesState = -1;

    private volatile long chatReadTablesRecheckAfterMs;

    /** -1=未探测；0=无表；1=chat_user_conversation_prefs 已建 */
    private volatile int chatUserConvPrefsTablesState = -1;

    private volatile long chatUserConvPrefsTablesRecheckAfterMs;

    public ChatJdbcRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * 通讯录分组表是否已建（未建时联系人列表退化为无 JOIN，避免整页 500）。
     */
    public boolean areContactGroupTablesPresent() {
        if (contactGroupTablesState == 1) {
            return true;
        }
        long now = System.currentTimeMillis();
        if (contactGroupTablesState == 0 && now < contactGroupTablesRecheckAfterMs) {
            return false;
        }
        synchronized (this) {
            if (contactGroupTablesState == 1) {
                return true;
            }
            if (contactGroupTablesState == 0 && System.currentTimeMillis() < contactGroupTablesRecheckAfterMs) {
                return false;
            }
            try {
                Long cnt = jdbc.queryForObject(
                        """
                                SELECT COUNT(1) FROM information_schema.tables
                                WHERE table_schema = DATABASE()
                                  AND table_name IN ('chat_contact_group', 'chat_contact_assignment')
                                """,
                        Long.class
                );
                long c = cnt == null ? 0L : cnt;
                if (c == 2L) {
                    contactGroupTablesState = 1;
                    contactGroupTablesRecheckAfterMs = 0L;
                    return true;
                }
            } catch (Exception e) {
                /* 无权限或异常时按无表处理 */
            }
            contactGroupTablesState = 0;
            contactGroupTablesRecheckAfterMs = System.currentTimeMillis() + 60_000L;
            return false;
        }
    }

    /**
     * 私聊核心表是否已建（未建时避免对 chat_conversation 等直接查询导致整页 500）。
     */
    public boolean areChatCoreTablesPresent() {
        if (chatCoreTablesState == 1) {
            return true;
        }
        long now = System.currentTimeMillis();
        if (chatCoreTablesState == 0 && now < chatCoreTablesRecheckAfterMs) {
            return false;
        }
        synchronized (this) {
            if (chatCoreTablesState == 1) {
                return true;
            }
            if (chatCoreTablesState == 0 && System.currentTimeMillis() < chatCoreTablesRecheckAfterMs) {
                return false;
            }
            try {
                Long cnt = jdbc.queryForObject(
                        """
                                SELECT COUNT(1) FROM information_schema.tables
                                WHERE table_schema = DATABASE()
                                  AND table_name IN ('chat_conversation', 'chat_message', 'chat_attachment')
                                """,
                        Long.class
                );
                long c = cnt == null ? 0L : cnt;
                if (c == 3L) {
                    chatCoreTablesState = 1;
                    chatCoreTablesRecheckAfterMs = 0L;
                    return true;
                }
            } catch (Exception e) {
                /* 无权限或异常时按无表处理 */
            }
            chatCoreTablesState = 0;
            chatCoreTablesRecheckAfterMs = System.currentTimeMillis() + 60_000L;
            return false;
        }
    }

    /**
     * 站内信已读游标表（未建时未读角标恒为 0，不影响发消息）。
     */
    public boolean areChatReadTablesPresent() {
        if (chatReadTablesState == 1) {
            return true;
        }
        long now = System.currentTimeMillis();
        if (chatReadTablesState == 0 && now < chatReadTablesRecheckAfterMs) {
            return false;
        }
        synchronized (this) {
            if (chatReadTablesState == 1) {
                return true;
            }
            if (chatReadTablesState == 0 && System.currentTimeMillis() < chatReadTablesRecheckAfterMs) {
                return false;
            }
            try {
                Long cnt = jdbc.queryForObject(
                        """
                                SELECT COUNT(1) FROM information_schema.tables
                                WHERE table_schema = DATABASE() AND table_name = 'chat_conversation_read'
                                """,
                        Long.class
                );
                long c = cnt == null ? 0L : cnt;
                if (c == 1L) {
                    chatReadTablesState = 1;
                    chatReadTablesRecheckAfterMs = 0L;
                    return true;
                }
            } catch (Exception e) {
                /* ignore */
            }
            chatReadTablesState = 0;
            chatReadTablesRecheckAfterMs = System.currentTimeMillis() + 60_000L;
            return false;
        }
    }

    /**
     * 每用户会话置顶/隐藏表（未建时列表退化为无偏好，与 scripts/chat_user_conversation_prefs.ddl.sql 一致）。
     */
    public boolean areChatUserConversationPrefsTablesPresent() {
        if (chatUserConvPrefsTablesState == 1) {
            return true;
        }
        long now = System.currentTimeMillis();
        if (chatUserConvPrefsTablesState == 0 && now < chatUserConvPrefsTablesRecheckAfterMs) {
            return false;
        }
        synchronized (this) {
            if (chatUserConvPrefsTablesState == 1) {
                return true;
            }
            if (chatUserConvPrefsTablesState == 0 && System.currentTimeMillis() < chatUserConvPrefsTablesRecheckAfterMs) {
                return false;
            }
            try {
                Long cnt = jdbc.queryForObject(
                        """
                                SELECT COUNT(1) FROM information_schema.tables
                                WHERE table_schema = DATABASE() AND table_name = 'chat_user_conversation_prefs'
                                """,
                        Long.class
                );
                long c = cnt == null ? 0L : cnt;
                if (c == 1L) {
                    chatUserConvPrefsTablesState = 1;
                    chatUserConvPrefsTablesRecheckAfterMs = 0L;
                    return true;
                }
            } catch (Exception e) {
                /* ignore */
            }
            chatUserConvPrefsTablesState = 0;
            chatUserConvPrefsTablesRecheckAfterMs = System.currentTimeMillis() + 60_000L;
            return false;
        }
    }

    public int countTotalUnreadDmForUser(String userId) {
        if (!areChatCoreTablesPresent() || !areChatReadTablesPresent()) {
            return 0;
        }
        Integer n = jdbc.query(
                """
                        SELECT COALESCE(SUM(sub.uc), 0) AS total_unread FROM (
                          SELECT (
                            SELECT COUNT(*) FROM chat_message m
                            WHERE m.conversation_id = c.id AND m.sender_id <> ?
                              AND m.create_time > COALESCE(
                                (SELECT r.last_read_at FROM chat_conversation_read r
                                 WHERE r.user_id = ? AND r.conversation_id = c.id),
                                TIMESTAMP('1970-01-01 00:00:00')
                              )
                          ) AS uc
                          FROM chat_conversation c
                          WHERE c.min_user_id = ? OR c.max_user_id = ?
                        ) sub
                        """,
                rs -> {
                    if (!rs.next()) {
                        return 0;
                    }
                    return rs.getInt("total_unread");
                },
                userId, userId, userId, userId
        );
        return n == null ? 0 : n;
    }

    /**
     * 各会话对方 userId → 对方发来且未读条数（仅含与本人有会话的 peer）。
     */
    public Map<String, Integer> unreadDmCountsByPeerUserId(String userId) {
        if (!areChatCoreTablesPresent() || !areChatReadTablesPresent()) {
            return Collections.emptyMap();
        }
        return jdbc.query(
                """
                        SELECT
                          CASE WHEN c.min_user_id = ? THEN c.max_user_id ELSE c.min_user_id END AS peer_id,
                          (
                            SELECT COUNT(*) FROM chat_message m
                            WHERE m.conversation_id = c.id AND m.sender_id <> ?
                              AND m.create_time > COALESCE(
                                (SELECT r.last_read_at FROM chat_conversation_read r
                                 WHERE r.user_id = ? AND r.conversation_id = c.id),
                                TIMESTAMP('1970-01-01 00:00:00')
                              )
                          ) AS unread_cnt
                        FROM chat_conversation c
                        WHERE c.min_user_id = ? OR c.max_user_id = ?
                        """,
                rs -> {
                    Map<String, Integer> out = new LinkedHashMap<>();
                    while (rs.next()) {
                        int cnt = rs.getInt("unread_cnt");
                        if (cnt > 0) {
                            out.put(rs.getString("peer_id"), cnt);
                        }
                    }
                    return out;
                },
                userId, userId, userId, userId, userId
        );
    }

    public Timestamp maxMessageCreateTimeInConversation(String conversationId) {
        return jdbc.query(
                "SELECT MAX(create_time) FROM chat_message WHERE conversation_id = ?",
                (ResultSetExtractor<Timestamp>) rs -> rs.next() ? rs.getTimestamp(1) : null,
                conversationId
        );
    }

    public void upsertConversationRead(String userId, String conversationId, Timestamp lastReadAt) {
        if (!areChatReadTablesPresent()) {
            return;
        }
        jdbc.update(
                """
                        INSERT INTO chat_conversation_read(user_id, conversation_id, last_read_at)
                        VALUES (?,?,?)
                        ON DUPLICATE KEY UPDATE last_read_at = GREATEST(last_read_at, VALUES(last_read_at))
                        """,
                userId, conversationId, lastReadAt
        );
    }

    /** 某用户在某会话的已读游标（用于「对方已读」推断） */
    public Optional<Timestamp> findLastReadAt(String userId, String conversationId) {
        if (!areChatReadTablesPresent()) {
            return Optional.empty();
        }
        Timestamp t = jdbc.query(
                "SELECT last_read_at FROM chat_conversation_read WHERE user_id = ? AND conversation_id = ? LIMIT 1",
                (ResultSetExtractor<Timestamp>) rs -> rs.next() ? rs.getTimestamp(1) : null,
                userId, conversationId
        );
        return t == null ? Optional.empty() : Optional.of(t);
    }

    public List<String> listBookmarkedPeerUserIds(String ownerUserId) {
        if (!areContactGroupTablesPresent()) {
            return Collections.emptyList();
        }
        return jdbc.query(
                "SELECT peer_user_id FROM chat_contact_assignment WHERE owner_user_id = ? ORDER BY peer_user_id",
                (rs, i) -> rs.getString(1),
                ownerUserId
        );
    }

    /**
     * 将对方加入本人通讯录（无分组）；若已有分组则保留原 group_id。
     */
    public void ensureContactBookmark(String ownerUserId, String peerUserId) {
        jdbc.update(
                """
                        INSERT INTO chat_contact_assignment(owner_user_id, peer_user_id, group_id) VALUES (?, ?, NULL)
                        ON DUPLICATE KEY UPDATE group_id = COALESCE(chat_contact_assignment.group_id, VALUES(group_id))
                        """,
                ownerUserId, peerUserId
        );
    }

    /**
     * 好友/站内信联系人：排除微信小程序「学号绑定」路径账号（mini_bind_type=STUDENT），与角色无关维度上的学生端身份。
     * NULL/空/STAFF 视为可出现在教职工通讯录（含历史账号密码用户）。
     */
    private static final String STAFF_CONTACT_MINI_BIND_FILTER_U = " AND NOT (UPPER(TRIM(IFNULL(u.mini_bind_type,''))) = 'STUDENT') ";
    private static final String STAFF_CONTACT_MINI_BIND_FILTER = " AND NOT (UPPER(TRIM(IFNULL(mini_bind_type,''))) = 'STUDENT') ";

    public List<Map<String, Object>> listStaffContacts(String excludeUserId, String keyword, int limit, int offset) {
        String me = excludeUserId;
        String kw = keyword == null ? "" : keyword.trim();
        boolean withGroups = areContactGroupTablesPresent();
        if (StringUtils.hasText(kw)) {
            String like = "%" + kw + "%";
            if (withGroups) {
                return jdbc.query(
                        """
                                SELECT u.id, u.username, IFNULL(u.display_nickname,'') AS displayNickname,
                                       ca.group_id AS contactGroupId
                                FROM sys_user u
                                LEFT JOIN chat_contact_assignment ca ON ca.owner_user_id = ? AND ca.peer_user_id = u.id
                                WHERE u.status = 1 AND u.id != ?
                                  AND (CASE u.role WHEN 'STUDENT' THEN 1 WHEN 'STAFF' THEN 2 WHEN 'SENIOR' THEN 3 WHEN 'ADMIN' THEN 4 WHEN 'SUPER_ADMIN' THEN 5 WHEN 'PLATFORM_OWNER' THEN 6 ELSE 0 END) >= 2
                                """ + STAFF_CONTACT_MINI_BIND_FILTER_U + """
                                  AND (u.username LIKE ? OR IFNULL(u.display_nickname,'') LIKE ?)
                                ORDER BY u.username
                                LIMIT ? OFFSET ?
                                """,
                        (rs, i) -> contactRow(rs),
                        me, me, like, like, limit, offset
                );
            }
            return jdbc.query(
                    """
                            SELECT id, username, IFNULL(display_nickname,'') AS displayNickname
                            FROM sys_user
                            WHERE status = 1 AND id != ?
                              AND (CASE role WHEN 'STUDENT' THEN 1 WHEN 'STAFF' THEN 2 WHEN 'SENIOR' THEN 3 WHEN 'ADMIN' THEN 4 WHEN 'SUPER_ADMIN' THEN 5 WHEN 'PLATFORM_OWNER' THEN 6 ELSE 0 END) >= 2
                            """ + STAFF_CONTACT_MINI_BIND_FILTER + """
                              AND (username LIKE ? OR IFNULL(display_nickname,'') LIKE ?)
                            ORDER BY username
                            LIMIT ? OFFSET ?
                            """,
                    (rs, i) -> contactRowNoGroup(rs),
                    me, like, like, limit, offset
            );
        }
        if (withGroups) {
            return jdbc.query(
                    """
                            SELECT u.id, u.username, IFNULL(u.display_nickname,'') AS displayNickname,
                                   ca.group_id AS contactGroupId
                            FROM sys_user u
                            LEFT JOIN chat_contact_assignment ca ON ca.owner_user_id = ? AND ca.peer_user_id = u.id
                            WHERE u.status = 1 AND u.id != ?
                              AND (CASE u.role WHEN 'STUDENT' THEN 1 WHEN 'STAFF' THEN 2 WHEN 'SENIOR' THEN 3 WHEN 'ADMIN' THEN 4 WHEN 'SUPER_ADMIN' THEN 5 WHEN 'PLATFORM_OWNER' THEN 6 ELSE 0 END) >= 2
                            """ + STAFF_CONTACT_MINI_BIND_FILTER_U + """
                            ORDER BY u.username
                            LIMIT ? OFFSET ?
                            """,
                    (rs, i) -> contactRow(rs),
                    me, me, limit, offset
            );
        }
        return jdbc.query(
                """
                        SELECT id, username, IFNULL(display_nickname,'') AS displayNickname
                        FROM sys_user
                        WHERE status = 1 AND id != ?
                          AND (CASE role WHEN 'STUDENT' THEN 1 WHEN 'STAFF' THEN 2 WHEN 'SENIOR' THEN 3 WHEN 'ADMIN' THEN 4 WHEN 'SUPER_ADMIN' THEN 5 WHEN 'PLATFORM_OWNER' THEN 6 ELSE 0 END) >= 2
                        """ + STAFF_CONTACT_MINI_BIND_FILTER + """
                        ORDER BY username
                        LIMIT ? OFFSET ?
                        """,
                (rs, i) -> contactRowNoGroup(rs),
                me, limit, offset
        );
    }

    private static Map<String, Object> contactRowNoGroup(java.sql.ResultSet rs) throws java.sql.SQLException {
        return Map.of(
                "id", rs.getString("id"),
                "username", rs.getString("username"),
                "displayNickname", rs.getString("displayNickname") == null ? "" : rs.getString("displayNickname"),
                "contactGroupId", ""
        );
    }

    private static Map<String, Object> contactRow(java.sql.ResultSet rs) throws java.sql.SQLException {
        String gid = rs.getString("contactGroupId");
        String dn = rs.getString("displayNickname");
        return Map.of(
                "id", rs.getString("id"),
                "username", rs.getString("username"),
                "displayNickname", dn == null ? "" : dn,
                "contactGroupId", gid == null ? "" : gid
        );
    }

    public long countStaffContacts(String excludeUserId, String keyword) {
        String kw = keyword == null ? "" : keyword.trim();
        if (StringUtils.hasText(kw)) {
            String like = "%" + kw + "%";
            Long n = jdbc.queryForObject(
                    """
                            SELECT COUNT(1) FROM sys_user
                            WHERE status = 1 AND id != ?
                              AND (CASE role WHEN 'STUDENT' THEN 1 WHEN 'STAFF' THEN 2 WHEN 'SENIOR' THEN 3 WHEN 'ADMIN' THEN 4 WHEN 'SUPER_ADMIN' THEN 5 WHEN 'PLATFORM_OWNER' THEN 6 ELSE 0 END) >= 2
                            """ + STAFF_CONTACT_MINI_BIND_FILTER + """
                              AND (username LIKE ? OR IFNULL(display_nickname,'') LIKE ?)
                            """,
                    Long.class,
                    excludeUserId, like, like
            );
            return n == null ? 0 : n;
        }
        Long n = jdbc.queryForObject(
                """
                        SELECT COUNT(1) FROM sys_user
                        WHERE status = 1 AND id != ?
                          AND (CASE role WHEN 'STUDENT' THEN 1 WHEN 'STAFF' THEN 2 WHEN 'SENIOR' THEN 3 WHEN 'ADMIN' THEN 4 WHEN 'SUPER_ADMIN' THEN 5 WHEN 'PLATFORM_OWNER' THEN 6 ELSE 0 END) >= 2
                        """ + STAFF_CONTACT_MINI_BIND_FILTER + """
                        """,
                Long.class,
                excludeUserId
        );
        return n == null ? 0 : n;
    }

    public Optional<String> findConversationId(String minUserId, String maxUserId) {
        List<String> ids = jdbc.query(
                "SELECT id FROM chat_conversation WHERE min_user_id = ? AND max_user_id = ? LIMIT 1",
                (rs, i) -> rs.getString(1),
                minUserId, maxUserId
        );
        return ids.isEmpty() ? Optional.empty() : Optional.of(ids.get(0));
    }

    public String insertConversation(String id, String minUserId, String maxUserId) {
        jdbc.update(
                "INSERT INTO chat_conversation(id, min_user_id, max_user_id, last_message_at) VALUES(?,?,?,NOW())",
                id, minUserId, maxUserId
        );
        return id;
    }

    public List<Map<String, Object>> listConversationsForUser(String userId) {
        return jdbc.query(
                """
                        SELECT c.id, c.min_user_id AS minUserId, c.max_user_id AS maxUserId, c.last_message_at AS lastMessageAt,
                               CASE WHEN c.min_user_id = ? THEN c.max_user_id ELSE c.min_user_id END AS peerUserId,
                               u.username AS peerUsername,
                               IFNULL(u.display_nickname,'') AS peerDisplayNickname
                        FROM chat_conversation c
                        JOIN sys_user u ON u.id = CASE WHEN c.min_user_id = ? THEN c.max_user_id ELSE c.min_user_id END
                        WHERE c.min_user_id = ? OR c.max_user_id = ?
                        ORDER BY c.last_message_at IS NULL, c.last_message_at DESC
                        """,
                (rs, i) -> Map.of(
                        "id", rs.getString("id"),
                        "peerUserId", rs.getString("peerUserId"),
                        "peerUsername", rs.getString("peerUsername"),
                        "peerDisplayNickname", rs.getString("peerDisplayNickname"),
                        "lastMessageAt", rs.getTimestamp("lastMessageAt") == null ? "" : rs.getTimestamp("lastMessageAt").toInstant().toString()
                ),
                userId, userId, userId, userId
        );
    }

    public List<Map<String, Object>> listConversationsForUserWithPrefs(String userId) {
        return jdbc.query(
                """
                        SELECT c.id, c.min_user_id AS minUserId, c.max_user_id AS maxUserId, c.last_message_at AS lastMessageAt,
                               CASE WHEN c.min_user_id = ? THEN c.max_user_id ELSE c.min_user_id END AS peerUserId,
                               u.username AS peerUsername,
                               IFNULL(u.display_nickname,'') AS peerDisplayNickname,
                               IFNULL(p.pinned, 0) AS pinned
                        FROM chat_conversation c
                        JOIN sys_user u ON u.id = CASE WHEN c.min_user_id = ? THEN c.max_user_id ELSE c.min_user_id END
                        LEFT JOIN chat_user_conversation_prefs p ON p.conversation_id = c.id AND p.user_id = ?
                        WHERE (c.min_user_id = ? OR c.max_user_id = ?)
                          AND (p.user_id IS NULL OR p.hidden_at IS NULL)
                        ORDER BY IFNULL(p.pinned, 0) DESC, c.last_message_at IS NULL, c.last_message_at DESC
                        """,
                (rs, i) -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("id", rs.getString("id"));
                    m.put("peerUserId", rs.getString("peerUserId"));
                    m.put("peerUsername", rs.getString("peerUsername"));
                    m.put("peerDisplayNickname", rs.getString("peerDisplayNickname"));
                    m.put("lastMessageAt", rs.getTimestamp("lastMessageAt") == null ? "" : rs.getTimestamp("lastMessageAt").toInstant().toString());
                    m.put("pinned", rs.getInt("pinned") != 0);
                    return m;
                },
                userId, userId, userId, userId, userId
        );
    }

    public void clearConversationHiddenForUser(String userId, String conversationId) {
        if (!areChatUserConversationPrefsTablesPresent()) {
            return;
        }
        jdbc.update(
                "UPDATE chat_user_conversation_prefs SET hidden_at = NULL, update_time = CURRENT_TIMESTAMP(3) WHERE user_id = ? AND conversation_id = ?",
                userId, conversationId
        );
    }

    public void upsertConversationPinned(String userId, String conversationId, boolean pinned) {
        int pinVal = pinned ? 1 : 0;
        int n = jdbc.update(
                "UPDATE chat_user_conversation_prefs SET pinned = ?, update_time = CURRENT_TIMESTAMP(3) WHERE user_id = ? AND conversation_id = ?",
                pinVal, userId, conversationId
        );
        if (n == 0) {
            jdbc.update(
                    "INSERT INTO chat_user_conversation_prefs (user_id, conversation_id, pinned, hidden_at) VALUES (?,?,?,NULL)",
                    userId, conversationId, pinVal
            );
        }
    }

    public void hideConversationFromUserList(String userId, String conversationId) {
        int n = jdbc.update(
                "UPDATE chat_user_conversation_prefs SET hidden_at = CURRENT_TIMESTAMP(3), update_time = CURRENT_TIMESTAMP(3) WHERE user_id = ? AND conversation_id = ?",
                userId, conversationId
        );
        if (n == 0) {
            jdbc.update(
                    "INSERT INTO chat_user_conversation_prefs (user_id, conversation_id, pinned, hidden_at) VALUES (?,?,0,CURRENT_TIMESTAMP(3))",
                    userId, conversationId
            );
        }
    }

    public Optional<Map<String, Object>> getConversationIfMember(String conversationId, String userId) {
        List<Map<String, Object>> rows = jdbc.query(
                """
                        SELECT id, min_user_id AS minUserId, max_user_id AS maxUserId
                        FROM chat_conversation
                        WHERE id = ? AND (min_user_id = ? OR max_user_id = ?)
                        LIMIT 1
                        """,
                (rs, i) -> Map.of(
                        "id", rs.getString("id"),
                        "minUserId", rs.getString("minUserId"),
                        "maxUserId", rs.getString("maxUserId")
                ),
                conversationId, userId, userId
        );
        return rows.isEmpty() ? Optional.empty() : Optional.of(rows.get(0));
    }

    public void touchConversationTime(String conversationId) {
        jdbc.update("UPDATE chat_conversation SET last_message_at = NOW() WHERE id = ?", conversationId);
    }

    public void insertMessage(String id, String conversationId, String senderId, String body, String attachmentId) {
        jdbc.update(
                "INSERT INTO chat_message(id, conversation_id, sender_id, body, attachment_id) VALUES(?,?,?,?,?)",
                id, conversationId, senderId, body, attachmentId
        );
    }

    public List<Map<String, Object>> listMessagesAfter(String conversationId, String afterMessageId, int limit) {
        if (afterMessageId == null || afterMessageId.isBlank()) {
            return listMessagesLatest(conversationId, limit);
        }
        Timestamp pivot = jdbc.query(
                "SELECT create_time FROM chat_message WHERE id = ? AND conversation_id = ? LIMIT 1",
                (ResultSetExtractor<Timestamp>) rs -> rs.next() ? rs.getTimestamp(1) : null,
                afterMessageId, conversationId
        );
        if (pivot == null) {
            return listMessagesLatest(conversationId, limit);
        }
        return jdbc.query(
                """
                        SELECT m.id, m.sender_id AS senderId, m.body, m.attachment_id AS attachmentId, m.create_time AS createTime,
                               a.original_name AS attachmentName, a.mime_type AS attachmentMime, a.size_bytes AS attachmentSize
                        FROM chat_message m
                        LEFT JOIN chat_attachment a ON a.id = m.attachment_id
                        WHERE m.conversation_id = ? AND (m.create_time > ? OR (m.create_time = ? AND m.id > ?))
                        ORDER BY m.create_time ASC, m.id ASC
                        LIMIT ?
                        """,
                (rs, i) -> messageRow(rs),
                conversationId, pivot, pivot, afterMessageId, limit
        );
    }

    /** 首次打开会话：最近消息，时间正序 */
    public List<Map<String, Object>> listMessagesLatest(String conversationId, int limit) {
        List<Map<String, Object>> desc = jdbc.query(
                """
                        SELECT m.id, m.sender_id AS senderId, m.body, m.attachment_id AS attachmentId, m.create_time AS createTime,
                               a.original_name AS attachmentName, a.mime_type AS attachmentMime, a.size_bytes AS attachmentSize
                        FROM chat_message m
                        LEFT JOIN chat_attachment a ON a.id = m.attachment_id
                        WHERE m.conversation_id = ?
                        ORDER BY m.create_time DESC, m.id DESC
                        LIMIT ?
                        """,
                (rs, i) -> messageRow(rs),
                conversationId, limit
        );
        java.util.Collections.reverse(desc);
        return desc;
    }

    private static Map<String, Object> messageRow(java.sql.ResultSet rs) throws java.sql.SQLException {
        return Map.of(
                "id", rs.getString("id"),
                "senderId", rs.getString("senderId"),
                "body", rs.getString("body") == null ? "" : rs.getString("body"),
                "attachmentId", rs.getString("attachmentId") == null ? "" : rs.getString("attachmentId"),
                "createTime", rs.getTimestamp("createTime").toInstant().toString(),
                "attachmentName", rs.getString("attachmentName") == null ? "" : rs.getString("attachmentName"),
                "attachmentMime", rs.getString("attachmentMime") == null ? "" : rs.getString("attachmentMime"),
                "attachmentSize", rs.getLong("attachmentSize")
        );
    }

    public void insertAttachment(String id, String conversationId, String storageKey, String originalName, String mime, long size, String sha256, String uploadedBy) {
        jdbc.update(
                "INSERT INTO chat_attachment(id, conversation_id, storage_key, original_name, mime_type, size_bytes, sha256_hex, uploaded_by) VALUES(?,?,?,?,?,?,?,?)",
                id, conversationId, storageKey, originalName, mime, size, sha256, uploadedBy
        );
    }

    public Optional<Map<String, Object>> findAttachmentForMember(String attachmentId, String userId) {
        List<Map<String, Object>> rows = jdbc.query(
                """
                        SELECT a.id, a.conversation_id AS conversationId, a.storage_key AS storageKey, a.original_name AS originalName,
                               a.mime_type AS mimeType, a.size_bytes AS sizeBytes
                        FROM chat_attachment a
                        JOIN chat_conversation c ON c.id = a.conversation_id
                        WHERE a.id = ? AND (c.min_user_id = ? OR c.max_user_id = ?)
                        LIMIT 1
                        """,
                (rs, i) -> Map.of(
                        "id", rs.getString("id"),
                        "conversationId", rs.getString("conversationId"),
                        "storageKey", rs.getString("storageKey"),
                        "originalName", rs.getString("originalName"),
                        "mimeType", rs.getString("mimeType") == null ? "" : rs.getString("mimeType"),
                        "sizeBytes", rs.getLong("sizeBytes")
                ),
                attachmentId, userId, userId
        );
        return rows.isEmpty() ? Optional.empty() : Optional.of(rows.get(0));
    }

    public Optional<Map<String, Object>> findAttachmentInConversation(String attachmentId, String conversationId) {
        List<Map<String, Object>> rows = jdbc.query(
                "SELECT id, storage_key AS storageKey, original_name AS originalName, mime_type AS mimeType, size_bytes AS sizeBytes FROM chat_attachment WHERE id = ? AND conversation_id = ? LIMIT 1",
                (rs, i) -> Map.of(
                        "id", rs.getString("id"),
                        "storageKey", rs.getString("storageKey"),
                        "originalName", rs.getString("originalName"),
                        "mimeType", rs.getString("mimeType") == null ? "" : rs.getString("mimeType"),
                        "sizeBytes", rs.getLong("sizeBytes")
                ),
                attachmentId, conversationId
        );
        return rows.isEmpty() ? Optional.empty() : Optional.of(rows.get(0));
    }

    public List<Map<String, Object>> listContactGroups(String ownerUserId) {
        if (!areContactGroupTablesPresent()) {
            return Collections.emptyList();
        }
        return jdbc.query(
                """
                        SELECT id, name, sort_order AS sortOrder
                        FROM chat_contact_group
                        WHERE owner_user_id = ?
                        ORDER BY sort_order ASC, name ASC
                        """,
                (rs, i) -> Map.of(
                        "id", rs.getString("id"),
                        "name", rs.getString("name"),
                        "sortOrder", rs.getInt("sortOrder")
                ),
                ownerUserId
        );
    }

    public int nextContactGroupSortOrder(String ownerUserId) {
        Integer n = jdbc.queryForObject(
                "SELECT COALESCE(MAX(sort_order), 0) + 1 FROM chat_contact_group WHERE owner_user_id = ?",
                Integer.class,
                ownerUserId
        );
        return n == null ? 0 : n;
    }

    public void insertContactGroup(String id, String ownerUserId, String name, int sortOrder) {
        jdbc.update(
                "INSERT INTO chat_contact_group(id, owner_user_id, name, sort_order) VALUES(?,?,?,?)",
                id, ownerUserId, name, sortOrder
        );
    }

    public int deleteContactGroupIfOwned(String id, String ownerUserId) {
        return jdbc.update("DELETE FROM chat_contact_group WHERE id = ? AND owner_user_id = ?", id, ownerUserId);
    }

    public boolean contactGroupOwnedBy(String groupId, String ownerUserId) {
        Long n = jdbc.queryForObject(
                "SELECT COUNT(1) FROM chat_contact_group WHERE id = ? AND owner_user_id = ?",
                Long.class,
                groupId, ownerUserId
        );
        return n != null && n > 0;
    }

    public void deleteContactAssignment(String ownerUserId, String peerUserId) {
        jdbc.update("DELETE FROM chat_contact_assignment WHERE owner_user_id = ? AND peer_user_id = ?", ownerUserId, peerUserId);
    }

    public void upsertContactAssignment(String ownerUserId, String peerUserId, String groupId) {
        jdbc.update(
                """
                        INSERT INTO chat_contact_assignment(owner_user_id, peer_user_id, group_id) VALUES(?,?,?)
                        ON DUPLICATE KEY UPDATE group_id = VALUES(group_id)
                        """,
                ownerUserId, peerUserId, groupId
        );
    }

    /**
     * 清除分组但保留通讯录行；若无记录则插入一条未分组记录。
     */
    public void clearContactGroupKeepAssignment(String ownerUserId, String peerUserId) {
        int n = jdbc.update(
                "UPDATE chat_contact_assignment SET group_id = NULL WHERE owner_user_id = ? AND peer_user_id = ?",
                ownerUserId, peerUserId
        );
        if (n == 0) {
            ensureContactBookmark(ownerUserId, peerUserId);
        }
    }
}
