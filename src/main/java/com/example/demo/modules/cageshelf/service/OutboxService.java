package com.example.demo.modules.cageshelf.service;

import com.alibaba.fastjson2.JSON;
import com.example.demo.modules.aro.service.AroService;
import com.example.demo.modules.cageshelf.entity.CageCellDetail;
import com.example.demo.modules.cageshelf.entity.OutboxRecord;
import com.example.demo.modules.cageshelf.mapper.CageCellDetailMapper;
import com.example.demo.modules.cageshelf.mapper.CageCellIndexMapper;
import com.example.demo.modules.cageshelf.mapper.OutboxRecordMapper;
import com.example.demo.modules.cageshelf.support.CageFieldMappingService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;

/**
 * Outbox 投递箱服务 — 可靠推送 ARO。
 *
 * 写入：业务变更时同步写入 outbox_record（与业务操作同一事务）
 * 投递：后台 Scheduler 定时轮询 pending 记录，逐条推 ARO
 * 重试：指数退避 1m→2m→4m→8m→16m→30m，最多 10 次
 * 死信：10 次后标记 dead，需人工处理
 */
@Service
public class OutboxService {

    private static final Logger log = LoggerFactory.getLogger(OutboxService.class);
    private static final DateTimeFormatter DT_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private static final int MAX_RETRY = 10;
    private static final int[] RETRY_DELAYS = {1, 2, 4, 8, 16, 30, 30, 30, 30, 30}; // 分钟

    private final OutboxRecordMapper mapper;
    private final AroService aroService;
    private final CageCellIndexMapper indexMapper;
    private final CageCellDetailMapper detailMapper;
    private final CageFieldMappingService mappingService;

    public OutboxService(OutboxRecordMapper mapper, AroService aroService,
                         CageCellIndexMapper indexMapper, CageCellDetailMapper detailMapper,
                         CageFieldMappingService mappingService) {
        this.mapper = mapper;
        this.aroService = aroService;
        this.indexMapper = indexMapper;
        this.detailMapper = detailMapper;
        this.mappingService = mappingService;
    }

    /** 写入投递箱 */
    public void enqueue(String aggregateType, String aggregateId, String eventType,
                        Map<String, Object> payload, String aroEndpoint, String summary) {
        OutboxRecord r = new OutboxRecord();
        r.setAggregateType(aggregateType);
        r.setAggregateId(aggregateId);
        r.setEventType(eventType);
        r.setPayload(JSON.toJSONString(payload));
        r.setAroEndpoint(aroEndpoint);
        r.setSummary(summary);
        mapper.insert(r);
        log.info("[outbox] 入队: {} | {} → {} status=pending", summary, aggregateId, aroEndpoint);
    }

    /** 轮询+投递（由 Scheduler 调用） */
    public int deliverBatch(int batchSize) {
        List<OutboxRecord> pending = mapper.selectPending(batchSize);
        if (pending.isEmpty()) return 0;

        int delivered = 0;
        for (OutboxRecord r : pending) {
            try {
                boolean ok = deliverOne(r);
                if (ok) delivered++;
            } catch (Exception e) {
                log.warn("[outbox] 投递异常 id={} err={}", r.getId(), e.getMessage());
                markFailed(r, e.getMessage());
            }
        }
        return delivered;
    }

    private static final String ARO_BASE = "https://aro.shsmu.edu.cn/jtu/api/admin";

