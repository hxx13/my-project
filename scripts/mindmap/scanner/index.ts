import { scanJavaModules } from './java-scanner.js';
import { scanFrontend } from './ts-scanner.js';
import type { Domain, ScanResult } from '../types.js';

export function scanAll(): ScanResult {
  const warnings: string[] = [];

  // Run both scanners
  const javaResult = scanJavaModules();
  warnings.push(...javaResult.warnings);
  const domains = javaResult.domains;

  const frontendResult = scanFrontend();
  warnings.push(...frontendResult.warnings);

  // Map frontend pages to backend domains by API path matching
  mapFrontendToDomains(domains, frontendResult.pages);

  return { domains, warnings };
}

/**
 * Match frontend pages to backend domains.
 *
 * Strategy: for each page's API calls, try to match the API path
 * to a domain's controller base paths.
 *
 * Example:
 *   Page "AdminAccessRulesPage" calls "GET /api/v1/twin/access-rule/list"
 *   → Domain "accessrule" has controller with base "/api/access-rule"
 *   → Match!
 */
function mapFrontendToDomains(domains: Domain[], pages: ReturnType<typeof scanFrontend>['pages']): void {
  // Build index: API path prefix → domain
  const prefixToDomain = new Map<string, Domain>();
  for (const domain of domains) {
    for (const mod of domain.modules) {
      for (const ctrl of mod.controllers) {
        for (const api of ctrl.apis) {
          // Extract domain-significant prefix: /api/xxx
          const parts = api.full_path.split('/');
          if (parts.length >= 3) {
            const prefix = '/' + parts.slice(1, 3).join('/'); // e.g. /api/access-rule
            if (!prefixToDomain.has(prefix)) {
              prefixToDomain.set(prefix, domain);
            }
          }
        }
      }
    }
  }

  // For each frontend page, try to match its API calls to a domain
  for (const page of pages) {
    if (page.api_calls.length === 0) continue;

    const matchedDomains = new Map<string, number>(); // domainId → match count

    for (const apiCall of page.api_calls) {
      // Extract and normalize path:
      // "GET /api/v1/twin/access-rule/list" → "/api/access-rule/list"
      const pathPart = apiCall
        .replace(/^(GET|POST|PUT|DELETE|PATCH|FETCH)\s+/, '')
        .replace(/^\/api\/v1\/twin/, '/api')
        .trim();

      for (const [prefix, domain] of prefixToDomain) {
        if (pathPart.startsWith(prefix)) {
          matchedDomains.set(domain.id, (matchedDomains.get(domain.id) || 0) + 1);
          break;
        }
      }
    }

    // Assign page to the domain with the most API matches
    if (matchedDomains.size > 0) {
      const sorted = [...matchedDomains.entries()].sort((a, b) => b[1] - a[1]);
      const targetId = sorted[0][0];
      const domain = domains.find(d => d.id === targetId);
      if (domain && !domain.frontend.some(p => p.route === page.route)) {
        domain.frontend.push(page);
      }
    }
  }
}
