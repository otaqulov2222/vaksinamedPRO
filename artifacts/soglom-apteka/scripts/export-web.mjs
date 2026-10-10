import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(appRoot, '../..');

console.log('[build-web] Starting VaksinaMed Web Static Export with Stable Font Assets...');

// 1. Locate font sources in node_modules
function findFont(pkgDir, relativeFontPath) {
  const pnpmBase = path.join(repoRoot, 'node_modules', '.pnpm');
  if (!fs.existsSync(pnpmBase)) {
    // Try local node_modules
    const local = path.join(appRoot, 'node_modules', pkgDir, relativeFontPath);
    if (fs.existsSync(local)) return local;
  } else {
    // Search .pnpm for matching package
    const entries = fs.readdirSync(pnpmBase, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name.startsWith(pkgDir)) {
        const candidate = path.join(pnpmBase, entry.name, 'node_modules', pkgDir.split('+').pop(), relativeFontPath);
        if (fs.existsSync(candidate)) return candidate;
        // Also check if directory structure is direct
        const candidateAlt = path.join(pnpmBase, entry.name, 'node_modules', relativeFontPath);
        if (fs.existsSync(candidateAlt)) return candidateAlt;
      }
    }
  }

  // Fallback recursive search if needed
  const directPath = path.join(repoRoot, 'node_modules', pkgDir, relativeFontPath);
  if (fs.existsSync(directPath)) return directPath;

  return null;
}

const fontDefinitions = [
  {
    name: 'Feather.ttf',
    searchPkg: '@expo+vector-icons',
    subPath: 'build/vendor/react-native-vector-icons/Fonts/Feather.ttf',
    aliases: ['Feather.ttf', 'feather.ttf'],
  },
  {
    name: 'MaterialCommunityIcons.ttf',
    searchPkg: '@expo+vector-icons',
    subPath: 'build/vendor/react-native-vector-icons/Fonts/MaterialCommunityIcons.ttf',
    aliases: ['MaterialCommunityIcons.ttf', 'material-community.ttf'],
  },
  {
    name: 'MaterialIcons.ttf',
    searchPkg: '@expo+vector-icons',
    subPath: 'build/vendor/react-native-vector-icons/Fonts/MaterialIcons.ttf',
    aliases: ['MaterialIcons.ttf'],
  },
  {
    name: 'Ionicons.ttf',
    searchPkg: '@expo+vector-icons',
    subPath: 'build/vendor/react-native-vector-icons/Fonts/Ionicons.ttf',
    aliases: ['Ionicons.ttf'],
  },
  {
    name: 'Inter-Regular.ttf',
    searchPkg: '@expo-google-fonts+inter',
    subPath: '400Regular/Inter_400Regular.ttf',
    aliases: ['Inter-Regular.ttf', 'Inter_400Regular.ttf'],
  },
  {
    name: 'Inter-Medium.ttf',
    searchPkg: '@expo-google-fonts+inter',
    subPath: '500Medium/Inter_500Medium.ttf',
    aliases: ['Inter-Medium.ttf', 'Inter_500Medium.ttf'],
  },
  {
    name: 'Inter-SemiBold.ttf',
    searchPkg: '@expo-google-fonts+inter',
    subPath: '600SemiBold/Inter_600SemiBold.ttf',
    aliases: ['Inter-SemiBold.ttf', 'Inter_600SemiBold.ttf'],
  },
  {
    name: 'Inter-Bold.ttf',
    searchPkg: '@expo-google-fonts+inter',
    subPath: '700Bold/Inter_700Bold.ttf',
    aliases: ['Inter-Bold.ttf', 'Inter_700Bold.ttf'],
  },
];

// Helper to verify TTF magic header
function verifyTtfMagic(buffer, filename) {
  if (buffer.length < 4) {
    throw new Error(`Font file ${filename} is too small (${buffer.length} bytes)`);
  }
  const magic = buffer.readUInt32BE(0);
  // 0x00010000 = TrueType, 0x4F54544F = OpenType (OTTO), 0x74746366 = TrueType Collection (ttcf)
  const isValid = magic === 0x00010000 || magic === 0x4F54544F || magic === 0x74746366;
  if (!isValid) {
    const hex = magic.toString(16);
    throw new Error(`Font file ${filename} has invalid magic bytes 0x${hex} (likely HTML or corrupted)`);
  }
}

// 2. Prepare public/fonts
const publicFontsDir = path.join(appRoot, 'public', 'fonts');
fs.mkdirSync(publicFontsDir, { recursive: true });

console.log('[build-web] Copying fonts to public/fonts for web dev & export...');
const resolvedFonts = new Map();

