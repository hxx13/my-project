package com.example.demo.modules.agv.analysis;

import com.example.demo.common.exception.ErrorCodeConstants;
import com.example.demo.common.exception.TwinBusinessException;
import com.example.demo.modules.agv.analysis.model.AgvActivitySegment;
import com.example.demo.modules.agv.analysis.model.AgvCorrection;
import com.example.demo.modules.agv.mapper.AgvAnalysisMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AgvCorrectionService {

    private static final int FEEDBACK_THRESHOLD = 3;

    private final AgvAnalysisMapper mapper;

    public AgvCorrectionService(AgvAnalysisMapper mapper) {
        this.mapper = mapper;
    }

    @Transactional
    public AgvCorrection correct(Long segmentId, String correctedType, String correctedBy, String note) {
        AgvActivitySegment seg = mapper.selectSegmentById(segmentId);
        if (seg == null) throw new TwinBusinessException(ErrorCodeConstants.AGV_SEGMENT_NOT_FOUND, "活动段不存在: " + segmentId);

        AgvCorrection c = new AgvCorrection();
        c.setSegmentId(segmentId);
        c.setOriginalType(seg.getActivityType());
        c.setCorrectedType(correctedType);
        c.setCorrectedBy(correctedBy);
        c.setCorrectionNote(note);
        mapper.insertCorrection(c);

        mapper.updateSegmentCorrection(segmentId, correctedType, c.getId());
        return c;
    }

    /**
     * Check if this correction type has reached feedback threshold.
     * If >= FEEDBACK_THRESHOLD unapplied corrections exist for this type,
     * consider creating or adjusting a rule.
     */
    public boolean shouldSuggestNewRule(String activityType) {
        return mapper.countUnappliedCorrectionsForType(activityType) >= FEEDBACK_THRESHOLD;
    }

    @Transactional
    public void applyFeedback(String activityType, Long ruleId) {
        mapper.markCorrectionsApplied(activityType, ruleId, FEEDBACK_THRESHOLD);
    }
}
