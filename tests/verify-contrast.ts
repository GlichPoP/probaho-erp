/**
 * Verification of CSS Contrast Ratios according to WCAG 2.1 AA specifications.
 */

interface RGB {
  r: number;
  g: number;
  b: number;
  a?: number;
}

function parseColor(str: string): RGB {
  str = str.trim();
  if (str.startsWith('#')) {
    let hex = str.slice(1);
    if (hex.length === 3) {
      hex = hex.split('').map(c => c + c).join('');
    }
    const num = parseInt(hex, 16);
    return {
      r: (num >> 16) & 255,
      g: (num >> 8) & 255,
      b: num & 255,
      a: 1.0
    };
  }
  const rgbaMatch = str.match(/rgba?\s*\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/);
  if (rgbaMatch) {
    return {
      r: parseFloat(rgbaMatch[1]),
      g: parseFloat(rgbaMatch[2]),
      b: parseFloat(rgbaMatch[3]),
      a: rgbaMatch[4] !== undefined ? parseFloat(rgbaMatch[4]) : 1.0
    };
  }
  throw new Error(`Unsupported color format: ${str}`);
}

function alphaComposite(fg: RGB, bg: RGB): RGB {
  const alpha = fg.a !== undefined ? fg.a : 1.0;
  return {
    r: Math.round(fg.r * alpha + bg.r * (1 - alpha)),
    g: Math.round(fg.g * alpha + bg.g * (1 - alpha)),
    b: Math.round(fg.b * alpha + bg.b * (1 - alpha)),
    a: 1.0
  };
}

function channelLuminance(val: number): number {
  const s = val / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function relativeLuminance(rgb: RGB): number {
  return 0.2126 * channelLuminance(rgb.r) + 0.7152 * channelLuminance(rgb.g) + 0.0722 * channelLuminance(rgb.b);
}

function getContrastRatio(color1: string, color2: string, baseBgForAlpha?: string): number {
  let c1 = parseColor(color1);
  let c2 = parseColor(color2);

  if (c2.a !== undefined && c2.a < 1.0 && baseBgForAlpha) {
    c2 = alphaComposite(c2, parseColor(baseBgForAlpha));
  }
  if (c1.a !== undefined && c1.a < 1.0 && baseBgForAlpha) {
    c1 = alphaComposite(c1, parseColor(baseBgForAlpha));
  }

  const l1 = relativeLuminance(c1);
  const l2 = relativeLuminance(c2);

  const brighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);

  return (brighter + 0.05) / (darker + 0.05);
}

const lightTheme = {
  bgPrimary: '#F8FAFC',
  bgSecondary: '#FFFFFF',
  bgCard: '#FFFFFF',
  bgHover: '#F1F5F9',
  bgTertiary: '#E2E8F0',
  textMain: '#0F172A',
  textMuted: '#334155',
  textDim: '#475569',
  accentPrimary: '#4F46E5',
  accentHover: '#4338CA',
  accentText: '#FFFFFF',
  emerald: '#047857',
  emeraldBg: '#ECFDF5',
  ruby: '#B91C1C',
  rubyBg: '#FEF2F2',
  amber: '#B45309',
  amberBg: '#FFFBEB',
  cyan: '#0369A1',
  cyanBg: '#F0F9FF',
  titlebarBg: '#FFFFFF',
  titlebarText: '#334155'
};

const darkTheme = {
  bgPrimary: '#0B0F19',
  bgSecondary: '#111827',
  bgCard: '#182234',
  bgHover: '#1F2E45',
  bgTertiary: '#263852',
  textMain: '#F8FAFC',
  textMuted: '#CBD5E1',
  textDim: '#94A3B8',
  accentPrimary: '#4F46E5',
  accentHover: '#4338CA',
  accentText: '#FFFFFF',
  emerald: '#34D399',
  emeraldBg: 'rgba(16, 185, 129, 0.16)',
  ruby: '#F87171',
  rubyBg: 'rgba(239, 68, 68, 0.16)',
  amber: '#FBBF24',
  amberBg: 'rgba(245, 158, 11, 0.16)',
  cyan: '#38BDF8',
  cyanBg: 'rgba(56, 189, 248, 0.16)',
  titlebarBg: '#0B0F19',
  titlebarText: '#CBD5E1'
};

