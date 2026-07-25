package com.example.demo.modules.twin.card.service;

import com.example.demo.common.time.BusinessTimeWindow;
import com.example.demo.modules.twin.card.entity.TwinCardMapping;
import com.example.demo.modules.twin.card.mapper.TwinCardMappingMapper;
import com.example.demo.modules.twin.card.support.ExemptChangeContext;
import com.example.demo.modules.twin.common.service.TwinAutomationLogService;
import com.example.demo.modules.twin.common.support.FreezeReaperAuditContext;
import com.example.demo.modules.twin.dahua.service.DahuaAutoSignoutService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.DependsOn;
import org.springframework.context.annotation.Lazy;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import javax.annotation.PostConstruct;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.ConcurrentHashMap;

@Service
@DependsOn("twinCardMappingSchemaMigrator")
public class TwinCardMappingService {

    private static final Logger log = LoggerFactory.getLogger(TwinCardMappingService.class);
    private static final DateTimeFormatter EXEMPT_EXPIRE_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    @Autowired
    private TwinCardMappingMapper mappingMapper;

    @Autowired
    private BusinessTimeWindow businessTimeWindow;

    // 💥 注入大华硬件物理控制中枢
    @Autowired
    private com.example.demo.modules.dahua.service.DahuaHardwareService dahuaHardwareService;

    @Lazy
    @Autowired
    private TwinAutomationLogService twinAutomationLogService;

    @Lazy
    @Autowired
    private DahuaAutoSignoutService dahuaAutoSignoutService;

    @Autowired
    private com.example.demo.modules.student.service.MobilePresenceNotifyService mobilePresenceNotifyService;

    // 🚨 核心防爆盾：双向极速索引缓存 (ConcurrentHashMap 保证线程安全)
    private final Map<String, TwinCardMapping> cardNoCache = new ConcurrentHashMap<>();
    private final Map<String, TwinCardMapping> userIdCache = new ConcurrentHashMap<>();
    private final Map<String, TwinCardMapping> dahuaPersonCodeCache = new ConcurrentHashMap<>();

    /**
     * 系统开机 / 映射表发生颠覆性改变时，重载缓存。
     * 引入 synchronized 单例锁，防止高并发下多个线程同时触发缓存击穿。
     */
    @PostConstruct
    public synchronized void reloadCache() {
        try {
            log.info("[Cache] 正在初始化物理卡片映射环境...");

            cardNoCache.clear();
            userIdCache.clear();
            dahuaPersonCodeCache.clear();

            List<TwinCardMapping> allMappings = mappingMapper.findAll();
            if (allMappings != null) {
                for (TwinCardMapping mapping : allMappings) {
                    indexMappingInCache(mapping);
                }
            }
            log.info("[Cache] 缓存加载完成！共载入 {} 条映射记录。O(1) 极速寻址已就绪。", cardNoCache.size());
        } catch (Exception e) {
            // 数据库表尚未就绪（StartupRunner 建表晚于 @PostConstruct），稍后自动重载
            log.warn("[Cache] 缓存初始化暂缓：{}", e.getMessage());
        }
    }

    // ================== 1. O(1) 极速读取 (专供刷卡网关调用，绝对禁止查库) ==================

    public TwinCardMapping getByCardNo(String cardNo) {
        if (cardNo == null) {
            return null;
        }
        String key = cardNo.trim();
        if (key.isEmpty()) {
            return null;
        }
        TwinCardMapping direct = cardNoCache.get(key);
        if (direct != null) {
            return direct;
        }
        TwinCardMapping upper = cardNoCache.get(key.toUpperCase());
        if (upper != null) {
            return upper;
        }
        return cardNoCache.get(key.toLowerCase()); // 耗时 0.01 毫秒
    }

    public TwinCardMapping getByAroUserId(String aroUserId) {
        if (aroUserId == null) {
            return null;
        }
        String key = aroUserId.trim();
        if (key.isEmpty()) {
            return null;
        }
        return userIdCache.get(key);
    }

    /**
     * 风控/滞留/违规/跑批：以 DB 为准加载映射并回写缓存，避免授予豁免后缓存未同步导致误判。
     */
    public TwinCardMapping loadMappingByAroUserIdFromDb(String aroUserId) {
        if (aroUserId == null || aroUserId.isBlank()) {
            return null;
        }
        TwinCardMapping db = mappingMapper.findByAroUserId(aroUserId.trim());
        if (db != null) {
            indexMappingInCache(db);
        }
        return db;
    }

    /**
     * 定时任务统一入口：是否仍享有有效免冻结豁免（读 DB，与 {@link #isFreezeExempt(TwinCardMapping)} 判定规则一致）。
     * 滞留违规、冻结跑批、第二道签退等风控路径应使用本方法，勿仅用 {@link #getByAroUserId(String)} 缓存。
     */
    public boolean isFreezeExemptForPolicy(String aroUserId) {
        return isFreezeExempt(loadMappingByAroUserIdFromDb(aroUserId));
    }

    private void indexMappingInCache(TwinCardMapping mapping) {
        if (mapping == null) {
            return;
        }
        String cardNo = mapping.getCardNo();
        if (cardNo != null) {
            String key = cardNo.trim();
            if (!key.isEmpty()) {
                cardNoCache.put(key, mapping);
                cardNoCache.put(key.toUpperCase(), mapping);
                cardNoCache.put(key.toLowerCase(), mapping);
            }
        }
        String aroUid = mapping.getAroUserId();
        if (aroUid != null && !aroUid.trim().isEmpty()) {
            userIdCache.put(aroUid.trim(), mapping);
        }
        String dahuaPersonCode = mapping.getDahuaPersonCode();
        if (dahuaPersonCode != null && !dahuaPersonCode.trim().isEmpty()) {
            dahuaPersonCodeCache.put(dahuaPersonCode.trim(), mapping);
        }
    }

    /** 豁免写库后以 DB 行为准刷新缓存（授予/收回/次数递增后调用）。 */
    private void refreshMappingCacheAfterExemptWrite(String aroUserId, String cardNo) {
        TwinCardMapping db = null;
        if (aroUserId != null && !aroUserId.isBlank()) {
            db = mappingMapper.findByAroUserId(aroUserId.trim());
        }
        if (db == null && cardNo != null && !cardNo.isBlank()) {
            db = mappingMapper.findByCardNo(cardNo.trim());
        }
        if (db != null) {
            indexMappingInCache(db);
        }
    }

    public TwinCardMapping getByDahuaPersonCode(String dahuaPersonCode) {
        if (dahuaPersonCode == null) {
            return null;
        }
        String key = dahuaPersonCode.trim();
        if (key.isEmpty()) {
            return null;
        }
        return dahuaPersonCodeCache.get(key);
    }

    /**
     * 是否持有有效免冻结标记（仅用于冻结跑批等；<b>不再</b>用于跳过大华激活/签退联动）。
     * @deprecated 新代码请用 {@link #isFreezeExempt(TwinCardMapping)} 或 {@link #isRoomExemptForScanEntry(String, String)}。
     */
    @Deprecated
    public boolean isLinkageRuleExempt(String aroUserId) {
        if (aroUserId == null || aroUserId.isBlank()) {
            return false;
        }
        return isFreezeExemptForPolicy(aroUserId);
    }

    /**
     * 返回用户当前有效的免冻结扫码进入授权房间 ID（与 freeze_exempt_room_ids 同源）。
     * 以 DB 为准（与 {@link #isFreezeExemptForPolicy} 一致），避免多实例缓存不一致导致豁免失效。
     */
    public List<String> listScanEntryExemptRoomIds(String userId) {
        TwinCardMapping m = loadMappingByAroUserIdFromDb(userId);
        if (!isFreezeExempt(m) || !hasScanEntryExemptCountRemaining(m)) {
            return List.of();
        }
        return parseFreezeExemptRoomIds(m.getFreezeExemptRoomIds());
    }

