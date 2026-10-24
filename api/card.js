const fs = require('fs');
const path = require('path');

const THEMES = [
  {
    name: 'scrooge_gold',
    accent: '#d4af37',
    accentLight: '#f3e5ab',
    bg0: '#1a1712',
    bg1: '#0d0c0a',
    bg2: '#030302',
    c0t: '#2a2620', c0l: '#211d17', c0r: '#1a1712',
    c1t: '#7c6224', c1l: '#68521e', c1r: '#544218',
    c2t: '#b8860b', c2l: '#9e7309', c2r: '#825e07',
    c3t: '#d4af37', c3l: '#b3932b', c3r: '#927720',
    c4t: '#f3e5ab', c4l: '#d4af37', c4r: '#b8860b'
  },
  {
    name: 'nordic_slate',
    accent: '#7dd3fc',
    accentLight: '#bae6fd',
    bg0: '#0c1524',
    bg1: '#070c14',
    bg2: '#020408',
    c0t: '#1e2430', c0l: '#171c26', c0r: '#11151c',
    c1t: '#244b6e', c1l: '#1d3c58', c1r: '#162e43',
    c2t: '#2b6e9e', c2l: '#22587e', c2r: '#1a4360',
    c3t: '#3894cf', c3l: '#2d76a5', c3r: '#22597d',
    c4t: '#7dd3fc', c4l: '#5ebbe8', c4r: '#42a3d4'
  },
  {
    name: 'deep_emerald',
    accent: '#34d399',
    accentLight: '#6ee7b7',
    bg0: '#081a12',
    bg1: '#05100b',
    bg2: '#020604',
    c0t: '#1b261e', c0l: '#151e18', c0r: '#0f1712',
    c1t: '#1d542b', c1l: '#174322', c1r: '#11331a',
    c2t: '#23783e', c2l: '#1c6031', c2r: '#154926',
    c3t: '#2ca053', c3l: '#238042', c3r: '#1a6132',
    c4t: '#5eead4', c4l: '#34d399', c4r: '#10b981'
  },
  {
    name: 'amethyst_dusk',
    accent: '#c084fc',
    accentLight: '#e9d5ff',
    bg0: '#140a1c',
    bg1: '#0c0612',
    bg2: '#040206',
    c0t: '#241e2b', c0l: '#1d1722', c0r: '#15101a',
    c1t: '#4a2c68', c1l: '#3b2353', c1r: '#2c1a3e',
    c2t: '#6d3d99', c2l: '#57307a', c2r: '#42245d',
    c3t: '#8c4ec5', c3l: '#703e9e', c3r: '#552e77',
    c4t: '#c084fc', c4l: '#a855f7', c4r: '#7e22ce'
  },
  {
    name: 'monochrome_steel',
    accent: '#cbd5e1',
    accentLight: '#f1f5f9',
    bg0: '#0f141c',
    bg1: '#090d13',
    bg2: '#030508',
    c0t: '#1f242c', c0l: '#181c22', c0r: '#12151a',
    c1t: '#3b4452', c1l: '#2f3642', c1r: '#232932',
    c2t: '#5b677a', c2l: '#495362', c2r: '#373e4a',
    c3t: '#818fa3', c3l: '#677382', c3r: '#4e5663',
    c4t: '#cbd5e1', c4l: '#94a3b8', c4r: '#64748b'
  },
  {
    name: 'bronze_ember',
    accent: '#fb923c',
    accentLight: '#ffedd5',
    bg0: '#180e08',
    bg1: '#0e0804',
    bg2: '#040201',
    c0t: '#28201a', c0l: '#201914', c0r: '#18120e',
    c1t: '#5e381f', c1l: '#4b2d18', c1r: '#382112',
    c2t: '#8c522a', c2l: '#704121', c2r: '#543118',
    c3t: '#ba6e38', c3l: '#95582c', c3r: '#704221',
    c4t: '#fb923c', c4l: '#ea580c', c4r: '#c2410c'
  }
];

function getSvgContent() {
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
  throw new Error('profile_card.svg not found in candidates: ' + candidates.join(', '));
}

