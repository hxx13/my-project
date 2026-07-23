package com.example.demo.common.dto;

import lombok.Data;

@Data
public class Result<T> {
    private Integer code;
    private String message;
    private Boolean success;
    private T data;

    public static <T> Result<T> success() {
        return success(null);
    }

    public static <T> Result<T> success(T data) {
        return success(data, "操作成功");
    }

    /** 成功但可带提示文案（例如缺表降级时的运维说明） */
    public static <T> Result<T> success(T data, String message) {
        Result<T> result = new Result<>();
        result.setCode(200);
        result.setSuccess(true);
        result.setMessage(message == null ? "操作成功" : message);
        result.setData(data);
        return result;
    }

    public static <T> Result<T> error(String message) {
        return fail(500, message);
    }

    /** 业务/全局异常统一出口（与 ErrorCodeConstants 配合） */
    public static <T> Result<T> fail(int code, String message) {
        Result<T> result = new Result<>();
        result.setCode(code);
        result.setSuccess(false);
        result.setMessage(message == null ? "操作失败" : message);
        return result;
    }
}