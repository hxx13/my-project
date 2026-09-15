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

/** 打印工位 CRUD。一工位绑一个专用账号，账号不可重复绑定。 */
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
        if (body.getUserId() == null || body.getUserId().isBlank()) {
            throw new IllegalArgumentException("必须指定打印者账号");
        }
        String uid = body.getUserId().trim();
        if (mapper.findByUserId(uid).isPresent()) {
            throw new IllegalArgumentException("该账号已经绑定了另一个工位");
        }
        PrintStation s = new PrintStation();
        s.setId("PS_" + UUID.randomUUID().toString().replace("-", ""));
        s.setName(body.getName().trim());
        s.setUserId(uid);
        s.setPageSize(blankToNull(body.getPageSize()));
        s.setSupportedTypes(normalizeTypes(body.getSupportedTypes()));
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
        if (body.getUserId() != null && !body.getUserId().isBlank()) {
            String uid = body.getUserId().trim();
            Optional<PrintStation> other = mapper.findByUserId(uid);
            if (other.isPresent() && !other.get().getId().equals(id)) {
                throw new IllegalArgumentException("该账号已经绑定了另一个工位");
            }
            s.setUserId(uid);
        }
        s.setPageSize(blankToNull(body.getPageSize()));
        s.setSupportedTypes(normalizeTypes(body.getSupportedTypes()));
        s.setEnabled(body.isEnabled());
        mapper.update(s);
        return s;
    }

    public void delete(String id) {
        if (mapper.deleteById(id) == 0) {
            throw new IllegalArgumentException("工位不存在");
        }
    }

    private static String blankToNull(String v) {
        return v == null || v.isBlank() ? null : v.trim();
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