    /**
     * 检查免冻结用户是否对指定房间有扫码时段豁免。
     * 条件：freeze_exempt_flag=1 未过期 AND freeze_exempt_room_ids JSON 数组包含 roomId。
     * 以 DB 为准（与 {@link #isFreezeExemptForPolicy} 一致），避免多实例缓存不一致导致豁免失效。
     */
    public boolean isRoomExemptForScanEntry(String userId, String roomId) {
        if (userId == null || userId.isBlank() || roomId == null || roomId.isBlank()) {
            return false;
        }
        TwinCardMapping m = loadMappingByAroUserIdFromDb(userId);
        if (!isFreezeExempt(m) || !hasScanEntryExemptCountRemaining(m)) {
            return false;
        }
        return parseFreezeExemptRoomIds(m.getFreezeExemptRoomIds()).contains(roomId.trim());
    }

    private TwinCardMapping resolveMappingByAroUserId(String userId) {
        if (userId == null) {
            return null;
        }
        String key = userId.trim();
        if (key.isEmpty()) {
            return null;
        }
        return userIdCache.get(key);
    }

    private boolean hasScanEntryExemptCountRemaining(TwinCardMapping m) {
        if (m == null) {
            return false;
        }
        String mode = m.getFreezeExemptMode();
        if (!"COUNT".equals(mode) && !"BOTH".equals(mode)) {
            return true;
        }
        Integer max = m.getFreezeExemptMaxCount();
        Integer used = m.getFreezeExemptUsedCount() != null ? m.getFreezeExemptUsedCount() : 0;
        return max == null || max <= 0 || used < max;
    }

    private List<String> parseFreezeExemptRoomIds(String roomIdsJson) {
        if (roomIdsJson == null || roomIdsJson.isBlank()) {
            return List.of();
        }
        try {
            com.alibaba.fastjson2.JSONArray arr = com.alibaba.fastjson2.JSON.parseArray(roomIdsJson);
            if (arr == null || arr.isEmpty()) {
                return List.of();
            }
            List<String> out = new ArrayList<>();
            for (int i = 0; i < arr.size(); i++) {
                Object item = arr.get(i);
                if (item == null) {
                    continue;
                }
                String id;
                if (item instanceof com.alibaba.fastjson2.JSONObject) {
                    // 新格式 {"roomId":"x","roomName":"y"}
                    id = ((com.alibaba.fastjson2.JSONObject) item).getString("roomId");
                } else {
                    // 旧格式 "roomIdString"
                    id = String.valueOf(item).trim();
                }
                if (id != null && !id.isBlank()) {
                    out.add(id.trim());
                }
            }
            return out;
        } catch (Exception e) {
            return List.of();
        }
    }

    /**
     * 物理冻结豁免（freeze_exempt_flag=1）：供滞留跑批 {@link #executeFreezeReaperTask} 使用；禁止对 null 做拆箱比较。
     */
    public boolean isFreezeExempt(TwinCardMapping mapping) {
        return isExemptCurrentlyActive(mapping);
    }

    /** flag=1 且未过 freeze_exempt_expire_at（无到期字段时视为仍有效，兼容历史数据） */
    private boolean isExemptCurrentlyActive(TwinCardMapping mapping) {
        if (mapping == null || mapping.getFreezeExemptFlag() == null || mapping.getFreezeExemptFlag() != 1) {
            return false;
        }
        String expireAt = mapping.getFreezeExemptExpireAt();
        if (expireAt == null || expireAt.isBlank()) {
            return true;
        }
        try {
            LocalDateTime exp = LocalDateTime.parse(expireAt.trim(), EXEMPT_EXPIRE_FMT);
            return LocalDateTime.now().isBefore(exp);
        } catch (Exception e) {
            return true;
        }
    }

    /**
     * 计算豁免到期时间。durationMinutes：正整数=从现在起算分钟；-1=当日 23:59:59。
     */
    public String computeExemptExpireAt(Integer durationMinutes) {
        if (durationMinutes == null) {
            throw new IllegalArgumentException("开启豁免须指定时效 durationMinutes");
        }
        LocalDateTime expire;
        if (durationMinutes == -1) {
            expire = LocalDate.now().atTime(23, 59, 59);
        } else if (durationMinutes <= 0) {
            throw new IllegalArgumentException("durationMinutes 须为正整数或 -1（今日有效）");
        } else {
            expire = LocalDateTime.now().plusMinutes(durationMinutes);
        }
        return expire.format(EXEMPT_EXPIRE_FMT);
    }

    /**
     * 计算豁免到期时间：延长至当日 {@code HH:mm}（如 18:00）。
     */
    public String computeExemptExpireAtUntil(String extendUntilTime) {
        if (extendUntilTime == null || extendUntilTime.isBlank()) {
            throw new IllegalArgumentException("开启豁免须指定 extendUntilTime（HH:mm）");
        }
        java.time.LocalTime target;
        try {
            target = java.time.LocalTime.parse(extendUntilTime.trim(), java.time.format.DateTimeFormatter.ofPattern("HH:mm"));
        } catch (Exception e) {
            throw new IllegalArgumentException("extendUntilTime 格式须为 HH:mm");
        }
        LocalDateTime expire = LocalDate.now().atTime(target);
        if (!expire.isAfter(LocalDateTime.now())) {
            throw new IllegalArgumentException("所选时点已过，请选择更晚的时间");
        }
        return expire.format(EXEMPT_EXPIRE_FMT);
    }

    /** 优先 extendUntilTime，否则 durationMinutes（兼容旧规则） */
    public String resolveExemptExpireAt(Integer durationMinutes, String extendUntilTime) {
        if (extendUntilTime != null && !extendUntilTime.isBlank()) {
            return computeExemptExpireAtUntil(extendUntilTime);
        }
        return computeExemptExpireAt(durationMinutes);
    }

    /**
     * 是否属于「大华孪生发卡库」人员：{@code twin_card_mapping} 存在该 ARO 用户，
     * 且同时具备物理卡号、大华人员主键 {@code dahua_seq}、大华人员编码 {@code dahua_person_code}
     *（与 {@link com.example.demo.modules.twin.scan.service.DahuaIssueCardOrchestratorService} 落库一致）。
     * 未发卡或未完整映射者不得参与待激活门禁联动计时（无平台侧 person 无法完成激活链路）。
     */
    public boolean hasDahuaIssuedTwinMapping(String aroUserId) {
        TwinCardMapping m = getByAroUserId(aroUserId);
        if (m == null) {
            return false;
        }
        if (m.getCardNo() == null || m.getCardNo().trim().isEmpty()) {
            return false;
        }
        if (m.getDahuaSeq() == null || m.getDahuaSeq().trim().isEmpty()) {
            return false;
        }
        return m.getDahuaPersonCode() != null && !m.getDahuaPersonCode().trim().isEmpty();
    }

    // ================== 2. 双写一致性写入 (专供前端管理台调用) ==================

    public synchronized void addMapping(TwinCardMapping mapping) {
        mapping.setLastModifiedTime(getCurrentTime());
        // 新录入映射一律无豁免，豁免只能经统一记账入口授予
        mapping.setFreezeExemptFlag(0);
        // 1. 持久化落盘
        mappingMapper.insertMapping(mapping);
        // 2. 刷入缓存 (保持双写一致)
        String cardNo = mapping.getCardNo();
        if (cardNo != null) {
            String key = cardNo.trim();
            if (!key.isEmpty()) {
                cardNoCache.put(key, mapping);
                cardNoCache.put(key.toUpperCase(), mapping);
                cardNoCache.put(key.toLowerCase(), mapping);
            }
        }
        if (mapping.getAroUserId() != null) {
            userIdCache.put(mapping.getAroUserId().trim(), mapping);
        }
        if (mapping.getDahuaPersonCode() != null && !mapping.getDahuaPersonCode().trim().isEmpty()) {
            dahuaPersonCodeCache.put(mapping.getDahuaPersonCode().trim(), mapping);
        }
    }

