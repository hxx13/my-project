package com.example.demo.modules.cardprint.service;

import com.example.demo.common.exception.TwinBusinessException;
import com.example.demo.modules.cardprint.entity.CardPrintValueMap;
import com.example.demo.modules.cardprint.mapper.CardPrintValueMapMapper;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;

import java.util.List;

/** 卡牌打印字段值映射：原值 → 渲染简称。 */
@Service
public class CardPrintValueMapService {

    private final CardPrintValueMapMapper mapper;

    public CardPrintValueMapService(CardPrintValueMapMapper mapper) {
        this.mapper = mapper;
    }

    public List<CardPrintValueMap> list() {
        return mapper.selectAll();
    }

    public CardPrintValueMap save(CardPrintValueMap t, String operator) {
        validate(t);
        if (t.getSort() == null) t.setSort(0);
        try {
            if (t.getId() == null) {
                t.setCreatedBy(operator);
                mapper.insert(t);
            } else {
                if (mapper.selectById(t.getId()) == null) {
                    throw new TwinBusinessException(404, "映射不存在");
                }
                mapper.update(t);
            }
        } catch (DuplicateKeyException e) {
            throw new TwinBusinessException(400, "该字段的原值已配置");
        }
        return mapper.selectById(t.getId());
    }

    public void delete(Long id) {
        mapper.deleteById(id);
    }

    private void validate(CardPrintValueMap t) {
        if (t.getCanonical() == null || t.getCanonical().isBlank()) {
            throw new TwinBusinessException(400, "字段不能为空");
        }
        if (t.getRawValue() == null || t.getRawValue().isBlank()) {
            throw new TwinBusinessException(400, "原值不能为空");
        }
        if (t.getShortValue() == null || t.getShortValue().isBlank()) {
            throw new TwinBusinessException(400, "简称不能为空");
        }
    }
}
