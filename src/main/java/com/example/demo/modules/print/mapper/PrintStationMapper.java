package com.example.demo.modules.print.mapper;

import com.example.demo.modules.print.entity.PrintStation;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

/**
 * 打印工位读写。
 *
 * 刻意不与 sys_user 联表：print_station 是本次新建的表（落在 0900_ai_ci 一拨），
 * sys_user 是老表（unicode_ci），跨拨列对列比较会抛 1267。
 * 反查账号一律用字面量比较，绕开排序规则分拨。
 */
@Repository
public class PrintStationMapper {

    private static final String COLS =
            "id, name, user_id, page_size, supported_types, printer_ip, enabled, created_by, created_at";

    private final JdbcTemplate jdbc;

    public PrintStationMapper(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    private static final RowMapper<PrintStation> ROW = (rs, i) -> {
        PrintStation s = new PrintStation();
        s.setId(rs.getString("id"));
        s.setName(rs.getString("name"));
        s.setUserId(rs.getString("user_id"));
        s.setPageSize(rs.getString("page_size"));
        s.setSupportedTypes(rs.getString("supported_types"));
        s.setPrinterIp(rs.getString("printer_ip"));
        s.setEnabled(rs.getBoolean("enabled"));
        s.setCreatedBy(rs.getString("created_by"));
        s.setCreatedAt(String.valueOf(rs.getTimestamp("created_at")));
        return s;
    };

    public void insert(PrintStation s) {
        jdbc.update("INSERT INTO print_station(" + COLS + ") VALUES(?,?,?,?,?,?,?,?,NOW())",
                s.getId(), s.getName(), s.getUserId(), s.getPageSize(), s.getSupportedTypes(),
                s.getPrinterIp(), s.isEnabled() ? 1 : 0, s.getCreatedBy());
    }

    public void update(PrintStation s) {
        jdbc.update("UPDATE print_station SET name=?, user_id=?, page_size=?, supported_types=?, printer_ip=?, enabled=? WHERE id=?",
                s.getName(), s.getUserId(), s.getPageSize(), s.getSupportedTypes(),
                s.getPrinterIp(), s.isEnabled() ? 1 : 0, s.getId());
    }

    public int deleteById(String id) {
        return jdbc.update("DELETE FROM print_station WHERE id = ?", id);
    }

    public List<PrintStation> listAll() {
        return jdbc.query("SELECT " + COLS + " FROM print_station ORDER BY created_at DESC", ROW);
    }

    public List<PrintStation> listEnabled() {
        return jdbc.query("SELECT " + COLS + " FROM print_station WHERE enabled = 1 ORDER BY name", ROW);
    }

    public Optional<PrintStation> findById(String id) {
        List<PrintStation> r = jdbc.query(
                "SELECT " + COLS + " FROM print_station WHERE id = ? LIMIT 1", ROW, id);
        return r.isEmpty() ? Optional.empty() : Optional.of(r.get(0));
    }

    /** 按账号反查工位。字面量比较，不联表。 */
    public Optional<PrintStation> findByUserId(String userId) {
        List<PrintStation> r = jdbc.query(
                "SELECT " + COLS + " FROM print_station WHERE user_id = ? LIMIT 1", ROW, userId);
        return r.isEmpty() ? Optional.empty() : Optional.of(r.get(0));
    }
}
