package com.example.demo.modules.mp.dto;

import lombok.Data;

@Data
public class MiniProgramReleaseView {
    private String id;
    private String versionCode;
    private String title;
    private String summary;
    private String bodyHtml;
    /** yyyy-MM-dd HH:mm */
    private String publishedAtText;
    private Integer showOnLaunch;
}
