const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '../src');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(file));
    } else {
      if (file.endsWith('.ts') || file.endsWith('.tsx')) {
        results.push(file);
      }
    }
  });
  return results;
}

const files = walk(srcDir);

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let original = content;

  // Replace common patterns
  content = content.replace(/process\.env\.MUSU_BRIDGE_URL \?\? (?:process\.env\.NEXT_PUBLIC_BRIDGE_URL \?\? )?"https?:\/\/(localhost|127\.0\.0\.1):8070"/g, 'getBridgeUrl()');
  content = content.replace(/process\.env\.MUSU_PORT_URL \?\? (?:process\.env\.MUSU_BRIDGE_URL \?\? )?"https?:\/\/(localhost|127\.0\.0\.1):(1355|8070)"/g, 'getBridgeUrl()');
  content = content.replace(/process\.env\.MUSU_WORKER_URL \?\? (?:process\.env\.MUSU_BRIDGE_URL \?\? )?"https?:\/\/(localhost|127\.0\.0\.1):8070"/g, 'getBridgeUrl()');
  
  content = content.replace(/process\.env\.NEXT_PUBLIC_BRIDGE_URL \?\? "http:\/\/localhost:8070"/g, 'getBridgeUrl()');
  
  content = content.replace(/const MUSU_PORT_URL = \(process\.env\.MUSU_PORT_URL[^;]+;/g, 'const MUSU_PORT_URL = getBridgeUrl();');
  content = content.replace(/const BRIDGE_URL = \(process\.env\.MUSU_BRIDGE_URL[^;]+;/g, 'const BRIDGE_URL = getBridgeUrl();');
  
  content = content.replace(/export const MUSU_PORT_URL = \(process\.env\.MUSU_PORT_URL[^;]+;/g, 'export const MUSU_PORT_URL = getBridgeUrl();');
  content = content.replace(/export const MUSU_BRIDGE_URL = \(process\.env\.MUSU_BRIDGE_URL[^;]+;/g, 'export const MUSU_BRIDGE_URL = getBridgeUrl();');
  content = content.replace(/export const MUSU_WORKER_URL = \(process\.env\.MUSU_WORKER_URL[^;]+;/g, 'export const MUSU_WORKER_URL = getBridgeUrl();');

  // Some specific replacements
  content = content.replace(/const BRIDGE_URL = process\.env\.NEXT_PUBLIC_MUSU_BRIDGE_URL \|\| "http:\/\/localhost:8070";/g, 'const BRIDGE_URL = getBridgeUrl();');
  content = content.replace(/const bridgeUrl = process\.env\.NEXT_PUBLIC_BRIDGE_URL \|\| "http:\/\/localhost:8070";/g, 'const bridgeUrl = getBridgeUrl();');

  // If replaced, we need to import getBridgeUrl if not already imported
  if (content !== original) {
    if (!content.includes('getBridgeUrl')) {
      // In case regex replaced it but it wasn't there before? Not possible.
      // We already inserted getBridgeUrl().
    }
    
    // Find relative path to src/lib/bridge-config
    if (!content.includes('import { getBridgeUrl }')) {
      const depth = file.split(path.sep).length - srcDir.split(path.sep).length;
      const prefix = depth === 1 ? './' : '../'.repeat(depth - 1);
      const importStmt = `import { getBridgeUrl } from '${prefix}lib/bridge-config';\n`;
      content = importStmt + content;
    }
    fs.writeFileSync(file, content, 'utf8');
    console.log('Updated', file);
  }
});