    /**
     * 设置/收回单卡冻结豁免（豁免状态唯一变更点之一，统一记 EXEMPT_GRANTED / EXEMPT_REVOKED 台账）。
     *
     * @param ctx 变更来源上下文（记账用）——所有调用方必须显式声明来源，见 {@link ExemptChangeContext} 静态工厂
     */
    public synchronized Map<String, Object> updateExemptFlag(
            String cardNo, Integer flag, Integer durationMinutes,
            String mode, Integer maxCount, String roomIds, String extendUntilTime,
            ExemptChangeContext ctx) {
        if (flag == null || (flag != 0 && flag != 1)) {
            throw new IllegalArgumentException("flag 须为 0 或 1");
        }
        if (flag == 1) {
            if (mode == null || mode.isBlank()) {
                mode = "TIME";
            }
            if (!mode.equals("TIME") && !mode.equals("COUNT") && !mode.equals("BOTH")) {
                throw new IllegalArgumentException("mode 须为 TIME / COUNT / BOTH");
            }
            if ((mode.equals("COUNT") || mode.equals("BOTH")) && (maxCount == null || maxCount <= 0)) {
                throw new IllegalArgumentException("次数限制模式须指定 maxCount");
            }
            boolean hasUntil = extendUntilTime != null && !extendUntilTime.isBlank();
            if ((mode.equals("TIME") || mode.equals("BOTH")) && durationMinutes == null && !hasUntil) {
                throw new IllegalArgumentException("时长限制模式须指定 extendUntilTime 或 durationMinutes");
            }
        }
        // 变更前快照：DB 直读带姓名（多实例部署下缓存可能陈旧，记账以库内真实状态为准；缓存仍用于解析 dbCardNo / WebSocket userId）
        TwinCardMapping cacheItem = resolveMappingByCardNo(cardNo);
        String dbCardNo = cacheItem != null ? cacheItem.getCardNo() : (cardNo == null ? "" : cardNo.trim());
        TwinCardMapping before = (dbCardNo == null || dbCardNo.isBlank())
                ? null : mappingMapper.findLedgerSnapshotByCardNo(dbCardNo);
        String updateTime = getCurrentTime();
        String expireAt = null;
        if (flag == 1 && (mode.equals("TIME") || mode.equals("BOTH"))) {
            expireAt = resolveExemptExpireAt(durationMinutes, extendUntilTime);
        }
        mappingMapper.updateExemptFlag(dbCardNo, flag, expireAt, updateTime, mode, maxCount, roomIds);
        // 写库后以 DB 刷新缓存，避免滞留/跑批仍读到旧 flag；post-save-no-full-refresh.mdc 不适用缓存层
        refreshMappingCacheAfterExemptWrite(cacheItem != null ? cacheItem.getAroUserId() : null, dbCardNo);
        // 统一记账：写库+刷缓存成功后落台账（write 内部吞异常，不阻断主业务）；门槛以真实状态迁移为准
        if (flag == 1) {
            if (shouldWriteGrantLedger(before, mode, expireAt, maxCount, roomIds)) {
                writeExemptLedger(true, before, ctx, buildGrantLedgerExtra(before, mode, expireAt, maxCount, roomIds));
            }
        } else {
            writeExemptLedger(false, before, ctx, null);
        }
        String aroUserId = cacheItem != null ? cacheItem.getAroUserId() : null;
        Map<String, Object> out = new HashMap<>();
        out.put("cardNo", dbCardNo);
        out.put("aroUserId", aroUserId != null ? aroUserId.trim() : null);
        out.put("freezeExemptFlag", flag);
        out.put("freezeExemptExpireAt", expireAt);
        out.put("freezeExemptMode", flag == 1 ? mode : null);
        out.put("freezeExemptMaxCount", flag == 1 ? maxCount : null);
        out.put("freezeExemptRoomIds", flag == 1 ? roomIds : null);
        out.put("lastModifiedTime", updateTime);
        // WebSocket 推送：H5 首页实时更新豁免状态
        if (cacheItem != null && cacheItem.getAroUserId() != null && !cacheItem.getAroUserId().isBlank()) {
            mobilePresenceNotifyService.notifyPresenceChanged(
                    cacheItem.getAroUserId().trim(),
                    flag == 1 ? "exempt_granted" : "exempt_revoked");
        }
        return out;
    }

    /**
     * 用户扫码进入授权房间时调用。
     * 若免冻结模式为 COUNT/BOTH，则 usedCount+1。
     * 若 usedCount 达到 maxCount，自动收回免冻结。
     */
    public void incrementExemptUsedCount(String userId, String roomId) {
        if (userId == null || userId.isBlank()) {
            return;
        }
        try {
            // 变更前快照：DB 直读带姓名（多实例缓存可能陈旧，记账以库内真实状态为准）
            TwinCardMapping before = mappingMapper.findLedgerSnapshotByUserId(userId.trim());
            int affected = mappingMapper.incrementExemptUsedCount(userId.trim(), roomId);
            if (affected > 0) {
                refreshMappingCacheAfterExemptWrite(userId.trim(), null);
                // 检查次数是否已耗尽（COUNT/BOTH 模式）
                TwinCardMapping mapping = getByAroUserId(userId.trim());
                if (mapping != null && (mapping.getFreezeExemptFlag() == null || mapping.getFreezeExemptFlag() == 0)) {
                    // flag 已翻转为 0：次数耗尽自动收回，补记统一台账
                    writeExemptLedger(false, before, ExemptChangeContext.countExhausted(false), "次数耗尽自动收回");
                    mobilePresenceNotifyService.notifyPresenceChanged(userId.trim(), "exempt_exhausted");
                }
            }
        } catch (Exception e) {
            log.warn("[豁免次数] incrementExemptUsedCount 失败 userId={} err={}", userId, e.getMessage());
        }
    }

    /**
     * 统一记账（唯一记账点）：豁免授予/收回落 twin_automation_log 台账。
     * <p>单人路径（updateExemptFlag / updateExemptFlagByUserId / incrementExemptUsedCount）与批量收回路径
     * （revokeExpiredTimedExemptions / runDailyExemptMaintenance / resetDailyExemptions /
     * clearAllExemptFlagsAfterFirstFreeze / reconcileExemptionsByLogs / deleteMapping）均已接入本方法，
     * 批量路径按「UPDATE 前取快照 → 执行 UPDATE → 逐人记账」模式调用。</p>
     * <p>记账门槛：收回仅在变更前确有豁免（flag=1）时落账，避免未曾豁免的用户每次扫码离开都产生虚假「收回」记录。</p>
     *
     * @param granted     true=授予（EXEMPT_GRANTED）；false=收回（EXEMPT_REVOKED）
     * @param snapshot    <b>变更前</b>快照（方法内部会经 {@link #copyLedgerSnapshot} 防御性复制，调用方可直接传缓存/查询原对象）；映射不存在时不记账直接返回
     * @param ctx         变更来源上下文（触发方式/渠道码/操作人/关联单号）
     * @param extraDetail 变更点附加说明（如授予后的模式/到期/房间、覆盖旧豁免检测），可空
     */
    private void writeExemptLedger(boolean granted, TwinCardMapping snapshot, ExemptChangeContext ctx, String extraDetail) {
        if (snapshot == null || ctx == null) {
            return;
        }
        // 防御性复制：缓存对象可能在记账前被 clearExemptFieldsInCache 等就地清空，统一在入口复制关键字段
        snapshot = copyLedgerSnapshot(snapshot);
        boolean wasExempt = snapshot.getFreezeExemptFlag() != null && snapshot.getFreezeExemptFlag() == 1;
        if (!granted && !wasExempt) {
            // 变更前本就无豁免：无真实状态迁移，不落「收回」台账
            return;
        }
        String userId = snapshot.getAroUserId() != null ? snapshot.getAroUserId().trim() : null;
        String name = snapshot.getUserName() != null ? snapshot.getUserName().trim() : "";
        StringBuilder detail = new StringBuilder(granted ? "授予冻结豁免。" : "收回冻结豁免。");
        detail.append("姓名=").append(name.isEmpty() ? "-" : name)
                .append("，卡号=").append(nullToDash(snapshot.getCardNo()));
        if (!granted) {
            detail.append("，原到期=").append(nullToDash(snapshot.getFreezeExemptExpireAt()))
                    .append("，原模式=").append(nullToDash(snapshot.getFreezeExemptMode()));
        }
        if (extraDetail != null && !extraDetail.isBlank()) {
            detail.append("，").append(extraDetail.trim());
        }
        if (ctx.getOperatorUserId() != null && !ctx.getOperatorUserId().isBlank()) {
            detail.append("，操作人=").append(ctx.getOperatorUserId().trim());
        }
        if (ctx.getRelatedId() != null && !ctx.getRelatedId().isBlank()) {
            detail.append("，关联单号=").append(ctx.getRelatedId().trim());
        }
        if (ctx.getClientHint() != null && !ctx.getClientHint().isBlank()) {
            detail.append("，客户端=").append(ctx.getClientHint().trim());
        }
        if (ctx.getExtraDetail() != null && !ctx.getExtraDetail().isBlank()) {
            detail.append("，").append(ctx.getExtraDetail().trim());
        }
        // write 本身吞异常，不阻断主业务，无需再包 try
        twinAutomationLogService.write(
                TwinAutomationLogService.TYPE_EXEMPTION,
                granted ? TwinAutomationLogService.EVENT_EXEMPT_GRANTED : TwinAutomationLogService.EVENT_EXEMPT_REVOKED,
                ctx.getTriggerType(),
                ctx.getReasonCode(),
                userId,
                snapshot.getCardNo(),
                true,
                detail.toString(),
                "exempt-ledger");
    }

