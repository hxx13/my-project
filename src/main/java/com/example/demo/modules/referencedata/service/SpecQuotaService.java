package com.example.demo.modules.referencedata.service;

import com.example.demo.modules.referencedata.dto.OrderLineCycleUsage;
import com.example.demo.modules.referencedata.entity.RefData;
import com.example.demo.modules.referencedata.mapper.RefOrderLineMapper;
import com.example.demo.modules.referencedata.mapper.ReferenceDataMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.util.Map;

/**
 * 每周期库存上限：上限是配置（卡牌 fieldData 里的 {@code specQuotas} / {@code quota}），
 * 占用是**算出来的**（目标周期 = 该周期的、未作废**订单行**数量之和），不落表、也不需要重置任务。
 *
 * <p><b>购物车不占额度。</b>加购只是意向，扣减发生在提交订单那一刻 —— 用户口径：
 * 加购不该让卡片上的「剩余」掉下来，否则一个人把购物车塞满，别人就都订不了了，而其实谁都没下单。
 *
 * <p>规格键与价格完全同源：{@code specQuotas} 用与 {@code specPrices} 相同的键
 * {@code "模板名: 选项"}，即购物车行 {@code spec_selections.option} 的原始串，调用方已用
 * {@code ReferenceDataService.extractSpecOption} 取出。这样上限与价格对「哪个规格」永远不会分歧。
 */
@Service
public class SpecQuotaService {

    private final RefOrderLineMapper orderLineMapper;
    private final ReferenceDataMapper referenceDataMapper;
    private final ObjectMapper objectMapper;

    public SpecQuotaService(RefOrderLineMapper orderLineMapper,
                            ReferenceDataMapper referenceDataMapper,
                            ObjectMapper objectMapper) {
        this.orderLineMapper = orderLineMapper;
        this.referenceDataMapper = referenceDataMapper;
        this.objectMapper = objectMapper;
    }

    /**
     * 已用量 = 目标周期 = cycle 的、未作废**订单行**数量之和（不含购物车）。
     *
     * <p>周期存 NULL 的历史行一律不计入任何具体周期 —— 它们没有落到某个到货日上。
     */
    public int usedQty(Long refDataId, String specOptionLabel, LocalDate cycle) {
        int orderSide = 0;
        for (OrderLineCycleUsage u : orderLineMapper.listCycleUsage(refDataId, specOptionLabel, cycle)) {
            if (consumes(u.getOrderStatus())) {
                orderSide += u.getQuantity();
            }
        }
        return orderSide;
    }

    /** 订单未作废（非 REJECTED/CANCELLED，含 status 为 null 的旧行）才消耗配额。 */
    static boolean consumes(String orderStatus) {
        return orderStatus == null
                || (!"REJECTED".equalsIgnoreCase(orderStatus) && !"CANCELLED".equalsIgnoreCase(orderStatus));
    }

    /** 可用 = 上限 − 已用（已用只算订单）。**上限没配 → null（不可订）**，与「可用 0」是两回事。 */
    public Integer availableQty(Long refDataId, String specOptionLabel, LocalDate cycle) {
        Integer cap = resolveCap(refDataId, specOptionLabel);
        if (cap == null) {
            return null;
        }
        return cap - usedQty(refDataId, specOptionLabel, cycle);
    }

    /**
     * 某物品某规格的每周期上限：有规格模板的卡按 {@code specQuotas[模板名: 选项]} 取，
     * 无规格卡用 {@code quota}。未配 → null。
     */
    public Integer resolveCap(Long refDataId, String specOptionLabel) {
        Map<String, Object> fd = parseFieldData(referenceDataMapper.findById(refDataId));
        Object specQuotas = fd.get("specQuotas");
        if (specQuotas instanceof Map<?, ?> map && !map.isEmpty()) {
            if (!StringUtils.hasText(specOptionLabel)) {
                return null;
            }
            return toInt(map.get(specOptionLabel));
        }
        return toInt(fd.get("quota"));
    }

    private Map<String, Object> parseFieldData(RefData refData) {
        if (refData == null || !StringUtils.hasText(refData.getFieldData())) {
            return Map.of();
        }
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> fd = objectMapper.readValue(refData.getFieldData(), Map.class);
            return fd == null ? Map.of() : fd;
        } catch (Exception e) {
            return Map.of();
        }
    }

    private static Integer toInt(Object raw) {
        if (raw == null) {
            return null;
        }
        if (raw instanceof Number n) {
            return n.intValue();
        }
        String s = raw.toString().trim();
        if (s.isEmpty()) {
            return null;
        }
        try {
            return Integer.parseInt(s);
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
