package com.example.demo.modules.ai.shot;

import com.example.demo.common.config.JwtTokenService;
import com.example.demo.modules.auth.dto.AuthUserInfo;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.auth.service.AuthService;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.microsoft.playwright.Browser;
import com.microsoft.playwright.BrowserContext;
import com.microsoft.playwright.Page;
import com.microsoft.playwright.Playwright;
import com.microsoft.playwright.PlaywrightException;
import com.microsoft.playwright.options.WaitUntilState;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;

/**
 * 页面截图的后端生产者 —— **服务端自己开一个无头浏览器**去渲染网页版，把 PNG 交回来。
 *
 * <p>为什么需要它（两条理由，缺一条它就不值得存在）：
 * <ol>
 *   <li><b>小程序根本没有截自己原生界面的 API</b>。那边要「看一眼某个页面」，只能由后端渲染
 *       网页版再把图回传；</li>
 *   <li><b>无人值守时没有载体浏览器可借</b>（AI 定时器）。</li>
 * </ol>
 * 网页端不走这里：那边由提问者自己的浏览器当场截（更快、不用装浏览器），见 {@code AiEventSink#image}。
 *
 * <h3>五条实测得来的约束，改这个类之前先读</h3>
 * <ol>
 *   <li><b>登录态要三个键一起复刻</b>（token / role / 用户信息）。只塞 token 时前端
 *       {@code isStudentAccount()} 读不到缓存里的用户信息，会把**任何人判成学生**、落进学生端 ——
 *       截出来就是「另一个人看到的页面」。</li>
 *   <li><b>直接深链会被启动重定向冲掉</b>，要再补一次客户端 hash 跳转（与用户点菜单同一条路）。</li>
 *   <li><b>不能用「网络空闲」当判据</b>：本应用有常驻通知流（SSE/WebSocket），网络**永远不会空闲**，
 *       实测直接 30 秒超时。只盯 fetch/XHR 的静默，长连接不计入。</li>
 *   <li><b>必须校验落点</b>。落错页面是最坏的失败 —— 用户看到别人的页面却以为是自己的。
 *       落点对不上就抛错，不截。</li>
 *   <li><b>球球本体是页面的一部分</b>（真实浏览器渲染整页），截图前用 CSS 把它藏掉。</li>
 * </ol>
 */
@Service
public class PageScreenshotService {

    private static final Logger log = LoggerFactory.getLogger(PageScreenshotService.class);

    private static final ObjectMapper M = new ObjectMapper();

    /** 桌面视口。截图是给「看这个页面长什么样」用的，按桌面宽度渲染信息量最大。 */
    private static final int VIEWPORT_W = 1440;
    private static final int VIEWPORT_H = 900;

    /** 请求静默多久算「这一页画完了」。太短会截到半成品，太长白等。 */
    private static final int QUIET_MS = 800;
    /** 等路由落位与等静默的上限。 */
    private static final int ROUTE_TIMEOUT_MS = 15000;
    private static final int QUIET_TIMEOUT_MS = 20000;

    /** 短令牌有效期：刚好够截一张图，不留给任何人复用的窗口。 */
    private static final Duration TOKEN_TTL = Duration.ofMinutes(3);

    private final JwtTokenService jwtTokenService;
    private final AuthService authService;

    @Value("${app.screenshot.enabled:true}")
    private boolean enabled;
    /**
     * 被截的那个站点根地址。生产上前端就由本应用自己发（与后端同端口），所以默认指向本机；
     * 开发态前端在 Vite 上，要单独指过去。
     */
    @Value("${app.screenshot.base-url:http://localhost:8081}")
    private String baseUrl;

    /**
     * 并发闸。无头浏览器每个上下文几百 MB，`per-request 起一个浏览器`会把生产机打爆 ——
     * 这是**唯一**必须限流的地方，别拿掉。
     */
    private final Semaphore slots = new Semaphore(2);

    private final Object lock = new Object();
    private Playwright playwright;
    private Browser browser;

    public PageScreenshotService(JwtTokenService jwtTokenService, AuthService authService) {
        this.jwtTokenService = jwtTokenService;
        this.authService = authService;
    }