    /**
     * 批量收回前取快照（先查快照后更新）：快照查询失败不阻断收回主流程，
     * 仅本批缺记账/推送（返回空列表并告警），收回 UPDATE 照常执行。
     */
    private List<TwinCardMapping> safeLoadRevokeSnapshots(
            java.util.function.Supplier<List<TwinCardMapping>> loader, String tag) {
        try {
            List<TwinCardMapping> list = loader.get();
            return list != null ? list : List.of();
        } catch (Exception e) {
            log.warn("[豁免记账] {} 收回前快照查询失败（收回照常执行，本批不记账）: {}", tag, e.getMessage());
            return List.of();
        }
    }

    /** granted 记账附加说明：变更后的 模式/到期/房间 + 覆盖旧豁免检测（before 为变更前快照，可空）。 */
    private static String buildGrantLedgerExtra(TwinCardMapping before, String mode, String expireAt, Integer maxCount, String roomIds) {
        StringBuilder sb = new StringBuilder();
        sb.append("模式=").append(nullToDash(mode))
                .append("，到期=").append(nullToDash(expireAt));
        if (maxCount != null) {
            sb.append("，次数上限=").append(maxCount);
        }
        sb.append("，房间=").append(nullToDash(roomIds));
        if (before != null && before.getFreezeExemptFlag() != null && before.getFreezeExemptFlag() == 1) {
            sb.append("，覆盖旧豁免(原到期=").append(nullToDash(before.getFreezeExemptExpireAt())).append(")");
            if (isCountQuotaReset(before)) {
                sb.append("，次数配额重置(已用=").append(before.getFreezeExemptUsedCount()).append(")");
            }
        }
        return sb.toString();
    }

    /** 变更前为 COUNT/BOTH 模式且已消耗过次数：重授予会清零 used_count，属配额重置。 */
    private static boolean isCountQuotaReset(TwinCardMapping before) {
        if (before == null) {
            return false;
        }
        String beforeMode = normalizeForCompare(before.getFreezeExemptMode());
        boolean countQuota = "COUNT".equals(beforeMode) || "BOTH".equals(beforeMode);
        return countQuota && before.getFreezeExemptUsedCount() != null && before.getFreezeExemptUsedCount() > 0;
    }

    /**
     * GRANTED 记账门槛：变更前非豁免，或到期/模式/次数上限/房间任一有实质变化才记账；
     * 完全等值的重复授予（如保管卡用户当日反复扫码）不记账，DB 更新行为不受影响。
     */
    private static boolean shouldWriteGrantLedger(
            TwinCardMapping before, String mode, String expireAt, Integer maxCount, String roomIds) {
        if (before == null) {
            // 映射不存在时 writeExemptLedger 亦会跳过，此处放行以保持单一职责
            return true;
        }
        if (before.getFreezeExemptFlag() == null || before.getFreezeExemptFlag() != 1) {
            return true;
        }
        // COUNT/BOTH 等值重授予仍会把 used_count 清零（配额真实回满），视为实质变化须记账
        if (isCountQuotaReset(before)) {
            return true;
        }
        return !Objects.equals(normalizeForCompare(expireAt), normalizeForCompare(before.getFreezeExemptExpireAt()))
                || !Objects.equals(normalizeForCompare(mode), normalizeForCompare(before.getFreezeExemptMode()))
                || !Objects.equals(maxCount, before.getFreezeExemptMaxCount())
                || !Objects.equals(normalizeForCompare(roomIds), normalizeForCompare(before.getFreezeExemptRoomIds()));
    }

    /** 比较用归一化：null/空白视为 null，其余 trim 后比较。 */
    private static String normalizeForCompare(String v) {
        if (v == null) {
            return null;
        }
        String t = v.trim();
        return t.isEmpty() ? null : t;
    }

    /**
     * 复制记账所需关键字段为轻量快照：缓存对象可能在快照捕获与记账之间被
     * {@link #clearExemptFieldsInCache} / {@link #syncCacheClearedExemptFlags} 等就地清空，
     * 记账 detail 必须使用复制件而非缓存原引用。
     */
    private static TwinCardMapping copyLedgerSnapshot(TwinCardMapping src) {
        if (src == null) {
            return null;
        }
        TwinCardMapping snap = new TwinCardMapping();
        snap.setAroUserId(src.getAroUserId());
        snap.setCardNo(src.getCardNo());
        snap.setUserName(src.getUserName());
        snap.setFreezeExemptFlag(src.getFreezeExemptFlag());
        snap.setFreezeExemptExpireAt(src.getFreezeExemptExpireAt());
        snap.setFreezeExemptMode(src.getFreezeExemptMode());
        snap.setFreezeExemptMaxCount(src.getFreezeExemptMaxCount());
        snap.setFreezeExemptUsedCount(src.getFreezeExemptUsedCount());
        snap.setFreezeExemptRoomIds(src.getFreezeExemptRoomIds());
        snap.setFreezeExemptGrantDate(src.getFreezeExemptGrantDate());
        snap.setExemptGrantedAt(src.getExemptGrantedAt());
        return snap;
    }

    /**
     * 与 {@link #getByCardNo} 一致：trim + 大小写不敏感，避免管理台/跑批传入格式与缓存键不一致。
     */
    private TwinCardMapping resolveMappingByCardNo(String cardNo) {
        if (cardNo == null) {
            return null;
        }
        String key = cardNo.trim();
        if (key.isEmpty()) {
            return null;
        }
        TwinCardMapping direct = cardNoCache.get(key);
        if (direct != null) {
            return direct;
        }
        TwinCardMapping upper = cardNoCache.get(key.toUpperCase());
        if (upper != null) {
            return upper;
        }
        return cardNoCache.get(key.toLowerCase());
    }

