/**
 * Builds the animated stat SVGs used by the profile README.
 *
 *   node scripts/build-stats.mjs
 *
 * No dependencies - Node 18+ global fetch only.
 *
 * Every figure is read live from the GitHub API, so the committed SVGs are never
 * hand-edited. Animation is plain CSS @keyframes inside each file: a browser renders
 * an <img>-referenced SVG in secure animated mode, which runs declarative CSS but
 * blocks script and external fetches. Third-party card services (github-readme-stats
 * and friends) are deliberately avoided - their free instances go down.
 *
 * Every animation is written so the unanimated resting state is already correct,
 * which is why the counter columns are stacked target-first and roll upward to a
 * zero offset rather than downward from it.
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
  },
  light: {
    panel: '#f6f8fa', border: '#d1d9e0', text: '#1f2328', muted: '#59636e', dim: '#818b98',
    star: '#9a6700', fork: '#0969da', repo: '#8250df',
    chip: '#eaeef2', sheen: '#1f2328', sheenOp: '0.07',
    bg0: '#ffffff', bg1: '#e9eff7', accent: '#0969da', accent2: '#8250df',
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

async function collect() {
  const [user, repos] = await Promise.all([
    api(`/users/${USER}`),
    api(`/users/${USER}/repos?per_page=100&type=owner`)
      .then((rs) => rs.filter((r) => !r.fork && !r.archived)),
  ]);

  return {
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
  const W = 900, H = 132, GAP = 12;
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
    + tiles.map((_, i) => `<rect x="${at(i)}" y="0" width="${TW}" height="${H}" rx="12"/>`).join('')
    + `</clipPath>`;

  const groups = tiles.map((t, i) => {
    const x = at(i);
    const cx = x + TW / 2;
    const nums = ramp(t.value).map((v, k) =>
      `<text x="${cx}" y="${86 + k * ROW}" class="n" fill="${t.color}">${fmt(v)}</text>`).join('');
    return `<g class="tile" style="animation-delay:${(0.05 + i * 0.09).toFixed(2)}s">`
      + `<rect x="${x}" y="0" width="${TW}" height="${H}" rx="12" fill="${th.panel}" stroke="${th.border}"/>`
      + t.icon(cx, 32, t.color)
      + `<g clip-path="url(#win${i})"><g class="roll" style="animation-delay:${(0.35 + i * 0.1).toFixed(2)}s">${nums}</g></g>`
      + `<text x="${cx}" y="116" class="l" fill="${th.muted}">${t.label}</text>`
      + `</g>`;
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${fmt(d.stars)} stars, ${fmt(d.forks)} forks and ${d.repoCount} public repositories">
<title>${fmt(d.stars)} stars ${DOT} ${fmt(d.forks)} forks ${DOT} ${d.repoCount} repos</title>
<defs>${clips}${sheenClip}
<linearGradient id="sheenG" x1="0" y1="0" x2="1" y2="0">
<stop offset="0" stop-color="${th.sheen}" stop-opacity="0"/>
<stop offset=".5" stop-color="${th.sheen}" stop-opacity="${th.sheenOp}"/>
<stop offset="1" stop-color="${th.sheen}" stop-opacity="0"/>
</linearGradient></defs>
<style>
.n{font-family:${SANS};font-size:34px;font-weight:700;text-anchor:middle}
.l{font-family:${SANS};font-size:10.5px;font-weight:600;letter-spacing:1.4px;text-anchor:middle}
.tile{animation:fade .55s ease-out both}
.roll{animation:roll 1.5s steps(${STEPS}) both}
.sheen{animation:sweep 6s ease-in-out 2.4s infinite}
@keyframes fade{from{opacity:0}to{opacity:1}}
@keyframes roll{from{transform:translateY(-${ROW * STEPS}px)}to{transform:translateY(0)}}
@keyframes sweep{0%,6%{transform:translateX(0)}58%,100%{transform:translateX(1240px)}}
</style>
${groups}
<g clip-path="url(#tiles)"><g class="sheen"><rect x="-270" y="-40" width="150" height="212" fill="url(#sheenG)" transform="skewX(-18)"/></g></g>
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
  const W = 900, H = 190;
  const CW = 7.5; // monospace advance width at 12.5px
  const pw = HERO.prompt.length * CW;

  // A 4 -> 3 -> 2 feed-forward graph sitting right of the text block.
  const layers = [
    { x: 652, ys: [44, 78, 112, 146] },
    { x: 752, ys: [61, 95, 129] },
    { x: 852, ys: [78, 112] },
  ];

  let edges = '';
  let e = 0;
  for (let li = 0; li < layers.length - 1; li++) {
    for (const y1 of layers[li].ys) {
      for (const y2 of layers[li + 1].ys) {
        // Negative delays start each edge mid-cycle, so the flow looks unsynchronised.
        edges += `<line class="edge e${li}" x1="${layers[li].x}" y1="${y1}"`
          + ` x2="${layers[li + 1].x}" y2="${y2}"`
          + ` style="animation-delay:${(-(e % 11) * 0.23).toFixed(2)}s"/>`;
        e++;
      }
    }
  }

  let nodes = '';
  let n = 0;
  layers.forEach((l, li) => {
    for (const y of l.ys) {
      nodes += `<circle class="node" cx="${l.x}" cy="${y}" r="4.6"`
        + ` fill="${li === 2 ? th.accent2 : th.accent}"`
        + ` style="animation-delay:${(n * 0.17).toFixed(2)}s"/>`;
      n++;
    }
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(HERO.name)}, ${fmt(d.followers)} followers ${DASH} ${esc(HERO.role)}">
<title>${esc(HERO.name)} ${DASH} ${esc(HERO.role)}</title>
<defs>
<linearGradient id="bgG" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="${th.bg0}"/><stop offset="1" stop-color="${th.bg1}"/>
</linearGradient>
<linearGradient id="accentG" x1="0" y1="0" x2="1" y2="0">
<stop offset="0" stop-color="${th.accent}"/><stop offset="1" stop-color="${th.accent2}"/>
</linearGradient>
<radialGradient id="glowG">
<stop offset="0" stop-color="${th.accent}" stop-opacity=".20"/>
<stop offset="1" stop-color="${th.accent}" stop-opacity="0"/>
</radialGradient>
<clipPath id="heroClip"><rect x="0" y="0" width="${W}" height="${H}" rx="14"/></clipPath>
<clipPath id="typeClip"><rect class="type" x="48" y="44" width="${(pw + 14).toFixed(1)}" height="24"/></clipPath>
</defs>
<style>
.p{font-family:${MONO};font-size:12.5px}
.nm{font-family:${SANS};font-size:32px;font-weight:800}
.fw{font-family:${SANS};font-size:15px;font-weight:600}
.rl{font-family:${SANS};font-size:13.5px}
.fc{font-family:${MONO};font-size:11.5px;letter-spacing:.4px}
.type{animation:type 1.45s steps(${HERO.prompt.length + 2}) .25s both;transform-box:fill-box;transform-origin:left}
.caret{animation:blink 1.06s step-end infinite}
.up{animation:up .6s cubic-bezier(.2,.7,.3,1) both}
.rule{animation:draw .7s cubic-bezier(.2,.7,.3,1) .95s both;transform-box:fill-box;transform-origin:left}
.glow{animation:breathe 7s ease-in-out infinite}
.edge{stroke-width:1.15;stroke-opacity:.45;stroke-dasharray:4 7;animation:flow 2.6s linear infinite}
.e0{stroke:${th.accent}}
.e1{stroke:${th.accent2}}
.node{animation:pulse 3s ease-in-out infinite}
@keyframes type{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@keyframes blink{0%,50%{opacity:1}50.01%,100%{opacity:0}}
@keyframes up{from{opacity:0;transform:translateY(9px)}to{opacity:1;transform:translateY(0)}}
@keyframes draw{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@keyframes breathe{0%,100%{opacity:.7}50%{opacity:1}}
@keyframes flow{to{stroke-dashoffset:-22}}
@keyframes pulse{0%,100%{opacity:.45}50%{opacity:1}}
</style>
<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="14" fill="url(#bgG)" stroke="${th.border}"/>
<g clip-path="url(#heroClip)">
<ellipse class="glow" cx="800" cy="95" rx="230" ry="140" fill="url(#glowG)"/>
${edges}
${nodes}
</g>
<g clip-path="url(#typeClip)">
<text x="48" y="62" class="p" fill="${th.accent}">${esc(HERO.prompt)}</text>
<rect class="caret" x="${(48 + pw + 3).toFixed(1)}" y="50" width="7" height="13" fill="${th.accent}"/>
</g>
<g class="up" style="animation-delay:.55s"><text x="48" y="106"><tspan class="nm" fill="${th.text}">${esc(HERO.name)}</tspan><tspan class="fw" fill="${th.accent}" dx="14">${fmt(d.followers)} followers</tspan></text></g>
<rect class="rule" x="48" y="119.5" width="64" height="3" rx="1.5" fill="url(#accentG)"/>
<g class="up" style="animation-delay:.7s"><text x="48" y="148" class="rl" fill="${th.muted}">${esc(HERO.role)}</text></g>
<g class="up" style="animation-delay:.82s"><text x="48" y="171" class="fc" fill="${th.dim}">${esc(HERO.focus)}</text></g>
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
};

for (const [name, svg] of Object.entries(files)) {
  await writeFile(join(OUT, name), svg, 'utf8');
}

console.log(
  `stars=${data.stars} forks=${data.forks} repos=${data.repoCount}`);
console.log(`wrote ${Object.keys(files).length} files to assets/`);