for (const def of fontDefinitions) {
  let fontPath = findFont(def.searchPkg, def.subPath);
  if (!fontPath) {
    // Check if already in public/fonts
    const existing = path.join(publicFontsDir, def.name);
    if (fs.existsSync(existing)) {
      fontPath = existing;
    }
  }

  if (!fontPath || !fs.existsSync(fontPath)) {
    console.error(`[build-web] Warning: Could not locate font source for ${def.name}`);
    continue;
  }

  const content = fs.readFileSync(fontPath);
  verifyTtfMagic(content, def.name);

  for (const alias of def.aliases) {
    const dest = path.join(publicFontsDir, alias);
    fs.writeFileSync(dest, content);
    resolvedFonts.set(alias, content);
  }
  console.log(`[build-web]   -> ${def.name} (${content.length} bytes)`);
}

// 3. Run Expo export --platform web
console.log('[build-web] Running `npx expo export --platform web`...');
const exportResult = spawnSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['expo', 'export', '--platform', 'web'],
  {
    cwd: appRoot,
    stdio: 'inherit',
    shell: true,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL || 'https://api-staging.vaksinamedgps.uz',
    },
  }
);

if (exportResult.status !== 0) {
  console.error(`[build-web] Expo export failed with exit code ${exportResult.status}`);
  process.exit(exportResult.status || 1);
}

// 4. Post-process dist directory
const distDir = path.join(appRoot, 'dist');
if (!fs.existsSync(distDir)) {
  console.error('[build-web] dist directory not found after export!');
  process.exit(1);
}

// Ensure dist/fonts and dist/assets/fonts exist
const distFontsDir = path.join(distDir, 'fonts');
const distAssetsFontsDir = path.join(distDir, 'assets', 'fonts');
fs.mkdirSync(distFontsDir, { recursive: true });
fs.mkdirSync(distAssetsFontsDir, { recursive: true });

console.log('[build-web] Ensuring all fonts exist in dist/fonts & dist/assets/fonts...');
for (const [alias, content] of resolvedFonts.entries()) {
  fs.writeFileSync(path.join(distFontsDir, alias), content);
  fs.writeFileSync(path.join(distAssetsFontsDir, alias), content);
}

// Also discover any additional TTF files emitted under dist/assets/__node_modules and mirror them to dist/fonts
function mirrorDiscoveredFonts(dir) {
  try {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, item.name);
      if (item.isDirectory()) {
        mirrorDiscoveredFonts(full);
      } else if (item.isFile() && item.name.endsWith('.ttf')) {
        const match = item.name.match(/^([A-Za-z0-9_-]+)\.[a-f0-9]+\.ttf$/);
        const fontBase = match ? match[1] : item.name.replace(/\.ttf$/, '');
        const target = path.join(distFontsDir, `${fontBase}.ttf`);
        if (!fs.existsSync(target)) {
          fs.copyFileSync(full, target);
          console.log(`[build-web]   Mirrored emitted font: ${fontBase}.ttf`);
        }
      }
    }
  } catch {}
}
mirrorDiscoveredFonts(path.join(distDir, 'assets'));

// 5. Sanitize and rewrite JS bundles in dist/_expo/static/js/web
const jsWebDir = path.join(distDir, '_expo', 'static', 'js', 'web');
if (fs.existsSync(jsWebDir)) {
  const jsFiles = fs.readdirSync(jsWebDir).filter((f) => f.endsWith('.js'));
  for (const jsFile of jsFiles) {
    const filePath = path.join(jsWebDir, jsFile);
    let code = fs.readFileSync(filePath, 'utf8');
    let replacementCount = 0;

    // Pattern to replace any /assets/__node_modules/.pnpm/.../<FontName>.<hash>.ttf with /fonts/<FontName>.ttf
    const pnpmRegex = /\/assets\/__node_modules\/\.pnpm\/[^\x22\x27\s]+\/([A-Za-z0-9_-]+)\.[a-f0-9]+\.ttf/g;
    code = code.replace(pnpmRegex, (_match, fontName) => {
      replacementCount++;
      return `/fonts/${fontName}.ttf`;
    });

    if (replacementCount > 0) {
      fs.writeFileSync(filePath, code, 'utf8');
      console.log(`[build-web] Sanitized ${replacementCount} font URLs in JS bundle: ${jsFile}`);
    }
  }
}

// 6. Final verification and integrity check
console.log('[build-web] Verifying font assets integrity in dist...');
const requiredDistFonts = [
  'Feather.ttf',
  'MaterialCommunityIcons.ttf',
  'Inter-Regular.ttf',
  'Inter-SemiBold.ttf',
  'Inter-Bold.ttf',
];

for (const fontName of requiredDistFonts) {
  const fontFile = path.join(distFontsDir, fontName);
  if (!fs.existsSync(fontFile)) {
    throw new Error(`CRITICAL: Required font ${fontName} missing in dist/fonts!`);
  }
  const buf = fs.readFileSync(fontFile);
  verifyTtfMagic(buf, fontName);
  console.log(`[build-web]   PASS: dist/fonts/${fontName} (${buf.length} bytes, valid TTF header)`);
}

console.log('[build-web] Web static export and font stabilization completed successfully!');