    /**
     * 🚀 物理与数字双向状态统筹 (强一致性)
     */
    public synchronized void updateCardStatus(String cardNo, String status) {
        TwinCardMapping cacheItem = resolveMappingByCardNo(cardNo);
        if (cacheItem == null) {
            throw new RuntimeException("本地字典中不存在该物理卡号: " + cardNo);
        }
        String canonicalCardNo = cacheItem.getCardNo();

        // 1. 大华人员主键：twin_card_mapping.dahua_seq（发卡落库为 personId 字符串），须为纯数字且须在 int 范围外仍可用 long
        String seqRaw = cacheItem.getDahuaSeq();
        if (seqRaw == null || seqRaw.isBlank()) {
            throw new RuntimeException("孪生映射缺少大华人员ID(dahua_seq)，无法下发冻结/解冻。卡号=" + canonicalCardNo);
        }
        final long dahuaPersonId;
        try {
            dahuaPersonId = Long.parseLong(seqRaw.trim());
        } catch (NumberFormatException e) {
            throw new RuntimeException("大华人员ID(dahua_seq)须为数字，当前值=" + seqRaw);
        }

        // 2. 状态协议翻译：咱们本地是 NORMAL/FROZEN，大华要的是 1=解冻, 2=冻结
        int dahuaStatus = "NORMAL".equals(status) ? 1 : 2;

        // 3. 💥 物理下发阻断！(强一致性事务)
        // 只有大华门禁主机真正锁死了/解开了，才允许更新我们自己的数据库！
        boolean hardwareSuccess = dahuaHardwareService.setPersonStatus(
                java.util.Collections.singletonList(dahuaPersonId), dahuaStatus);

        if (!hardwareSuccess) {
            // 如果硬件掉线或拒绝，直接抛出异常，触发回滚，前端会立刻弹出红框报错！
            throw new RuntimeException("大华硬件网关拒绝了状态变更指令，操作已中止！");
        }

        // 4. 物理世界执行成功，放行数字世界的状态更新（WHERE 使用库内原始 card_no，避免大小写/空格与库不一致）
        String updateTime = getCurrentTime();
        mappingMapper.updateCardStatus(canonicalCardNo, status, updateTime);
        cacheItem.setCardStatus(status);
        cacheItem.setLastModifiedTime(updateTime);

        log.info("[twin-map] 孪生卡状态已同步 userId={} 物理卡号={} 状态={} dahuaPersonId={}",
                cacheItem.getAroUserId(), canonicalCardNo, status, dahuaPersonId);
    }

    // ================== 3. 复杂聚合查询 (走真实数据库，不走缓存) ==================
    /**
     * 供前端资料库大屏获取全量数据，此方法允许走数据库执行 JOIN
     * 因为这是管理台操作，频次极低，不会影响打卡主干道。
     */
    public List<TwinCardMapping> getAllWithUserInfo() {
        return mappingMapper.findAllWithUserInfo();
    }

    private String getCurrentTime() {
        return LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
    }

