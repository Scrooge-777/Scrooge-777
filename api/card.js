const fs = require('fs');
const path = require('path');

// 10 Distinct, Non-Vibrant / Dark-Mode Sophisticated Palettes
const THEMES = [
  {
    name: 'cyber_gold',
    label: 'Cyber Gold',
    accent: '#ffd700',
    accentLight: '#ffea78',
    bg0: '#1f180a', bg1: '#0d0c08', bg2: '#030302',
    c0t: '#2a2620', c0l: '#211d17', c0r: '#1a1712',
    c1t: '#7c6224', c1l: '#68521e', c1r: '#544218',
    c2t: '#b8860b', c2l: '#9e7309', c2r: '#825e07',
    c3t: '#e6b800', c3l: '#c49d00', c3r: '#a38200',
    c4t: '#ffd700', c4l: '#e6c200', c4r: '#ccad00'
  },
  {
    name: 'nordic_ice',
    label: 'Nordic Ice Blue',
    accent: '#38bdf8',
    accentLight: '#bae6fd',
    bg0: '#0c1a2e', bg1: '#08101d', bg2: '#02050a',
    c0t: '#16202c', c0l: '#121922', c0r: '#0e131b',
    c1t: '#1e4868', c1l: '#183952', c1r: '#132d41',
    c2t: '#2572a6', c2l: '#1e5b85', c2r: '#18496a',
    c3t: '#2e9ad8', c3l: '#257cac', c3r: '#1c6085',
    c4t: '#38bdf8', c4l: '#2e9ad8', c4r: '#257cac'
  },
  {
    name: 'matrix_emerald',
    label: 'Matrix Emerald',
    accent: '#10b981',
    accentLight: '#6ee7b7',
    bg0: '#081c14', bg1: '#05110c', bg2: '#020504',
    c0t: '#142219', c0l: '#0f1b14', c0r: '#0b140f',
    c1t: '#165032', c1l: '#124028', c1r: '#0e321f',
    c2t: '#1d7d4c', c2l: '#17643d', c2r: '#124e30',
    c3t: '#10b981', c3l: '#0d9467', c3r: '#0a7451',
    c4t: '#34d399', c4l: '#10b981', c4r: '#059669'
  },
  {
    name: 'royal_amethyst',
    label: 'Royal Amethyst',
    accent: '#a855f7',
    accentLight: '#d8b4fe',
    bg0: '#1b0c2e', bg1: '#11071c', bg2: '#050208',
    c0t: '#20162a', c0l: '#191121', c0r: '#130d19',
    c1t: '#48206f', c1l: '#391a58', c1r: '#2c1444',
    c2t: '#6e31a8', c2l: '#572785', c2r: '#441e68',
    c3t: '#9333ea', c3l: '#7e22ce', c3r: '#6b21a8',
    c4t: '#a855f7', c4l: '#9333ea', c4r: '#7e22ce'
  },
  {
    name: 'crimson_ruby',
    label: 'Crimson Ruby',
    accent: '#f43f5e',
    accentLight: '#fda4af',
    bg0: '#2b0b14', bg1: '#19060b', bg2: '#070103',
    c0t: '#26161a', c0l: '#1e1114', c0r: '#170d10',
    c1t: '#6e1d31', c1l: '#581727', c1r: '#44121e',
    c2t: '#a72545', c2l: '#851d37', c2r: '#67172b',
    c3t: '#e11d48', c3l: '#be123c', c3r: '#9f1239',
    c4t: '#f43f5e', c4l: '#e11d48', c4r: '#be123c'
  },
  {
    name: 'cyber_cyan',
    label: 'Cyber Cyan',
    accent: '#06b6d4',
    accentLight: '#67e8f9',
    bg0: '#061c22', bg1: '#041115', bg2: '#010507',
    c0t: '#132125', c0l: '#0f1a1d', c0r: '#0b1416',
    c1t: '#124e5b', c1l: '#0e3e49', c1r: '#0b3038',
    c2t: '#127b91', c2l: '#0e6274', c2r: '#0b4d5a',
    c3t: '#0891b2', c3l: '#0e7490', c3r: '#155e75',
    c4t: '#06b6d4', c4l: '#0891b2', c4r: '#0e7490'
  },
  {
    name: 'sunset_amber',
    label: 'Sunset Amber',
    accent: '#f97316',
    accentLight: '#fed7aa',
    bg0: '#261206', bg1: '#160a03', bg2: '#060201',
    c0t: '#241a14', c0l: '#1c140f', c0r: '#150f0b',
    c1t: '#683515', c1l: '#532a11', c1r: '#3f200d',
    c2t: '#9f4d17', c2l: '#7f3d12', c2r: '#622f0e',
    c3t: '#ea580c', c3l: '#c2410c', c3r: '#9a3412',
    c4t: '#f97316', c4l: '#ea580c', c4r: '#c2410c'
  },
  {
    name: 'acid_lime',
    label: 'Acid Lime',
    accent: '#84cc16',
    accentLight: '#d9f99d',
    bg0: '#172206', bg1: '#0e1503', bg2: '#030601',
    c0t: '#1b2214', c0l: '#151b10', c0r: '#10140c',
    c1t: '#455e16', c1l: '#374b12', c1r: '#29380d',
    c2t: '#658d19', c2l: '#517114', c2r: '#3d550f',
    c3t: '#65a30d', c3l: '#4d7c0f', c3r: '#3f6212',
    c4t: '#84cc16', c4l: '#65a30d', c4r: '#4d7c0f'
  },
  {
    name: 'sakura_rose',
    label: 'Sakura Rose',
    accent: '#ec4899',
    accentLight: '#fbcfe8',
    bg0: '#270c1e', bg1: '#170712', bg2: '#060104',
    c0t: '#251720', c0l: '#1d1219', c0r: '#160e13',
    c1t: '#671f49', c1l: '#52193a', c1r: '#3f132c',
    c2t: '#9e296a', c2l: '#7e2154', c2r: '#611941',
    c3t: '#db2777', c3l: '#be185d', c3r: '#9d174d',
    c4t: '#ec4899', c4l: '#db2777', c4r: '#be185d'
  },
  {
    name: 'monochrome_platinum',
    label: 'Monochrome Platinum',
    accent: '#e2e8f0',
    accentLight: '#ffffff',
    bg0: '#11151c', bg1: '#0b0e13', bg2: '#030406',
    c0t: '#1b1f28', c0l: '#151820', c0r: '#101319',
    c1t: '#394254', c1l: '#2d3443', c1r: '#232934',
    c2t: '#58657d', c2l: '#465063', c2r: '#363e4d',
    c3t: '#94a3b8', c3l: '#64748b', c3r: '#475569',
    c4t: '#e2e8f0', c4l: '#cbd5e1', c4r: '#94a3b8'
  }
];

