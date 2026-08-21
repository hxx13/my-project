package com.example.demo.modules.twin.dashboard.service;

import com.example.demo.modules.auth.service.UserDisplayNameService;
import com.example.demo.modules.notification.mapper.StudentNotificationMapper;
import com.example.demo.modules.notification.push.dispatch.PushService;
import com.example.demo.modules.student.service.MobileUserSocketPushService;
import com.example.demo.modules.twin.common.mapper.TwinDashboardMapper;
import com.example.demo.modules.twin.dashboard.entity.TwinStudentViolation;
import com.example.demo.modules.twin.dashboard.mapper.TwinCageStatusViolationMapper;
import com.example.demo.modules.twin.dashboard.mapper.TwinStudentViolationMapper;
import com.example.demo.modules.twin.obligation.service.ObligationService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Collections;
import java.util.concurrent.atomic.AtomicLong;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 回归：同人多次开单不得 SUPERSEDE 旧 ACTIVE，每次 INSERT 独立 id。
 */
@ExtendWith(MockitoExtension.class)
class TwinStudentViolationCreateNoSupersedeTest {

    @Mock private TwinStudentViolationMapper violationMapper;
    @Mock private UserDisplayNameService userDisplayNameService;
    @Mock private TwinDashboardMapper dashboardMapper;
    @Mock private TwinViolationRuleService ruleService;
    @Mock private MobileUserSocketPushService mobileUserSocketPushService;
    @Mock private StudentNotificationMapper studentNotificationMapper;
    @Mock private TwinCageStatusViolationMapper cageStatusViolationMapper;
    @Mock private PushService pushService;
    @Mock private ObligationService obligationService;

    private TwinStudentViolationService service;
    private final AtomicLong idSeq = new AtomicLong(100);

    @BeforeEach
    void setUp() {
        service = new TwinStudentViolationService(
                violationMapper,
                new ObjectMapper(),
                userDisplayNameService,
                dashboardMapper,
                ruleService,
                mobileUserSocketPushService,
                studentNotificationMapper,
                cageStatusViolationMapper,
                null,
                pushService,
                obligationService
        );
        when(violationMapper.selectIdsDueToExpire()).thenReturn(Collections.emptyList());
        when(violationMapper.expireActivePastDue()).thenReturn(0);
        doAnswer(inv -> {
            TwinStudentViolation row = inv.getArgument(0);
            row.setId(idSeq.incrementAndGet());
            return 1;
        }).when(violationMapper).insert(any(TwinStudentViolation.class));
    }

    @Test
    void createTwiceForSameUser_insertsTwoActiveRowsWithoutSupersede() {
        TwinStudentViolation first = service.create(
                "u-demo",
                "第一次违规",
                null,
                false,
                null,
                true,
                null,
                "admin",
                "MANUAL",
                null,
                null,
                null,
                null
        );
        TwinStudentViolation second = service.create(
                "u-demo",
                "第二次违规",
                null,
                true,
                null,
                true,
                null,
                "admin",
                "MANUAL",
                null,
                null,
                null,
                null
        );

        assertNotNull(first.getId());
        assertNotNull(second.getId());
        assertNotEquals(first.getId(), second.getId());
        assertEquals("ACTIVE", first.getStatus());
        assertEquals("ACTIVE", second.getStatus());

        verify(violationMapper, never()).supersedeActiveByTargetUserId(any());
        verify(violationMapper, never()).selectActiveIdsByTargetUserId(any());
        verify(violationMapper, times(2)).insert(any(TwinStudentViolation.class));

        ArgumentCaptor<TwinStudentViolation> cap = ArgumentCaptor.forClass(TwinStudentViolation.class);
        verify(violationMapper, times(2)).insert(cap.capture());
        assertEquals("u-demo", cap.getAllValues().get(0).getTargetUserId());
        assertEquals("u-demo", cap.getAllValues().get(1).getTargetUserId());
        assertTrue(cap.getAllValues().get(0).getViolationText().contains("第一次违规"));
        assertTrue(cap.getAllValues().get(1).getViolationText().contains("第二次违规"));
    }
}