    /** 单条投递 */
    private boolean deliverOne(OutboxRecord r) {
        String aroUrl = null;
        boolean ok;

        // 根据端点路由
        Map<String, Object> payload = JSON.parseObject(r.getPayload(), Map.class);
        switch (r.getAroEndpoint()) {
            // ── 映射端点：使用 CageFieldMappingService 翻译业务字段 ──
            case "cageBoxAction" -> {
                aroUrl = ARO_BASE + "/animalCageBoxPart/save";
                Long aid = getAnimalCageId(payload);
                Long cbId = resolveCageBoxId(payload);
                if (aid == null || cbId == null) {
                    ok = false;
                    break;
                }
                Map<String, Object> mapped = mappingService.applyPush("cageBoxAction", payload);
                ok = aroService.saveAnimalCageBoxPart(aid, cbId, mapped);
            }
            case "specialBreeding" -> {
                aroUrl = ARO_BASE + "/specialBreeding/save";
                Long cbId = resolveCageBoxId(payload);
                if (cbId == null) {
                    ok = false;
                    break;
                }
                Map<String, Object> mapped = mappingService.applyPush("specialBreeding", payload);
                mapped.putIfAbsent("cageBoxId", cbId);
                ok = aroService.postAroJson("/admin/specialBreeding/save", mapped);
            }
            case "animalHealth" -> {
                aroUrl = ARO_BASE + "/animalHealth/save";
                Long cbId = resolveCageBoxId(payload);
                if (cbId == null) {
                    ok = false;
                    break;
                }
                // animalHealth 无映射 targets，直接传 payload + cageBoxId
                Map<String, Object> healthBody = new LinkedHashMap<>(payload);
                healthBody.put("cageBoxId", cbId);
                ok = aroService.postAroJson("/admin/animalHealth/save", healthBody);
            }
            case "cancelColor" -> {
                Long cbId = resolveCageBoxId(payload);
                Integer color = toInt(payload.get("color"));
                aroUrl = ARO_BASE + "/cageBox/cancelColor";
                ok = cbId != null && color != null && aroService.cancelCageBoxColor(cbId, color);
            }
            case "cageRelatedBox" -> {
                aroUrl = ARO_BASE + "/cageRelatedBox/save";
                Map<String, Object> mapped = mappingService.applyPush("cageRelatedBox", payload);
                Long aid = getAnimalCageId(payload);
                if (aid != null) mapped.putIfAbsent("animalCageId", aid);
                ok = aroService.postAroJson("/admin/cageRelatedBox/save", mapped);
            }
            // ── 非映射端点：保持原有逻辑 ──
            case "unbindCageBox" -> {
                aroUrl = ARO_BASE + "/cageBox/batchDelete";
                Long aid = getAnimalCageId(payload);
                ok = aid != null && aroService.unbindCageBox(java.util.List.of(aid));
            }
            case "updateAnimalCage" -> {
                aroUrl = ARO_BASE + "/animalCage/update";
                Map<String, Object> aroBody = buildUpdateBody(payload);
                ok = aroBody != null && aroService.updateAnimalCage(aroBody);
            }
            case "cageBook" -> {
                aroUrl = ARO_BASE + "/book";
                Long roomId = toLong(payload.get("roomId"));
                Long shelveId = toLong(payload.get("shelveId"));
                Long aupId = toLong(payload.get("aupId"));
                List<Long> cageIds = toLongList(payload.get("animalCageIds"));
                ok = roomId != null && shelveId != null && aupId != null && cageIds != null
                        && aroService.bookCages(roomId, shelveId, cageIds, aupId);
            }
            case "cancelBook" -> {
                aroUrl = ARO_BASE + "/book/cancel";
                List<Long> cageIds = toLongList(payload.get("animalCageIds"));
                ok = cageIds != null && aroService.cancelBookCages(cageIds);
            }
            default -> {
                markFailed(r, "未知端点: " + r.getAroEndpoint());
                return false;
            }
        }

        // 写入实际 ARO URL
        if (aroUrl != null) {
            mapper.updateAroUrl(r.getId(), aroUrl);
        }

        if (ok) {
            log.info("[outbox] ✅ 投递成功 id={} | {} | POST {}", r.getId(), r.getSummary(), aroUrl);
            markDelivered(r);
            return true;
        } else {
            String err = aroService.getLastAroErrorMessage();
            log.warn("[outbox] ❌ 投递失败 id={} | {} | POST {} | err={}", r.getId(), r.getSummary(), aroUrl, err);
            markFailed(r, err);
            return false;
        }
    }

    private void markDelivered(OutboxRecord r) {
        String now = DT_FMT.format(LocalDateTime.now());
        mapper.updateStatus(r.getId(), "delivered", r.getRetryCount(), null, null, null, now);
        log.info("[outbox] ✅ 投递成功 id={} | {}", r.getId(), r.getSummary());
    }

