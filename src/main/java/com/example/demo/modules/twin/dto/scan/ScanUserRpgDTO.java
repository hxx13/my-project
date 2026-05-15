package com.example.demo.modules.twin.dto.scan;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class ScanUserRpgDTO {
    private int exp;
    private int level;
    private int nextLevelExp;
}
