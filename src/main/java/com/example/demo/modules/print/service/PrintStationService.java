package com.example.demo.modules.print.service;

import com.example.demo.modules.print.entity.PrintStation;
import com.example.demo.modules.print.mapper.PrintStationMapper;
import org.springframework.stereotype.Service;

import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/** 打印工位 CRUD。KIOSK 工位绑一个专用账号且不可重复绑定；SERVER 直发工位没有账号。 */
@Service
public class PrintStationService {

    private final PrintStationMapper mapper;

    public PrintStationService(PrintStationMapper mapper) {
        this.mapper = mapper;
    }

    public List<PrintStation> listAll() {
        return mapper.listAll();
    }

    public List<PrintStation> listEnabled() {
        return mapper.listEnabled();
    }

    public Optional<PrintStation> findById(String id) {
        return mapper.findById(id);
    }

    /** 按当前登录账号反查它是不是某个工位。工位侧接口的鉴权全靠它。 */
    public Optional<PrintStation> findByUserId(String userId) {
        if (userId == null || userId.isBlank()) return Optional.empty();
        return mapper.findByUserId(userId.trim());
    }

    public PrintStation create(PrintStation body, String operatorId) {
        if (body.getName() == null || body.getName().isBlank()) {
            throw new IllegalArgumentException("工位名不能为空");
        }
        String mode = normalizeMode(body.getMode());
        if (PrintStation.MODE_SERVER.equals(mode)) {
            requirePrinterIp(body.getPrinterIp());
        }
        PrintStation s = new PrintStation();
        s.setId("PS_" + UUID.randomUUID().toString().replace("-", ""));
        s.setName(body.getName().trim());
        s.setMode(mode);
        s.setUserId(PrintStation.MODE_SERVER.equals(mode) ? null : requireFreeAccount(body.getUserId(), null));
        s.setPageSize(blankToNull(body.getPageSize()));
        s.setSupportedTypes(normalizeTypes(body.getSupportedTypes()));
        s.setPrinterIp(blankToNull(body.getPrinterIp()));
        s.setEnabled(true);
        s.setCreatedBy(operatorId);
        mapper.insert(s);
        return s;
    }

    public PrintStation update(String id, PrintStation body) {
        PrintStation s = mapper.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("工位不存在"));
        if (body.getName() != null && !body.getName().isBlank()) {
            s.setName(body.getName().trim());
        }
        String mode = normalizeMode(body.getMode());
        s.setMode(mode);
        if (PrintStation.MODE_SERVER.equals(mode)) {
            requirePrinterIp(body.getPrinterIp());
            // 切到直发就把专用账号让出来，否则那个账号被一个根本不需要它的工位占着
            s.setUserId(null);
        } else {
            s.setUserId(requireFreeAccount(body.getUserId(), id));
        }
        s.setPageSize(blankToNull(body.getPageSize()));
        s.setSupportedTypes(normalizeTypes(body.getSupportedTypes()));
        s.setPrinterIp(blankToNull(body.getPrinterIp()));
        s.setEnabled(body.isEnabled());
        mapper.update(s);
        return s;
    }

    /** 直发工位的 printer_ip 是投递目标，不是备注 —— 空了这个工位建出来就是死的。 */
    private static void requirePrinterIp(String ip) {
        if (ip == null || ip.isBlank()) {
            throw new IllegalArgumentException("直发工位必须填打印机 IP（它就是投递目标）");
        }
    }

    /**
     * 校验并返回可用的专用账号。只有 KIOSK 工位需要一个账号登录工位页，
     * 直发工位由后端执行，没有"谁登录"这回事。
     *
     * @param selfId 编辑时是自己，撞到自己不算重复绑定
     */
    private String requireFreeAccount(String rawUserId, String selfId) {
        if (rawUserId == null || rawUserId.isBlank()) {
            throw new IllegalArgumentException("必须指定打印者账号");
        }
        String uid = rawUserId.trim();
        Optional<PrintStation> other = mapper.findByUserId(uid);
        if (other.isPresent() && !other.get().getId().equals(selfId)) {
            throw new IllegalArgumentException("该账号已经绑定了另一个工位");
        }
        return uid;
    }

    public void delete(String id) {
        if (mapper.deleteById(id) == 0) {
            throw new IllegalArgumentException("工位不存在");
        }
    }

    private static String blankToNull(String v) {
        return v == null || v.isBlank() ? null : v.trim();
    }

    /**
     * 归一化执行方式。认不出的值一律归 KIOSK —— 与 supportedTypes 同源的处理，
     * 不给脏值留后门（KIOSK 是存量行为，兜底到它不会改变任何已有工位的表现）。
     */
    private static String normalizeMode(String v) {
        if (v == null || v.isBlank()) return PrintStation.MODE_KIOSK;
        return PrintStation.MODE_SERVER.equalsIgnoreCase(v.trim())
                ? PrintStation.MODE_SERVER : PrintStation.MODE_KIOSK;
    }

    /** 支持的文件类型分组 —— 与前端 FILE_GROUPS 一一对应，改一处要改两处。 */
    private static final Set<String> KNOWN_TYPES = Set.of("pdf", "image", "word", "excel", "ppt");

    /**
     * 归一化「支持的文件类型」。
     *
     * 只保留认识的分组，认不出的丢掉；**空串折成 null（= 全支持）** ——
     * 存量工位不配这一项，行为与改动前一致。全部勾掉等于什么都没配，也按全支持处理，
     * 否则一个手滑就把工位配成"什么都打不了"且界面上看不出来。
     */
    private static String normalizeTypes(String v) {
        if (v == null || v.isBlank()) return null;
        String joined = Arrays.stream(v.split(","))
                .map(String::trim)
                .map(s -> s.toLowerCase(Locale.ROOT))
                .filter(KNOWN_TYPES::contains)
                .distinct()
                .collect(Collectors.joining(","));
        return joined.isEmpty() ? null : joined;
    }
}
