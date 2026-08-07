package com.example.demo.modules.site.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Data;

import java.util.ArrayList;
import java.util.List;

/** 门户页脚配置（sys_site_config.portal_footer JSON） */
@Data
public class PortalFooterVo {

    private ContactInfo contact = new ContactInfo();

    private List<FooterGroup> groups = new ArrayList<>();

    @Data
    public static class ContactInfo {
        private String phone = "";
        private String email = "";
        private String address = "";
        private String workHours = "";
    }

    @Data
    public static class FooterGroup {
        private String id = "";
        private String group = "";
        private int sortOrder = 0;
        private List<FooterLink> items = new ArrayList<>();
    }

    @Data
    public static class FooterLink {
        private String label = "";
        private String url = "";
        private boolean requiresAuth = false;
        private int sortOrder = 0;
    }
}
