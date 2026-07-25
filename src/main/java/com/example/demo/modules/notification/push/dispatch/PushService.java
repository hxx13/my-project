package com.example.demo.modules.notification.push.dispatch;

import com.example.demo.modules.notification.push.dto.PushRequest;
import org.springframework.stereotype.Service;

import java.util.Map;
import java.util.Set;

@Service
public class PushService {

    private final PushDispatchEngine engine;

    public PushService(PushDispatchEngine engine) {
        this.engine = engine;
    }

    public void send(String sourceCode, Map<String, String> variables) {
        engine.dispatch(sourceCode, variables, null);
    }

    public void send(String sourceCode, Map<String, String> variables, Set<String> targetUserIds) {
        engine.dispatch(sourceCode, variables, targetUserIds);
    }

    public void send(PushRequest request) {
        engine.dispatch(request.getSourceCode(), request.getVariables(), request.getTargetUserIds());
    }
}
