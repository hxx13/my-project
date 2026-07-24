package com.example.demo.modules.site.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Data;

import java.util.ArrayList;
import java.util.List;

/** 登录页 / 首页轮播配置（sys_site_config.login_branding JSON） */
@Data
public class LoginBrandingVo {
    /** 兼容旧版：等同 heroImageUrlsLight */
    private List<String> heroImageUrls = new ArrayList<>();
    private List<String> heroImageUrlsLight = new ArrayList<>();
    private List<String> heroImageUrlsDark = new ArrayList<>();
    private int intervalSec = 8;
    private boolean heroCarouselEnabled = true;

    /** 公开 GET 接口填充：小程序可直接用的绝对 URL，不写入库 */
    @JsonInclude(JsonInclude.Include.NON_EMPTY)
    private List<String> heroImageUrlsLightDisplay = new ArrayList<>();
    @JsonInclude(JsonInclude.Include.NON_EMPTY)
    private List<String> heroImageUrlsDarkDisplay = new ArrayList<>();
}
