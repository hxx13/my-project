package com.example.demo.modules.twin.service;

import com.example.demo.modules.twin.entity.TwinCardMapping;
import com.example.demo.modules.twin.mapper.TwinCardMappingMapper;
import com.example.demo.modules.twin.support.FreezeReaperAuditContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.DependsOn;
import org.springframework.context.annotation.Lazy;
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
import java.util.concurrent.ConcurrentHashMap;

@Service
@DependsOn("twinCardMappingSchemaMigrator")
public class TwinCardMappingService {

    private static final Logger log = LoggerFactory.getLogger(TwinCardMappingService.class);

    @Autowired
    private TwinCardMappingMapper mappingMapper;

    // 💥 注入大华硬件物理控制中枢
    @Autowired
    private com.example.demo.modules.dahua.service.DahuaHardwareService dahuaHardwareService;

    @Lazy
    @Autowired
    private TwinAutomationLogService twinAutomationLogService;

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
        System.out.println("⏳ [Cache] 正在初始化物理卡片映射环境...");

        cardNoCache.clear();
        userIdCache.clear();
        dahuaPersonCodeCache.clear();

        // 现在查库绝对安全了
        List<TwinCardMapping> allMappings = mappingMapper.findAll();
        if (allMappings != null) {
            for (TwinCardMapping mapping : allMappings) {
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
                if (aroUid != null) {
                    userIdCache.put(aroUid.trim(), mapping);
                }
                String dahuaPersonCode = mapping.getDahuaPersonCode();
                if (dahuaPersonCode != null && !dahuaPersonCode.trim().isEmpty()) {
                    dahuaPersonCodeCache.put(dahuaPersonCode.trim(), mapping);
                }
            }
        }
        System.out.println("✅ [Cache] 缓存加载完成！共载入 " + cardNoCache.size() + " 条映射记录。O(1) 极速寻址已就绪。");
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
     * 冻结豁免：同时视为「门禁联动规则」豁免（不触发刷卡侧自动签退/激活倒计时等），且联动逻辑不会清除该标记。
     */
    public boolean isLinkageRuleExempt(String aroUserId) {
        if (aroUserId == null || aroUserId.isBlank()) {
            return false;
        }
        TwinCardMapping m = userIdCache.get(aroUserId.trim());
        return isFreezeExempt(m);
    }

    /**
     * 物理冻结豁免（freeze_exempt_flag=1）：供滞留跑批 {@link #executeFreezeReaperTask} 与联动豁免 {@link #isLinkageRuleExempt} 使用；禁止对 null 做拆箱比较。
     */
    public boolean isFreezeExempt(TwinCardMapping mapping) {
        return mapping != null && mapping.getFreezeExemptFlag() != null && mapping.getFreezeExemptFlag() == 1;
    }

