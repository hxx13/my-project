package com.example.demo.modules.referencedata.service;

import com.example.demo.modules.animalorder.service.AnimalOrderTimePolicyService;
import com.example.demo.modules.referencedata.dto.OrderLineCycleUsage;
import com.example.demo.modules.referencedata.entity.RefData;
import com.example.demo.modules.referencedata.mapper.RefCartMapper;
import com.example.demo.modules.referencedata.mapper.RefOrderLineMapper;
import com.example.demo.modules.referencedata.mapper.ReferenceDataMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.time.ZonedDateTime;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class SpecQuotaServiceTest {

    private static final Long REF = 1L;
    private static final String SPEC = "性别: 雌性";
    private static final LocalDate CYCLE = LocalDate.of(2026, 9, 25);

    private static RefData refData(String fieldData) {
        RefData r = new RefData();
        r.setId(REF);
        r.setFieldData(fieldData);
        return r;
    }

    private static SpecQuotaService service(RefCartMapper cart, RefOrderLineMapper line, ReferenceDataMapper data) {
        return new SpecQuotaService(cart, line, data, new ObjectMapper());
    }

    private static OrderLineCycleUsage usage(int qty, String status) {
        OrderLineCycleUsage u = new OrderLineCycleUsage();
        u.setQuantity(qty);
        u.setOrderStatus(status);
        return u;
    }

    @Test
    void 未配上限_availableQty返回null而非0() {
        RefCartMapper cart = mock(RefCartMapper.class);
        RefOrderLineMapper line = mock(RefOrderLineMapper.class);
        ReferenceDataMapper data = mock(ReferenceDataMapper.class);
        when(data.findById(REF)).thenReturn(refData("{\"priceEnabled\":true,\"price\":10}"));
        when(cart.sumQtyByCycle(any(), any(), any(), anyBoolean())).thenReturn(0);
        when(line.listCycleUsage(any(), any(), any())).thenReturn(List.of());

        assertNull(service(cart, line, data).availableQty(REF, SPEC, CYCLE));
    }

    @Test
    void 无规格物品_读flatQuota() {
        RefCartMapper cart = mock(RefCartMapper.class);
        RefOrderLineMapper line = mock(RefOrderLineMapper.class);
        ReferenceDataMapper data = mock(ReferenceDataMapper.class);
        when(data.findById(REF)).thenReturn(refData("{\"quota\":30}"));
        when(cart.sumQtyByCycle(any(), any(), any(), anyBoolean())).thenReturn(0);
        when(line.listCycleUsage(any(), any(), any())).thenReturn(List.of());

        SpecQuotaService svc = service(cart, line, data);
        assertEquals(30, svc.resolveCap(REF, null));
        assertEquals(30, svc.availableQty(REF, null, CYCLE));
    }

    @Test
    void 占用同时算购物车与已下单() {
        RefCartMapper cart = mock(RefCartMapper.class);
        RefOrderLineMapper line = mock(RefOrderLineMapper.class);
        ReferenceDataMapper data = mock(ReferenceDataMapper.class);
        when(data.findById(REF)).thenReturn(refData("{\"specQuotas\":{\"性别: 雌性\":20}}"));
        when(cart.sumQtyByCycle(REF, SPEC, CYCLE, true)).thenReturn(3);
        when(line.listCycleUsage(REF, SPEC, CYCLE)).thenReturn(List.of(usage(5, "PENDING")));

        SpecQuotaService svc = service(cart, line, data);
        assertEquals(8, svc.usedQty(REF, SPEC, CYCLE));
        assertEquals(12, svc.availableQty(REF, SPEC, CYCLE));
    }

    @Test
    void 已作废订单不消耗() {
        RefCartMapper cart = mock(RefCartMapper.class);
        RefOrderLineMapper line = mock(RefOrderLineMapper.class);
        ReferenceDataMapper data = mock(ReferenceDataMapper.class);
        when(data.findById(REF)).thenReturn(refData("{\"specQuotas\":{\"性别: 雌性\":20}}"));
        when(cart.sumQtyByCycle(REF, SPEC, CYCLE, true)).thenReturn(0);
        when(line.listCycleUsage(REF, SPEC, CYCLE)).thenReturn(List.of(
                usage(5, "REJECTED"),
                usage(3, "CANCELLED"),
                usage(2, null),
                usage(4, "APPROVED")));

        assertEquals(6, service(cart, line, data).usedQty(REF, SPEC, CYCLE));
    }

    @Test
    void NULL周期按当前周期计_默认includeNull为true() {
        RefCartMapper cart = mock(RefCartMapper.class);
        RefOrderLineMapper line = mock(RefOrderLineMapper.class);
        ReferenceDataMapper data = mock(ReferenceDataMapper.class);
        when(data.findById(REF)).thenReturn(refData("{\"quota\":100}"));
        when(cart.sumQtyByCycle(any(), any(), any(), anyBoolean())).thenReturn(0);
        when(line.listCycleUsage(any(), any(), any())).thenReturn(List.of());

        SpecQuotaService svc = service(cart, line, data);
        svc.usedQty(REF, SPEC, CYCLE);         // 3 参：默认把 NULL 旧行计入当前周期
        svc.usedQty(REF, SPEC, CYCLE, false);  // 预约周期：不带 NULL

        verify(cart).sumQtyByCycle(REF, SPEC, CYCLE, true);
        verify(cart).sumQtyByCycle(REF, SPEC, CYCLE, false);
    }

    @Test
    void 周期枚举_严格递增且不早于今天() {
        AnimalOrderTimePolicyService policy = mock(AnimalOrderTimePolicyService.class);
        // 模拟引擎「下一送达日 = 锚点 + 2 天」：锚点若没推进，结果就不递增，测出循环推进 bug。
        when(policy.estimateDeliveryAt(anyString(), any(ZonedDateTime.class), nullable(String.class)))
                .thenAnswer(inv -> inv.getArgument(1, ZonedDateTime.class).toLocalDate().plusDays(2));

        List<LocalDate> cycles = ReferenceDataService.enumerateCycles(policy, "浦东", null, 3);

        assertEquals(3, cycles.size());
        LocalDate today = LocalDate.now();
        for (int i = 0; i < cycles.size(); i++) {
            assertFalse(cycles.get(i).isBefore(today), "第 " + i + " 个周期不能早于今天");
            if (i > 0) {
                assertTrue(cycles.get(i).isAfter(cycles.get(i - 1)), "周期必须严格递增");
            }
        }
    }
}
