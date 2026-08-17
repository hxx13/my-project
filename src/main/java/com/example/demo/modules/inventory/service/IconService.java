package com.example.demo.modules.inventory.service;

import com.example.demo.common.dto.Result;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.inventory.dto.IconView;
import com.example.demo.modules.inventory.entity.InvUploadIcon;
import com.example.demo.modules.inventory.mapper.UploadIconMapper;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
public class IconService {

    private final UploadIconMapper uploadIconMapper;

    public IconService(UploadIconMapper uploadIconMapper) {
        this.uploadIconMapper = uploadIconMapper;
    }

    public Result<Map<String, Object>> list() {
        Map<String, Object> result = new HashMap<>();
        result.put("builtin", builtinIcons());
        result.put("uploaded", uploadIconMapper.selectAll());
        return Result.success(result);
    }

    public Result<InvUploadIcon> create(User operator, String name, String url, String mime) {
        InvUploadIcon icon = new InvUploadIcon();
        icon.setName(name);
        icon.setUrl(url);
        icon.setMime(mime);
        icon.setUploadedBy(operator != null ? operator.getId() : null);
        uploadIconMapper.insert(icon);
        return Result.success(uploadIconMapper.selectById(icon.getId()));
    }

    public Result<?> delete(Long id) {
        uploadIconMapper.deleteById(id);
        return Result.success(null);
    }

    /** 内置医疗图标（硬编码列表）。 */
    private List<IconView> builtinIcons() {
        List<IconView> list = new ArrayList<>();
        list.add(icon("scalpel", "手术刀", "🔪"));
        list.add(icon("scissors", "手术剪", "✂️"));
        list.add(icon("stethoscope", "听诊器", "🩺"));
        list.add(icon("syringe", "注射器", "💉"));
        list.add(icon("medicine", "药品", "💊"));
        list.add(icon("gloves", "手套", "🧤"));
        list.add(icon("gauze", "纱布", "🧻"));
        list.add(icon("dressing", "敷料", "🩹"));
        list.add(icon("reagent", "试剂", "🧪"));
        list.add(icon("anesthesia", "麻醉机", "🛏️"));
        list.add(icon("monitor", "监护仪", "📟"));
        list.add(icon("microscope", "显微镜", "🔬"));
        list.add(icon("endoscope", "内窥镜", "🔭"));
        list.add(icon("recoveryBed", "复苏床", "🛏️"));
        list.add(icon("disinfectant", "消毒液", "🧴"));
        return list;
    }

    private IconView icon(String key, String label, String emoji) {
        IconView v = new IconView();
        v.setKey(key);
        v.setLabel(label);
        v.setEmoji(emoji);
        return v;
    }
}
