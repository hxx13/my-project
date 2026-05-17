package com.example.demo.modules.twin.support;

import com.example.demo.modules.roommapping.entity.RoomMappingRoom;
import org.springframework.util.StringUtils;

/**
 * 根据 ARO 房间库（room_mapping_room）与展示名解析校区：浦东 / 浦西。
 */
public final class ScanCampusTagResolver {

    private ScanCampusTagResolver() {
    }

    public static String resolve(RoomMappingRoom catalogRow, String displayName) {
        if (catalogRow != null && StringUtils.hasText(catalogRow.getRegionName())) {
            String rn = catalogRow.getRegionName().trim();
            if (rn.contains("浦东")) {
                return "浦东";
            }
            if (rn.contains("浦西")) {
                return "浦西";
            }
        }
        return resolveFromText(displayName);
    }

    public static String resolveFromText(String text) {
        if (!StringUtils.hasText(text)) {
            return "";
        }
        String s = text.trim();
        if (s.contains("浦东")) {
            return "浦东";
        }
        if (s.contains("浦西")) {
            return "浦西";
        }
        return "";
    }
}