    /**
     * 是否属于「大华孪生发卡库」人员：{@code twin_card_mapping} 存在该 ARO 用户，
     * 且同时具备物理卡号、大华人员主键 {@code dahua_seq}、大华人员编码 {@code dahua_person_code}
     *（与 {@link com.example.demo.modules.twin.service.DahuaIssueCardOrchestratorService} 落库一致）。
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

    public synchronized void updateExemptFlag(String cardNo, Integer flag) {
        TwinCardMapping cacheItem = resolveMappingByCardNo(cardNo);
        String dbCardNo = cacheItem != null ? cacheItem.getCardNo() : (cardNo == null ? "" : cardNo.trim());
        String updateTime = getCurrentTime();
        // 1. 持久化落盘
        mappingMapper.updateExemptFlag(dbCardNo, flag, updateTime);
        // 2. 局部刷新缓存
        if (cacheItem != null) {
            cacheItem.setFreezeExemptFlag(flag);
            cacheItem.setLastModifiedTime(updateTime);
            // Java 是引用传递，修改 cacheItem 也会直接在 userIdCache 中生效
        }
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
        System.out.println("💀 [手动风控] 开始执行物理空间滞留清扫...");
        int frozenCount = 0;
        int exemptCount = 0;
        int failCount = 0;

        // 1. 查找当前所有“在馆”人员 (ENTER 次数 > EXIT 次数)
        String todayStr = java.time.LocalDate.now().format(java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd"));
        List<String> strandedUserIds = mappingMapper.findTodayStrandedUserIds(todayStr + "%");

        for (String userId : strandedUserIds) {
            TwinCardMapping mapping = getByAroUserId(userId);
            if (mapping != null && "NORMAL".equals(mapping.getCardStatus())) {
                // 2. 豁免权判决（仅跑批路径；禁止 null 拆箱 == 1 触发 NPE）
                if (isFreezeExempt(mapping)) {
                    exemptCount++;
                } else {
                    String cno = mapping.getCardNo();
                    if (cno == null || cno.isBlank()) {
                        log.warn("[freeze-reaper] skip no physical card mapping userId={}", userId);
                    } else {
                        // 3. 滞留跑批/手动触发跑批：强制冻结（豁免已在分支上排除）
                        try {
                            updateCardStatus(cno, "FROZEN");
                            frozenCount++;
                            writeReaperSingleUserFreezeAudit(userId, cno);
                        } catch (Exception e) {
                            failCount++;
                            log.error("[freeze-reaper] 单用户冻结失败 userId={} cardNo={} err={}",
                                    userId, cno, e.getMessage(), e);
                        }
                    }
                }
            }
        }

        Map<String, Integer> stats = new HashMap<>();
        stats.put("frozenCount", frozenCount);
        stats.put("exemptCount", exemptCount);
        stats.put("failCount", failCount);
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
            TwinCardMapping mapping = getByAroUserId(userId);
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
    public synchronized void deleteMapping(String cardNo) {
        TwinCardMapping mapping = resolveMappingByCardNo(cardNo);
        if (mapping == null) {
            return;
        }
        String canonical = mapping.getCardNo();
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

        System.out.println("🗑️ [Cache/DB] 映射已解除: 卡号 " + canonical + " (人员: " + mapping.getAroUserId() + ")");
    }

    /**
     * 💥 专为打卡弹窗风控联动设计：通过 ARO 人员 ID 直接修改物理卡的冻结豁免权
     */
    @Transactional(rollbackFor = Exception.class)
    public synchronized void updateExemptFlagByUserId(String aroUserId, int flag) {
        try {
            int affected = mappingMapper.updateExemptFlagByUserId(aroUserId, flag);
            if (affected > 0) {
                TwinCardMapping m = userIdCache.get(aroUserId);
                if (m != null) {
                    m.setFreezeExemptFlag(flag);
                    m.setLastModifiedTime(getCurrentTime());
                }
                System.out.println("✅ [映射底盘] 成功修改人员 [" + aroUserId + "] 的物理卡风控豁免状态为: " + (flag == 1 ? "开启" : "关闭"));
            }
        } catch (Exception e) {
            System.err.println("❌ [映射底盘] 修改豁免权失败: " + e.getMessage());
        }
    }

    // TwinCardMappingService.java 补丁
    /**
     * 🧹 每日洗刷任务：物理抹除全校所有人的豁免特权，迎接新的一天
     */
    @Transactional(rollbackFor = Exception.class)
    public int resetDailyExemptions() {
        try {
            int rows = mappingMapper.resetDailyExemptions();
            System.out.println("🧹 [系统自检] 每日豁免权洗刷完成，共收回 " + rows + " 份过期特权。");
            return rows;
        } catch (Exception e) {
            System.err.println("❌ [系统异常] 豁免权洗刷失败: " + e.getMessage());
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
            int rows = mappingMapper.clearAllExemptFlagsKeepGrantTrace();
            if (rows > 0) {
                for (TwinCardMapping m : userIdCache.values()) {
                    if (m != null && m.getFreezeExemptFlag() != null && m.getFreezeExemptFlag() == 1) {
                        m.setFreezeExemptFlag(0);
                        m.setLastModifiedTime(getCurrentTime());
                    }
                }
            }
            System.out.println("🧹 [第一次冻结] 冻结完成后已回收豁免权，共处理 " + rows + " 人。");
            return rows;
        } catch (Exception e) {
            System.err.println("❌ [第一次冻结] 回收豁免权失败: " + e.getMessage());
            return 0;
        }
    }

    /**
     * 🛡️ 事件溯源状态对齐 (Event-Sourced Reconciliation)
     * 这是一个【绝对幂等】的自愈方法。不管何时调用，都不会误杀今天的正常豁免权。
     */
    @Transactional(rollbackFor = Exception.class)
    public void reconcileExemptionsByLogs() {
        System.out.println("🔍 [系统自检] 启动事件溯源自愈引擎，正在通过底层流水核对全校豁免权合法性...");

        // 💥 核心核对 SQL：
        // 剥夺豁免权的条件：当前拥有豁免权 (flag=1)，但在今天的 aro_access_log 中找不到他申请不还卡的记录
        try {
            int revokedCount = mappingMapper.revokeExpiredExemptionsByTodayKeepCard();
            if (revokedCount > 0) {
                System.out.println("🚨 [风控纠偏] 发现并褫夺了 " + revokedCount + " 份昨天的过期豁免权！系统状态已绝对对齐。");
            } else {
                System.out.println("✅ [风控纠偏] 当前系统中所有豁免权均合法有效，无过期特权泄漏。");
            }
        } catch (Exception e) {
            System.err.println("❌ [系统异常] 豁免权核对失败: " + e.getMessage());
        }
    }
}