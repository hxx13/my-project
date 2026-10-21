package com.example.demo.modules.remotescreen.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 在线网页屏幕登记表（内存）。
 *
 * <p>**用来「精准指定哪一个网页」**：每个浏览器标签页在本地生成一个稳定的 {@code screenId}
 * （sessionStorage，刷新不变、关标签即失效），连上实时通道后把编号 + 名称 + 当前路由报上来。
 * 小程序就按这个编号点名 —— 不依赖 IP（多台机器可能同一出口）也不依赖页面标题（会重复）。
 *
 * <p>名称（label）由使用者在首次使用时改一次（「电视墙旁那台」），之后重连沿用；
 * **落库到 remote_screen**，后端重启也不丢。
 */
@Component
public class RemoteScreenRegistry {

    private static final Logger log = LoggerFactory.getLogger(RemoteScreenRegistry.class);

    public static class Entry {
        public String screenId;
        /** 配对码：页面上显示、手机上输入。凭码可以控制**不属于本账号**的展示页 */
        public String code = "";
        /** 这条页面是用哪个账号登录的 —— 只允许**同账号**控制 */
        public String ownerUserId = "";
        public String label = "";
        public String route = "";
        public String title = "";
        public String ip = "";
        public UUID sessionId;
        public long lastSeenAt;

        public Map<String, Object> toView() {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("screenId", screenId);
            m.put("code", code);
            m.put("label", label);
            m.put("route", route);
            m.put("title", title);
            m.put("ip", ip);
            m.put("lastSeenAt", Instant.ofEpochMilli(lastSeenAt).toString());
            // 会话编号只内部用，不对外
            return m;
        }
    }

    private final Map<String, Entry> byScreenId = new ConcurrentHashMap<>();
    /** sessionId → screenId：断开时按会话找回 */
    private final Map<UUID, String> bySession = new ConcurrentHashMap<>();

    private final JdbcTemplate jdbc;

