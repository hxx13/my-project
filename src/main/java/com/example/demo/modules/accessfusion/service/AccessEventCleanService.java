package com.example.demo.modules.accessfusion.service;

import com.example.demo.modules.accessfusion.entity.AccessCleanBatch;
import com.example.demo.modules.accessfusion.entity.AccessCleanedEvent;
import com.example.demo.modules.accessfusion.entity.AccessDoorRule;
import com.example.demo.modules.accessfusion.entity.AccessRawEvent;
import com.example.demo.modules.accessfusion.entity.AccessVisitRound;
import com.example.demo.modules.accessfusion.mapper.AccessCleanBatchMapper;
import com.example.demo.modules.accessfusion.mapper.AccessCleanedEventMapper;
import com.example.demo.modules.accessfusion.mapper.AccessDoorRuleMapper;
import com.example.demo.modules.accessfusion.mapper.AccessRawEventMapper;
import com.example.demo.modules.accessfusion.mapper.AccessVisitRoundMapper;
import com.example.demo.modules.accessfusion.model.InferredAccessEvent;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
public class AccessEventCleanService {

    private final AccessRawEventMapper rawEventMapper;
    private final AccessDoorRuleMapper doorRuleMapper;
    private final AccessCleanedEventMapper cleanedEventMapper;
    private final AccessVisitRoundMapper visitRoundMapper;
    private final AccessCleanBatchMapper batchMapper;
    private final AccessDirectionInferenceEngine inferenceEngine;
    private final AccessFusionRoomResolver roomResolver;
    private final ObjectMapper objectMapper;

    public AccessEventCleanService(
            AccessRawEventMapper rawEventMapper,
            AccessDoorRuleMapper doorRuleMapper,
            AccessCleanedEventMapper cleanedEventMapper,
            AccessVisitRoundMapper visitRoundMapper,
            AccessCleanBatchMapper batchMapper,
            AccessDirectionInferenceEngine inferenceEngine,
            AccessFusionRoomResolver roomResolver,
            ObjectMapper objectMapper) {
        this.rawEventMapper = rawEventMapper;
        this.doorRuleMapper = doorRuleMapper;
        this.cleanedEventMapper = cleanedEventMapper;
        this.visitRoundMapper = visitRoundMapper;
        this.batchMapper = batchMapper;
        this.inferenceEngine = inferenceEngine;
        this.roomResolver = roomResolver;
        this.objectMapper = objectMapper;
    }

