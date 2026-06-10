package com.example.demo.modules.knowledge.config;

import com.example.demo.modules.knowledge.entity.KnowledgeCategory;
import com.example.demo.modules.knowledge.entity.KnowledgeHistory;
import com.example.demo.modules.knowledge.entity.KnowledgePage;
import com.example.demo.modules.knowledge.mapper.KnowledgeCategoryMapper;
import com.example.demo.modules.knowledge.mapper.KnowledgeHistoryMapper;
import com.example.demo.modules.knowledge.mapper.KnowledgePageMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.*;

/**
 * 数字花园导入器 — 原封不动镜像 docs/ 目录结构。
 * docs/*.md →「项目文档」分类
 * docs/开发参考-md/{子目录}/*.md → 各子目录为独立分类
 */
@Component
@Order(115)
public class KnowledgeYudaoImportRunner implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(KnowledgeYudaoImportRunner.class);
    private static final String DOCS = "docs";
    private static final String REF_MD = "docs/开发参考-md";

    private final KnowledgeCategoryMapper cm;
    private final KnowledgePageMapper pm;
    private final KnowledgeHistoryMapper hm;

    public KnowledgeYudaoImportRunner(KnowledgeCategoryMapper c, KnowledgePageMapper p, KnowledgeHistoryMapper h) {
        this.cm = c; this.pm = p; this.hm = h;
    }

    @Override public void run(ApplicationArguments args) {
        log.info("[knowledge-import] 就绪。手动触发: POST /api/admin/knowledge/pages/trigger-import");
    }

    public ImportResult runImport() {
        clearAll();
        int[] stats = {0, 0, 0, 0};

        // ── docs/*.md → 项目文档 ──
        KnowledgeCategory proj = mkCat(null, "项目文档", "project-docs", "Building2", 0);
        stats = add(stats, importFiles(proj, new File(DOCS)));

        // ── docs/开发参考-md/{子目录} → 各自分类 ──
        File refRoot = new File(REF_MD);
        File[] dirs = refRoot.listFiles(File::isDirectory);
        if (dirs != null) {
            Arrays.sort(dirs, Comparator.comparing(File::getName));
            int sort = 1;
            for (File dir : dirs) {
                KnowledgeCategory cat = mkCat(null, dir.getName(), slugify(dir.getName()), "Folder", sort++);
                stats = add(stats, importFiles(cat, dir));
            }
        }

        log.info("[KNOWLEDGE] done: {} total {} ok {} skip {} err", stats[0], stats[1], stats[2], stats[3]);
        return new ImportResult(stats[0], stats[1], stats[2], stats[3]);
    }

    private int[] importFiles(KnowledgeCategory cat, File dir) {
        int[] s = {0, 0, 0, 0};
        File[] files = dir.listFiles((d, n) -> n.endsWith(".md"));
        if (files == null) return s;
        for (File f : files) {
            s[0]++;
            try { s[importOne(cat, f) ? 1 : 2]++; }
            catch (Exception e) { s[3]++; log.error("[import] {}: {}", f.getName(), e.getMessage()); }
        }
        return s;
    }

    private boolean importOne(KnowledgeCategory cat, File file) throws Exception {
        String raw = Files.readString(file.toPath(), StandardCharsets.UTF_8);
        String title = extractTitle(raw, file.getName());
        String slug = slugify(title);
        String body = stripFrontmatter(raw);
        if (body.length() < 50) { log.warn("[import] short: {}", title); return false; }
        if (pm.countByCategoryAndSlug(cat.getId(), slug) > 0) return false;

        KnowledgePage p = new KnowledgePage();
        p.setCategoryId(cat.getId()); p.setSlug(slug); p.setTitle(title);
        p.setContentHtml(body); p.setContentMd(body);
        p.setSource("imported"); p.setVersion(1); p.setAuthor("system"); p.setIsPublished(1);
        pm.insert(p);

        KnowledgeHistory h = new KnowledgeHistory();
        h.setPageId(p.getId()); h.setVersion(1); h.setContentHtml(body); h.setContentMd(body);
        h.setAuthor("system"); h.setSummary("初始导入");
        hm.insert(h);
        return true;
    }

    private KnowledgeCategory mkCat(Long parentId, String name, String slug, String icon, int sort) {
        KnowledgeCategory c = cm.findBySlug(slug);
        if (c != null) return c;
        c = new KnowledgeCategory();
        c.setParentId(parentId); c.setName(name); c.setSlug(slug); c.setIcon(icon); c.setSortOrder(sort);
        cm.insert(c);
        return c;
    }

    private void clearAll() {
        // 顺序: history → pages → categories（FK 约束）
        for (var cat : cm.findAll()) {
            var pages = pm.findByCategory(cat.getId());
            if (pages != null) for (var p : pages) hm.deleteByPageId(p.getId());
        }
        for (var cat : cm.findAll()) {
            var pages = pm.findByCategory(cat.getId());
            if (pages != null) for (var p : pages) pm.deleteById(p.getId());
        }
        for (var cat : cm.findAll()) cm.deleteById(cat.getId());
    }

    static String extractTitle(String raw, String filename) {
        if (raw.startsWith("---")) {
            int end = raw.indexOf("---", 3);
            if (end > 0) {
                for (String line : raw.substring(3, end).split("\\n")) {
                    if (line.startsWith("title:")) return line.substring(6).trim().replaceAll("^[\"']|[\"']$", "");
                }
            }
        }
        String h1 = raw.replaceFirst("---[\\s\\S]*?---", "").trim();
        var m = java.util.regex.Pattern.compile("^#\\s+(.+)$", java.util.regex.Pattern.MULTILINE).matcher(h1);
        if (m.find()) return m.group(1).trim();
        return filename.replaceFirst("\\.md$", "").replaceAll("^\\d+-", "").trim();
    }

    static String stripFrontmatter(String raw) {
        if (raw.startsWith("---")) { int e = raw.indexOf("---", 3); if (e > 0) return raw.substring(e + 3).trim(); }
        return raw.trim();
    }

    static String slugify(String s) {
        if (s == null || s.isBlank()) return "untitled";
        String slug = s.trim().replaceAll("[^a-zA-Z0-9\\u4e00-\\u9fa5]", "-").replaceAll("-+", "-").replaceAll("^-|-$", "").toLowerCase();
        return slug.isBlank() ? "untitled" : slug;
    }

    static int[] add(int[] a, int[] b) { for (int i = 0; i < 4; i++) a[i] += b[i]; return a; }

    public record ImportResult(int total, int success, int skipped, int errors) {}
}
