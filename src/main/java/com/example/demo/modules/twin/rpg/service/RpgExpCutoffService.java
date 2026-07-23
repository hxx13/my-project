package com.example.demo.modules.twin.rpg.service;

import com.example.demo.modules.twin.rpg.config.RpgExpCutoffProperties;
import org.springframework.stereotype.Service;

import java.time.LocalDate;

/** 经验计算截止日期查询（逻辑见 {@link RpgExpCutoffProperties}）。 */
@Service
public class RpgExpCutoffService {

    private final RpgExpCutoffProperties properties;

    public RpgExpCutoffService(RpgExpCutoffProperties properties) {
        this.properties = properties;
    }

    public String cutoffStartForQuery() {
        return properties.cutoffStartForQuery();
    }

    public LocalDate cutoffDate() {
        return properties.cutoffDate();
    }

    public boolean isOnOrAfterCutoff(LocalDate date) {
        return properties.isOnOrAfterCutoff(date);
    }
}
