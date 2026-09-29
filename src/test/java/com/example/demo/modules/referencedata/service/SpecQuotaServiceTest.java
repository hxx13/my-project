package com.example.demo.modules.referencedata.service;

import com.example.demo.modules.animalorder.service.AnimalOrderTimePolicyService;
import com.example.demo.modules.referencedata.dto.OrderLineCycleUsage;
import com.example.demo.modules.referencedata.entity.RefData;
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

    private static SpecQuotaService service(RefOrderLineMapper line, ReferenceDataMapper data) {
        return new SpecQuotaService(line, data, new ObjectMapper());
    }

    private static OrderLineCycleUsage usage(int qty, String status) {
        OrderLineCycleUsage u = new OrderLineCycleUsage();
        u.setQuantity(qty);
        u.setOrderStatus(status);
        return u;
    }

    @Test
    void 未配上限_availableQty返回null而非0() {
        RefOrderLineMapper line = mock(RefOrderLineMapper.class);
        ReferenceDataMapper data = mock(ReferenceDataMapper.class);
        when(data.findById(REF)).thenReturn(refData("{\"priceEnabled\":true,\"price\":10}"));
        when(line.listCycleUsage(any(), any(), any())).thenReturn(List.of());

        assertNull(service(line, data).availableQty(REF, SPEC, CYCLE));
    }

    @Test
    void 无规格物品_读flatQuota() {
        RefOrderLineMapper line = mock(RefOrderLineMapper.class);
        ReferenceDataMapper data = mock(ReferenceDataMapper.class);
        when(data.findById(REF)).thenReturn(refData("{\"quota\":30}"));
        when(line.listCycleUsage(any(), any(), any())).thenReturn(List.of());

        SpecQuotaService svc = service(line, data);
        assertEquals(30, svc.resolveCap(REF, null));
        assertEquals(30, svc.availableQty(REF, null, CYCLE));
    }

    @Test
    void 购物车不占额度_已用只算订单行() {
        RefOrderLineMapper line = mock(RefOrderLineMapper.class);
        ReferenceDataMapper data = mock(ReferenceDataMapper.class);
        when(data.findById(REF)).thenReturn(refData("{\"specQuotas\":{\"性别: 雌性\":20}}"));
        // 该规格车里还压着 3（不在本测试里体现）：加购不该吃掉额度，所以已用仍是订单那 5
        when(line.listCycleUsage(REF, SPEC, CYCLE)).thenReturn(List.of(usage(5, "PENDING")));

        SpecQuotaService svc = service(line, data);
        assertEquals(5, svc.usedQty(REF, SPEC, CYCLE));
        assertEquals(15, svc.availableQty(REF, SPEC, CYCLE));
    }

    @Test
    void 已作废订单不消耗() {
        RefOrderLineMapper line = mock(RefOrderLineMapper.class);
        ReferenceDataMapper data = mock(ReferenceDataMapper.class);
        when(data.findById(REF)).thenReturn(refData("{\"specQuotas\":{\"性别: 雌性\":20}}"));
        when(line.listCycleUsage(REF, SPEC, CYCLE)).thenReturn(List.of(
                usage(5, "REJECTED"),
                usage(3, "CANCELLED"),
                usage(2, null),
                usage(4, "APPROVED")));

        assertEquals(6, service(line, data).usedQty(REF, SPEC, CYCLE));
    }

    @Test
    void 上限被调小到低于已下单量_可用量为负由调用方兜底() {
        RefOrderLineMapper line = mock(RefOrderLineMapper.class);
        ReferenceDataMapper data = mock(ReferenceDataMapper.class);
        when(data.findById(REF)).thenReturn(refData("{\"specQuotas\":{\"性别: 雌性\":3}}"));
        when(line.listCycleUsage(REF, SPEC, CYCLE)).thenReturn(List.of(usage(8, "APPROVED")));

        assertEquals(-5, service(line, data).availableQty(REF, SPEC, CYCLE));
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
