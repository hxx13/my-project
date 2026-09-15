package com.example.demo.modules.print.service;

import com.example.demo.modules.print.entity.PrintStation;
import com.example.demo.modules.print.mapper.PrintStationMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.util.List;

/**
 * 后端直发（SERVER）工位的打印机端口探测。
 *
 * KIOSK 工位看工位页心跳（{@link PrintStationHealthService#touch}），
 * SERVER 工位没有常开电脑，只能后端自己探打印机还活着没有。
 *
 * 为什么不查 lpstat：CUPS 对 socket:// 后端不做持续探测，打印机断电了照样报 idle，
 * 直到真派一单才发现。TCP 连 9100 才是「此刻能不能收活」的真实答案。
 *
 * 探测结果写 printer_online + printer_checked_at。checked_at 无论通不通都写 ——
 * 健康判定靠它的新鲜度区分「探测任务挂了」和「打印机不通」，漏写会让两台都判成 OFFLINE。
 */
@Component
public class PrinterReachabilityProbe {

    private static final Logger log = LoggerFactory.getLogger(PrinterReachabilityProbe.class);

    /** 打印机原始打印端口（RAW / 9100）。 */
    private static final int PORT = 9100;

    /** 连接超时。一台不可达的机器不能把这一轮卡住。 */
    private static final int CONNECT_TIMEOUT_MS = 3000;

    private final PrintStationMapper printStationMapper;
    private final JdbcTemplate jdbc;

    public PrinterReachabilityProbe(PrintStationMapper printStationMapper, JdbcTemplate jdbc) {
        this.printStationMapper = printStationMapper;
        this.jdbc = jdbc;
    }

    @Scheduled(fixedDelayString = "${app.print.probe-ms:60000}")
    public void probe() {
        try {
            List<PrintStation> stations = printStationMapper.listEnabled();
            int probed = 0;
            int online = 0;
            for (PrintStation s : stations) {
                if (!PrintStation.MODE_SERVER.equals(s.getMode())) {
                    continue;
                }
                try {
                    boolean reachable = probeHost(s.getPrinterIp());
                    jdbc.update("UPDATE print_station SET printer_online = ?, printer_checked_at = NOW() WHERE id = ?",
                            reachable ? 1 : 0, s.getId());
                    probed++;
                    if (reachable) {
                        online++;
                    }
                } catch (Exception e) {
                    // 逐台兜住：单台的写库或解析异常不能拖垮后面几台
                    log.warn("[print] 工位 {} 打印机探测写回失败: {}", s.getId(), e.getMessage());
                }
            }
            if (probed > 0) {
                log.info("[print] 打印机探测完成：SERVER 工位 {} 台，可达 {} 台", probed, online);
            }
        } catch (Exception e) {
            // 整轮兜底：后台任务抛出去没人接
            log.warn("[print] 打印机探测失败: {}", e.getMessage());
        }
    }

    /** 连得上 9100 = 在线。null / 空 / 格式不对一律判不通，不抛。 */
    private boolean probeHost(String host) {
        if (host == null || host.trim().isEmpty()) {
            return false;
        }
        try (Socket s = new Socket()) {
            s.connect(new InetSocketAddress(host.trim(), PORT), CONNECT_TIMEOUT_MS);
            return true;
        } catch (IOException e) {
            // ConnectException / SocketTimeoutException / UnknownHostException 都是它的子类，
            // 一个 IOException 就全覆盖；多 catch 里同时写父类和子类编译不过。
            return false;
        }
    }
}
