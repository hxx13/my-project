package com.example.demo.modules.knowledge.service;

import org.springframework.stereotype.Service;
import java.util.List;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

@Service
public class WikilinkScanner {

    private static final Pattern WIKILINK_PATTERN = Pattern.compile("\\[\\[([^\\]]+)\\]\\]");

    /**
     * Extract [[title]] references from markdown content.
     * Returns list of referenced page titles (deduplicated).
     */
    public List<String> scan(String contentMd) {
        if (contentMd == null || contentMd.isEmpty()) return List.of();
        return WIKILINK_PATTERN.matcher(contentMd)
            .results()
            .map(mr -> mr.group(1).trim())
            .filter(title -> !title.isEmpty())
            .distinct()
            .collect(Collectors.toList());
    }
}
