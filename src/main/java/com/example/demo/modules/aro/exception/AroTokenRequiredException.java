package com.example.demo.modules.aro.exception;

import com.example.demo.common.exception.ErrorCodeConstants;
import com.example.demo.common.exception.TwinBusinessException;

/**
 * ARO CAS token 缺失或过期，需要重新登录 CAS 获取 token。
 */
public class AroTokenRequiredException extends TwinBusinessException {

    public AroTokenRequiredException(String message) {
        super(ErrorCodeConstants.ARO_TOKEN_REQUIRED, message);
    }
}
