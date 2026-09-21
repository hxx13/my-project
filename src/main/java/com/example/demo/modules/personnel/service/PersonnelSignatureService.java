package com.example.demo.modules.personnel.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.security.SecureRandom;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 电子签名：每人一份、**提交后不可更改**；管理员可查看与重置；另有限时一次性链接
 * （电脑上没法手写，用手机扫码打开画自己的签名）。
 *
 * <p>「不可更改」的保证落在数据库：{@code personnel_signature} 上 personnel_id 唯一，
 * 重复提交撞键而不是只靠应用层判断（应用层能被绕过）。
 */
@Service
public class PersonnelSignatureService {

    private static final Logger log = LoggerFactory.getLogger(PersonnelSignatureService.class);

    /** 限时链接默认有效期（分钟）。用途只是"把手机当绘图板"，用完即弃，不需要长。 */
    private static final int DEFAULT_TTL_MINUTES = 5;

    private static final SecureRandom RANDOM = new SecureRandom();

    private final PersonnelService personnelService;
    private final JdbcTemplate jdbcTemplate;

    public PersonnelSignatureService(PersonnelService personnelService, JdbcTemplate jdbcTemplate) {
        this.personnelService = personnelService;
        this.jdbcTemplate = jdbcTemplate;
    }

    /** 我的签名（未签则 hasSignature=false）。任何登录者都能查自己的，不区分学生/教职工视角。 */
    public Map<String, Object> mySignature(String accountId) {
        Long pid = requirePersonnelId(accountId);
        return signatureOf(pid);
    }

    /** 管理员按人员 id 查看。 */
    public Map<String, Object> signatureByPersonnel(Long personnelId) {
        if (personnelId == null) throw new IllegalArgumentException("人员 id 不能为空");
        return signatureOf(personnelId);
    }