    @Transactional(rollbackFor = Exception.class)
    public AccessCleanBatch runClean(LocalDateTime windowStart, LocalDateTime windowEnd, String batchType) {
        roomResolver.refreshCache();
        AccessCleanBatch batch = new AccessCleanBatch();
        batch.setBatchType(batchType != null ? batchType : "MANUAL");
        batch.setWindowStart(windowStart);
        batch.setWindowEnd(windowEnd);
        batch.setStatus("RUNNING");
        batchMapper.insert(batch);

        try {
            int rawCount = rawEventMapper.countForClean(windowStart, windowEnd);
            int page = 2000;
            int offset = 0;
            List<AccessRawEvent> allRaw = new java.util.ArrayList<>();
            while (offset < rawCount) {
                allRaw.addAll(rawEventMapper.selectForClean(windowStart, windowEnd, page, offset));
                offset += page;
            }

            Map<String, AccessDoorRule> rules = new HashMap<>();
            for (AccessDoorRule r : doorRuleMapper.selectAllEnabled()) {
                rules.put(r.getChannelCode(), r);
            }

            List<InferredAccessEvent> inferred = inferenceEngine.infer(allRaw, rules, roomResolver);
            cleanedEventMapper.deleteByBatchId(batch.getId());
            visitRoundMapper.deleteByBatchId(batch.getId());

            int reviewCount = 0;
            Map<Long, Long> rawToCleanedId = new HashMap<>();
            for (InferredAccessEvent inf : inferred) {
                AccessCleanedEvent row = toCleanedRow(inf, batch.getId());
                cleanedEventMapper.insert(row);
                rawToCleanedId.put(inf.raw.getId(), row.getId());
                if (row.getNeedsReview() != null && row.getNeedsReview() == 1) {
                    reviewCount++;
                }
            }

            List<AccessDirectionInferenceEngine.AccessVisitRoundDraft> visits =
                    inferenceEngine.buildVisitRounds(inferred);
            for (AccessDirectionInferenceEngine.AccessVisitRoundDraft v : visits) {
                AccessVisitRound vr = new AccessVisitRound();
                vr.setBatchId(batch.getId());
                vr.setUserId(
                        v.enter() != null
                                ? v.enter().raw.getMappingUserId()
                                : v.exit().raw.getMappingUserId());
                vr.setRoomId(v.enter() != null ? v.enter().roomId : v.exit().roomId);
                vr.setRoomName(v.enter() != null ? v.enter().roomName : v.exit().roomName);
                LocalDateTime t = v.enter() != null ? v.enter().eventTime : v.exit().eventTime;
                vr.setRoundDate(t != null ? LocalDate.from(t) : windowStart.toLocalDate());
                if (v.enter() != null) {
                    vr.setEnterTime(v.enter().eventTime);
                    vr.setEnterCleanedEventId(rawToCleanedId.get(v.enter().raw.getId()));
                }
                if (v.exit() != null) {
                    vr.setExitTime(v.exit().eventTime);
                    vr.setExitCleanedEventId(rawToCleanedId.get(v.exit().raw.getId()));
                }
                vr.setStatus(v.status());
                visitRoundMapper.insert(vr);
            }

            batch.setRawIn(rawCount);
            batch.setCleanedOut(inferred.size());
            batch.setVisitOut(visits.size());
            batch.setReviewCount(reviewCount);
            batch.setStatus("DONE");
            batch.setFinishedAt(LocalDateTime.now());
            batchMapper.updateDone(batch);
            return batch;
        } catch (Exception e) {
            batch.setStatus("FAILED");
            batch.setErrorMessage(e.getMessage());
            batch.setFinishedAt(LocalDateTime.now());
            batchMapper.updateDone(batch);
            throw e;
        }
    }

    public AccessCleanBatch runDailyYesterday() {
        LocalDate y = LocalDate.now().minusDays(1);
        return runClean(y.atStartOfDay(), y.plusDays(1).atStartOfDay(), "DAILY");
    }

    public AccessCleanBatch runIncrementalLastHours(int hours) {
        LocalDateTime end = LocalDateTime.now();
        return runClean(end.minusHours(hours), end, "INCREMENTAL");
    }

    private AccessCleanedEvent toCleanedRow(InferredAccessEvent inf, long batchId) {
        AccessCleanedEvent row = new AccessCleanedEvent();
        row.setBatchId(batchId);
        row.setRawEventId(inf.raw.getId());
        row.setUserId(inf.raw.getMappingUserId());
        row.setPersonName(inf.raw.getPersonName());
        row.setChannelCode(inf.raw.getChannelCode());
        row.setRoomId(inf.roomId);
        row.setRoomName(inf.roomName);
        row.setAreaName(inf.areaName);
        row.setFloorName(inf.floorName);
        row.setDirection(inf.direction);
        row.setAccessType(inf.accessType);
        row.setInferenceMethod(inf.inferenceMethod);
        row.setConfidence(inf.confidence);
        row.setEventTime(inf.eventTime);
        row.setNeedsReview(inf.needsReview ? 1 : 0);
        row.setProjectGroupNames(inf.projectGroupNames);
        try {
            row.setFlagsJson(objectMapper.writeValueAsString(inf.flags));
        } catch (Exception e) {
            row.setFlagsJson("[]");
        }
        return row;
    }
}
