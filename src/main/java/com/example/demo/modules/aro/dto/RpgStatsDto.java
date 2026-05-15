package com.example.demo.modules.aro.dto;

import lombok.Data;

@Data
public class RpgStatsDto {
    private Integer level;          // 当前等级
    private Double exp;             // 当前经验值 (支持 0.05 小数)
    private Double nextLevelExp;    // 升级所需总经验

    // 用于离开结算时，告诉前端“本次打卡加了多少分”
    private Double sessionExpAdded;

    // 💥 这就是你问的那个“函数”：它是构造函数（打包机）
    public RpgStatsDto(Integer level, Double exp, Double nextLevelExp) {
        this.level = level;
        this.exp = exp;
        this.nextLevelExp = nextLevelExp;
        this.sessionExpAdded = 0.0; // 默认本次新增为0
    }
}