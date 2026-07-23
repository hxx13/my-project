package com.example.demo.modules.mp.dto;

import lombok.Data;

@Data
public class MiniProgramReleaseUpsertRequest {
    private String versionCode;
    private String title;
    private String summary;
    private String bodyHtml;
    /** 是否作为打开小程序时的首屏公告（服务端会把其它记录此项清零） */
    private Boolean showOnLaunch;
}
