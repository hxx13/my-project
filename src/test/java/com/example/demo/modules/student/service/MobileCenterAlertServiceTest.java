package com.example.demo.modules.student.service;

import com.example.demo.modules.portal.entity.PortalContent;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

@org.junit.jupiter.api.extension.ExtendWith(org.mockito.junit.jupiter.MockitoExtension.class)
class MobileCenterAlertServiceTest {

    @org.mockito.Mock com.example.demo.modules.twin.dashboard.mapper.TwinScanPopupAnnouncementMapper announcementMapper;
    @org.mockito.Mock com.example.demo.modules.twin.dashboard.mapper.TwinStudentViolationMapper violationMapper;
    @org.mockito.Mock com.example.demo.modules.twin.dashboard.service.TwinStudentViolationService twinStudentViolationService;
    @org.mockito.Mock com.example.demo.modules.twin.card.service.TwinCardMappingService cardMappingService;
    @org.mockito.Mock com.example.demo.modules.roommapping.mapper.RoomMappingRoomMapper roomMappingRoomMapper;
    @org.mockito.Mock com.example.demo.modules.twin.common.service.RoomDictionaryManager roomDictionaryManager;
    @org.mockito.Mock com.example.demo.modules.notification.mapper.StudentNotificationMapper studentNotificationMapper;
    @org.mockito.Mock com.example.demo.modules.twin.scan.delay.mapper.TwinScanDelayRequestMapper scanDelayRequestMapper;
    @org.mockito.Mock com.example.demo.modules.twin.scan.delay.service.ScanDelayConfigService scanDelayConfigService;
    @org.mockito.Mock com.example.demo.modules.material.mapper.MaterialRequestMapper materialRequestMapper;
    @org.mockito.Mock com.example.demo.modules.material.mapper.MaterialRequestLineMapper materialRequestLineMapper;
    @org.mockito.Mock com.example.demo.modules.twin.scan.service.TwinScanNoticeAutoSuppressService scanNoticeAutoSuppressService;
    @org.mockito.Mock com.example.demo.modules.portal.mapper.PortalContentMapper portalContentMapper;
    @org.mockito.Mock StudentAnnouncementViewService announcementViewService;

    MobileCenterAlertService service;

    @org.junit.jupiter.api.BeforeEach
    void setUp() {
        service = new MobileCenterAlertService(
                announcementMapper,
                violationMapper,
                twinStudentViolationService,
                cardMappingService,
                roomMappingRoomMapper,
                roomDictionaryManager,
                studentNotificationMapper,
                scanDelayRequestMapper,
                scanDelayConfigService,
                materialRequestMapper,
                materialRequestLineMapper,
                scanNoticeAutoSuppressService,
                portalContentMapper,
                announcementViewService,
                null);
    }

    @Test
    void sectionOf_mapsGeneralNoticeToGeneral_andEverythingElseToPersonal() {
        assertEquals("GENERAL", MobileCenterAlertService.sectionOf("general_notice"));
        assertEquals("PERSONAL", MobileCenterAlertService.sectionOf("announcement"));
        assertEquals("PERSONAL", MobileCenterAlertService.sectionOf("violation"));
        assertEquals("PERSONAL", MobileCenterAlertService.sectionOf("exempt"));
    }

    @Test
    void buildAlerts_putsPortalNoticesIntoAnnouncementsAsGeneralSection() {
        PortalContent notice = new PortalContent();
        notice.setId(88L);
        notice.setTitle("实验室安全月活动通知");
        notice.setContentHtml("<p>详见门户</p>");
        notice.setPublishedAt(java.time.LocalDateTime.of(2026, 9, 18, 10, 0));

        org.mockito.Mockito.lenient()
                .when(scanNoticeAutoSuppressService.suppressKeysForUser(org.mockito.ArgumentMatchers.anyString()))
                .thenReturn(java.util.Set.of());
        org.mockito.Mockito.when(portalContentMapper.listPublic("NOTICE", null, null, "priority", 20, 0))
                .thenReturn(java.util.List.of(notice));

        java.util.Map<String, Object> resp = service.buildAlerts("user-1", false);

        @SuppressWarnings("unchecked")
        java.util.List<java.util.Map<String, Object>> announcements =
                (java.util.List<java.util.Map<String, Object>>) resp.get("announcements");
        assertEquals(1, announcements.size());
        assertEquals("general_notice", announcements.get(0).get("kind"));
        assertEquals("GENERAL", announcements.get(0).get("section"));
        assertEquals("实验室安全月活动通知", announcements.get(0).get("title"));
    }