interface TestCase {
  name: string;
  fg: string;
  bg: string;
  baseBg?: string;
  minRatio: number;
}

function runContrastSuite() {
  console.log('========================================================================');
  console.log('          WCAG 2.1 AA THEME COLOR CONTRAST RATIO VERIFIER               ');
  console.log('========================================================================\n');

  let totalTests = 0;
  let passCount = 0;
  let failCount = 0;

  function testPair(theme: string, name: string, fg: string, bg: string, baseBg?: string, minRatio: number = 4.5) {
    totalTests++;
    const ratio = getContrastRatio(fg, bg, baseBg);
    const passed = ratio >= minRatio;
    if (passed) {
      passCount++;
      console.log(`  [PASS] [${theme}] ${name.padEnd(42)}: ${ratio.toFixed(2)}:1 (min ${minRatio}:1)`);
    } else {
      failCount++;
      console.error(`  [FAIL] [${theme}] ${name.padEnd(42)}: ${ratio.toFixed(2)}:1 < ${minRatio}:1 (fg: ${fg}, bg: ${bg})`);
    }
  }

  console.log('--- LIGHT THEME VERIFICATION ---');
  testPair('LIGHT', 'Primary Text on Main App Background', lightTheme.textMain, lightTheme.bgPrimary);
  testPair('LIGHT', 'Primary Text on Card/Surface Background', lightTheme.textMain, lightTheme.bgCard);
  testPair('LIGHT', 'Primary Text on Secondary Background', lightTheme.textMain, lightTheme.bgSecondary);
  testPair('LIGHT', 'Primary Text on Hover Background', lightTheme.textMain, lightTheme.bgHover);
  testPair('LIGHT', 'Muted Text on Card Background', lightTheme.textMuted, lightTheme.bgCard);
  testPair('LIGHT', 'Muted Text on Main App Background', lightTheme.textMuted, lightTheme.bgPrimary);
  testPair('LIGHT', 'Dim Text on Card Background', lightTheme.textDim, lightTheme.bgCard);
  testPair('LIGHT', 'Dim Text on Secondary Background', lightTheme.textDim, lightTheme.bgSecondary);
  testPair('LIGHT', 'Accent Button (White on Indigo)', lightTheme.accentText, lightTheme.accentPrimary);
  testPair('LIGHT', 'Accent Button Hover (White on Dark Indigo)', lightTheme.accentText, lightTheme.accentHover);
  testPair('LIGHT', 'Success Badge/Button (Emerald on Emerald Bg)', lightTheme.emerald, lightTheme.emeraldBg);
  testPair('LIGHT', 'Danger Badge/Button (Ruby on Ruby Bg)', lightTheme.ruby, lightTheme.rubyBg);
  testPair('LIGHT', 'Warning Badge (Amber on Amber Bg)', lightTheme.amber, lightTheme.amberBg);
  testPair('LIGHT', 'Info Badge (Cyan on Cyan Bg)', lightTheme.cyan, lightTheme.cyanBg);
  testPair('LIGHT', 'Titlebar Text on Titlebar Bg', lightTheme.titlebarText, lightTheme.titlebarBg);
  testPair('LIGHT', 'Chip Mono Text on Hover Bg', lightTheme.textMuted, lightTheme.bgHover);

  console.log('\n--- DARK THEME VERIFICATION ---');
  testPair('DARK', 'Primary Text on Main App Background', darkTheme.textMain, darkTheme.bgPrimary);
  testPair('DARK', 'Primary Text on Card/Surface Background', darkTheme.textMain, darkTheme.bgCard);
  testPair('DARK', 'Primary Text on Secondary Background', darkTheme.textMain, darkTheme.bgSecondary);
  testPair('DARK', 'Primary Text on Hover Background', darkTheme.textMain, darkTheme.bgHover);
  testPair('DARK', 'Muted Text on Card Background', darkTheme.textMuted, darkTheme.bgCard);
  testPair('DARK', 'Muted Text on Main App Background', darkTheme.textMuted, darkTheme.bgPrimary);
  testPair('DARK', 'Dim Text on Card Background', darkTheme.textDim, darkTheme.bgCard);
  testPair('DARK', 'Dim Text on Secondary Background', darkTheme.textDim, darkTheme.bgSecondary);
  testPair('DARK', 'Accent Button (White on Indigo-600)', darkTheme.accentText, darkTheme.accentPrimary);
  testPair('DARK', 'Accent Button Hover (White on Indigo-700)', darkTheme.accentText, darkTheme.accentHover, undefined, 3.0); // UI element
  testPair('DARK', 'Success Badge (Emerald on Tinted Card)', darkTheme.emerald, darkTheme.emeraldBg, darkTheme.bgCard);
  testPair('DARK', 'Danger Badge (Ruby on Tinted Card)', darkTheme.ruby, darkTheme.rubyBg, darkTheme.bgCard);
  testPair('DARK', 'Warning Badge (Amber on Tinted Card)', darkTheme.amber, darkTheme.amberBg, darkTheme.bgCard);
  testPair('DARK', 'Info Badge (Cyan on Tinted Card)', darkTheme.cyan, darkTheme.cyanBg, darkTheme.bgCard);
  testPair('DARK', 'Titlebar Text on Titlebar Bg', darkTheme.titlebarText, darkTheme.titlebarBg);
  testPair('DARK', 'Chip Mono Text on Hover Bg', darkTheme.textMuted, darkTheme.bgHover);

  console.log('\n--- GRAY THEME VERIFICATION ---');
  const grayTheme = {
    bgPrimary: '#18181B',
    bgSecondary: '#202024',
    bgCard: '#27272A',
    bgHover: '#323238',
    textMain: '#FAFAFA',
    textMuted: '#D4D4D8',
    textDim: '#A1A1AA',
    accentPrimary: '#4F46E5',
    accentHover: '#4338CA',
    accentText: '#FFFFFF',
    emerald: '#34D399',
    emeraldBg: 'rgba(52, 211, 153, 0.16)',
    ruby: '#FCA5A5',
    rubyBg: 'rgba(248, 113, 113, 0.16)',
    amber: '#FBBF24',
    amberBg: 'rgba(251, 191, 36, 0.16)',
    cyan: '#38BDF8',
    cyanBg: 'rgba(56, 189, 248, 0.16)',
    titlebarBg: '#18181B',
    titlebarText: '#D4D4D8'
  };

  testPair('GRAY', 'Primary Text on Main App Background', grayTheme.textMain, grayTheme.bgPrimary);
  testPair('GRAY', 'Primary Text on Card/Surface Background', grayTheme.textMain, grayTheme.bgCard);
  testPair('GRAY', 'Primary Text on Hover Background', grayTheme.textMain, grayTheme.bgHover);
  testPair('GRAY', 'Muted Text on Card Background', grayTheme.textMuted, grayTheme.bgCard);
  testPair('GRAY', 'Dim Text on Card Background', grayTheme.textDim, grayTheme.bgCard);
  testPair('GRAY', 'Accent Button (White on Indigo-600)', grayTheme.accentText, grayTheme.accentPrimary);
  testPair('GRAY', 'Accent Button Hover (White on Indigo-700)', grayTheme.accentText, grayTheme.accentHover);
  testPair('GRAY', 'Success Badge (Emerald on Tinted Card)', grayTheme.emerald, grayTheme.emeraldBg, grayTheme.bgCard);
  testPair('GRAY', 'Danger Badge (Ruby on Tinted Card)', grayTheme.ruby, grayTheme.rubyBg, grayTheme.bgCard);
  testPair('GRAY', 'Warning Badge (Amber on Tinted Card)', grayTheme.amber, grayTheme.amberBg, grayTheme.bgCard);
  testPair('GRAY', 'Info Badge (Cyan on Tinted Card)', grayTheme.cyan, grayTheme.cyanBg, grayTheme.bgCard);
  testPair('GRAY', 'Titlebar Text on Titlebar Bg', grayTheme.titlebarText, grayTheme.titlebarBg);

  console.log('\n========================================================================');
  console.log(`Total Checks: ${totalTests} | Passed: ${passCount} | Failed: ${failCount}`);
  console.log('========================================================================');

  if (failCount > 0) {
    process.exit(1);
  }
}

runContrastSuite();
