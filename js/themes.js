// Visual themes: 3D scene colours + UI CSS variables. Choice persists in localStorage.

const KEY = 'harish-agents-map-theme';

export const THEMES = {
  midnight: {
    name: 'Midnight Neon',
    sky: 'radial-gradient(ellipse at 50% 30%, #1b1f4a 0%, #0b0d24 55%, #05060f 100%)',
    fog: 0x0b0d24, ground: 0x0d1030, groundEdge: 0x2a2f7a, tile: 0x2e3568, tileSide: 0x1a1f45,
    body: 0xdfe4ff, trim: 0x2b2f55, hemiSky: 0x8f97ff, hemiGround: 0x1a1d40, hemi: 0.9, sun: 0xd0d6ff, sunI: 1.5,
    particles: 0x8fa2ff, accent: 0x7c5cff,
    css: { '--bg': '#070918', '--panel': 'rgba(18,22,52,.62)', '--panel-solid': '#12163a', '--border': 'rgba(140,150,255,.22)',
      '--text': '#e8eaff', '--muted': '#9aa0d0', '--accent': '#8b7bff', '--accent-2': '#2ee6d6', '--chip': 'rgba(255,255,255,.07)' },
  },
  daybreak: {
    name: 'Daybreak',
    sky: 'linear-gradient(180deg, #ffd9b8 0%, #ffeedd 35%, #cfe7ff 100%)',
    fog: 0xf3e6dc, ground: 0x9fd3c7, groundEdge: 0xffffff, tile: 0xfff6ec, tileSide: 0xe0c9b4,
    body: 0xffffff, trim: 0x55607a, hemiSky: 0xfff1e0, hemiGround: 0x8fb3c7, hemi: 0.9, sun: 0xffe2c0, sunI: 1.4,
    particles: 0xffb36b, accent: 0xff7a59,
    css: { '--bg': '#fbeee4', '--panel': 'rgba(255,255,255,.66)', '--panel-solid': '#fff8f2', '--border': 'rgba(120,90,60,.18)',
      '--text': '#2c2233', '--muted': '#7a6a74', '--accent': '#ff6a3d', '--accent-2': '#2b8cff', '--chip': 'rgba(0,0,0,.05)' },
  },
  aurora: {
    name: 'Aurora',
    sky: 'linear-gradient(180deg, #071a2b 0%, #0d3b4a 40%, #1d6b5f 75%, #3c2a6b 100%)',
    fog: 0x0d3340, ground: 0x0a2530, groundEdge: 0x38f2b0, tile: 0x1a4652, tileSide: 0x0f2c36,
    body: 0xe6fff7, trim: 0x1f3d47, hemiSky: 0x7dffd6, hemiGround: 0x1a1240, hemi: 0.75, sun: 0xc4fff0, sunI: 1.1,
    particles: 0x7dffcf, accent: 0x38f2b0,
    css: { '--bg': '#06202b', '--panel': 'rgba(8,40,50,.6)', '--panel-solid': '#0b2f3a', '--border': 'rgba(120,255,210,.2)',
      '--text': '#e4fff6', '--muted': '#8fc7b8', '--accent': '#38f2b0', '--accent-2': '#b48cff', '--chip': 'rgba(255,255,255,.07)' },
  },
  paper: {
    name: 'Paper',
    sky: 'radial-gradient(ellipse at 50% 20%, #ffffff 0%, #f1efe9 60%, #e4e0d6 100%)',
    fog: 0xece9e1, ground: 0xe8e4da, groundEdge: 0x9a958a, tile: 0xfdfcf8, tileSide: 0xd8d3c6,
    body: 0xfafafa, trim: 0x3a3a3a, hemiSky: 0xffffff, hemiGround: 0xcfc9bb, hemi: 1.0, sun: 0xffffff, sunI: 1.2,
    particles: 0x9a958a, accent: 0x222222,
    css: { '--bg': '#efece5', '--panel': 'rgba(255,255,255,.78)', '--panel-solid': '#ffffff', '--border': 'rgba(0,0,0,.12)',
      '--text': '#1f1f1f', '--muted': '#6b6b6b', '--accent': '#1f1f1f', '--accent-2': '#d9480f', '--chip': 'rgba(0,0,0,.05)' },
  },
};

export function savedTheme() {
  try {
    const t = localStorage.getItem(KEY);
    if (t && THEMES[t]) return t;
  } catch { /* storage blocked */ }
  return 'midnight';
}

export function saveTheme(id) {
  try { localStorage.setItem(KEY, id); } catch { /* ignore */ }
}

export function applyCssTheme(id) {
  const t = THEMES[id];
  const root = document.documentElement;
  for (const [k, v] of Object.entries(t.css)) root.style.setProperty(k, v);
  root.style.setProperty('--sky', t.sky);
  root.dataset.theme = id;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', t.css['--bg']);
}