    private void markFailed(OutboxRecord r, String error) {
        // 网络故障 → 重试；ARO 业务拒绝 → 直接死信
        // 判断依据：默认错误/含"HTTP"/含"网络异常" = 网络问题；其他 = ARO 返回的具体拒绝原因
        boolean isNetworkError = error == null || error.isBlank()
                || error.equals("ARO 服务异常，请稍后重试")
                || error.contains("HTTP")
                || error.contains("网络异常");

        if (!isNetworkError) {
            mapper.updateStatus(r.getId(), "dead", r.getRetryCount(), null, error, null, null);
            log.warn("[outbox] 💀 业务拒绝 id={} | {} | err={}", r.getId(), r.getSummary(), error);
            return;
        }

        int nextRetry = (r.getRetryCount() != null ? r.getRetryCount() : 0) + 1;
        if (nextRetry > MAX_RETRY) {
            mapper.updateStatus(r.getId(), "dead", nextRetry, null, error, null, null);
            log.warn("[outbox] 💀 死信 id={} retries={} | {} | err={}", r.getId(), nextRetry, r.getSummary(), error);
        } else {
            int delayMin = RETRY_DELAYS[Math.min(nextRetry - 1, RETRY_DELAYS.length - 1)];
            String nextAt = LocalDateTime.now().plusMinutes(delayMin).format(DT_FMT);
            mapper.updateStatus(r.getId(), "failed", nextRetry, nextAt, error, null, null);
            log.info("[outbox] ⏳ 重试 id={} retry={}/{} next={} | {}", r.getId(), nextRetry, MAX_RETRY, nextAt, r.getSummary());
        }
    }

    /** 统计 */
    public Map<String, Object> stats() {
        List<Map<String, Object>> raw = mapper.stats();
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("stats", raw);
        result.put("recent", mapper.selectRecent(20));
        return result;
    }

    /** 同时兼容 canonical (snake_case) 和 camelCase 的 animalCageId 取值 */
    private Long getAnimalCageId(Map<String, Object> payload) {
        Long v = toLong(payload.get("animal_cage_id"));
        if (v == null) v = toLong(payload.get("animalCageId"));
        return v;
    }

    /** 同时兼容 canonical (snake_case) 和 camelCase 的 cageBoxCode 取值 */
    private String getCageBoxCode(Map<String, Object> payload) {
        String v = payload.containsKey("cage_box_code") ? String.valueOf(payload.get("cage_box_code")).trim() : "";
        if (v.isEmpty()) v = payload.containsKey("cageBoxCode") ? String.valueOf(payload.get("cageBoxCode")).trim() : "";
        return v;
    }

    /**
     * 解析 cageBoxId — 三级回退 + 写回本地DB。
     * 兼容 canonical (snake_case) 和旧 camelCase 键名。
     */
    private Long resolveCageBoxId(Map<String, Object> payload) {
        // ① payload 直接带了 cageBoxId（兼容两种命名）
        Long cbId = toLong(payload.get("cage_box_id"));
        if (cbId == null) cbId = toLong(payload.get("cageBoxId"));
        if (cbId != null) return cbId;

        // ② 从本地 cage_cell_detail 取
        Long aid = getAnimalCageId(payload);
        if (aid != null) {
            CageCellDetail d = detailMapper.selectByAnimalCageId(aid);
            if (d != null && d.getCageBoxId() != null) return d.getCageBoxId();
        }

        // ③ 兜底：通过 ARO 用 cageBoxCode 解析
        String code = getCageBoxCode(payload);
        if (code.isEmpty() && aid != null) {
            CageCellDetail d = detailMapper.selectByAnimalCageId(aid);
            if (d != null && d.getCageBoxCode() != null) code = d.getCageBoxCode();
        }
        if (code.isEmpty()) {
            log.warn("[outbox] resolveCageBoxId 失败: animalCageId={} 无 cageBoxCode/cageBoxId", aid);
            return null;
        }

        if (aid != null) {
            Map<String, Object> idx = indexMapper.selectByAnimalCageId(aid);
            if (idx != null) {
                Long roomId = toLong(idx.get("roomId"));
                Long shelveId = toLong(idx.get("shelve_id"));
                if (roomId != null && shelveId != null) {
                    Map<String, Long> resolved = aroService.resolveCageBoxIds(roomId, shelveId, code);
                    if (!resolved.isEmpty()) {
                        Long resolvedCbId = resolved.get("cageBoxId");
                        // 写回本地 DB，下次直接命中步骤②
                        if (resolvedCbId != null && aid != null) {
                            try {
                                CageCellDetail d = detailMapper.selectByAnimalCageId(aid);
                                if (d != null && d.getCageBoxId() == null) {
                                    d.setCageBoxId(resolvedCbId);
                                    detailMapper.batchUpsert(java.util.List.of(d));
                                    log.info("[outbox] 已缓存 cageBoxId: animalCageId={} cageBoxId={}", aid, resolvedCbId);
                                }
                            } catch (Exception e) {
                                log.warn("[outbox] 缓存 cageBoxId 失败: {}", e.getMessage());
                            }
                        }
                        return resolvedCbId;
                    }
                }
            }
        }
        return null;
    }

