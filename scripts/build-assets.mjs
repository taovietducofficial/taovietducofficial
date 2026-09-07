/**
 * Builds the animated stat SVGs used by the profile README.
 *
 *   node scripts/build-assets.mjs
 *
 * No dependencies - Node 18+ global fetch only.
 *
 * Every figure (and the avatar image) is read live from the GitHub API, so the
 * committed SVGs are never hand-edited. Animation is plain CSS @keyframes inside
 * each file: a browser renders an <img>-referenced SVG in secure animated mode,
 * which runs declarative CSS but blocks script and external fetches - so the
 * avatar is embedded as a base64 data: URI rather than linked, and third-party
 * card services (github-readme-stats and friends) are deliberately avoided,
 * since their free instances go down.
 *
 * Every counter animation is written so the unanimated resting state is already
 * correct, which is why the counter columns are stacked target-first and roll
 * upward to a zero offset rather than downward from it.
 */

import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const USER = 'taovietducofficial';
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets');

const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const MONO = "ui-monospace,SFMono-Regular,'SF Mono',Menlo,Consolas,monospace";

const DOT = '·';
const DASH = '—';

const THEMES = {
  dark: {
    panel: '#161b22', border: '#30363d', text: '#e6edf3', muted: '#8b949e', dim: '#6e7681',
    star: '#e3b341', fork: '#39c5cf', repo: '#a371f7',
    chip: '#21262d', sheen: '#ffffff', sheenOp: '0.09',
    bg0: '#0d1117', bg1: '#1b2230', accent: '#39c5cf', accent2: '#a371f7',
    grainOp: '0.05',
  },
  light: {
    panel: '#f6f8fa', border: '#d1d9e0', text: '#1f2328', muted: '#59636e', dim: '#818b98',
    star: '#9a6700', fork: '#0969da', repo: '#8250df',
    chip: '#eaeef2', sheen: '#1f2328', sheenOp: '0.07',
    bg0: '#ffffff', bg1: '#e9eff7', accent: '#0969da', accent2: '#8250df',
    grainOp: '0.035',
  },
};

