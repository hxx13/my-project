package com.example.demo.modules.animalorder.service;

import com.example.demo.modules.cageshelf.service.CageInfoValueService;
import com.example.demo.modules.referencedata.entity.CageOrderReservation;
import com.example.demo.modules.referencedata.mapper.CageOrderReservationMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Set;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 孤儿预定释放必须同时撤掉预填进笼位表单的值。
 *
 * <p>预定会把「实验员 = 预定人」等字段写进笼位（written_json 记账）。其他三条释放路径都调
 * {@code clearWrittenFields}，唯独启动清孤儿这条漏了，结果空笼位永远挂着上一个预定人的名字。
 */
class CageOrderReservationOrphanReleaseTest {

    private static CageOrderReservationService serviceWith(CageOrderReservationMapper mapper,
                                                           CageInfoValueService infoValue) {
        // 只用得到 mapper / infoValue / objectMapper，其余协作者给 null 即可
        return new CageOrderReservationService(
                null, null, null, null, null, null, null, null,
                infoValue, null, mapper, null, null, null, null, new ObjectMapper());
    }

    @Test
    void 清孤儿_按written_json撤销预填字段() {
        CageOrderReservationMapper mapper = mock(CageOrderReservationMapper.class);
        CageInfoValueService infoValue = mock(CageInfoValueService.class);
        CageOrderReservation orphan = new CageOrderReservation();
        orphan.setAnimalCageId(7L);
        orphan.setWrittenJson("{\"experimenter_name\":\"林安顺\",\"animal_strain_name\":\"C57BL/6\"}");
        when(mapper.listOrphans()).thenReturn(List.of(orphan));

        serviceWith(mapper, infoValue).releaseOrphans();

        verify(infoValue).clearByCanonicals(eq(7L), eq(Set.of("experimenter_name", "animal_strain_name")),
                eq("UPDATE"), eq("ORDER_RELEASE"));
        verify(mapper).releaseOrphans("购物车行已不存在，自动释放");
    }

    @Test
    void 清孤儿_没有written_json时不撤字段但照样释放() {
        CageOrderReservationMapper mapper = mock(CageOrderReservationMapper.class);
        CageInfoValueService infoValue = mock(CageInfoValueService.class);
        CageOrderReservation orphan = new CageOrderReservation();
        orphan.setAnimalCageId(8L);
        when(mapper.listOrphans()).thenReturn(List.of(orphan));

        serviceWith(mapper, infoValue).releaseOrphans();

        verify(infoValue, never()).clearByCanonicals(anyLong(), any(), anyString(), anyString());
        verify(mapper).releaseOrphans("购物车行已不存在，自动释放");
    }
}