    /** 从本地DB构建完整的 ARO updateAnimalCage 请求体，通过映射表翻译字段名 */
    private Map<String, Object> buildUpdateBody(Map<String, Object> payload) {
        Long animalCageId = getAnimalCageId(payload);
        if (animalCageId == null) return null;

        Map<String, Object> idx = indexMapper.selectByAnimalCageId(animalCageId);
        if (idx == null) {
            log.warn("[outbox] buildUpdateBody 未找到位置 animalCageId={}", animalCageId);
            return null;
        }

        // 基础字段：从本地 cage_cell_index 组装规范名 Map，再经映射表翻成 ARO 字段名
        Map<String, Object> canonical = new LinkedHashMap<>();
        canonical.put("animal_cage_id", animalCageId);
        canonical.put("position_x", toInt(idx.get("position_x")));
        canonical.put("position_y", toInt(idx.get("position_y")));
        canonical.put("state", 1);
        canonical.put("type", 1);

        // 业务字段：从 cage_cell_detail 读取，覆盖默认值
        CageCellDetail detail = detailMapper.selectByAnimalCageId(animalCageId);
        if (detail != null) {
            if (detail.getCageTypeCode() != null) canonical.put("state", detail.getCageTypeCode());
            if (detail.getCageName() != null && !detail.getCageName().isBlank())
                canonical.put("cage_name", detail.getCageName());
            canonical.put("needs_division", Boolean.TRUE.equals(detail.getNeedsDivision()));
            canonical.put("needs_special_feeding", Boolean.TRUE.equals(detail.getNeedsSpecialFeeding()));
            canonical.put("needs_transfer", Boolean.TRUE.equals(detail.getNeedsTransfer()));
            canonical.put("has_health_abnormality", Boolean.TRUE.equals(detail.getHasHealthAbnormality()));
        }

        // 通过映射表翻译: 规范名 → ARO 字段名
        Map<String, Object> aroBody = mappingService.applyPush("updateAnimalCage", canonical);

        // 补充映射表不覆盖的基础设施字段
        aroBody.putIfAbsent("id", animalCageId);
        aroBody.putIfAbsent("roomId", toLong(idx.get("roomId")));
        aroBody.putIfAbsent("shelveId", toLong(idx.get("shelve_id")));
        aroBody.putIfAbsent("type", 1);

        return aroBody;
    }

    @SuppressWarnings("unchecked")
    private static List<Long> toLongList(Object v) {
        if (v instanceof List<?> list) {
            List<Long> result = new java.util.ArrayList<>();
            for (Object item : list) {
                Long l = toLong(item);
                if (l != null) result.add(l);
            }
            return result.isEmpty() ? null : result;
        }
        return null;
    }

    private static Long toLong(Object v) {
        if (v == null) return null;
        if (v instanceof Number n) return n.longValue();
        try { return Long.parseLong(String.valueOf(v).trim()); } catch (Exception e) { return null; }
    }
    private static Integer toInt(Object v) {
        if (v == null) return null;
        if (v instanceof Number n) return n.intValue();
        try { return Integer.parseInt(String.valueOf(v).trim()); } catch (Exception e) { return null; }
    }
}
