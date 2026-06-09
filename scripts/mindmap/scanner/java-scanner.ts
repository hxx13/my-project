import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Domain, ModuleInfo, ControllerInfo, ApiEndpoint, ServiceInfo, DataEntity, Interaction } from '../types.js';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
const MODULES_DIR = path.join(PROJECT_ROOT, 'src', 'main', 'java', 'com', 'example', 'demo', 'modules');

/** Java file with its parsed content */
interface JavaFile {
  absolutePath: string;
  relativePath: string;   // e.g. "twin/scan/controller/TwinScanController.java"
  content: string;
  className: string;
  packageName: string;    // e.g. "com.example.demo.modules.twin.scan.controller"
  moduleName: string;     // e.g. "twin"
}

/**
 * Entry point: scan all Java modules and return auto-populated domains.
 */
export function scanJavaModules(): { domains: Domain[]; warnings: string[] } {
  const warnings: string[] = [];

  if (!fs.existsSync(MODULES_DIR)) {
    warnings.push(`Modules directory not found: ${MODULES_DIR}`);
    return { domains: [], warnings };
  }

  // Scan all Java files
  const allFiles = collectAllJavaFiles(warnings);

  // Group by top-level module name
  const moduleGroups = new Map<string, JavaFile[]>();
  for (const file of allFiles) {
    const existing = moduleGroups.get(file.moduleName) || [];
    existing.push(file);
    moduleGroups.set(file.moduleName, existing);
  }

  // Build domains
  const domains: Domain[] = [];
  for (const [moduleName, files] of moduleGroups) {
    const domain = buildDomain(moduleName, files, warnings);
    domains.push(domain);
  }

  // Resolve cross-domain interactions
  resolveCrossDomainInteractions(domains, warnings);

  return { domains, warnings };
}

// ---- File Collection ----

function collectAllJavaFiles(_warnings: string[]): JavaFile[] {
  const results: JavaFile[] = [];

  const topDirs = fs.readdirSync(MODULES_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);

  for (const topDir of topDirs) {
    const dirPath = path.join(MODULES_DIR, topDir);
    walkJavaFiles(dirPath, topDir, results);
  }

  return results;
}

function walkJavaFiles(dir: string, moduleName: string, results: JavaFile[]): void {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkJavaFiles(fullPath, moduleName, results);
    } else if (entry.name.endsWith('.java')) {
      try {
        const content = fs.readFileSync(fullPath, 'utf-8');
        const className = extractClassName(entry.name, content);
        const packageName = extractPackage(content);

        // Determine sub-package relative to the module
        const relativePath = path.relative(
          path.join(MODULES_DIR, moduleName),
          fullPath
        ).replace(/\\/g, '/');

        results.push({
          absolutePath: fullPath,
          relativePath,
          content,
          className,
          packageName,
          moduleName,
        });
      } catch (e) {
        // Skip unreadable files
      }
    }
  }
}

// ---- Basic Extraction ----

function extractClassName(filename: string, content: string): string {
  const match = content.match(/(?:public\s+)?(?:abstract\s+)?(?:class|interface|enum)\s+(\w+)/);
  if (match) return match[1];
  return filename.replace('.java', '');
}

function extractPackage(content: string): string {
  const match = content.match(/^package\s+([\w.]+);/m);
  return match ? match[1] : '';
}

// ---- Domain Builder ----

function buildDomain(moduleName: string, files: JavaFile[], warnings: string[]): Domain {
  // Group files by sub-package
  // e.g. "twin/scan/controller" → subPkg = "scan"
  const subPkgGroups = groupBySubPackage(files, moduleName);

  const modules: ModuleInfo[] = [];

  for (const [subPkg, subFiles] of subPkgGroups) {
    const mod = buildModuleInfo(moduleName, subPkg, subFiles, warnings);
    modules.push(mod);
  }

  const domainId = camelToKebab(moduleName);

  return {
    id: domainId,
    name: '',
    summary: '',
    description: '',
    business_actors: [],
    business_rules: [],
    modules,
    frontend: [],
    interactions: [],
    data_flows: [],
    pending: [],
  };
}

/**
 * Group files by their immediate sub-package within the module.
 * Files directly in the module root (no sub-pkg) go to "" (base).
 */
function groupBySubPackage(files: JavaFile[], moduleName: string): Map<string, JavaFile[]> {
  const groups = new Map<string, JavaFile[]>();

  for (const file of files) {
    // Determine sub-package from the package name
    // e.g. "com.example.demo.modules.twin.scan.controller" → remove base →
    //      "scan.controller" → first segment = "scan"
    const basePkg = `com.example.demo.modules.${moduleName}`;
    let subPkg = '';

    if (file.packageName && file.packageName !== basePkg) {
      const remainder = file.packageName.startsWith(basePkg + '.')
        ? file.packageName.substring(basePkg.length + 1)
        : file.packageName;
      // Take the first segment: "scan.controller" → "scan"
      subPkg = remainder.split('.')[0] || '';
    }

    const existing = groups.get(subPkg) || [];
    existing.push(file);
    groups.set(subPkg, existing);
  }

  return groups;
}

