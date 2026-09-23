/**
 * 物品规格 schema 解析/序列化（Material + Supplies 共用）
 * 权威格式：{ "dimensions": [{ "name": "尺码", "options": ["S","M"] }] }
 * 兼容旧扁平格式：{ "尺码": ["S","M"] }
 */

function parseSpecDimensions(specSchema) {
  if (!specSchema) return [];
  try {
    var obj = typeof specSchema === 'string' ? JSON.parse(specSchema) : specSchema;
    if (!obj || typeof obj !== 'object') return [];
    if (Array.isArray(obj.dimensions) && obj.dimensions.length) {
      return obj.dimensions
        .map(function (d) {
          return {
            name: d && d.name != null ? String(d.name).trim() : '',
            options: Array.isArray(d && d.options)
              ? d.options.map(function (o) { return String(o).trim(); }).filter(Boolean)
              : [],
          };
        })
        .filter(function (d) { return d.name && d.options.length > 0; });
    }
    return Object.keys(obj)
      .filter(function (k) { return k !== 'dimensions' && Array.isArray(obj[k]); })
      .map(function (k) {
        return {
          name: String(k).trim(),
          options: obj[k].map(function (o) { return String(o).trim(); }).filter(Boolean),
        };
      })
      .filter(function (d) { return d.name && d.options.length > 0; });
  } catch (e) {
    return [];
  }
}

function hasSpecSchema(specSchema) {
  return parseSpecDimensions(specSchema).length > 0;
}

function serializeSpecDimensions(dimensions) {
  var dims = (dimensions || [])
    .map(function (d) {
      return {
        name: d && d.name != null ? String(d.name).trim() : '',
        options: Array.isArray(d && d.options)
          ? d.options.map(function (o) { return String(o).trim(); }).filter(Boolean)
          : Array.isArray(d && d.optionsStr)
            ? String(d.optionsStr).split(',').map(function (s) { return s.trim(); }).filter(Boolean)
            : typeof (d && d.optionsStr) === 'string'
              ? String(d.optionsStr).split(',').map(function (s) { return s.trim(); }).filter(Boolean)
              : [],
      };
    })
    .filter(function (d) { return d.name && d.options.length >= 2; });
  if (!dims.length) return null;
  return JSON.stringify({ dimensions: dims });
}

/** 审计备注列：尺码:S,颜色:红 */
function formatSpecRemark(specSnapshot) {
  if (!specSnapshot) return '';
  try {
    var obj = typeof specSnapshot === 'string' ? JSON.parse(specSnapshot) : specSnapshot;
    if (!obj || typeof obj !== 'object') return '';
    return Object.keys(obj)
      .map(function (k) { return k + ':' + obj[k]; })
      .join(',');
  } catch (e) {
    return '';
  }
}

function formatSpecLabel(specSnapshot) {
  if (!specSnapshot) return '';
  try {
    var obj = typeof specSnapshot === 'string' ? JSON.parse(specSnapshot) : specSnapshot;
    return Object.values(obj).join('·');
  } catch (e) {
    return '';
  }
}

module.exports = {
  parseSpecDimensions: parseSpecDimensions,
  hasSpecSchema: hasSpecSchema,
  serializeSpecDimensions: serializeSpecDimensions,
  formatSpecRemark: formatSpecRemark,
  formatSpecLabel: formatSpecLabel,
};
