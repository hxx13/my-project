package com.example.demo.modules.remotescreen.service;

import com.corundumstudio.socketio.SocketIOClient;
import com.corundumstudio.socketio.SocketIOServer;
import com.example.demo.common.config.JwtTokenService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.remotescreen.service.RemoteScreenRegistry.Entry;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.net.InetSocketAddress;
import java.net.SocketAddress;
import java.util.Map;
import java.util.UUID;

/**
 * 网页屏幕的实时控制通道（Socket.IO）。
 *
 * <p>协议（事件名即契约，网页端在 {@code useRemoteScreenControl} 里对接）：
 * <ul>
 *   <li>客户端 → 服务端 {@code SCREEN_HELLO}：{screenId, label, route, title}，连上就报一次</li>
 *   <li>客户端 → 服务端 {@code SCREEN_STATE}：{screenId, route, title}，换页时刷新</li>
 *   <li>服务端 → 客户端 {@code SCREEN_NAVIGATE}：{route}，让它跳到指定页面</li>
 * </ul>
 *
 * <p>为什么用实时通道而不是让网页轮询：屏幕上「现在在哪一页」要能立刻看到，指令也要立刻到。
 */
@Component
public class RemoteScreenSocketService {

    private static final Logger log = LoggerFactory.getLogger(RemoteScreenSocketService.class);

    public static final String EVENT_HELLO = "SCREEN_HELLO";
    public static final String EVENT_STATE = "SCREEN_STATE";
    public static final String EVENT_NAVIGATE = "SCREEN_NAVIGATE";
    /** 服务端 → 客户端：名称被改过，回写本地，重连时沿用 */
    public static final String EVENT_LABEL = "SCREEN_LABEL";
    /** 服务端 → 客户端：配对码（页面角落显示，手机上输入它来配对） */
    public static final String EVENT_CODE = "SCREEN_CODE";

    private final SocketIOServer server;
    private final RemoteScreenRegistry registry;
    private final JwtTokenService jwtTokenService;

    public RemoteScreenSocketService(SocketIOServer server,
                                     RemoteScreenRegistry registry,
                                     JwtTokenService jwtTokenService) {
        this.server = server;
        this.registry = registry;
        this.jwtTokenService = jwtTokenService;
    }

    @PostConstruct
    public void register() {
        server.addEventListener(EVENT_HELLO, Map.class, (client, data, ack) -> {
            Map<?, ?> m = (Map<?, ?>) data;
            Entry e = registry.register(
                    str(m.get("screenId")),
                    ownerOf(client),
                    str(m.get("label")),
                    str(m.get("route")),
                    str(m.get("title")),
                    ipOf(client),
                    client.getSessionId());
            if (e != null) {
                log.info("[屏幕] 上线 {} 「{}」 route={} ip={} owner={} code={}",
                        e.screenId, e.label, e.route, e.ip, e.ownerUserId, e.code);
                // 把配对码回给页面自己，让它显示在角落
                client.sendEvent(EVENT_CODE, Map.of("code", e.code));
            }
        });

        server.addEventListener(EVENT_STATE, Map.class, (client, data, ack) -> {
            Map<?, ?> m = (Map<?, ?>) data;
            registry.updateState(str(m.get("screenId")), str(m.get("route")), str(m.get("title")));
        });

        server.addDisconnectListener(client -> {
            registry.unregisterSession(client.getSessionId());
            log.info("[屏幕] 下线 session={}", client.getSessionId());
        });
    }

    /**
     * 让某个屏幕跳到指定路由。
     *
     * @param pairingCode 可选：凭配对码操作**不属于本账号**的展示页；为空则按同账号校验
     * @return true = 指令已下发；false = 不在线、不是本账号、且码也不对
     */
    public boolean navigate(String screenId, String route, String ownerUserId, String pairingCode) {
        return send(screenId, ownerUserId, pairingCode, EVENT_NAVIGATE, Map.of("route", route),
                "下发导航 " + route);
    }

    /** 改名后把新名字回写给那台屏幕，让它存到本地，重连时沿用。 */
    public void pushLabel(String screenId, String ownerUserId, String pairingCode, String label) {
        send(screenId, ownerUserId, pairingCode, EVENT_LABEL, Map.of("label", label), "回写名称「" + label + "」");
    }

    /** 校验：同账号，或用对了配对码。 */
    public boolean canControl(String screenId, String ownerUserId, String pairingCode) {
        Entry e = registry.get(screenId);
        if (e == null) {
            return false;
        }
        if (ownerUserId != null && ownerUserId.equals(e.ownerUserId)) {
            return true;
        }
        return pairingCode != null && !pairingCode.isBlank() && e.code != null
                && e.code.equalsIgnoreCase(pairingCode.trim());
    }

    private boolean send(String screenId, String ownerUserId, String pairingCode,
                         String event, Map<String, Object> payload, String desc) {
        Entry e = registry.get(screenId);
        if (e == null || e.sessionId == null) {
            return false;
        }
        boolean allowed = (ownerUserId != null && ownerUserId.equals(e.ownerUserId))
                || (pairingCode != null && !pairingCode.isBlank() && e.code != null
                    && e.code.equalsIgnoreCase(pairingCode.trim()));
        if (!allowed) {
            return false;
        }
        SocketIOClient client = server.getClient(e.sessionId);
        if (client == null || !client.isChannelOpen()) {
            registry.unregisterSession(e.sessionId);
            return false;
        }
        client.sendEvent(event, payload);
        log.info("[屏幕] {} {}「{}」", desc, e.screenId, e.label);
        return true;
    }

    /** 这条连接是哪个账号登录的 —— 远程控制只允许同账号。 */
    private String ownerOf(SocketIOClient client) {
        try {
            String token = client.getHandshakeData().getSingleUrlParam("token");
            if (token == null || token.isBlank()) {
                return "";
            }
            User u = jwtTokenService.validateTokenAndResolveUser(token.trim());
            return u == null || u.getId() == null ? "" : u.getId();
        } catch (Exception e) {
            log.warn("[屏幕] 解析登录账号失败: {}", e.getMessage());
            return "";
        }
    }

    private static String ipOf(SocketIOClient client) {
        try {
            SocketAddress addr = client.getRemoteAddress();
            if (addr instanceof InetSocketAddress isa) {
                return isa.getAddress() == null ? "" : isa.getAddress().getHostAddress();
            }
            return addr == null ? "" : addr.toString();
        } catch (Exception ignored) {
            return "";
        }
    }

    private static String str(Object o) {
        return o == null ? null : String.valueOf(o);
    }
}