    /** 浏览器没装/起不来时抛这个，调用方据此给用户一句人话，而不是把栈丢出去。 */
    public static class UnavailableException extends RuntimeException {
        public UnavailableException(String message, Throwable cause) {
            super(message, cause);
        }

        public UnavailableException(String message) {
            super(message);
        }
    }

    /**
     * 容器关闭时把浏览器和驱动收干净。
     *
     * <p><b>不加这段会连累构建</b>：`@SpringBootTest` 会把整个应用（含这里的预热）启起来，
     * 而 Playwright 起的是**真进程**（Node 驱动 + Chromium）—— 不显式关，测试 JVM 结束后
     * 这些进程被遗弃，`mvnw test` 看着就像卡死（实测踩到，还留下 3 个 chrome-headless-shell）。
     */
    @PreDestroy
    public void shutdown() {
        try {
            if (browser != null) {
                browser.close();
            }
        } catch (RuntimeException ignored) {
            // 关不掉就交给进程回收
        }
        try {
            if (playwright != null) {
                playwright.close();
            }
        } catch (RuntimeException ignored) {
            // 同上
        }
        browser = null;
        playwright = null;
    }

    /**
     * 预热：`Playwright.create()` 冷启动要好几秒（首次甚至要下驱动），
     * 不能让第一个提问的人干等。**失败只记日志**，不能拖垮启动 —— 这个能力缺失时整个应用照常跑。
     */
    @EventListener(ApplicationReadyEvent.class)
    public void warmUp() {
        if (!enabled) {
            return;
        }
        Thread t = new Thread(() -> {
            try {
                browser();
                log.info("[page-shot] 无头浏览器已就绪");
            } catch (RuntimeException e) {
                log.warn("[page-shot] 无头浏览器预热失败，页面截图暂不可用：{}", e.getMessage());
            }
        }, "page-shot-warmup");
        t.setDaemon(true);
        t.start();
    }

