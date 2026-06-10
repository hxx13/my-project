package com.example.demo.modules.knowledge.service;

import com.example.demo.modules.knowledge.entity.KnowledgePage;
import com.example.demo.modules.knowledge.mapper.KnowledgePageMapper;
import com.example.demo.modules.knowledge.mapper.KnowledgeCategoryMapper;
import com.example.demo.modules.knowledge.entity.KnowledgeCategory;
import com.example.demo.modules.knowledge.model.GraphResponse;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.stream.Collectors;

@Service
public class GraphService {

    private final KnowledgePageMapper pageMapper;
    private final KnowledgeCategoryMapper categoryMapper;
    private final WikilinkScanner wikilinkScanner;
    private final ReferenceAnalyzer referenceAnalyzer;

    public GraphService(KnowledgePageMapper pageMapper,
                        KnowledgeCategoryMapper categoryMapper,
                        WikilinkScanner wikilinkScanner,
                        ReferenceAnalyzer referenceAnalyzer) {
        this.pageMapper = pageMapper;
        this.categoryMapper = categoryMapper;
        this.wikilinkScanner = wikilinkScanner;
        this.referenceAnalyzer = referenceAnalyzer;
    }

    public GraphResponse buildGraph(Long categoryId, String tag) {
        List<KnowledgePage> pages = (categoryId != null)
            ? pageMapper.findByCategoryId(categoryId)
            : pageMapper.findAll();

        Map<Long, KnowledgeCategory> categoryMap = categoryMapper.findAll().stream()
            .collect(Collectors.toMap(KnowledgeCategory::getId, c -> c));

        // Build nodes
        List<GraphResponse.GraphNode> nodes = pages.stream()
            .map(p -> {
                GraphResponse.GraphNode node = new GraphResponse.GraphNode();
                node.setId(p.getId());
                node.setTitle(p.getTitle());
                node.setCategoryId(p.getCategoryId());
                KnowledgeCategory cat = categoryMap.get(p.getCategoryId());
                node.setCategoryName(cat != null ? cat.getName() : "未知");
                node.setRefCount(0); // populated below
                return node;
            })
            .collect(Collectors.toList());

        Map<Long, Integer> refCounts = new HashMap<>();
        nodes.forEach(n -> refCounts.put(n.getId(), 0));

        // Build edges: manual [[wikilink]] + auto reference analysis
        Set<String> edgeKeys = new HashSet<>();
        List<GraphResponse.GraphEdge> edges = new ArrayList<>();

        // Manual wikilinks
        for (KnowledgePage page : pages) {
            if (page.getContentMd() != null && !page.getContentMd().isEmpty()) {
                List<String> refs = wikilinkScanner.scan(page.getContentMd());
                for (String refTitle : refs) {
                    KnowledgePage target = pageMapper.findByTitle(refTitle);
                    if (target != null && !target.getId().equals(page.getId())) {
                        String key = page.getId() + "->" + target.getId();
                        if (edgeKeys.add(key)) {
                            GraphResponse.GraphEdge edge = new GraphResponse.GraphEdge();
                            edge.setSource(page.getId());
                            edge.setTarget(target.getId());
                            edge.setType("manual");
                            edges.add(edge);
                            refCounts.merge(target.getId(), 1, Integer::sum);
                        }
                    }
                }
            }
        }

        // Auto references
        List<Map<String, Object>> autoEdges = referenceAnalyzer.analyze();
        for (Map<String, Object> ae : autoEdges) {
            Long source = (Long) ae.get("source");
            Long target = (Long) ae.get("target");
            String key = source + "->" + target;
            if (edgeKeys.add(key)) {
                GraphResponse.GraphEdge edge = new GraphResponse.GraphEdge();
                edge.setSource(source);
                edge.setTarget(target);
                edge.setType("auto");
                edges.add(edge);
                refCounts.merge(target, 1, Integer::sum);
            }
        }

        // Apply ref counts to nodes
        nodes.forEach(n -> n.setRefCount(refCounts.getOrDefault(n.getId(), 0)));

        GraphResponse response = new GraphResponse();
        response.setNodes(nodes);
        response.setEdges(edges);
        return response;
    }
}
