package com.example.demo.modules.auth.dto;

import lombok.Data;

@Data
public class UpdateDisplayNicknameRequest {
    /** 空串或 null 表示清空昵称，回退为账号名 */
    private String displayNickname;
}