    /** 截一个后台页面。成功返回 PNG 字节；不可用时抛 {@link UnavailableException}。 */
    public byte[] shoot(User user, String webPath) {
        if (!enabled) {
            throw new UnavailableException("页面截图功能未启用");
        }
        if (user == null || webPath == null || webPath.isBlank()) {
            throw new UnavailableException("缺少截图所需的身份或页面");
        }
        String route = toConsoleRoute(webPath);
        if (route == null) {
            throw new UnavailableException("这个页面不支持后端渲染");
        }

        boolean acquired;
        try {
            acquired = slots.tryAcquire(15, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new UnavailableException("截图排队被中断");
        }
        if (!acquired) {
            throw new UnavailableException("截图任务排队过久，稍后再试");
        }
        try {
            return render(user, route);
        } finally {
            slots.release();
        }
    }

    private byte[] render(User user, String route) {
        // 与登录同口径：先合并两个 id 的最高角色，否则令牌里的角色会和这份用户信息对不上
        jwtTokenService.resolveUnifiedRole(user);
        String token = jwtTokenService.generateShortLivedToken(user, TOKEN_TTL);
        AuthUserInfo info = authService.buildUserInfo(user);

        Browser b = browser();
        BrowserContext ctx = null;
        try {
            ctx = b.newContext(new Browser.NewContextOptions()
                    .setViewportSize(VIEWPORT_W, VIEWPORT_H)
                    // 密集表格按 2 倍出图才看得清；代价是文件大一点，可接受
                    .setDeviceScaleFactor(2));

            // ① 登录态三件套（约束 1）
            String seed = "try{"
                    + "localStorage.setItem('auth_token'," + js(token) + ");"
                    + "localStorage.setItem('auth_role'," + js(String.valueOf(info.getRole())) + ");"
                    + "localStorage.setItem('auth_user_info'," + js(M.writeValueAsString(info)) + ");"
                    + "}catch(e){}";
            ctx.addInitScript(seed);

            // ② 请求静默追踪器必须**先于页面脚本**装上，否则首屏那批请求不计数，会误判成已静默（约束 3）
            ctx.addInitScript("() => {"
                    + " window.__inflight = 0; window.__quietSince = null;"
                    + " const of = window.fetch;"
                    + " window.fetch = function(){ window.__inflight++;"
                    + "   return of.apply(this, arguments).finally(()=>{ window.__inflight--; }); };"
                    + " const ox = XMLHttpRequest.prototype.send;"
                    + " XMLHttpRequest.prototype.send = function(){ window.__inflight++;"
                    + "   this.addEventListener('loadend', ()=>{ window.__inflight--; });"
                    + "   return ox.apply(this, arguments); };"
                    + "}");

            Page page = ctx.newPage();
            page.setDefaultTimeout(ROUTE_TIMEOUT_MS);

            // ③ 一次直达目标（先根再 hash 是同文档跳转，应用会在 router 就绪前把它重置掉）
            page.navigate(baseUrl + "/#" + route, new Page.NavigateOptions()
                    .setWaitUntil(WaitUntilState.DOMCONTENTLOADED));

            // ④ 深链可能被启动重定向冲掉，补一次客户端跳转（约束 2）
            if (!page.url().contains(route)) {
                page.evaluate("() => { location.hash = '#" + route.replace("'", "") + "'; }");
            }

            // ⑤ 落点校验（约束 4）：对不上就抛，宁可不给图也不能给错图
            page.waitForFunction("location.hash && location.hash.indexOf(" + js(route) + ") >= 0",
                    null, new Page.WaitForFunctionOptions().setTimeout(ROUTE_TIMEOUT_MS));

            // ⑥ 等这一页真的画完：只盯 fetch/XHR 静默（约束 3）
            page.evaluate("() => { window.__quietSince = null; }");
            page.waitForFunction("() => {"
                            + " if (window.__inflight > 0) { window.__quietSince = null; return false; }"
                            + " if (!window.__quietSince) window.__quietSince = performance.now();"
                            + " return performance.now() - window.__quietSince > " + QUIET_MS + "; }",
                    null, new Page.WaitForFunctionOptions().setTimeout(QUIET_TIMEOUT_MS));

            // ⑦ 球球自己是页面的一部分，藏掉再截（约束 5）
            page.addStyleTag(new Page.AddStyleTagOptions()
                    .setContent(".scan-assistant-dock{display:none !important}"));

            return page.screenshot(new Page.ScreenshotOptions().setFullPage(true));
        } catch (UnavailableException e) {
            throw e;
        } catch (PlaywrightException | com.fasterxml.jackson.core.JsonProcessingException e) {
            throw new UnavailableException("页面渲染失败：" + e.getMessage(), e);
        } finally {
            if (ctx != null) {
                try {
                    ctx.close();
                } catch (RuntimeException ignored) {
                    // 关不掉不影响这一张图，交给进程回收
                }
            }
        }
    }

    /**
     * 页面清单里的规范路径 → 浏览器要访问的 console 路由。
     *
     * <p>与前端 {@code toAdminRoutePath} 同一条规则：{@code /admin/x} → {@code /console/admin/x}
     * （裸 {@code /admin/x} 会命中顶层 legacy 重定向、整页闪一下）。
     * 学生页 {@code /student/x} 本来就在顶层，不动。
     */
    private static String toConsoleRoute(String webPath) {
        String p = webPath.trim();
        if (p.startsWith("/admin") && (p.length() == 6 || p.charAt(6) == '/')) {
            return "/console" + p;
        }
        if (p.startsWith("/student/") || p.startsWith("/content-manager")) {
            return p;
        }
        return null;
    }

    /** 拿共用浏览器；没起过就起，死了就重起。 */
    private Browser browser() {
        Browser current = browser;
        if (current != null && current.isConnected()) {
            return current;
        }
        synchronized (lock) {
            if (browser != null && browser.isConnected()) {
                return browser;
            }
            try {
                if (playwright == null) {
                    playwright = Playwright.create();
                }
                browser = playwright.chromium().launch();
                return browser;
            } catch (RuntimeException e) {
                throw new UnavailableException(
                        "无头浏览器不可用（多半是还没装 Chromium，或生产机缺中文字体/系统依赖）", e);
            }
        }
    }

    private static String js(String s) {
        try {
            return M.writeValueAsString(s);
        } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
            return "\"\"";
        }
    }
}