const esc = (s) => String(s).replace(/[&<>"']/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));

const fmt = (n) => n.toLocaleString('en-US');

// --------------------------------------------------------------- GitHub API

const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';

async function api(path) {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': `${USER}-profile-stats`,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${res.statusText}`);
  return res.json();
}

async function fetchAvatarDataUri(url) {
  const res = await fetch(`${url}&s=200`);
  if (!res.ok) throw new Error(`avatar -> ${res.status} ${res.statusText}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const type = res.headers.get('content-type') || 'image/jpeg';
  return `data:${type};base64,${buf.toString('base64')}`;
}

async function collect() {
  const [user, repos] = await Promise.all([
    api(`/users/${USER}`),
    api(`/users/${USER}/repos?per_page=100&type=owner`)
      .then((rs) => rs.filter((r) => !r.fork && !r.archived)),
  ]);
  const avatar = await fetchAvatarDataUri(user.avatar_url);

  return {
    avatar,
    followers: user.followers,
    stars: repos.reduce((n, r) => n + r.stargazers_count, 0),
    forks: repos.reduce((n, r) => n + r.forks_count, 0),
    repoCount: repos.length,
    repos,
  };
}

// ------------------------------------------------------------------- icons

function starIcon(cx, cy, c) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = ((-90 + i * 36) * Math.PI) / 180;
    const r = i % 2 ? 3.2 : 7.6;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`);
  }
  return `<polygon points="${pts.join(' ')}" fill="${c}"/>`;
}

function forkIcon(x, y, c) {
  return `<g fill="${c}" stroke="${c}" stroke-width="1.7" stroke-linecap="round">`
    + `<circle cx="${x - 6}" cy="${y - 6}" r="2.3" stroke="none"/>`
    + `<circle cx="${x + 6}" cy="${y - 6}" r="2.3" stroke="none"/>`
    + `<circle cx="${x}" cy="${y + 6.5}" r="2.3" stroke="none"/>`
    + `<path fill="none" d="M${x - 6} ${y - 3.2} V${y - 1} H${x + 6} V${y - 3.2} M${x} ${y - 1} V${y + 4}"/>`
    + `</g>`;
}

function repoIcon(x, y, c) {
  return `<g fill="none" stroke="${c}" stroke-width="1.7" stroke-linejoin="round">`
    + `<path d="M${x - 6} ${y - 5.2} A2.3 2.3 0 0 1 ${x - 3.7} ${y - 7.5} H${x + 6} V${y + 4.4} H${x - 3.7}`
      + ` A2.3 2.3 0 0 0 ${x - 6} ${y + 6.7} Z"/>`
    + `<path d="M${x + 6} ${y + 4.4} V${y + 7.5} H${x - 3.7}"/>`
    + `</g>`;
}

// ------------------------------------------------------------- shared defs
//
// A single fine-grain noise filter, reused by both cards, keeps the panels
// from reading as flat vector fills - a fixed seed keeps dark/light in sync.

function grainFilter(id) {
  return `<filter id="${id}" x="-20%" y="-20%" width="140%" height="140%">`
    + `<feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="7" stitchTiles="stitch" result="n"/>`
    + `<feColorMatrix in="n" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.7 0"/>`
    + `</filter>`;
}

// --------------------------------------------------------- animated counter
//
// A per-digit odometer is fragile to build and to read. This instead stacks sampled
// values in a column and steps the column through them, so every frame lands exactly
// on a rendered number. The column is ordered target-first and animates from a
// negative offset back to zero, so if CSS animation never runs the resting frame
// still shows the true figure rather than a zero.

const STEPS = 14;
const ROW = 38;

function ramp(target) {
  const out = [];
  for (let i = 0; i <= STEPS; i++) {
    const t = i / STEPS;
    out.push(i === STEPS ? target : Math.round(target * (1 - Math.pow(1 - t, 2.4))));
  }
  return out.reverse(); // [target, ..., 0]
}

// -------------------------------------------------------------- impact strip

function impactSVG(d, key) {
  const th = THEMES[key];
  const W = 900, GAP = 12;
  const H = 132;
  const TW = (W - GAP * 2) / 3;

  const tiles = [
    { label: 'TOTAL STARS', value: d.stars, color: th.star, icon: starIcon },
    { label: 'FORKS', value: d.forks, color: th.fork, icon: forkIcon },
    { label: 'PUBLIC REPOS', value: d.repoCount, color: th.repo, icon: repoIcon },
  ];

  const at = (i) => i * (TW + GAP);

  const clips = tiles.map((_, i) =>
    `<clipPath id="win${i}"><rect x="${at(i)}" y="57" width="${TW}" height="38"/></clipPath>`).join('');

  const sheenClip = `<clipPath id="tiles">`
    + tiles.map((_, i) => `<rect x="${at(i)}" y="0" width="${TW}" height="${H}" rx="14"/>`).join('')
    + `</clipPath>`;

  const groups = tiles.map((t, i) => {
    const x = at(i);
    const cx = x + TW / 2;
    const nums = ramp(t.value).map((v, k) =>
      `<text x="${cx}" y="${86 + k * ROW}" class="n" fill="${t.color}">${fmt(v)}</text>`).join('');
    return `<g class="tile" style="animation-delay:${(0.05 + i * 0.09).toFixed(2)}s">`
      + `<rect x="${x}" y="0" width="${TW}" height="${H}" rx="14" fill="${th.panel}" stroke="${th.border}"/>`
      + `<rect x="${x + 0.75}" y="0.75" width="${TW - 1.5}" height="${H - 1.5}" rx="13.25" fill="none" stroke="${t.color}" stroke-opacity=".14"/>`
      + t.icon(cx, 32, t.color)
      + `<g clip-path="url(#win${i})"><g class="roll" style="animation-delay:${(0.35 + i * 0.1).toFixed(2)}s">${nums}</g></g>`
      + `<text x="${cx}" y="116" class="l" fill="${th.muted}">${t.label}</text>`
      + `</g>`;
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${fmt(d.stars)} stars, ${fmt(d.forks)} forks and ${d.repoCount} public repositories">
<title>${fmt(d.stars)} stars ${DOT} ${fmt(d.forks)} forks ${DOT} ${d.repoCount} repos</title>
<defs>${clips}${sheenClip}
${grainFilter('grain')}
<linearGradient id="sheenG" x1="0" y1="0" x2="1" y2="0">
<stop offset="0" stop-color="${th.sheen}" stop-opacity="0"/>
<stop offset=".5" stop-color="${th.sheen}" stop-opacity="${th.sheenOp}"/>
<stop offset="1" stop-color="${th.sheen}" stop-opacity="0"/>
</linearGradient></defs>
<style>
.n{font-family:${SANS};font-size:34px;font-weight:700;text-anchor:middle;font-variant-numeric:tabular-nums}
.l{font-family:${SANS};font-size:10.5px;font-weight:600;letter-spacing:1.4px;text-anchor:middle}
.tile{animation:fade .55s ease-out both}
.roll{animation:roll 1.5s steps(${STEPS}) both}
.sheen{animation:sweep 6s ease-in-out 2.4s infinite}
@keyframes fade{from{opacity:0}to{opacity:1}}
@keyframes roll{from{transform:translateY(-${ROW * STEPS}px)}to{transform:translateY(0)}}
@keyframes sweep{0%,6%{transform:translateX(0)}58%,100%{transform:translateX(1240px)}}
</style>
${groups}
<g clip-path="url(#tiles)">
<g class="sheen"><rect x="-270" y="-40" width="150" height="${H + 80}" fill="url(#sheenG)" transform="skewX(-18)"/></g>
<rect x="0" y="0" width="${W}" height="${H}" filter="url(#grain)" opacity="${th.grainOp}" fill="#ffffff"/>
</g>
</svg>
`;
}

// -------------------------------------------------------------------- hero
//
// The copy here is static, but the file is generated rather than hand-written so
// the dark and light variants cannot drift apart and the network graph's edge
// geometry stays derived rather than eyeballed.

const HERO = {
  prompt: 'taovietducofficial ~ $ whoami',
  name: 'Tào Việt Đức',
  role: `Software Engineer II ${DOT} Aspiring DevOps Engineer`,
  focus: `Backend Engineering ${DOT} System Design ${DOT} DevOps ${DOT} CI/CD`,
};

function heroSVG(d, key) {
  const th = THEMES[key];
  const W = 900, CH = 190;
  const TOP_M = 0, SIDE_M = 0;
  const H = CH;
  const CW = 7.5; // monospace advance width at 12.5px
  const pw = HERO.prompt.length * CW;

  const AX = 92, AY = TOP_M + 132, AR = 38; // avatar center/radius, card-local

  // A git branch/merge graph, kept as a quiet ambient texture behind the
  // right two-thirds of the identity row - closer to this identity (git,
  // CI/CD, backend) than a generic neural-net motif would be.
  const gy = TOP_M + 136;
  const trunkY = gy, branchY = gy - 32;
  const GX0 = 570, GX1 = 856;
  const forkX = 636, mergeX = 800;
  const trunkDots = [GX0, forkX, mergeX, GX1];
  const branchDots = [700, 760];

  const trunkPath = `M${GX0},${trunkY} L${GX1},${trunkY}`;
  const branchPath = `M${forkX},${trunkY} C${forkX + 26},${trunkY} ${forkX + 26},${branchY} ${forkX + 52},${branchY}`
    + ` L${mergeX - 26},${branchY} C${mergeX},${branchY} ${mergeX},${trunkY} ${mergeX + 26},${trunkY}`;

  const edges = `<path class="edge trunk" d="${trunkPath}" style="animation-delay:.1s"/>`
    + `<path class="edge branch" d="${branchPath}" style="animation-delay:.4s"/>`;

  let n = 0;
  const dot = (x, y, c) => {
    const s = `<circle class="node" cx="${x}" cy="${y}" r="3.6" fill="${c}"`
      + ` style="animation-delay:${(n * 0.18).toFixed(2)}s"/>`;
    n++;
    return s;
  };
  const nodes = trunkDots.map((x) => dot(x, trunkY, th.accent)).join('')
    + branchDots.map((x) => dot(x, branchY, th.accent2)).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(HERO.name)}, ${fmt(d.followers)} followers ${DASH} ${esc(HERO.role)}">
<title>${esc(HERO.name)} ${DASH} ${esc(HERO.role)}</title>
<defs>
<linearGradient id="bgG" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="${th.bg0}"/><stop offset="1" stop-color="${th.bg1}"/>
</linearGradient>
<linearGradient id="accentG" x1="0" y1="0" x2="1" y2="0">
<stop offset="0" stop-color="${th.accent}"/><stop offset="1" stop-color="${th.accent2}"/>
</linearGradient>
<linearGradient id="ringG" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="${th.accent}"/><stop offset="1" stop-color="${th.accent2}"/>
</linearGradient>
<radialGradient id="glowG">
<stop offset="0" stop-color="${th.accent}" stop-opacity=".22"/>
<stop offset="1" stop-color="${th.accent}" stop-opacity="0"/>
</radialGradient>
<clipPath id="heroClip"><rect x="${SIDE_M}" y="${TOP_M}" width="${W - SIDE_M * 2}" height="${CH}" rx="16"/></clipPath>
<clipPath id="typeClip"><rect class="type" x="${48 + SIDE_M}" y="${TOP_M + 44}" width="${(pw + 14).toFixed(1)}" height="24"/></clipPath>
<clipPath id="avatarClip"><circle cx="${AX}" cy="${AY}" r="${AR}"/></clipPath>
${grainFilter('grain')}
</defs>
<rect x="${SIDE_M}" y="${TOP_M}" width="${W - SIDE_M * 2}" height="${CH}" rx="16" fill="url(#bgG)" stroke="${th.border}"/>
<g clip-path="url(#heroClip)">
<ellipse class="glow" cx="${W - 90}" cy="${TOP_M + CH / 2}" rx="240" ry="150" fill="url(#glowG)"/>
${edges}
${nodes}
<rect x="${SIDE_M}" y="${TOP_M}" width="${W - SIDE_M * 2}" height="${CH}" filter="url(#grain)" opacity="${th.grainOp}" fill="#ffffff"/>
</g>
<style>
.p{font-family:${MONO};font-size:12.5px}
.nm{font-family:${SANS};font-size:29px;font-weight:800}
.fw{font-family:${SANS};font-size:14px;font-weight:600}
.rl{font-family:${SANS};font-size:13.5px}
.fc{font-family:${MONO};font-size:11.5px;letter-spacing:.4px}
.type{animation:type 1.45s steps(${HERO.prompt.length + 2}) .25s both;transform-box:fill-box;transform-origin:left}
.caret{animation:blink 1.06s step-end infinite}
.up{animation:up .6s cubic-bezier(.2,.7,.3,1) both}
.avatarIn{animation:avatarIn .7s cubic-bezier(.2,.7,.3,1) .15s both;transform-box:fill-box;transform-origin:center}
.rule{animation:draw .7s cubic-bezier(.2,.7,.3,1) .95s both;transform-box:fill-box;transform-origin:left}
.hairline{animation:draw .8s cubic-bezier(.2,.7,.3,1) .3s both;transform-box:fill-box;transform-origin:left}
.glow{animation:breathe 7s ease-in-out infinite}
.edge{fill:none;stroke-width:1.3;stroke-opacity:.32;stroke-linecap:round;stroke-dasharray:460;animation:drawline 1.8s cubic-bezier(.2,.7,.3,1) both}
.trunk{stroke:${th.accent}}
.branch{stroke:${th.accent2}}
.node{animation:pulse 3s ease-in-out infinite}
@keyframes type{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@keyframes blink{0%,50%{opacity:1}50.01%,100%{opacity:0}}
@keyframes up{from{opacity:0;transform:translateY(9px)}to{opacity:1;transform:translateY(0)}}
@keyframes avatarIn{from{opacity:0;transform:scale(.85)}to{opacity:1;transform:scale(1)}}
@keyframes draw{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@keyframes drawline{from{stroke-dashoffset:460}to{stroke-dashoffset:0}}
@keyframes breathe{0%,100%{opacity:.65}50%{opacity:1}}
@keyframes pulse{0%,100%{opacity:.4}50%{opacity:1}}
</style>
<g clip-path="url(#typeClip)">
<text x="${48 + SIDE_M}" y="${TOP_M + 62}" class="p" fill="${th.accent}">${esc(HERO.prompt)}</text>
<rect class="caret" x="${(48 + SIDE_M + pw + 3).toFixed(1)}" y="${TOP_M + 50}" width="7" height="13" fill="${th.accent}"/>
</g>
<rect class="hairline" x="${48 + SIDE_M}" y="${TOP_M + 82.5}" width="${W - SIDE_M * 2 - 96}" height="1" fill="${th.border}"/>
<g class="avatarIn">
<circle cx="${AX}" cy="${AY}" r="${AR + 3}" fill="url(#ringG)"/>
<circle cx="${AX}" cy="${AY}" r="${AR + 1}" fill="${th.bg0}"/>
<g clip-path="url(#avatarClip)"><image href="${d.avatar}" x="${AX - AR}" y="${AY - AR}" width="${AR * 2}" height="${AR * 2}" preserveAspectRatio="xMidYMid slice"/></g>
</g>
<g class="up" style="animation-delay:.5s"><text x="${152 + SIDE_M}" y="${TOP_M + 118}"><tspan class="nm" fill="${th.text}">${esc(HERO.name)}</tspan><tspan class="fw" fill="${th.accent}" dx="13">${fmt(d.followers)} followers</tspan></text></g>
<rect class="rule" x="${152 + SIDE_M}" y="${TOP_M + 128}" width="52" height="3" rx="1.5" fill="url(#accentG)"/>
<g class="up" style="animation-delay:.62s"><text x="${152 + SIDE_M}" y="${TOP_M + 148}" class="rl" fill="${th.muted}">${esc(HERO.role)}</text></g>
<g class="up" style="animation-delay:.74s"><text x="${152 + SIDE_M}" y="${TOP_M + 168}" class="fc" fill="${th.dim}">${esc(HERO.focus)}</text></g>
</svg>
`;
}

// -------------------------------------------------------------------- stack

const STACK = [
  { label: 'Frontend', items: ['React', 'Next.js', 'Angular', 'TypeScript', 'Tailwind CSS'] },
  { label: 'Backend', items: ['Java', 'Spring Boot', 'Go', 'Node.js', 'Express', 'Python'] },
  { label: 'Data', items: ['PostgreSQL', 'MongoDB', 'Redis', 'Kafka'] },
  { label: 'GenAI', items: ['GenAI', 'AI Integration'] },
  { label: 'DevOps', items: ['Linux', 'Docker', 'Kubernetes', 'GitHub Actions', 'CI/CD'] },
  { label: 'Cloud', items: ['AWS', 'On-Premises'] },
  { label: 'Engineering', items: ['REST API', 'Microservices', 'System Design', 'Testing', 'Observability'] },
];

function stackSVG(key) {
  const th = THEMES[key];
  const W = 900;
  const TOP_M = 0, SIDE_M = 0;
  const ROW_H = 42, PAD = 12;
  const CH = PAD * 2 + STACK.length * ROW_H;
  const H = CH;
  // accent/fork and accent2/repo are the same hues in THEMES, so the real
  // palette is these three - cycled deliberately rather than padded out
  // with near-duplicates that would read as a color mistake.
  const palette = [th.accent, th.star, th.repo];
  const CHIP_W = 132;
  const left = SIDE_M + 28;

  const rows = STACK.map((row, i) => {
    const rowTop = TOP_M + PAD + i * ROW_H;
    const cy = rowTop + ROW_H / 2;
    const color = palette[i % palette.length];
    const divider = i > 0
      ? `<line x1="${SIDE_M + 20}" y1="${rowTop}" x2="${W - SIDE_M - 20}" y2="${rowTop}" stroke="${th.border}" stroke-opacity=".5"/>`
      : '';
    return `<g class="row" style="animation-delay:${(0.04 + i * 0.06).toFixed(2)}s">`
      + divider
      + `<rect x="${left}" y="${(cy - 12).toFixed(1)}" width="${CHIP_W}" height="24" rx="12" fill="${color}" fill-opacity=".14" stroke="${color}" stroke-opacity=".5"/>`
      + `<text x="${(left + CHIP_W / 2).toFixed(1)}" y="${(cy + 4.5).toFixed(1)}" class="lb" fill="${color}">${esc(row.label)}</text>`
      + `<text x="${left + CHIP_W + 20}" y="${(cy + 4.5).toFixed(1)}" class="it" fill="${th.text}">${esc(row.items.join(` ${DOT} `))}</text>`
      + `</g>`;
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Stack: ${STACK.map((r) => `${r.label} - ${r.items.join(', ')}`).join('; ')}">
<title>Stack</title>
<defs>
<linearGradient id="bgG" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="${th.bg0}"/><stop offset="1" stop-color="${th.bg1}"/>
</linearGradient>
<clipPath id="cardClip"><rect x="${SIDE_M}" y="${TOP_M}" width="${W - SIDE_M * 2}" height="${CH}" rx="16"/></clipPath>
${grainFilter('grain')}
</defs>
<rect x="${SIDE_M}" y="${TOP_M}" width="${W - SIDE_M * 2}" height="${CH}" rx="16" fill="url(#bgG)" stroke="${th.border}"/>
<g clip-path="url(#cardClip)"><rect x="${SIDE_M}" y="${TOP_M}" width="${W - SIDE_M * 2}" height="${CH}" filter="url(#grain)" opacity="${th.grainOp}" fill="#ffffff"/></g>
<style>
.lb{font-family:${SANS};font-size:12.5px;font-weight:700;text-anchor:middle}
.it{font-family:${SANS};font-size:13px;font-weight:500}
.row{animation:up .5s cubic-bezier(.2,.7,.3,1) both}
@keyframes up{from{opacity:0;transform:translateY(7px)}to{opacity:1;transform:translateY(0)}}
</style>
${rows}
</svg>
`;
}

// ------------------------------------------------------------------ badges
//
// Individually clickable, so each link stays its own <a><img></a> pair in the
// README - but drawn as a pill matching the card system instead of a stock
// shields.io badge, which is flat-colored and does not follow dark/light.

const LINKS = [
  { id: 'linkedin', label: 'LinkedIn', role: 'accent' },
  { id: 'github', label: 'GitHub', role: 'dim' },
  { id: 'hf', label: 'Hugging Face', role: 'star' },
];

function badgeSVG(label, color) {
  const H = 36, PAD_X = 20;
  const W = Math.round(label.length * 7.6 + PAD_X * 2);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(label)}">
<title>${esc(label)}</title>
<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="18" fill="${color}" fill-opacity=".13" stroke="${color}" stroke-opacity=".55"/>
<text x="${W / 2}" y="${H / 2 + 4.5}" text-anchor="middle" fill="${color}" font-family="${SANS}" font-size="13" font-weight="700">${esc(label)}</text>
</svg>
`;
}

// -------------------------------------------------------------------- main

const data = await collect();

const files = {
  'hero-dark.svg': heroSVG(data, 'dark'),
  'hero-light.svg': heroSVG(data, 'light'),
  'impact-dark.svg': impactSVG(data, 'dark'),
  'impact-light.svg': impactSVG(data, 'light'),
  'stack-dark.svg': stackSVG('dark'),
  'stack-light.svg': stackSVG('light'),
};

for (const link of LINKS) {
  for (const key of ['dark', 'light']) {
    files[`badge-${link.id}-${key}.svg`] = badgeSVG(link.label, THEMES[key][link.role]);
  }
}

for (const [name, svg] of Object.entries(files)) {
  await writeFile(join(OUT, name), svg, 'utf8');
}

console.log(
  `stars=${data.stars} forks=${data.forks} repos=${data.repoCount} followers=${data.followers}`);
console.log(`wrote ${Object.keys(files).length} files to assets/`);