    public RemoteScreenRegistry(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** 登记/刷新一条屏幕。已存在时只更新会话与状态，**保留用户改过的名称**。 */
    public Entry register(String screenId, String ownerUserId, String label, String route, String title,
                          String ip, UUID sessionId) {
        if (screenId == null || screenId.isBlank()) {
            return null;
        }
        String sid = screenId.trim();
        // 同一个标签页换了会话（重连），先把旧会话的映射清掉
        String prevScreen = bySession.get(sessionId);
        if (prevScreen != null && !prevScreen.equals(sid)) {
            bySession.remove(sessionId);
        }
        Entry e = byScreenId.computeIfAbsent(sid, k -> new Entry());
        e.screenId = sid;
        if (ownerUserId != null) {
            e.ownerUserId = ownerUserId;
        }
        if (label != null && !label.isBlank()) {
            e.label = label.trim();
        }
        if (route != null) {
            e.route = route;
        }
        if (title != null) {
            e.title = title;
        }
        if (ip != null) {
            e.ip = ip;
        }
        e.sessionId = sessionId;
        e.lastSeenAt = System.currentTimeMillis();
        if (e.code == null || e.code.isBlank()) {
            e.code = newCode();
        }
        bySession.put(sessionId, sid);
        // 客户端没带名字（第一次打开 / 本地被清过）就从库里取回上次起的名字
        if (e.label == null || e.label.isBlank()) {
            e.label = storedLabel(sid);
        }
        rememberOwner(sid, e.ownerUserId);
        return e;
    }

    /** 页面换了路由：刷新状态与心跳。 */
    public void updateState(String screenId, String route, String title) {
        Entry e = byScreenId.get(screenId);
        if (e == null) {
            return;
        }
        if (route != null) {
            e.route = route;
        }
        if (title != null) {
            e.title = title;
        }
        e.lastSeenAt = System.currentTimeMillis();
    }

    /** 改名。这条名称就是小程序里辨认「哪一台」的依据。 */
    public Entry rename(String screenId, String label) {
        Entry e = byScreenId.get(screenId);
        if (e == null) {
            return null;
        }
        e.label = label == null ? "" : label.trim();
        saveLabel(screenId, e.ownerUserId, e.label);
        return e;
    }

    // ---------------------------------------------------------------- 持久化
    // 只存「编号 → 名称」这一条映射；在线状态、路由都是瞬时的，没必要落库。

    private String storedLabel(String screenId) {
        try {
            List<String> rows = jdbc.queryForList(
                    "SELECT label FROM remote_screen WHERE screen_id = ?", String.class, screenId);
            return rows.isEmpty() || rows.get(0) == null ? "" : rows.get(0);
        } catch (Exception ex) {
            log.debug("[屏幕] 读取名称失败 {}: {}", screenId, ex.getMessage());
            return "";
        }
    }

    private void rememberOwner(String screenId, String ownerUserId) {
        if (ownerUserId == null || ownerUserId.isBlank()) {
            return;
        }
        try {
            jdbc.update("""
                    INSERT INTO remote_screen (screen_id, owner_user_id) VALUES (?, ?)
                    ON DUPLICATE KEY UPDATE owner_user_id = VALUES(owner_user_id)
                    """, screenId, ownerUserId);
        } catch (Exception ex) {
            log.debug("[屏幕] 记录归属失败 {}: {}", screenId, ex.getMessage());
        }
    }

    private void saveLabel(String screenId, String ownerUserId, String label) {
        try {
            jdbc.update("""
                    INSERT INTO remote_screen (screen_id, owner_user_id, label) VALUES (?, ?, ?)
                    ON DUPLICATE KEY UPDATE label = VALUES(label), owner_user_id = VALUES(owner_user_id)
                    """, screenId, ownerUserId == null ? "" : ownerUserId, label == null ? "" : label);
        } catch (Exception ex) {
            log.warn("[屏幕] 保存名称失败 {}: {}", screenId, ex.getMessage());
        }
    }

    /** 连接断开：把屏幕下线。 */
    public void unregisterSession(UUID sessionId) {
        String sid = bySession.remove(sessionId);
        if (sid == null) {
            return;
        }
        Entry e = byScreenId.get(sid);
        // 只清掉「确实还是这个会话」的那条，避免旧连接的断开事件把新连接顶掉
        if (e != null && sessionId.equals(e.sessionId)) {
            byScreenId.remove(sid);
        }
    }

    /** 按配对码找（不分账号：码本身就是凭证）。 */
    public Entry getByCode(String code) {
        if (code == null || code.isBlank()) {
            return null;
        }
        String want = code.trim().toUpperCase();
        for (Entry e : byScreenId.values()) {
            if (e.code != null && want.equals(e.code.toUpperCase())) {
                return e;
            }
        }
        return null;
    }

    /** 配对码：6 位，去掉了容易看错的 0/O/1/I/L。 */
    private static final String CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    private static final java.security.SecureRandom RANDOM = new java.security.SecureRandom();

    private String newCode() {
        for (int attempt = 0; attempt < 20; attempt++) {
            StringBuilder sb = new StringBuilder(6);
            for (int i = 0; i < 6; i++) {
                sb.append(CODE_ALPHABET.charAt(RANDOM.nextInt(CODE_ALPHABET.length())));
            }
            String code = sb.toString();
            if (getByCode(code) == null) {
                return code;
            }
        }
        return String.valueOf(System.nanoTime()).substring(0, 6);
    }

    public Entry get(String screenId) {
        return byScreenId.get(screenId);
    }

    /**
     * 按账号取：**只能拿到本账号登录的那些页面**。
     * 远程控制是「我控制我自己登录的屏幕」，不是任何管理员都能动别人的页面。
     */
    public Entry getOwned(String screenId, String ownerUserId) {
        Entry e = byScreenId.get(screenId);
        if (e == null || ownerUserId == null || !ownerUserId.equals(e.ownerUserId)) {
            return null;
        }
        return e;
    }

    /** 在线屏幕（只列本账号的）。 */
    public List<Entry> listOwned(String ownerUserId) {
        List<Entry> out = new ArrayList<>();
        for (Entry e : byScreenId.values()) {
            if (ownerUserId != null && ownerUserId.equals(e.ownerUserId)) {
                out.add(e);
            }
        }
        out.sort(Comparator.comparing((Entry e) -> e.label == null ? "" : e.label)
                .thenComparing(e -> e.screenId));
        return out;
    }

    public List<Entry> list() {
        List<Entry> out = new ArrayList<>(byScreenId.values());
        out.sort(Comparator.comparing((Entry e) -> e.label == null ? "" : e.label)
                .thenComparing(e -> e.screenId));
        return out;
    }
}
