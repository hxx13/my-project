package com.example.demo.modules.knowledge.service;

import com.example.demo.modules.knowledge.entity.KnowledgePage;
import com.example.demo.modules.knowledge.mapper.KnowledgePageMapper;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.stream.Collectors;

/**
 * Auto-discovers potential cross-references between knowledge pages
 * based on keyword co-occurrence and shared category.
 * Returns candidate edges (type=auto) that supplement manual [[wikilinks]].
 */
@Service
public class ReferenceAnalyzer {

    private final KnowledgePageMapper pageMapper;

    public ReferenceAnalyzer(KnowledgePageMapper pageMapper) {
        this.pageMapper = pageMapper;
    }

    /**
     * Analyze all pages and return auto-discovered edges.
     * Strategy: pages in the same category that share title keywords.
     */
    public List<Map<String, Object>> analyze() {
        List<KnowledgePage> all = pageMapper.findAll();
        if (all.size() < 2) return List.of();

        List<Map<String, Object>> edges = new ArrayList<>();
        Map<Long, Set<String>> keywordCache = new HashMap<>();

        for (int i = 0; i < all.size(); i++) {
            for (int j = i + 1; j < all.size(); j++) {
                KnowledgePage a = all.get(i);
                KnowledgePage b = all.get(j);

                // Same category pages get auto-reference
                if (a.getCategoryId().equals(b.getCategoryId())) {
                    Set<String> aWords = keywordCache.computeIfAbsent(a.getId(),
                        k -> extractKeywords(a.getTitle()));
                    Set<String> bWords = keywordCache.computeIfAbsent(b.getId(),
                        k -> extractKeywords(b.getTitle()));

                    // Check for keyword overlap (excluding very short words)
                    Set<String> intersection = new HashSet<>(aWords);
                    intersection.retainAll(bWords);

                    if (intersection.size() >= 2) {
                        edges.add(Map.of(
                            "source", a.getId(),
                            "target", b.getId(),
                            "type", "auto"
                        ));
                    }
                }
            }
        }
        return edges;
    }

    private Set<String> extractKeywords(String title) {
        if (title == null) return Set.of();
        return Arrays.stream(title.split("[\\s\\-_,.()（）\\[\\]【】]+"))
            .filter(w -> w.length() >= 2)
            .map(String::toLowerCase)
            .collect(Collectors.toSet());
    }
}