// ---- Module Builder ----

function buildModuleInfo(
  moduleName: string,
  subPkg: string,
  files: JavaFile[],
  warnings: string[]
): ModuleInfo {
  const controllers: ControllerInfo[] = [];
  const services: ServiceInfo[] = [];
  const mappers: string[] = [];
  const entities: DataEntity[] = [];
  const scheduledTasks: { method: string; cron: string; description: string }[] = [];

  for (const file of files) {
    const { content, className } = file;

    // @RestController or @Controller
    if (/@RestController|@Controller\b/.test(content)) {
      const ctrl = parseController(className, content, warnings);
      if (ctrl && ctrl.apis.length > 0) controllers.push(ctrl);
    }

    // @Service
    if (/@Service\b/.test(content)) {
      const svc = parseService(className, content);
      if (svc) services.push(svc);
    }

    // @Mapper or extends BaseMapper
    if (/@Mapper\b|extends\s+BaseMapper/.test(content)) {
      mappers.push(className);
    }

    // @Entity or @Table
    if (/@Entity\b|@Table\b/.test(content)) {
      const entity = parseEntity(className, content);
      if (entity) entities.push(entity);
    }

    // @Scheduled
    const scheduledMatches = content.matchAll(/@Scheduled\s*\(\s*cron\s*=\s*"([^"]+)"/g);
    for (const match of scheduledMatches) {
      const afterAnnotation = content.substring(match.index! + match[0].length, match.index! + 500);
      const methodMatch = afterAnnotation.match(/public\s+\w+\s+(\w+)\s*\(/);
      if (methodMatch) {
        scheduledTasks.push({ method: methodMatch[1], cron: match[1], description: '' });
      }
    }
  }

  const pkg = subPkg
    ? `com.example.demo.modules.${moduleName}.${subPkg}`
    : `com.example.demo.modules.${moduleName}`;

  // Determine role
  const roles: string[] = [];
  if (controllers.length > 0) roles.push('controller');
  if (services.length > 0) roles.push('service');
  if (mappers.length > 0) roles.push('repository');

  return {
    package: pkg,
    role: roles.join('/') || 'utility',
    controllers,
    services,
    mappers,
    entities,
    scheduled_tasks: scheduledTasks,
  };
}

// ---- Controller Parser ----

function parseController(className: string, content: string, _warnings: string[]): ControllerInfo | null {
  // Extract @RequestMapping base path
  let basePath = '';
  const reqMapMatch = content.match(/@RequestMapping\s*\(\s*(?:"([^"]+)"|value\s*=\s*"([^"]+)")/);
  if (reqMapMatch) {
    basePath = reqMapMatch[1] || reqMapMatch[2] || '';
  }

  const apis: ApiEndpoint[] = [];

  const mappingPatterns: Array<{ pattern: RegExp; method: ApiEndpoint['method'] }> = [
    { pattern: /@GetMapping\s*\(\s*(?:"([^"]+)"|value\s*=\s*"([^"]+)"|path\s*=\s*"([^"]+)")/, method: 'GET' },
    { pattern: /@PostMapping\s*\(\s*(?:"([^"]+)"|value\s*=\s*"([^"]+)"|path\s*=\s*"([^"]+)")/, method: 'POST' },
    { pattern: /@PutMapping\s*\(\s*(?:"([^"]+)"|value\s*=\s*"([^"]+)"|path\s*=\s*"([^"]+)")/, method: 'PUT' },
    { pattern: /@DeleteMapping\s*\(\s*(?:"([^"]+)"|value\s*=\s*"([^"]+)"|path\s*=\s*"([^"]+)")/, method: 'DELETE' },
    { pattern: /@PatchMapping\s*\(\s*(?:"([^"]+)"|value\s*=\s*"([^"]+)"|path\s*=\s*"([^"]+)")/, method: 'PATCH' },
    // Generic @RequestMapping with method = RequestMethod.XXX
    { pattern: /@RequestMapping\s*\(\s*(?:value|path)\s*=\s*"([^"]+)"[^)]*method\s*=\s*RequestMethod\.(\w+)/, method: 'GET' as ApiEndpoint['method'] },
  ];

  for (const { pattern, method } of mappingPatterns) {
    const re = new RegExp(pattern.source, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
      let subPath = m[1] || m[2] || m[3] || '';
      let actualMethod = method;

      // For @RequestMapping, extract the method from RequestMethod.XXX
      if (pattern.source.includes('RequestMethod') && m[2]) {
        actualMethod = m[2].toUpperCase() as ApiEndpoint['method'];
      }

      const fullPath = joinPath(basePath, subPath);

      // Avoid duplicates
      if (!apis.some(a => a.method === actualMethod && a.full_path === fullPath)) {
        apis.push({
          method: actualMethod,
          path: subPath,
          full_path: fullPath,
          summary: '',
          params: [],
          returns: '',
        });
      }
    }
  }

  // Infer base path from first API if not explicitly set
  if (!basePath && apis.length > 0) {
    const first = apis[0];
    const parts = first.full_path.split('/');
    if (parts.length >= 3) {
      basePath = '/' + parts.slice(1, 3).join('/');
    }
  }

  if (apis.length === 0) return null;

  return { class: className, base_path: basePath, apis };
}

// ---- Service Parser ----

function parseService(className: string, content: string): ServiceInfo | null {
  const dependencies: string[] = [];
  const seenDeps = new Set<string>();

  // @Autowired fields
  const autowiredRe = /@Autowired\s*\n\s*private\s+(\w+)\s+(\w+);/g;
  let m: RegExpExecArray | null;
  while ((m = autowiredRe.exec(content)) !== null) {
    const depName = m[1];
    if (!seenDeps.has(depName)) {
      dependencies.push(depName);
      seenDeps.add(depName);
    }
  }

  // Constructor injection (if no @Autowired fields found, check constructor params)
  if (dependencies.length === 0) {
    const constructorMatch = content.match(new RegExp(`public\\s+${className}\\s*\\(([^)]*)\\)`));
    if (constructorMatch) {
      const params = constructorMatch[1].split(',');
      for (const param of params) {
        const typeMatch = param.trim().match(/^(?:final\s+)?(\w+(?:<[^>]+>)?)\s+\w+$/);
        if (typeMatch && !['int', 'long', 'boolean', 'String', 'void', 'Integer', 'Long', 'Boolean', 'Double', 'Float', 'BigDecimal', 'LocalDateTime', 'LocalDate', 'Date'].includes(typeMatch[1])) {
          const depName = typeMatch[1];
          if (!seenDeps.has(depName)) {
            dependencies.push(depName);
            seenDeps.add(depName);
          }
        }
      }
    }
  }

  // Public methods
  const methods: { name: string; summary: string }[] = [];
  const methodRe = /public\s+(?:static\s+)?(?:<[^>]+>\s+)?(\w+(?:<[^>]+>)?)\s+(\w+)\s*\(/g;
  while ((m = methodRe.exec(content)) !== null) {
    const methodName = m[2];
    // Skip getters/setters/constructors/Object overrides
    if (methodName === className) continue;
    if (methodName.startsWith('get') || methodName.startsWith('set') || methodName.startsWith('is')) continue;
    if (['equals', 'hashCode', 'toString', 'clone', 'finalize'].includes(methodName)) continue;
    if (!methods.some(mt => mt.name === methodName)) {
      methods.push({ name: methodName, summary: '' });
    }
  }

  return { class: className, dependencies, methods };
}

// ---- Entity Parser ----

function parseEntity(className: string, content: string): DataEntity | null {
  let tableName = '';
  const tableMatch = content.match(/@Table\s*\(\s*(?:name\s*=\s*)?["']([^"']+)["']/);
  if (tableMatch) {
    tableName = tableMatch[1];
  } else {
    tableName = 't_' + className
      .replace(/([A-Z])/g, '_$1')
      .toLowerCase()
      .replace(/^_/, '');
  }

  const keyFields: string[] = [];
  const idRe = /@Id\s*\n\s*private\s+\w+\s+(\w+);/g;
  let m: RegExpExecArray | null;
  while ((m = idRe.exec(content)) !== null) {
    keyFields.push(m[1]);
  }

  return { name: className, table: tableName, key_fields: keyFields, description: '' };
}

// ---- Cross-Domain Interactions ----

function resolveCrossDomainInteractions(domains: Domain[], warnings: string[]): void {
  // Build a map: class name → domain id
  const classToDomain = new Map<string, string>();
  for (const domain of domains) {
    for (const mod of domain.modules) {
      for (const ctrl of mod.controllers) {
        classToDomain.set(ctrl.class, domain.id);
      }
      for (const svc of mod.services) {
        classToDomain.set(svc.class, domain.id);
      }
      for (const mapper of mod.mappers) {
        classToDomain.set(mapper, domain.id);
      }
    }
  }

  for (const domain of domains) {
    const interactions: Interaction[] = [];
    const seen = new Set<string>();

    for (const mod of domain.modules) {
      for (const svc of mod.services) {
        for (const dep of svc.dependencies) {
          const targetDomain = classToDomain.get(dep);
          if (targetDomain && targetDomain !== domain.id) {
            const key = `${targetDomain}:${dep}`;
            if (!seen.has(key)) {
              seen.add(key);
              interactions.push({
                target: targetDomain,
                type: 'rest-call',
                detail: `${svc.class} 依赖 ${dep}`,
                source: 'auto',
              });
            }
          }
        }
      }
    }

    domain.interactions = interactions;
  }
}

// ---- Utilities ----

function joinPath(base: string, sub: string): string {
  if (!base) return sub.startsWith('/') ? sub : '/' + sub;
  if (!sub) return base;
  return base.replace(/\/$/, '') + '/' + sub.replace(/^\//, '');
}

function camelToKebab(s: string): string {
  return s
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();
}