    private Map<String, Object> signatureOf(Long personnelId) {
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                "SELECT image_data, source, created_at FROM personnel_signature WHERE personnel_id = ?", personnelId);
        if (rows.isEmpty()) {
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("hasSignature", false);
            return out;
        }
        Map<String, Object> row = rows.get(0);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("hasSignature", true);
        out.put("imageData", row.get("image_data"));
        out.put("source", row.get("source"));
        out.put("createdAt", row.get("created_at"));
        return out;
    }

    /**
     * 提交签名。**已存在即拒** —— 签名之后不可更改，修改的唯一途径是管理员重置。
     *
     * @param imageData PNG dataUrl（白底、固定尺寸由前端保证）
     */
    @Transactional(rollbackFor = Exception.class)
    public void submit(Long personnelId, String imageData, String source) {
        if (personnelId == null) throw new IllegalArgumentException("人员 id 不能为空");
        if (!StringUtils.hasText(imageData)) throw new IllegalArgumentException("签名图片不能为空");
        String src = StringUtils.hasText(source) ? source.trim() : "WEB";
        try {
            jdbcTemplate.update(
                    "INSERT INTO personnel_signature(personnel_id, image_data, source) VALUES(?,?,?)",
                    personnelId, imageData, src);
        } catch (DuplicateKeyException e) {
            throw new IllegalStateException("签名已提交，不可更改；如需重签请联系管理员重置");
        }
    }

    /** 本人提交（按登录账号解析人）。 */
    @Transactional(rollbackFor = Exception.class)
    public void submitMine(String accountId, String imageData, String source) {
        submit(requirePersonnelId(accountId), imageData, source);
    }

    /** 管理员重置：删掉签名，本人之后可重新签。 */
    @Transactional(rollbackFor = Exception.class)
    public int reset(Long personnelId, String operatorId) {
        if (personnelId == null) throw new IllegalArgumentException("人员 id 不能为空");
        int n = jdbcTemplate.update("DELETE FROM personnel_signature WHERE personnel_id = ?", personnelId);
        if (n > 0) {
            log.warn("[signature-reset] 重置人员 {} 的签名，操作人 {}", personnelId, operatorId);
        }
        return n;
    }

    /** 生成本人的限时一次性链接。 */
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> createLink(String accountId, Integer ttlMinutes) {
        Long pid = requirePersonnelId(accountId);
        // 已经签过就不用生成链接了——签了也不让改
        if (Boolean.TRUE.equals(signatureOf(pid).get("hasSignature"))) {
            throw new IllegalStateException("签名已提交，不可更改");
        }
        int ttl = (ttlMinutes == null || ttlMinutes <= 0) ? DEFAULT_TTL_MINUTES : Math.min(ttlMinutes, 24 * 60);
        String token = newToken();
        jdbcTemplate.update(
                "INSERT INTO signature_link(token, personnel_id, expires_at, created_by) "
                        + "VALUES(?,?, DATE_ADD(NOW(), INTERVAL ? MINUTE), ?)",
                token, pid, ttl, accountId);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("token", token);
        out.put("expiresInMinutes", ttl);
        return out;
    }

    /**
     * 解析链接（公开端点用）。
     *
     * <p>三条失败分支**分别给文案**：不存在 / 已使用 / 已过期 —— 合并成一句会让用户
     * 完全不知道该重新生成还是找管理员。
     */
    public Map<String, Object> resolveLink(String token) {
        if (!StringUtils.hasText(token)) throw new IllegalArgumentException("链接无效");
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                "SELECT l.personnel_id, l.expires_at, l.consumed_at, p.name "
                        + "FROM signature_link l LEFT JOIN personnel p ON p.id = l.personnel_id "
                        + "WHERE l.token = ?", token.trim());
        if (rows.isEmpty()) throw new IllegalStateException("链接无效");
        Map<String, Object> row = rows.get(0);
        if (row.get("consumed_at") != null) throw new IllegalStateException("该链接已使用过，请重新生成");
        java.time.LocalDateTime exp = toLocalDateTime(row.get("expires_at"));
        if (exp != null && exp.isBefore(java.time.LocalDateTime.now())) {
            throw new IllegalStateException("该链接已过期，请重新生成");
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("personnelId", row.get("personnel_id"));
        out.put("name", row.get("name"));
        out.put("expiresAt", row.get("expires_at"));
        return out;
    }

    /**
     * 消费链接并落签名（公开端点用）。
     *
     * <p>并发保护：先用带 {@code consumed_at IS NULL} 的条件 UPDATE 抢锁，影响行数为 0
     * 说明已被别人用掉。**不读改写** —— 同一链接并发提交两次只应成功一次。
     */
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> consumeLink(String token, String imageData) {
        Map<String, Object> info = resolveLink(token); // 顺带校验过期/已用，并拿到姓名
        Long pid = ((Number) info.get("personnelId")).longValue();
        int claimed = jdbcTemplate.update(
                "UPDATE signature_link SET consumed_at = NOW() WHERE token = ? AND consumed_at IS NULL", token.trim());
        if (claimed == 0) throw new IllegalStateException("该链接已使用过，请重新生成");
        submit(pid, imageData, "MOBILE_LINK");
        return info;
    }

    /**
     * JDBC 驱动对 DATETIME 列可能返回 {@code LocalDateTime}（Connector/J 8 默认）
     * 也可能返回 {@code Timestamp} —— **别硬转**，硬转会抛 ClassCastException。
     */
    private static java.time.LocalDateTime toLocalDateTime(Object v) {
        if (v == null) return null;
        if (v instanceof java.time.LocalDateTime ldt) return ldt;
        if (v instanceof java.sql.Timestamp ts) return ts.toLocalDateTime();
        if (v instanceof java.time.OffsetDateTime odt) return odt.toLocalDateTime();
        try {
            return java.time.LocalDateTime.parse(String.valueOf(v).trim().replace(' ', 'T'));
        } catch (Exception e) {
            return null;
        }
    }

    private Long requirePersonnelId(String accountId) {
        String pid = personnelService.resolveIdByAccount(accountId);
        if (!StringUtils.hasText(pid)) throw new IllegalStateException("未找到人员档案");
        try {
            return Long.parseLong(pid);
        } catch (NumberFormatException e) {
            throw new IllegalStateException("未找到人员档案");
        }
    }

    /** 48 位十六进制随机 token（与 student_mobile_token 同规格）。 */
    private static String newToken() {
        byte[] buf = new byte[24];
        RANDOM.nextBytes(buf);
        StringBuilder sb = new StringBuilder(48);
        for (byte b : buf) {
            sb.append(Character.forDigit((b >> 4) & 0xF, 16));
            sb.append(Character.forDigit(b & 0xF, 16));
        }
        return sb.toString();
    }
}