    @Test
    void buildAlerts_putsExemptIntoFeedbacks_notAnnouncements() {
        com.example.demo.modules.twin.card.entity.TwinCardMapping mapping =
                new com.example.demo.modules.twin.card.entity.TwinCardMapping();
        mapping.setFreezeExemptMode("TIME");
        org.mockito.Mockito.lenient()
                .when(cardMappingService.getByAroUserId("user-1"))
                .thenReturn(mapping);
        org.mockito.Mockito.lenient()
                .when(cardMappingService.isFreezeExempt(mapping))
                .thenReturn(true);
        org.mockito.Mockito.lenient()
                .when(scanNoticeAutoSuppressService.suppressKeysForUser(org.mockito.ArgumentMatchers.anyString()))
                .thenReturn(java.util.Set.of());

        java.util.Map<String, Object> resp = service.buildAlerts("user-1", false);

        @SuppressWarnings("unchecked")
        java.util.List<java.util.Map<String, Object>> announcements =
                (java.util.List<java.util.Map<String, Object>>) resp.get("announcements");
        @SuppressWarnings("unchecked")
        java.util.List<java.util.Map<String, Object>> feedbacks =
                (java.util.List<java.util.Map<String, Object>>) resp.get("feedbacks");

        assertEquals(1, feedbacks.stream().filter(i -> "exempt".equals(i.get("kind"))).count());
        assertEquals(0, announcements.stream().filter(i -> "exempt".equals(i.get("kind"))).count());
    }

    @Test
    void buildAlerts_marksExemptItemAsRead_soMessageBadgeDoesNotCountIt() {
        com.example.demo.modules.twin.card.entity.TwinCardMapping mapping =
                new com.example.demo.modules.twin.card.entity.TwinCardMapping();
        org.mockito.Mockito.lenient()
                .when(cardMappingService.getByAroUserId("user-1"))
                .thenReturn(mapping);
        org.mockito.Mockito.lenient()
                .when(cardMappingService.isFreezeExempt(mapping))
                .thenReturn(true);
        org.mockito.Mockito.lenient()
                .when(scanNoticeAutoSuppressService.suppressKeysForUser(org.mockito.ArgumentMatchers.anyString()))
                .thenReturn(java.util.Set.of());

        java.util.Map<String, Object> resp = service.buildAlerts("user-1", false);

        @SuppressWarnings("unchecked")
        java.util.List<java.util.Map<String, Object>> feedbacks =
                (java.util.List<java.util.Map<String, Object>>) resp.get("feedbacks");
        java.util.Map<String, Object> exempt = feedbacks.stream()
                .filter(i -> "exempt".equals(i.get("kind"))).findFirst().orElseThrow();
        assertEquals(Boolean.TRUE, exempt.get("isRead"));
    }

    @Test
    void sortAnnouncementsBySection_putsGeneralFirst_thenTimeDescending() {
        String earlier = java.time.LocalDateTime.of(2026, 9, 10, 9, 0).toString();
        String later = java.time.LocalDateTime.of(2026, 9, 18, 9, 0).toString();
        java.util.Map<String, Object> g1 = new java.util.LinkedHashMap<>();
        g1.put("section", "GENERAL");
        g1.put("publishAt", earlier);
        java.util.Map<String, Object> p1 = new java.util.LinkedHashMap<>();
        p1.put("section", "PERSONAL");
        p1.put("createdAt", later);
        java.util.Map<String, Object> g2 = new java.util.LinkedHashMap<>();
        g2.put("section", "GENERAL");
        g2.put("publishAt", later);

        java.util.List<java.util.Map<String, Object>> items =
                new java.util.ArrayList<>(java.util.List.of(p1, g1, g2));
        MobileCenterAlertService.sortAnnouncementsBySection(items);

        assertEquals("GENERAL", items.get(0).get("section"));
        assertEquals(later, items.get(0).get("publishAt"));
        assertEquals("GENERAL", items.get(1).get("section"));
        assertEquals("PERSONAL", items.get(2).get("section"));
    }
}