function generateCard(selectedThemeName) {
  let svg = getSvgContent();

  let theme = THEMES.find(t => t.name === selectedThemeName);
  if (!theme) {
    theme = THEMES[Math.floor(Math.random() * THEMES.length)];
  }

  // 1. Replace Background Gradient
  svg = svg.replace(/<radialGradient id="bg"[^>]*>.*?<\/radialGradient>/s,
    `<radialGradient id="bg" cx="25%" cy="15%" r="95%"><stop offset="0" stop-color="${theme.bg0}"/><stop offset="0.55" stop-color="${theme.bg1}"/><stop offset="1" stop-color="${theme.bg2}"/></radialGradient>`);

  // 2. Replace Radar Fill & Title Gradients
  svg = svg.replace(/<linearGradient id="radarFill"[^>]*>.*?<\/linearGradient>/s,
    `<linearGradient id="radarFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${theme.accent}" stop-opacity="0.32"/><stop offset="1" stop-color="${theme.accent}" stop-opacity="0.05"/></linearGradient>`);

  svg = svg.replace(/<linearGradient id="title"[^>]*>.*?<\/linearGradient>/s,
    `<linearGradient id="title" x1="0" x2="1"><stop offset="0" stop-color="${theme.accent}"/><stop offset="1" stop-color="${theme.accentLight}"/></linearGradient>`);

  // 3. Replace Style Color Classes
  const newClasses = `.c0t{fill:${theme.c0t}}.c0l{fill:${theme.c0l}}.c0r{fill:${theme.c0r}}
.c1t{fill:${theme.c1t}}.c1l{fill:${theme.c1l}}.c1r{fill:${theme.c1r}}
.c2t{fill:${theme.c2t}}.c2l{fill:${theme.c2l}}.c2r{fill:${theme.c2r}}
.c3t{fill:${theme.c3t}}.c3l{fill:${theme.c3l}}.c3r{fill:${theme.c3r}}
.c4t{fill:${theme.c4t}}.c4l{fill:${theme.c4l}}.c4r{fill:${theme.c4r}}`;

  svg = svg.replace(/\.c0t\{fill:[^}]+\}\.c0l\{fill:[^}]+\}\.c0r\{fill:[^}]+\}\s*\.c1t\{fill:[^}]+\}\.c1l\{fill:[^}]+\}\.c1r\{fill:[^}]+\}\s*\.c2t\{fill:[^}]+\}\.c2l\{fill:[^}]+\}\.c2r\{fill:[^}]+\}\s*\.c3t\{fill:[^}]+\}\.c3l\{fill:[^}]+\}\.c3r\{fill:[^}]+\}\s*\.c4t\{fill:[^}]+\}\.c4l\{fill:[^}]+\}\.c4r\{fill:[^}]+\}/,
    newClasses);

  // 4. Update Drop Shadow & Radar Stroke / Fill / Strong text
  svg = svg.replace(/filter:drop-shadow\(0 0 12px #[0-9a-fA-F]+\)/g, `filter:drop-shadow(0 0 12px ${theme.accent})`);
  svg = svg.replace(/(<polygon points="[^"]+" fill="url\(#radarFill\)" stroke=")[^"]+(" stroke-width="1.8" stroke-linejoin="round"\/>)/g, `$1${theme.accent}$2`);
  svg = svg.replace(/(<circle class="radar-node" cx="[^"]+" cy="[^"]+" r="4" fill=")[^"]+("\/>)/g, `$1${theme.accent}$2`);
  svg = svg.replace(/\.strong\{fill:#[0-9a-fA-F]+\}/g, `.strong{fill:${theme.accent}}`);

  return { svg, themeName: theme.name };
}

module.exports = (req, res) => {
  try {
    const selectedTheme = req && req.query ? req.query.theme : null;
    const { svg, themeName } = generateCard(selectedTheme);

    res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=0, must-revalidate, no-cache, no-store');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('X-Selected-Theme', themeName);

    res.status(200).send(svg);
  } catch (err) {
    res.status(500).send(`<svg xmlns="http://www.w3.org/2000/svg"><text y="20">Error: ${err.message}</text></svg>`);
  }
};

module.exports.generateCard = generateCard;
module.exports.THEMES = THEMES;