let cachedSvg = null;
let warmCounter = Math.floor(Math.random() * THEMES.length);

async function getSvgContent() {
  // 1. Live copy from GitHub first, so the card stays fresh without a Vercel redeploy
  try {
    const rawUrl = `https://raw.githubusercontent.com/Scrooge-777/Scrooge-777/main/assets/profile_card.svg?nocache=${Date.now()}`;
    const resp = await fetch(rawUrl, {
      headers: { 'User-Agent': 'Scrooge-Profile-Worker', 'Cache-Control': 'no-cache' },
      signal: AbortSignal.timeout(3500)
    });
    if (resp.ok) {
      const text = await resp.text();
      if (text.includes('<svg') && text.includes('</svg>')) {
        cachedSvg = text;
        return text;
      }
    }
  } catch (err) {
    // fall through to cached / bundled copy
  }

  // 2. Last good live copy on a warm lambda
  if (cachedSvg) {
    return cachedSvg;
  }

  // 3. Bundled file from the deployed build
  const candidates = [
    path.join(__dirname, '..', 'assets', 'profile_card.svg'),
    path.join(process.cwd(), 'assets', 'profile_card.svg'),
    path.join(__dirname, 'assets', 'profile_card.svg')
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      return fs.readFileSync(c, 'utf8');
    }
  }

  throw new Error('profile_card.svg not found in candidates');
}