    /**
     * 💀 核心风控执行引擎：执行一次全量滞留人员清扫
     * 返回本次处理的统计结果，供前端展示
     */
    public Map<String, Integer> executeFreezeReaperTask() {
        log.info("[手动风控] 开始执行物理空间滞留清扫...");
        int frozenCount = 0;
        int exemptCount = 0;
        int failCount = 0;
        int skippedNoCard = 0;
        int skippedNotNormal = 0;

        // 1. 查找当前所有"在馆"人员 (ENTER 次数 > EXIT 次数)
        String todayStr = java.time.LocalDate.now().format(java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd"));
        List<String> strandedUserIds = mappingMapper.findTodayStrandedUserIds(todayStr + "%");

        for (String userId : strandedUserIds) {
            TwinCardMapping mapping = loadMappingByAroUserIdFromDb(userId);
            if (mapping == null) {
                skippedNotNormal++;
                twinAutomationLogService.write(
                        TwinAutomationLogService.TYPE_SCHEDULER,
                        TwinAutomationLogService.EVENT_REAPER_USER_FROZEN,
                        "TIMER",
                        TwinAutomationLogService.TRIGGER_REAPER_USER_FROZEN,
                        userId,
                        null,
                        false,
                        "冻结跑批：无卡映射记录，无法冻结",
                        "freeze-reaper-user");
                continue;
            }
            if (!"NORMAL".equals(mapping.getCardStatus())) {
                skippedNotNormal++;
                twinAutomationLogService.write(
                        TwinAutomationLogService.TYPE_SCHEDULER,
                        TwinAutomationLogService.EVENT_REAPER_USER_FROZEN,
                        "TIMER",
                        TwinAutomationLogService.TRIGGER_REAPER_USER_FROZEN,
                        userId,
                        mapping.getCardNo(),
                        true,
                        "冻结跑批：卡片状态非 NORMAL（当前=" + mapping.getCardStatus() + "），无需冻结",
                        "freeze-reaper-user");
                continue;
            }
            // 2. 豁免权判决（DB 为准，与滞留违规同源）
            if (isFreezeExempt(mapping)) {
                exemptCount++;
                twinAutomationLogService.write(
                        TwinAutomationLogService.TYPE_SCHEDULER,
                        TwinAutomationLogService.EVENT_REAPER_USER_FROZEN,
                        "TIMER",
                        TwinAutomationLogService.TRIGGER_REAPER_USER_FROZEN,
                        userId,
                        mapping.getCardNo(),
                        true,
                        "冻结跑批：用户享有免冻结豁免，已跳过",
                        "freeze-reaper-user");
                continue;
            }
            String cno = mapping.getCardNo();
            if (cno == null || cno.isBlank()) {
                skippedNoCard++;
                log.warn("[freeze-reaper] skip no physical card mapping userId={}", userId);
                twinAutomationLogService.write(
                        TwinAutomationLogService.TYPE_SCHEDULER,
                        TwinAutomationLogService.EVENT_REAPER_USER_FROZEN,
                        "TIMER",
                        TwinAutomationLogService.TRIGGER_REAPER_USER_FROZEN,
                        userId,
                        null,
                        false,
                        "冻结跑批：无物理卡号，无法冻结",
                        "freeze-reaper-user");
                continue;
            }
            // 3. 滞留跑批/手动触发跑批：强制冻结（豁免已在分支上排除）
            try {
                updateCardStatus(cno, "FROZEN");
                frozenCount++;
                writeReaperSingleUserFreezeAudit(userId, cno);
            } catch (Exception e) {
                failCount++;
                log.error("[freeze-reaper] 单用户冻结失败 userId={} cardNo={} err={}",
                        userId, cno, e.getMessage(), e);
                twinAutomationLogService.write(
                        TwinAutomationLogService.TYPE_SCHEDULER,
                        TwinAutomationLogService.EVENT_REAPER_USER_FROZEN,
                        "TIMER",
                        TwinAutomationLogService.TRIGGER_REAPER_USER_FROZEN,
                        userId,
                        cno,
                        false,
                        "冻结跑批：冻结失败 — " + (e.getMessage() != null ? e.getMessage().substring(0, Math.min(e.getMessage().length(), 200)) : "未知错误"),
                        "freeze-reaper-user");
            }
        }

        Map<String, Integer> stats = new HashMap<>();
        stats.put("frozenCount", frozenCount);
        stats.put("exemptCount", exemptCount);
        stats.put("failCount", failCount);
        stats.put("skippedNoCard", skippedNoCard);
        stats.put("skippedNotNormal", skippedNotNormal);
        stats.put("totalChecked", strandedUserIds.size());
        return stats;
    }

    /**
     * 跑批成功冻结单人后写入 twin_automation_log（依赖 {@link FreezeReaperAuditContext}，由 JobScheduler 在跑批任务执行期间设置）。
     */
    private void writeReaperSingleUserFreezeAudit(String aroUserId, String cardNo) {
        try {
            FreezeReaperAuditContext.Ctx ctx = FreezeReaperAuditContext.get();
            String triggerType = ctx != null ? ctx.getTriggerType() : "TIMER";
            String jobKey = ctx != null && ctx.getJobKey() != null && !ctx.getJobKey().isEmpty()
                    ? ctx.getJobKey()
                    : "RUN_REAPER";
            String source = ctx != null ? ctx.getUpdatedBy() : "";
            String batchLabel = "RUN_REAPER_SECOND".equals(jobKey) ? "第二次冻结跑批" : "首次冻结跑批";
            String detail = batchLabel + "：已对滞留人员执行大华人员冻结；卡号=" + cardNo
                    + "；任务键=" + jobKey + "；调度来源=" + (source == null || source.isEmpty() ? "—" : source);
            twinAutomationLogService.write(
                    TwinAutomationLogService.TYPE_SCHEDULER,
                    TwinAutomationLogService.EVENT_REAPER_USER_FROZEN,
                    triggerType,
                    TwinAutomationLogService.TRIGGER_REAPER_USER_FROZEN,
                    aroUserId,
                    cardNo,
                    true,
                    detail,
                    "freeze-reaper-user"
            );
        } catch (Exception ignored) {
            // 自动化日志不阻断跑批
        }
    }

    /**
     * 第二次冻结补偿名单：今天曾授予过豁免、当前无豁免、且仍处于在馆滞留。
     */
    public List<String> listTodayExemptedThenRevokedStrandedUserIds() {
        String today = LocalDate.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd"));
        List<String> strandedUserIds = mappingMapper.findTodayStrandedUserIds(today + "%");
        List<String> out = new ArrayList<>();
        if (strandedUserIds == null || strandedUserIds.isEmpty()) {
            return out;
        }
        for (String userId : strandedUserIds) {
            TwinCardMapping mapping = loadMappingByAroUserIdFromDb(userId);
            if (mapping == null) {
                continue;
            }
            Integer flag = mapping.getFreezeExemptFlag();
            String grantDate = mapping.getFreezeExemptGrantDate();
            if ((flag == null || flag != 1) && today.equals(grantDate)) {
                out.add(userId);
            }
        }
        return out;
    }

    /**
     * 第二次冻结补偿候选：今天曾授予过豁免、当前无豁免（不依赖本地流水是否已同步）。
     * 具体是否仍在馆，由自动离开流程实时向 ARO 查询 no-leave-room 判断。
     */
    public List<String> listTodayExemptedThenRevokedUserIds() {
        List<String> ids = mappingMapper.findTodayExemptedThenRevokedUserIds();
        if (ids == null) {
            return new ArrayList<>();
        }
        return ids;
    }

    // 在 TwinCardMappingService 类中补充
    /**
     * 解绑卡映射（豁免状态变更点之一）：若被删映射豁免仍生效，删除前记「豁免随行删除」台账。
     *
     * @param ctx 变更来源上下文（记账用），见 {@link ExemptChangeContext#mappingDeleted(String)}
     */
    public synchronized void deleteMapping(String cardNo, ExemptChangeContext ctx) {
        TwinCardMapping mapping = resolveMappingByCardNo(cardNo);
        if (mapping == null) {
            return;
        }
        String canonical = mapping.getCardNo();
        // 1. 豁免随行消失：删除前记统一台账（writeExemptLedger 内部复制快照并吞异常，不阻断解绑）
        if (mapping.getFreezeExemptFlag() != null && mapping.getFreezeExemptFlag() == 1) {
            // 记账快照 DB 直读带姓名（缓存对象无 userName 且多实例下可能陈旧），查不到时回退缓存对象
            TwinCardMapping ledgerSnapshot = mappingMapper.findLedgerSnapshotByCardNo(canonical);
            writeExemptLedger(false, ledgerSnapshot != null ? ledgerSnapshot : mapping, ctx, "解绑卡映射，豁免随行删除");
        }
        // 2. 物理删除数据库记录
        mappingMapper.deleteMapping(canonical);

        // 3. 同时清理内存索引（与 reloadCache 键规则一致）
        String key = canonical == null ? "" : canonical.trim();
        if (!key.isEmpty()) {
            cardNoCache.remove(key);
            cardNoCache.remove(key.toUpperCase());
            cardNoCache.remove(key.toLowerCase());
        }
        if (mapping.getAroUserId() != null) {
            userIdCache.remove(mapping.getAroUserId().trim());
        }
        if (mapping.getDahuaPersonCode() != null && !mapping.getDahuaPersonCode().trim().isEmpty()) {
            dahuaPersonCodeCache.remove(mapping.getDahuaPersonCode().trim());
        }

        log.info("[Cache/DB] 映射已解除: 卡号 {} (人员: {})", canonical, mapping.getAroUserId());
    }

    /**
     * 💥 专为打卡弹窗风控联动设计：通过 ARO 人员 ID 直接修改物理卡的冻结豁免权
     *
     * @param ctx 变更来源上下文（记账用），见 {@link ExemptChangeContext} 静态工厂
     */
    @Transactional(rollbackFor = Exception.class)
    public synchronized void updateExemptFlagByUserId(String aroUserId, int flag, ExemptChangeContext ctx) {
        updateExemptFlagByUserId(aroUserId, flag, flag == 1 ? -1 : null, "TIME", null, null, ctx);
    }

    public synchronized void updateExemptFlagByUserId(
            String aroUserId, int flag, Integer durationMinutes,
            String mode, Integer maxCount, String roomIds, ExemptChangeContext ctx) {
        try {
            if (flag == 1 && mode == null) {
                mode = "TIME";
            }
            String expireAt = null;
            if (flag == 1 && (mode.equals("TIME") || mode.equals("BOTH"))) {
                expireAt = computeExemptExpireAt(durationMinutes != null ? durationMinutes : -1);
            }
            // 变更前快照（UPDATE 前取）：DB 直读带姓名，消除多实例缓存陈旧误判 + 台账姓名缺失
            TwinCardMapping before = (aroUserId == null || aroUserId.isBlank())
                    ? null : mappingMapper.findLedgerSnapshotByUserId(aroUserId.trim());
            int affected = mappingMapper.updateExemptFlagByUserId(aroUserId, flag, expireAt, mode, maxCount, roomIds);
            if (affected > 0) {
                refreshMappingCacheAfterExemptWrite(aroUserId.trim(), null);
                log.info("[映射底盘] 人员 {} 豁免={} mode={} maxCount={}", aroUserId, flag == 1 ? "开" : "关", mode, maxCount);
                // 统一记账：写库+刷缓存成功后落台账；门槛以真实状态迁移为准（未曾豁免的收回、等值重复授予不记账）
                if (flag == 1) {
                    if (shouldWriteGrantLedger(before, mode, expireAt, maxCount, roomIds)) {
                        writeExemptLedger(true, before, ctx, buildGrantLedgerExtra(before, mode, expireAt, maxCount, roomIds));
                    }
                } else {
                    writeExemptLedger(false, before, ctx, null);
                }
            }
        } catch (Exception e) {
            log.error("[映射底盘] 修改豁免权失败 aroUserId={}: {}", aroUserId, e.getMessage());
        }
    }

    @Scheduled(fixedDelay = 60_000, initialDelay = 45_000)
    public void revokeExpiredTimedExemptions() {
        try {
            // 收回前快照（WHERE 与 UPDATE 逐字镜像）：既供逐人记账，也供 WebSocket 推送
            List<TwinCardMapping> expiredSnapshots = safeLoadRevokeSnapshots(
                    mappingMapper::findExpiredExemptSnapshots, "时效到期");
            int rows = mappingMapper.revokeExpiredExemptionsByExpireAt();
            if (rows > 0) {
                syncCacheClearedExemptFlags();
                log.info("[豁免时效] 已自动收回 {} 份到期豁免", rows);
                for (TwinCardMapping snap : expiredSnapshots) {
                    if (snap == null) {
                        continue;
                    }
                    writeExemptLedger(false, snap, ExemptChangeContext.expireTimer(), "时效到期自动收回");
                    String uid = snap.getAroUserId();
                    if (uid != null && !uid.isBlank()) {
                        mobilePresenceNotifyService.notifyPresenceChanged(uid.trim(), "exempt_expired");
                    }
                }
            }
            // 免冻结增强：同时收回次数已耗尽的 COUNT/BOTH 豁免（兜底，主路径在 incrementExemptUsedCount 中已处理）
            List<TwinCardMapping> exhaustedSnapshots = safeLoadRevokeSnapshots(
                    mappingMapper::findExhaustedCountExemptSnapshots, "次数耗尽");
            int countExhausted = mappingMapper.revokeExhaustedCountExemptions();
            if (countExhausted > 0) {
                syncCacheClearedExemptFlags();
                log.info("[豁免时效] 已自动收回 {} 份次数耗尽豁免", countExhausted);
                for (TwinCardMapping snap : exhaustedSnapshots) {
                    if (snap == null) {
                        continue;
                    }
                    writeExemptLedger(false, snap, ExemptChangeContext.countExhausted(true), "次数耗尽定时兜底收回");
                    // 对齐即时路径（incrementExemptUsedCount）行为：耗尽收回同样推送 H5 实时通知
                    String uid = snap.getAroUserId();
                    if (uid != null && !uid.isBlank()) {
                        mobilePresenceNotifyService.notifyPresenceChanged(uid.trim(), "exempt_exhausted");
                    }
                }
            }
        } catch (Exception e) {
            log.warn("[豁免时效] 到期收回失败: {}", e.getMessage());
        }
    }

    /**
     * 定时管理「每日豁免回收」：
     * <ul>
     *   <li>无条件收回当前 flag=1 的豁免；</li>
     *   <li>仅当 {@code autoSignoutOnRevoke}（定时管理任务配置，与冻结总开关无关）时，
     *       对<strong>今日曾豁免</strong>且<strong>今日流水仍判定在馆</strong>者执行自动签离；</li>
     *   <li>未申请豁免的滞留者、流水已离开者、时效到期自动收回者均不签离。</li>
     * </ul>
     *
     * @return [0]=收回条数 [1]=自动签离成功数
     */
    @Transactional(rollbackFor = Exception.class)
    public int[] runDailyExemptMaintenance(boolean autoSignoutOnRevoke) {
        List<TwinCardMapping> exemptedToday;
        try {
            exemptedToday = mappingMapper.findMappingsExemptedToday();
        } catch (Exception e) {
            log.error("[豁免回收] 查询今日豁免轨迹失败: {}", e.getMessage());
            throw e;
        }
        if (exemptedToday == null) {
            exemptedToday = List.of();
        }

        List<TwinCardMapping> activeBefore;
        try {
            activeBefore = mappingMapper.findAllActiveExemptions();
        } catch (Exception e) {
            log.error("[豁免回收] 查询生效豁免失败: {}", e.getMessage());
            throw e;
        }
        if (activeBefore == null) {
            activeBefore = List.of();
        }

        int revoked = 0;
        if (!activeBefore.isEmpty()) {
            try {
                revoked = mappingMapper.forceRevokeAllActiveExemptions();
            } catch (Exception e) {
                log.error("[豁免回收] 兜底收回失败: {}", e.getMessage());
                throw e;
            }
            syncCacheAfterForceRevoke(activeBefore);
            for (TwinCardMapping snap : activeBefore) {
                if (snap == null) {
                    continue;
                }
                // 统一记账：授予日/授予时间并入附加说明，detail 信息量不低于旧的独立拼装（原到期/原模式由记账点自动拼）
                writeExemptLedger(false, snap, ExemptChangeContext.dailyResetFallback(),
                        "定时兜底收回（无视时效/流水规则），授予日=" + nullToDash(snap.getFreezeExemptGrantDate())
                                + "，授予时间=" + nullToDash(snap.getExemptGrantedAt()));
            }
        } else {
            log.info("[豁免回收] 库中无 freeze_exempt_flag=1，无需收回");
        }

        int signoutOk = 0;
        int signoutFail = 0;
        int signoutSkippedNoUser = 0;
        int signoutSkippedNotInside = 0;
        if (!autoSignoutOnRevoke) {
            log.info("[豁免回收] 兜底收回={}；定时任务未开启「回收后自动签离」（twin_job_schedule_config.revoke_auto_signout_enabled）",
                    revoked);
            return new int[] {revoked, signoutOk};
        }
        if (exemptedToday.isEmpty()) {
            log.info("[豁免回收] 兜底收回={}；今日无豁免授予记录，跳过签离", revoked);
            return new int[] {revoked, signoutOk};
        }

        java.util.Set<String> stillInside = new java.util.HashSet<>();
        BusinessTimeWindow.Window day = businessTimeWindow.todayWindow();
        List<String> insideIds = mappingMapper.findTodayStillInsideUserIdsByAccessLog(
                day.startInclusive(), day.endExclusive());
        if (insideIds != null) {
            for (String id : insideIds) {
                if (id != null && !id.isBlank()) {
                    stillInside.add(id.trim());
                }
            }
        }

        for (TwinCardMapping snap : exemptedToday) {
            String userId = snap.getAroUserId();
            if (userId == null || userId.isBlank()) {
                signoutSkippedNoUser++;
                log.warn("[豁免回收] 今日曾豁免但无法签离：aro_user_id 为空，卡号={}", nullToDash(snap.getCardNo()));
                twinAutomationLogService.write(
                        TwinAutomationLogService.TYPE_EXEMPTION,
                        "DAILY_EXEMPT_SIGNOUT_SKIPPED",
                        "TIMER",
                        "DAILY_EXEMPT_RESET_TIMER",
                        null,
                        snap.getCardNo(),
                        false,
                        "豁免回收后自动签离·跳过：aro_user_id 为空，卡号=" + nullToDash(snap.getCardNo()),
                        "daily-exempt-reset");
                continue;
            }
            String uid = userId.trim();
            if (!stillInside.contains(uid)) {
                signoutSkippedNotInside++;
                log.info("[豁免回收] 跳过签离 userId={}：今日曾豁免但流水已离开或未进入（非滞留）", uid);
                twinAutomationLogService.write(
                        TwinAutomationLogService.TYPE_EXEMPTION,
                        "DAILY_EXEMPT_SIGNOUT_SKIPPED",
                        "TIMER",
                        "DAILY_EXEMPT_RESET_TIMER",
                        uid,
                        snap.getCardNo(),
                        true,
                        "豁免回收后自动签离·跳过：今日曾豁免但流水已离开或未进入（非滞留）",
                        "daily-exempt-reset");
                continue;
            }
            try {
                if (dahuaAutoSignoutService.autoSignout(
                        uid,
                        "TIMER",
                        TwinAutomationLogService.TRIGGER_DAILY_EXEMPT_REVOKE_AUTO_SIGNOUT,
                        buildExemptRevokeSignoutDetail(snap))) {
                    signoutOk++;
                } else {
                    signoutFail++;
                    log.warn("[豁免回收] 自动签离未成功 userId={} 卡号={}（详见自动化日志）",
                            uid, nullToDash(snap.getCardNo()));
                }
            } catch (Exception e) {
                signoutFail++;
                log.warn("[豁免回收] 自动签离异常 userId={}: {}", uid, e.getMessage());
            }
        }
        log.info("[豁免回收] 兜底收回={} 今日曾豁免={} 流水在馆={} 签离成功={} 失败={} 跳过(无userId)={} 跳过(已离开)={}",
                revoked, exemptedToday.size(), stillInside.size(), signoutOk, signoutFail,
                signoutSkippedNoUser, signoutSkippedNotInside);
        return new int[] {revoked, signoutOk};
    }

    private static String buildExemptRevokeSignoutDetail(TwinCardMapping snap) {
        return "因定时兜底收回豁免，按配置执行自动签离。卡号=" + nullToDash(snap.getCardNo())
                + "，原到期=" + nullToDash(snap.getFreezeExemptExpireAt());
    }

    private static String nullToDash(String v) {
        return v == null || v.isBlank() ? "-" : v.trim();
    }

    private void syncCacheAfterForceRevoke(List<TwinCardMapping> revoked) {
        for (TwinCardMapping snap : revoked) {
            if (snap == null) {
                continue;
            }
            clearExemptFieldsInCache(snap.getAroUserId(), snap.getCardNo());
        }
    }

    private void clearExemptFieldsInCache(String aroUserId, String cardNo) {
        if (aroUserId != null && !aroUserId.isBlank()) {
            TwinCardMapping m = userIdCache.get(aroUserId.trim());
            if (m != null) {
                m.setFreezeExemptFlag(0);
                m.setFreezeExemptGrantDate(null);
                m.setExemptGrantedAt(null);
                m.setFreezeExemptExpireAt(null);
                m.setLastModifiedTime(getCurrentTime());
            }
        }
        if (cardNo != null && !cardNo.isBlank()) {
            String key = cardNo.trim();
            for (String k : List.of(key, key.toUpperCase(), key.toLowerCase())) {
                TwinCardMapping m = cardNoCache.get(k);
                if (m != null) {
                    m.setFreezeExemptFlag(0);
                    m.setFreezeExemptGrantDate(null);
                    m.setExemptGrantedAt(null);
                    m.setFreezeExemptExpireAt(null);
                    m.setLastModifiedTime(getCurrentTime());
                }
            }
        }
    }

    /** 将缓存与库对齐：库已收回则清缓存；库仍有效则回写缓存，避免只清不同步。 */
    private void syncCacheClearedExemptFlags() {
        for (TwinCardMapping m : userIdCache.values()) {
            if (m == null) {
                continue;
            }
            String uid = m.getAroUserId();
            if (uid == null || uid.isBlank()) {
                continue;
            }
            TwinCardMapping db = mappingMapper.findByAroUserId(uid.trim());
            if (db == null || db.getFreezeExemptFlag() == null || db.getFreezeExemptFlag() != 1) {
                if (m.getFreezeExemptFlag() != null && m.getFreezeExemptFlag() == 1) {
                    m.setFreezeExemptFlag(0);
                    m.setFreezeExemptGrantDate(null);
                    m.setExemptGrantedAt(null);
                    m.setFreezeExemptExpireAt(null);
                    m.setFreezeExemptMode(null);
                    m.setFreezeExemptMaxCount(null);
                    m.setFreezeExemptUsedCount(0);
                    m.setFreezeExemptRoomIds(null);
                    m.setLastModifiedTime(getCurrentTime());
                }
            } else {
                indexMappingInCache(db);
            }
        }
    }

    private void syncCacheExpiredExemptFlags() {
        LocalDateTime now = LocalDateTime.now();
        for (TwinCardMapping m : userIdCache.values()) {
            if (m == null || m.getFreezeExemptFlag() == null || m.getFreezeExemptFlag() != 1) {
                continue;
            }
            String expireAt = m.getFreezeExemptExpireAt();
            if (expireAt == null || expireAt.isBlank()) {
                continue;
            }
            try {
                if (!now.isBefore(LocalDateTime.parse(expireAt.trim(), EXEMPT_EXPIRE_FMT))) {
                    m.setFreezeExemptFlag(0);
                    m.setFreezeExemptGrantDate(null);
                    m.setExemptGrantedAt(null);
                    m.setFreezeExemptExpireAt(null);
                }
            } catch (Exception ignored) {
                // keep cache as-is
            }
        }
    }

    // TwinCardMappingService.java 补丁
    /**
     * 🧹 每日洗刷任务：物理抹除全校所有人的豁免特权，迎接新的一天
     */
    @Transactional(rollbackFor = Exception.class)
    public int resetDailyExemptions() {
        try {
            // 收回前快照（WHERE 与 resetDailyExemptions UPDATE 逐字镜像）：供逐人记账
            List<TwinCardMapping> snapshots = safeLoadRevokeSnapshots(
                    mappingMapper::findStartupResetExemptSnapshots, "开机洗刷");
            int rows = mappingMapper.resetDailyExemptions();
            if (rows > 0) {
                syncCacheClearedExemptFlags();
                for (TwinCardMapping snap : snapshots) {
                    writeExemptLedger(false, snap, ExemptChangeContext.startupReset(), "开机洗刷隔日过期豁免");
                }
            }
            log.info("[系统自检] 每日豁免权洗刷完成，共收回 {} 份过期特权。", rows);
            return rows;
        } catch (Exception e) {
            log.error("[系统异常] 豁免权洗刷失败: {}", e.getMessage());
            return 0;
        }
    }

    /**
     * 第一次冻结后立刻回收全员豁免权：
     * 仅清除当前生效标记，保留 grant_date 轨迹供二次冻结补偿识别。
     */
    @Transactional(rollbackFor = Exception.class)
    public int clearAllExemptFlagsAfterFirstFreeze() {
        try {
            // 收回前快照：clearAllExemptFlagsKeepGrantTrace 的 WHERE 就是 flag=1，findAllActiveExemptions 正好镜像
            List<TwinCardMapping> snapshots = safeLoadRevokeSnapshots(
                    mappingMapper::findAllActiveExemptions, "首次冻结清空");
            int rows = mappingMapper.clearAllExemptFlagsKeepGrantTrace();
            if (rows > 0) {
                for (TwinCardMapping m : userIdCache.values()) {
                    if (m != null && m.getFreezeExemptFlag() != null && m.getFreezeExemptFlag() == 1) {
                        m.setFreezeExemptFlag(0);
                        m.setFreezeExemptExpireAt(null);
                        m.setLastModifiedTime(getCurrentTime());
                    }
                }
                for (TwinCardMapping snap : snapshots) {
                    writeExemptLedger(false, snap, ExemptChangeContext.firstFreezeClear(),
                            "首次冻结结束后清空当日豁免（保留授予轨迹供二次冻结补偿识别）");
                }
            }
            log.info("[第一次冻结] 冻结完成后已回收豁免权，共处理 {} 人。", rows);
            return rows;
        } catch (Exception e) {
            log.error("[第一次冻结] 回收豁免权失败: {}", e.getMessage());
            return 0;
        }
    }

    /**
     * 🛡️ 事件溯源状态对齐 (Event-Sourced Reconciliation)
     * 这是一个【绝对幂等】的自愈方法。不管何时调用，都不会误杀今天的正常豁免权。
     */
    @Transactional(rollbackFor = Exception.class)
    public void reconcileExemptionsByLogs() {
        log.info("[系统自检] 启动事件溯源自愈引擎，正在通过底层流水核对全校豁免权合法性...");

        // 💥 核心核对 SQL：
        // 剥夺豁免权的条件：当前拥有豁免权 (flag=1)，但在今天的 aro_access_log 中找不到他申请不还卡的记录
        try {
            // 收回前快照（WHERE 与 revokeExpiredExemptionsByTodayKeepCard 逐字镜像）：供逐人记账
            List<TwinCardMapping> snapshots = safeLoadRevokeSnapshots(
                    mappingMapper::findReconcileRevokeSnapshots, "事件溯源纠偏");
            int revokedCount = mappingMapper.revokeExpiredExemptionsByTodayKeepCard();
            if (revokedCount > 0) {
                syncCacheClearedExemptFlags();
                for (TwinCardMapping snap : snapshots) {
                    writeExemptLedger(false, snap, ExemptChangeContext.reconcile(),
                            "核对今日流水后褫夺过期豁免（无今日保管卡记录）");
                }
                log.warn("[风控纠偏] 发现并褫夺了 {} 份昨天的过期豁免权！系统状态已绝对对齐。", revokedCount);
            } else {
                log.info("[风控纠偏] 当前系统中所有豁免权均合法有效，无过期特权泄漏。");
            }
        } catch (Exception e) {
            log.error("[系统异常] 豁免权核对失败: {}", e.getMessage());
        }
    }
}