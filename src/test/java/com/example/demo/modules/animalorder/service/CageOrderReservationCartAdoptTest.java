package com.example.demo.modules.animalorder.service;

import com.example.demo.modules.auth.service.UserDisplayNameService;
import com.example.demo.modules.aup.mapper.AupRecordMapper;
import com.example.demo.modules.cageshelf.mapper.CageCellDetailMapper;
import com.example.demo.modules.cageshelf.mapper.CageCellIndexMapper;
import com.example.demo.modules.cageshelf.mapper.CageClaimMapper;
import com.example.demo.modules.cageshelf.mapper.CageOpRequestMapper;
import com.example.demo.modules.cageshelf.mapper.CageShelfMapper;
import com.example.demo.modules.cageshelf.service.CageDivisionService;
import com.example.demo.modules.cageshelf.service.CageFormAuditService;
import com.example.demo.modules.cageshelf.service.CageInfoValueService;
import com.example.demo.modules.identity.service.PersonIdentityService;
import com.example.demo.modules.notification.service.NotificationSettingsService;
import com.example.demo.modules.referencedata.entity.CageOrderReservation;
import com.example.demo.modules.referencedata.mapper.CageOrderReservationMapper;
import com.example.demo.modules.referencedata.mapper.ReferenceDataMapper;
import com.example.demo.modules.student.service.StudentCageShelfService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 「先点笼位、后补规格」这条正常顺序的收口契约：规格是在加购那一刻才补上的，
 * 此时数量往往与锁定时相同（默认都是 1）。数量列必须跟着性别一起写进笼位表单，
 * 只按「数量变没变」决定写不写，会让笼位表单里性别有、数量空。
 */
class CageOrderReservationCartAdoptTest {

    private static final String USER = "STAFF_1";
    private static final Long CAGE_ID = 100L;

    private CageInfoValueService infoValueService;
    private CageOrderReservationService service;

    private CageOrderReservationService build(CageOrderReservationMapper reservationMapper,
                                              PersonIdentityService personIdentityService,
                                              CageInfoValueService infoValueService) {
        NotificationSettingsService settings = mock(NotificationSettingsService.class);
        when(settings.getEffectiveValue(any(), any(), any())).thenReturn(null);
        return new CageOrderReservationService(
                mock(CageCellDetailMapper.class),
                mock(CageCellIndexMapper.class),
                mock(CageShelfMapper.class),
                mock(CageOpRequestMapper.class),
                mock(CageClaimMapper.class),
                mock(StudentCageShelfService.class),
                personIdentityService,
                mock(CageDivisionService.class),
                infoValueService,
                mock(CageFormAuditService.class),
                reservationMapper,
                null,
                mock(AupRecordMapper.class),
                mock(ReferenceDataMapper.class),
                mock(UserDisplayNameService.class),
                settings,
                new ObjectMapper());
    }

    /** 锁定时规格为空（还没选）、数量 1；加购时补上「性别: 雌性」、数量仍是 1。 */
    @Test
    void 先锁笼位后补规格_数量未变也要把雌性数量写进笼位表单() {
        CageOrderReservationMapper reservationMapper = mock(CageOrderReservationMapper.class);
        PersonIdentityService personIdentityService = mock(PersonIdentityService.class);
        infoValueService = mock(CageInfoValueService.class);
        service = build(reservationMapper, personIdentityService, infoValueService);

        CageOrderReservation r = new CageOrderReservation();
        r.setId(9L);
        r.setStatus("LOCKED");
        r.setReserverId(USER);
        r.setAnimalCageId(CAGE_ID);
        r.setSpecKey("");
        r.setSex(null);
        r.setQuantity(1);
        when(reservationMapper.findById(9L)).thenReturn(r);
        when(personIdentityService.samePerson(USER, USER)).thenReturn(true);

        service.requireActiveForCart(9L, USER, 42L, "性别: 雌性", 1);

        ArgumentCaptor<Map<String, Object>> patch = ArgumentCaptor.forClass(Map.class);
        verify(infoValueService).syncFromMapped(eq(CAGE_ID), patch.capture());
        assertEquals("雌性", patch.getValue().get("animal_sex"), "性别应写进笼位表单");
        assertEquals(1, ((Number) patch.getValue().get("animal_female_number")).intValue(),
                "数量没变也必须把雌性数量写进去，否则笼位表单里性别有、数量空");
    }

    /** 对照组：雄性同理。 */
    @Test
    void 补规格为雄性时写雄性数量列() {
        CageOrderReservationMapper reservationMapper = mock(CageOrderReservationMapper.class);
        PersonIdentityService personIdentityService = mock(PersonIdentityService.class);
        infoValueService = mock(CageInfoValueService.class);
        service = build(reservationMapper, personIdentityService, infoValueService);

        CageOrderReservation r = new CageOrderReservation();
        r.setId(10L);
        r.setStatus("LOCKED");
        r.setReserverId(USER);
        r.setAnimalCageId(CAGE_ID);
        r.setSpecKey("");
        r.setSex(null);
        r.setQuantity(3);
        when(reservationMapper.findById(10L)).thenReturn(r);
        when(personIdentityService.samePerson(USER, USER)).thenReturn(true);

        service.requireActiveForCart(10L, USER, 42L, "性别: 雄性", 3);

        ArgumentCaptor<Map<String, Object>> patch = ArgumentCaptor.forClass(Map.class);
        verify(infoValueService).syncFromMapped(eq(CAGE_ID), patch.capture());
        assertEquals(3, ((Number) patch.getValue().get("animal_male_number")).intValue());
    }
}