async function generateCard(selectedThemeName) {
  let svg = await getSvgContent();

  let theme = THEMES.find(t => t.name === selectedThemeName);
  if (!theme) {
    // Round-robin advance for warm lambdas + time hash for cold starts
    warmCounter = (warmCounter + 1) % THEMES.length;
    const timeIndex = Math.floor(Date.now() / 1200) % THEMES.length;
    const index = (warmCounter + timeIndex) % THEMES.length;
    theme = THEMES[index];
  }

  // 1. Replace Background Gradient
  svg = svg.replace(/<radialGradient id="bg"[^>]*>.*?<\/radialGradient>/s,
    `<radialGradient id="bg" cx="25%" cy="15%" r="95%"><stop offset="0" stop-color="${theme.bg0}"/><stop offset="0.55" stop-color="${theme.bg1}"/><stop offset="1" stop-color="${theme.bg2}"/></radialGradient>`);

  // 2. Replace Radar Fill & Title Gradients
  svg = svg.replace(/<linearGradient id="radarFill"[^>]*>.*?<\/linearGradient>/s,
    `<linearGradient id="radarFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${theme.accent}" stop-opacity="0.32"/><stop offset="1" stop-color="${theme.accent}" stop-opacity="0.05"/></linearGradient>`);

  svg = svg.replace(/<linearGradient id="title"[^>]*>.*?<\/linearGradient>/s,
    `<linearGradient id="title" x1="0" x2="1"><stop offset="0" stop-color="${theme.accent}"/><stop offset="1" stop-color="${theme.accentLight}"/></linearGradient>`);

  // 3. Replace Style Color Classes for 3D Island & Activity Legend
  const newClasses = `.c0t{fill:${theme.c0t}}.c0l{fill:${theme.c0l}}.c0r{fill:${theme.c0r}}
.c1t{fill:${theme.c1t}}.c1l{fill:${theme.c1l}}.c1r{fill:${theme.c1r}}
.c2t{fill:${theme.c2t}}.c2l{fill:${theme.c2l}}.c2r{fill:${theme.c2r}}
.c3t{fill:${theme.c3t}}.c3l{fill:${theme.c3l}}.c3r{fill:${theme.c3r}}
.c4t{fill:${theme.c4t}}.c4l{fill:${theme.c4l}}.c4r{fill:${theme.c4r}}`;

  svg = svg.replace(/\.c0t\{fill:[^}]+\}\.c0l\{fill:[^}]+\}\.c0r\{fill:[^}]+\}\s*\.c1t\{fill:[^}]+\}\.c1l\{fill:[^}]+\}\.c1r\{fill:[^}]+\}\s*\.c2t\{fill:[^}]+\}\.c2l\{fill:[^}]+\}\.c2r\{fill:[^}]+\}\s*\.c3t\{fill:[^}]+\}\.c3l\{fill:[^}]+\}\.c3r\{fill:[^}]+\}\s*\.c4t\{fill:[^}]+\}\.c4l\{fill:[^}]+\}\.c4r\{fill:[^}]+\}/,
    newClasses);

  // 4. Update Drop Shadow & Radar Stroke / Nodes / Strong KPI text
  svg = svg.replace(/filter:drop-shadow\(0 0 12px #[0-9a-fA-F]+\)/g, `filter:drop-shadow(0 0 12px ${theme.accent})`);
  svg = svg.replace(/(<polygon points="[^"]+" fill="url\(#radarFill\)" stroke=")[^"]+(" stroke-width="1.8" stroke-linejoin="round"\/>)/g, `$1${theme.accent}$2`);
  svg = svg.replace(/(<circle class="radar-node" cx="[^"]+" cy="[^"]+" r="4" fill=")[^"]+("\/>)/g, `$1${theme.accent}$2`);
  svg = svg.replace(/\.strong\{fill:#[0-9a-fA-F]+\}/g, `.strong{fill:${theme.accent}}`);
  svg = svg.replace(/stroke:#57da69/g, `stroke:${theme.accent}`);

  return { svg, themeName: theme.name, themeLabel: theme.label };
}

module.exports = async (req, res) => {
  try {
    const selectedTheme = req && req.query ? req.query.theme : null;
    const { svg, themeName, themeLabel } = await generateCard(selectedTheme);

    res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=0, must-revalidate, no-cache, no-store');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('X-Selected-Theme', themeName);
    res.setHeader('X-Theme-Label', themeLabel);

    res.status(200).send(svg);
  } catch (err) {
    res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
    res.status(500).send('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="40"><text y="20" fill="#f43f5e">Card unavailable</text></svg>');
  }
};

module.exports.generateCard = generateCard;
module.exports.THEMES = THEMES;
