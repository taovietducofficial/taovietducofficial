/**
 * Builds the animated blueprint plates used by the profile README.
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
 *
 * All chip and label geometry is measured in monospace advance widths, so text
 * boxes are computed rather than eyeballed and cannot overflow their plate.
 *
 * A browser that never starts an animation - an SVG still below the fold when the
 * page paints - shows the animation's own resting frame, so two rules keep that
 * frame honest: anything whose start state would hide or falsify content (the
 * counter columns, the drawn rules and the pipeline wire) fills `forwards`, never
 * `both`, and every entrance animates transform only, never opacity.
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

// Monospace advance ratio - every measured box below derives from this.
const ADV = 0.6;
const mw = (text, size, tracking = 0) => text.length * (size * ADV + tracking);

// Cyanotype negative for dark, drafting paper for light. The two are the same
// drawing under different light, not two different designs.
const THEMES = {
  dark: {
    bg0: '#08131d', bg1: '#0e2233',
    grid: '#7dd3fc', gridOp: '0.075', majorOp: '0.16',
    frame: '#1f4a63',
    text: '#e6f3fb', muted: '#93b6ca', dim: '#5f8299',
    accent: '#38bdf8', accent2: '#fbbf24', accent3: '#a78bfa',
    star: '#fbbf24', fork: '#38bdf8', repo: '#a78bfa',
    grainOp: '0.05',
  },
  light: {
    bg0: '#f7fafc', bg1: '#e4eef6',
    grid: '#1d5f80', gridOp: '0.09', majorOp: '0.18',
    frame: '#b3cbd9',
    text: '#0c2333', muted: '#43657a', dim: '#5a7d93',
    accent: '#0b6f96', accent2: '#9a5a00', accent3: '#6d43c8',
    star: '#9a5a00', fork: '#0b6f96', repo: '#6d43c8',
    grainOp: '0.03',
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
//
// Drawn as outlines rather than solids so they read as symbols on a technical
// drawing instead of as UI glyphs.

function starIcon(cx, cy, c) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = ((-90 + i * 36) * Math.PI) / 180;
    const r = i % 2 ? 4.2 : 10;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`);
  }
  return `<polygon points="${pts.join(' ')}" fill="none" stroke="${c}" stroke-width="1.5" stroke-linejoin="round"/>`;
}

function forkIcon(x, y, c) {
  return `<g fill="${c}" stroke="${c}" stroke-width="1.6" stroke-linecap="round">`
    + `<circle cx="${x - 7}" cy="${y - 7}" r="2.6" fill="none"/>`
    + `<circle cx="${x + 7}" cy="${y - 7}" r="2.6" fill="none"/>`
    + `<circle cx="${x}" cy="${y + 7.5}" r="2.6" fill="none"/>`
    + `<path fill="none" d="M${x - 7} ${y - 4.2} V${y - 1} H${x + 7} V${y - 4.2} M${x} ${y - 1} V${y + 4.7}"/>`
    + `</g>`;
}

function repoIcon(x, y, c) {
  return `<g fill="none" stroke="${c}" stroke-width="1.6" stroke-linejoin="round">`
    + `<path d="M${x - 7} ${y - 6} A2.6 2.6 0 0 1 ${x - 4.4} ${y - 8.6} H${x + 7} V${y + 5} H${x - 4.4}`
      + ` A2.6 2.6 0 0 0 ${x - 7} ${y + 7.6} Z"/>`
    + `<path d="M${x + 7} ${y + 5} V${y + 8.6} H${x - 4.4}"/>`
    + `</g>`;
}

// ------------------------------------------------------- shared plate parts
//
// Every asset sits on the same drawing surface: gradient ground, a two-step
// grid, a hairline frame and inset corner ticks. Defining it once is what keeps
// the three plates reading as sheets from one drawing set.

function grainFilter(id) {
  return `<filter id="${id}" x="-20%" y="-20%" width="140%" height="140%">`
    + `<feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="7" stitchTiles="stitch" result="n"/>`
    + `<feColorMatrix in="n" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.7 0"/>`
    + `</filter>`;
}

function plateDefs(th, W, H) {
  return `<linearGradient id="bgG" x1="0" y1="0" x2="1" y2="1">`
    + `<stop offset="0" stop-color="${th.bg0}"/><stop offset="1" stop-color="${th.bg1}"/>`
    + `</linearGradient>`
    + `<linearGradient id="accentG" x1="0" y1="0" x2="1" y2="0">`
    + `<stop offset="0" stop-color="${th.accent}"/><stop offset="1" stop-color="${th.accent2}"/>`
    + `</linearGradient>`
    + `<pattern id="gm" width="12" height="12" patternUnits="userSpaceOnUse">`
    + `<path d="M12 0H0V12" fill="none" stroke="${th.grid}" stroke-opacity="${th.gridOp}" stroke-width=".7"/>`
    + `</pattern>`
    + `<pattern id="gM" width="60" height="60" patternUnits="userSpaceOnUse">`
    + `<rect width="60" height="60" fill="url(#gm)"/>`
    + `<path d="M60 0H0V60" fill="none" stroke="${th.grid}" stroke-opacity="${th.majorOp}" stroke-width="1"/>`
    + `</pattern>`
    + `<clipPath id="plate"><rect x="0" y="0" width="${W}" height="${H}" rx="5"/></clipPath>`
    + grainFilter('grain');
}

function plateGround(th, W, H, inner = '') {
  return `<rect x="0" y="0" width="${W}" height="${H}" rx="5" fill="url(#bgG)"/>`
    + `<g clip-path="url(#plate)">`
    + `<rect x="0" y="0" width="${W}" height="${H}" fill="url(#gM)"/>`
    + inner
    + `<rect x="0" y="0" width="${W}" height="${H}" filter="url(#grain)" opacity="${th.grainOp}" fill="#ffffff"/>`
    + `</g>`
    + `<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="5" fill="none" stroke="${th.frame}"/>`
    + corners(th, W, H);
}

function corners(th, W, H, inset = 11, len = 13) {
  const [a, b] = [inset, inset + len];
  return `<g fill="none" stroke="${th.accent}" stroke-opacity=".5" stroke-width="1.2">`
    + `<path d="M${a} ${b}V${a}H${b}"/>`
    + `<path d="M${W - b} ${a}H${W - a}V${b}"/>`
    + `<path d="M${W - a} ${H - b}V${H - a}H${W - b}"/>`
    + `<path d="M${b} ${H - a}H${a}V${H - b}"/>`
    + `</g>`;
}

// A drafting scale bar - short ticks every `step`, tall ones every fifth.
function ruler(th, x0, x1, y, step = 15, up = 8, tall = 14) {
  let out = '';
  for (let x = x0, i = 0; x <= x1; x += step, i++) {
    const h = i % 5 === 0 ? tall : up;
    out += `<path d="M${x} ${y}V${y - h}"/>`;
  }
  return `<g stroke="${th.frame}" stroke-width="1" stroke-opacity=".75">${out}</g>`;
}

// --------------------------------------------------------- animated counter
//
// A per-digit odometer is fragile to build and to read. This instead stacks sampled
// values in a column and steps the column through them, so every frame lands exactly
// on a rendered number. The column is ordered target-first and animates from a
// negative offset back to zero, so if CSS animation never runs the resting frame
// still shows the true figure rather than a zero.

const STEPS = 14;
const ROW = 44; // must exceed the counter window height, or neighbours bleed in

function ramp(target) {
  const out = [];
  for (let i = 0; i <= STEPS; i++) {
    const t = i / STEPS;
    out.push(i === STEPS ? target : Math.round(target * (1 - Math.pow(1 - t, 2.4))));
  }
  return out.reverse(); // [target, ..., 0]
}

// ------------------------------------------------------------ impact plate
//
// An instrument panel rather than three separate cards: one continuous sheet
// divided by hairlines, figures set flush left under their legends, with the
// scale bar running along the bottom edge.

function impactSVG(d, key) {
  const th = THEMES[key];
  const W = 900, H = 134, CELL = W / 3;

  const cells = [
    { label: 'TOTAL STARS', value: d.stars, color: th.star, icon: starIcon },
    { label: 'FORKS', value: d.forks, color: th.fork, icon: forkIcon },
    { label: 'PUBLIC REPOS', value: d.repoCount, color: th.repo, icon: repoIcon },
  ];

  const clips = cells.map((_, i) =>
    `<clipPath id="win${i}"><rect x="${i * CELL + 24}" y="56" width="${CELL - 70}" height="40"/></clipPath>`).join('');

  const dividers = [1, 2].map((i) =>
    `<g stroke="${th.frame}"><path d="M${i * CELL} 30V104" stroke-opacity=".8"/></g>`).join('');

  const groups = cells.map((c, i) => {
    const x = i * CELL + 24;
    const nums = ramp(c.value).map((v, k) =>
      `<text x="${x}" y="${88 + k * ROW}" class="n" fill="${c.color}">${fmt(v)}</text>`).join('');
    return `<g class="cell" style="animation-delay:${(0.06 + i * 0.1).toFixed(2)}s">`
      + `<text x="${x}" y="46" class="l" fill="${th.muted}">${c.label}</text>`
      + `<g clip-path="url(#win${i})"><g class="roll" style="animation-delay:${(0.35 + i * 0.1).toFixed(2)}s">${nums}</g></g>`
      + `<rect class="tick" x="${x}" y="100" width="36" height="2.5" fill="${c.color}"`
        + ` style="animation-delay:${(0.9 + i * 0.1).toFixed(2)}s"/>`
      + c.icon(i * CELL + CELL - 44, 72, c.color)
      + `</g>`;
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${fmt(d.stars)} stars, ${fmt(d.forks)} forks and ${d.repoCount} public repositories">
<title>${fmt(d.stars)} stars ${DOT} ${fmt(d.forks)} forks ${DOT} ${d.repoCount} repos</title>
<defs>${clips}
${plateDefs(th, W, H)}
</defs>
<style>
.n{font-family:${SANS};font-size:37px;font-weight:800;font-variant-numeric:tabular-nums}
.l{font-family:${MONO};font-size:10px;letter-spacing:1.7px}
.cell{animation:rise .5s cubic-bezier(.2,.7,.3,1) both}
.roll{animation:roll 1.5s steps(${STEPS}) forwards}
.tick{animation:grow .5s cubic-bezier(.2,.7,.3,1) forwards;transform-box:fill-box;transform-origin:left}
@keyframes rise{from{transform:translateY(8px)}to{transform:translateY(0)}}
@keyframes roll{from{transform:translateY(-${ROW * STEPS}px)}to{transform:translateY(0)}}
@keyframes grow{from{transform:scaleX(0)}to{transform:scaleX(1)}}
</style>
${plateGround(th, W, H)}
${dividers}
${ruler(th, 24, W - 24, H - 11)}
${groups}
</svg>
`;
}

// -------------------------------------------------------------- hero plate
//
// The copy is static, but the file is generated rather than hand-written so the
// dark and light sheets cannot drift apart and the pipeline geometry stays
// derived rather than eyeballed.

const HERO = {
  name: 'Tào Việt Đức',
  role: `Software Engineer II ${DOT} Aspiring DevOps Engineer`,
  focus: `Backend Engineering ${DOT} System Design ${DOT} DevOps ${DOT} CI/CD`,
  caption: `OPEN SOURCE ${DOT} SYSTEMS ${DOT} AUTOMATION`,
  stages: ['CODE', 'BUILD', 'SHIP', 'RUN'],
};

function heroSVG(d, key) {
  const th = THEMES[key];
  const W = 900, H = 394, CX = W / 2;

  const AY = 81, AR = 48; // avatar hexagon centre / circumradius, on the centre axis
  const hex = Array.from({ length: 6 }, (_, i) => {
    const a = (i * 60 * Math.PI) / 180;
    return `${(CX + AR * Math.cos(a)).toFixed(2)},${(AY + AR * Math.sin(a)).toFixed(2)}`;
  }).join(' ');

  // A delivery pipeline, not a generic network motif: the packet travels the
  // same path the work does. Stretched near the full plate width so it reads as
  // the base of the stack rather than as a fifth line of text.
  const PGAP = 200, PY = 322;
  const span = PGAP * (HERO.stages.length - 1);
  const PX0 = CX - span / 2;
  const nodes = HERO.stages.map((_, i) => PX0 + i * PGAP);

  const pipeline = `<path class="wire" d="M${PX0} ${PY}H${nodes[nodes.length - 1]}" stroke="${th.accent}"/>`
    + nodes.map((x, i) =>
      `<g class="node" style="animation-delay:${(i * 0.85).toFixed(2)}s">`
      + `<circle cx="${x}" cy="${PY}" r="8" fill="${th.bg0}" stroke="${th.accent}" stroke-width="1.5"/>`
      + `<circle cx="${x}" cy="${PY}" r="3" fill="${th.accent}"/></g>`
      + `<text x="${x}" y="${PY + 26}" class="sg" fill="${th.dim}">${HERO.stages[i]}</text>`).join('')
    + `<g class="packet"><circle cx="${PX0}" cy="${PY}" r="3.6" fill="${th.accent2}"/></g>`;

  const glow = `<ellipse class="glow" cx="${CX}" cy="${AY + 20}" rx="360" ry="210" fill="url(#glowG)"/>`;

  // Live follower readout. The count is right-anchored inside a slot sized for
  // the final figure, so every frame of the roll lands flush against the same
  // edge and nothing downstream of it shifts while the number climbs.
  const FS = 12, TR = 1.3, HROW = 20, CHIP_Y = 198, CHIP_H = 31;
  const baseY = CHIP_Y + CHIP_H / 2 + 4.5;
  const count = fmt(d.followers);
  const wLabel = mw('GITHUB', FS, TR), wUnit = mw('FOLLOWERS', FS, TR), wNum = mw(count, FS, TR);
  const chipW = Math.round(16 + 18 + wLabel + 11 + wNum + 8 + wUnit + 16);
  const x0 = Math.round(CX - chipW / 2) + 0.5;
  const labelX = x0 + 34;
  const slotL = labelX + wLabel + 11;
  const slotR = slotL + wNum;
  const unitX = slotR + 8;

  const counter = ramp(d.followers).map((v, k) =>
    `<text class="num" x="${slotR.toFixed(1)}" y="${baseY + k * HROW}" fill="${th.accent}">${fmt(v)}</text>`).join('');

  const chip = `<rect x="${x0}" y="${CHIP_Y}" width="${chipW}" height="${CHIP_H}" rx="4"`
    + ` fill="${th.accent}" fill-opacity=".08" stroke="${th.accent}" stroke-opacity=".4"/>`
    + `<circle class="live" cx="${x0 + 19}" cy="${CHIP_Y + CHIP_H / 2}" r="3.5" fill="${th.accent2}"/>`
    + `<text x="${labelX.toFixed(1)}" y="${baseY}" class="gh" fill="${th.muted}">GITHUB</text>`
    + `<g clip-path="url(#fwin)"><g class="hroll">${counter}</g></g>`
    + `<text x="${unitX.toFixed(1)}" y="${baseY}" class="gh" fill="${th.muted}">FOLLOWERS</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(HERO.name)}, ${fmt(d.followers)} followers ${DASH} ${esc(HERO.role)}">
<title>${esc(HERO.name)} ${DASH} ${esc(HERO.role)}</title>
<defs>
${plateDefs(th, W, H)}
<radialGradient id="glowG">
<stop offset="0" stop-color="${th.accent}" stop-opacity=".2"/>
<stop offset="1" stop-color="${th.accent}" stop-opacity="0"/>
</radialGradient>
<linearGradient id="ringG" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="${th.accent}"/><stop offset="1" stop-color="${th.accent2}"/>
</linearGradient>
<clipPath id="hexClip"><polygon points="${hex}"/></clipPath>
<clipPath id="fwin"><rect x="${(slotL - 2).toFixed(1)}" y="${baseY - 13}" width="${(wNum + 4).toFixed(1)}" height="18"/></clipPath>
</defs>
<style>
text{text-anchor:middle}
.nm{font-family:${SANS};font-size:35px;font-weight:800}
.rl{font-family:${SANS};font-size:15px}
.gh{font-family:${MONO};font-size:${FS}px;letter-spacing:${TR}px;text-anchor:start}
.num{font-family:${MONO};font-size:${FS}px;letter-spacing:${TR}px;text-anchor:end;font-variant-numeric:tabular-nums}
.fc{font-family:${MONO};font-size:12.5px;letter-spacing:.3px}
.cp{font-family:${MONO};font-size:10.5px;letter-spacing:1.5px}
.sg{font-family:${MONO};font-size:9.5px;letter-spacing:1.2px}
.up{animation:up .6s cubic-bezier(.2,.7,.3,1) both}
.avatarIn{animation:avatarIn .7s cubic-bezier(.2,.7,.3,1) .12s both;transform-box:fill-box;transform-origin:center}
.orbit{animation:spin 26s linear infinite;transform-origin:${CX}px ${AY}px}
.rule{animation:grow .7s cubic-bezier(.2,.7,.3,1) .8s forwards;transform-box:fill-box;transform-origin:center}
.glow{animation:breathe 7s ease-in-out infinite}
.wire{fill:none;stroke-width:1.4;stroke-opacity:.4;stroke-dasharray:${span};animation:draw 1.4s cubic-bezier(.2,.7,.3,1) .3s forwards}
.node{animation:blip 3.4s ease-in-out infinite}
.packet{animation:flow 3.4s linear .6s infinite}
.live{animation:live 2.2s ease-in-out infinite}
.hroll{animation:hroll 1.9s steps(${STEPS}) .45s forwards}
@keyframes up{from{transform:translateY(9px)}to{transform:translateY(0)}}
@keyframes avatarIn{from{transform:scale(.88)}to{transform:scale(1)}}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes grow{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@keyframes draw{from{stroke-dashoffset:${span}}to{stroke-dashoffset:0}}
@keyframes breathe{0%,100%{opacity:.6}50%{opacity:1}}
@keyframes blip{0%,100%{opacity:.45}12%{opacity:1}}
@keyframes flow{0%{transform:translateX(0);opacity:0}6%{opacity:1}94%{opacity:1}100%{transform:translateX(${span}px);opacity:0}}
@keyframes live{0%,100%{opacity:.3}50%{opacity:1}}
@keyframes hroll{from{transform:translateY(-${HROW * STEPS}px)}to{transform:translateY(0)}}
</style>
${plateGround(th, W, H, glow)}
<g class="avatarIn">
<circle class="orbit" cx="${CX}" cy="${AY}" r="${AR + 11}" fill="none" stroke="${th.accent}" stroke-opacity=".4" stroke-width="1.1" stroke-dasharray="3 8"/>
<polygon points="${hex}" fill="url(#ringG)"/>
<g clip-path="url(#hexClip)"><image href="${d.avatar}" x="${CX - AR}" y="${AY - AR}" width="${AR * 2}" height="${AR * 2}" preserveAspectRatio="xMidYMid slice"/></g>
<polygon points="${hex}" fill="none" stroke="${th.bg0}" stroke-opacity=".55" stroke-width="3"/>
</g>
<g class="up" style="animation-delay:.3s"><text x="${CX}" y="181" class="nm" fill="${th.text}">${esc(HERO.name)}</text></g>
<g class="up" style="animation-delay:.42s">${chip}</g>
<rect class="rule" x="${CX - 33}" y="242" width="66" height="3.5" rx="1.75" fill="url(#accentG)"/>
<g class="up" style="animation-delay:.54s"><text x="${CX}" y="267" class="rl" fill="${th.muted}">${esc(HERO.role)}</text></g>
<g class="up" style="animation-delay:.66s"><text x="${CX}" y="290" class="fc" fill="${th.dim}">${esc(HERO.focus)}</text></g>
${pipeline}
<text x="${CX}" y="378" class="cp" fill="${th.dim}">${esc(HERO.caption)}</text>
</svg>
`;
}

// -------------------------------------------------------------- stack plate
//
// Drawn as the layer diagram it actually is: a bus down the left gutter, one
// tapped layer per domain, each tool a measured chip rather than a run-on line.

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
  const W = 900, PAD = 20, ROW_H = 46;
  const H = PAD * 2 + STACK.length * ROW_H;

  const BUS = 58, CHIP_X = 190;
  const CHIP_FS = 11, CHIP_PAD = 11, CHIP_GAP = 8, CHIP_H = 22;
  // accent / accent2 / accent3 are the only three hues on the sheet - cycled
  // deliberately rather than padded out with near-duplicates.
  const palette = [th.accent, th.accent2, th.accent3];

  const cy = (i) => PAD + i * ROW_H + ROW_H / 2;
  const bus = `<path d="M${BUS} ${cy(0)}V${cy(STACK.length - 1)}" stroke="${th.frame}" stroke-width="1.2" fill="none"/>`;

  const rows = STACK.map((row, i) => {
    const y = cy(i);
    const color = palette[i % palette.length];
    let x = CHIP_X;
    const chips = row.items.map((item) => {
      const w = Math.round(mw(item, CHIP_FS) + CHIP_PAD * 2);
      const g = `<g><rect x="${x}" y="${(y - CHIP_H / 2).toFixed(1)}" width="${w}" height="${CHIP_H}" rx="3"`
        + ` fill="${color}" fill-opacity=".1" stroke="${color}" stroke-opacity=".45"/>`
        + `<text x="${x + CHIP_PAD}" y="${(y + 4).toFixed(1)}" class="ch" fill="${th.text}">${esc(item)}</text></g>`;
      x += w + CHIP_GAP;
      return g;
    }).join('');

    return `<g class="row" style="animation-delay:${(0.05 + i * 0.07).toFixed(2)}s">`
      + (i > 0 ? `<path d="M20 ${PAD + i * ROW_H}H${W - 20}" stroke="${th.frame}" stroke-opacity=".35"/>` : '')
      + `<text x="22" y="${(y + 3.5).toFixed(1)}" class="ix" fill="${th.dim}">L${i + 1}</text>`
      + `<rect x="${BUS - 4}" y="${y - 4}" width="8" height="8" fill="${color}" transform="rotate(45 ${BUS} ${y})"/>`
      + `<text x="76" y="${(y + 4).toFixed(1)}" class="lb" fill="${color}">${esc(row.label.toUpperCase())}</text>`
      + chips
      + `</g>`;
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Stack: ${STACK.map((r) => `${r.label} - ${r.items.join(', ')}`).join('; ')}">
<title>Stack</title>
<defs>${plateDefs(th, W, H)}</defs>
<style>
.ix{font-family:${MONO};font-size:9.5px;letter-spacing:1px}
.lb{font-family:${MONO};font-size:11.5px;font-weight:700;letter-spacing:.9px}
.ch{font-family:${MONO};font-size:${CHIP_FS}px}
.row{animation:up .5s cubic-bezier(.2,.7,.3,1) both}
@keyframes up{from{transform:translateX(-10px)}to{transform:translateX(0)}}
</style>
${plateGround(th, W, H)}
${bus}
${rows}
</svg>
`;
}

// ------------------------------------------------------------------ badges
//
// Individually clickable, so each link stays its own <a><img></a> pair in the
// README - drawn as a notched equipment tag so they belong to the drawing set
// rather than to shields.io, which is flat-coloured and ignores dark/light.

const LINKS = [
  { id: 'linkedin', label: 'LinkedIn', role: 'accent' },
  { id: 'github', label: 'GitHub', role: 'accent3' },
  { id: 'hf', label: 'Hugging Face', role: 'accent2' },
];

function badgeSVG(label, th, color) {
  const FS = 11, TRACK = 1.1, NOTCH = 9;
  const text = label.toUpperCase();
  const H = 34, TX = 30;
  const W = Math.round(TX + mw(text, FS, TRACK) + 14);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(label)}">
<title>${esc(label)}</title>
<path d="M.5 .5H${W - NOTCH - .5}L${W - .5} ${NOTCH + .5}V${H - .5}H.5Z" fill="${color}" fill-opacity=".1" stroke="${color}" stroke-opacity=".55"/>
<rect x="14" y="${H / 2 - 3.5}" width="7" height="7" fill="${color}"/>
<text x="${TX}" y="${H / 2 + 4}" fill="${th.text}" font-family="${MONO}" font-size="${FS}" letter-spacing="${TRACK}">${esc(text)}</text>
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
    files[`badge-${link.id}-${key}.svg`] = badgeSVG(link.label, THEMES[key], THEMES[key][link.role]);
  }
}

for (const [name, svg] of Object.entries(files)) {
  await writeFile(join(OUT, name), svg, 'utf8');
}

console.log(
  `stars=${data.stars} forks=${data.forks} repos=${data.repoCount} followers=${data.followers}`);
console.log(`wrote ${Object.keys(files).length} files to assets/`);
