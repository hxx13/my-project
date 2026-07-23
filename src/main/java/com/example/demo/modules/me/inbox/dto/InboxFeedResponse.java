package com.example.demo.modules.me.inbox.dto;

import lombok.Data;

import java.util.ArrayList;
import java.util.List;

@Data
public class InboxFeedResponse {
    private List<InboxItemDto> items = new ArrayList<>();
    /** 下一页传入 beforeMillis */
    private Long nextBeforeMillis;
}
