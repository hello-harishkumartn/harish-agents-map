// Three.js scene: floating hex islands per desk, robots, labels, packets, camera.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { Robot, createRobotMaterials, applyRobotTheme } from './robots.js';
import { Ambient } from './ambient.js';
import { resolveDesks, layoutKey, effectiveStatus, recentAgents, STATUS_LABEL } from './data.js';

const HEX_R = 1.45;        // tile radius
const HEX_STEP = 1.58;     // lattice spacing
const SQ3 = Math.sqrt(3);
const HUB_ID = 'harish-pa';
const LABEL_FAR = 58;      // hide name tags beyond this camera distance

const easeInOut = x => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

function hexToXZ(q, r) {
  return [HEX_STEP * SQ3 * (q + r / 2), HEX_STEP * 1.5 * r];
}

/** Axial coords of ring k (k=0 is the centre). */
function hexRing(k) {
  if (k === 0) return [[0, 0]];
  const dirs = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
  const out = [];
  let q = -k, r = k; // start at direction 4 * k
  for (let side = 0; side < 6; side++) {
    for (let i = 0; i < k; i++) {
      out.push([q, r]);
      q += dirs[side][0];
      r += dirs[side][1];
    }
  }
  return out;
}

const isRingDesk = d => d.id === 'studio' || /solo/i.test(d.name || '');

export class World {
  constructor(canvasHost, { mobile, reduced, onPick }) {
    this.mobile = mobile;
    this.motion = reduced ? 0.2 : 1;
    this.onPick = onPick;
    this.robots = new Map();
    this.deskInfo = new Map();
    this.key = '';
    this.recent = new Set();
    this.islands = [];
    this.fly = null;

    const renderer = new THREE.WebGLRenderer({ antialias: !mobile, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2));
    renderer.setSize(canvasHost.clientWidth, canvasHost.clientHeight);
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = !mobile;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    canvasHost.appendChild(renderer.domElement);
    this.renderer = renderer;

    const labels = new CSS2DRenderer();
    labels.setSize(canvasHost.clientWidth, canvasHost.clientHeight);
    labels.domElement.className = 'labels';
    canvasHost.appendChild(labels.domElement);
    this.labels = labels;

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x0b0d24, 45, 120);
    this.scene = scene;

    const camera = new THREE.PerspectiveCamera(45, canvasHost.clientWidth / canvasHost.clientHeight, 0.1, 300);
    camera.position.set(0, mobile ? 40 : 30, mobile ? 50 : 40);
    this.camera = camera;
    this.home = { pos: camera.position.clone(), target: new THREE.Vector3(0, 0, 0) };

    const controls = new OrbitControls(camera, labels.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 5;
    controls.maxDistance = 85;
    controls.maxPolarAngle = Math.PI * 0.45;
    controls.screenSpacePanning = false;
    controls.addEventListener('start', () => { this.fly = null; });
    this.controls = controls;

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x222244, 0.8);
    this.sun = new THREE.DirectionalLight(0xffffff, 1.2);
    this.sun.position.set(18, 30, 12);
    if (!mobile) {
      this.sun.castShadow = true;
      this.sun.shadow.mapSize.set(1024, 1024);
      Object.assign(this.sun.shadow.camera, { left: -32, right: 32, top: 32, bottom: -32, near: 1, far: 90 });
      this.sun.shadow.bias = -0.0015;
    }
    scene.add(this.hemi, this.sun);

    this.mats = {
      tile: new THREE.MeshStandardMaterial({ color: 0x23284f, roughness: 0.8, flatShading: true }),
      rock: new THREE.MeshStandardMaterial({ color: 0x161a3a, roughness: 1, flatShading: true }),
      ground: new THREE.MeshStandardMaterial({ color: 0x0d1030, roughness: 1 }),
      rim: new Map(),
      robot: createRobotMaterials(),
    };
    this.geo = {
      top: new THREE.CylinderGeometry(HEX_R, HEX_R, 0.32, 6),
      rim: new THREE.CylinderGeometry(HEX_R + 0.08, HEX_R + 0.08, 0.1, 6),
      rock: new THREE.ConeGeometry(HEX_R * 0.92, 1.7, 6),
    };

    const ground = new THREE.Mesh(new THREE.CircleGeometry(140, 48), this.mats.ground);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -3.2;
    ground.receiveShadow = !mobile;
    this.grid = new THREE.PolarGridHelper(60, 12, 8, 64, 0x2a2f7a, 0x2a2f7a);
    this.grid.position.y = -3.15;
    this.grid.material.transparent = true;
    this.grid.material.opacity = 0.25;
    scene.add(ground, this.grid);

    this.ambient = new Ambient(scene, mobile);
    this.layer = new THREE.Group();
    scene.add(this.layer);

    this.raycaster = new THREE.Raycaster();
    this.bindPointer(labels.domElement);
  }

  setTheme(t) {
    this.scene.fog.color.setHex(t.fog);
    this.mats.tile.color.setHex(t.tile);
    this.mats.rock.color.setHex(t.tileSide);
    this.mats.ground.color.setHex(t.ground);
    this.grid.material.color.setHex(t.groundEdge);
    this.hemi.color.setHex(t.hemiSky);
    this.hemi.groundColor.setHex(t.hemiGround);
    this.hemi.intensity = t.hemi;
    this.sun.color.setHex(t.sun);
    this.sun.intensity = t.sunI;
    this.ambient.setTheme(t);
    applyRobotTheme(this.mats.robot, t);
  }

  rimMat(color) {
    if (!this.mats.rim.has(color)) {
      this.mats.rim.set(color, new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.5, flatShading: true }));
    }
    return this.mats.rim.get(color);
  }

  makeTile(color, decorative = false) {
    const g = new THREE.Group();
    const top = new THREE.Mesh(this.geo.top, this.mats.tile);
    top.position.y = -0.16;
    top.receiveShadow = !this.mobile;
    const rock = new THREE.Mesh(this.geo.rock, this.mats.rock);
    rock.rotation.x = Math.PI;
    rock.position.y = -1.17;
    g.add(top, rock);
    if (!decorative) {
      const rim = new THREE.Mesh(this.geo.rim, this.rimMat(color));
      rim.position.y = -0.3;
      g.add(rim);
    } else {
      g.scale.set(0.96, 1, 0.96);
      g.position.y = -0.25;
    }
    return g;
  }

  makeLabel(text, cls, onClick) {
    const el = document.createElement(onClick ? 'button' : 'div');
    el.className = cls;
    el.innerHTML = `<span class="dot"></span><span class="txt"></span>`;
    el.querySelector('.txt').textContent = text;
    if (onClick) {
      el.type = 'button';
      el.addEventListener('click', e => { e.stopPropagation(); onClick(); });
      el.addEventListener('pointerdown', e => e.stopPropagation());
    }
    return { el, obj: new CSS2DObject(el) };
  }

  clearLayer() {
    for (const r of this.robots.values()) r.dispose();
    const css = [];
    this.layer.traverse(o => { if (o.isCSS2DObject) css.push(o); });
    css.forEach(o => o.removeFromParent());
    this.layer.clear();
    this.robots.clear();
    this.deskInfo.clear();
    this.islands = [];
  }

  /** Build desks + robots from data. Called only when the agent/desk set changes. */
  build(data) {
    this.clearLayer();
    const desks = resolveDesks(data);
    const byDesk = new Map(desks.map(d => [d.id, []]));
    for (const a of data.agents) byDesk.get(a.desk || 'misc').push(a);

    const hubDesk = desks.find(d => d.id === 'hub' || byDesk.get(d.id).some(a => a.id === HUB_ID));
    const ringDesks = desks.filter(d => d !== hubDesk && isRingDesk(d) && byDesk.get(d.id).length);
    const clusterDesks = desks.filter(d => d !== hubDesk && !ringDesks.includes(d) && byDesk.get(d.id).length);

    if (hubDesk) this.buildCluster(hubDesk, byDesk.get(hubDesk.id), new THREE.Vector3(0, 0, 0), true);
    const R = Math.max(13, (clusterDesks.length * 10.5) / (2 * Math.PI));
    clusterDesks.forEach((d, i) => {
      const a = -Math.PI / 2 + Math.PI / 4 + (i / clusterDesks.length) * Math.PI * 2;
      this.buildCluster(d, byDesk.get(d.id), new THREE.Vector3(Math.cos(a) * R, 0, Math.sin(a) * R), false);
    });
    ringDesks.forEach((d, i) => this.buildRing(d, byDesk.get(d.id), R + 8 + i * 5));
    this.hubPos = this.robots.get(HUB_ID)?.group.position.clone() ?? new THREE.Vector3();
  }

  addIsland(group) {
    group.userData.phase = Math.random() * Math.PI * 2;
    group.userData.baseY = group.position.y;
    this.islands.push(group);
    this.layer.add(group);
  }

  addRobot(agent, desk, parent, x, z, scale) {
    const robot = new Robot(agent, desk.color, this.mats.robot, { scale, shadows: !this.mobile });
    robot.group.position.set(x, 0, z);
    robot.desk = desk;
    robot.name = agent.name;
    const { el, obj } = this.makeLabel(agent.name, 'tag', () => this.onPick(agent.id));
    obj.position.set(0, 2.0, 0);
    robot.group.add(obj);
    robot.label = el;
    parent.add(robot.group);
    this.robots.set(agent.id, robot);
  }

  buildCluster(desk, agents, center, hub) {
    const island = new THREE.Group();
    island.position.copy(center);
    const cells = [...hexRing(0), ...hexRing(1)];
    if (agents.length > 6) cells.push(...hexRing(2));
    if (agents.length > 18) cells.push(...hexRing(3));

    // Which cells get robots: hub uses centre; desks spread along ring 1 (then ring 2...).
    const slots = new Map();
    if (hub) {
      agents.forEach((a, i) => slots.set(i === 0 ? 0 : i, a));
    } else if (agents.length <= 6) {
      agents.forEach((a, i) => slots.set(1 + Math.round((i * 6) / agents.length + (agents.length === 3 ? 1 : 0)) % 6, a));
    } else {
      agents.forEach((a, i) => slots.set(1 + i, a));
    }

    cells.forEach(([q, r], idx) => {
      const [x, z] = hexToXZ(q, r);
      const agent = slots.get(idx);
      const tile = this.makeTile(desk.color, !agent && !(idx === 0));
      tile.position.x = x;
      tile.position.z = z;
      island.add(tile);
      if (agent) this.addRobot(agent, desk, island, x, z, hub && idx === 0 ? 1.6 : 1);
      else if (idx === 0) this.addEmblem(island, desk.color);
    });

    const extent = Math.max(...cells.map(([q, r]) => Math.hypot(...hexToXZ(q, r)))) + HEX_R + 0.6;
    this.addDeskRing(island, desk, extent, 0, hub ? 3.9 : 2.2);
    this.deskInfo.set(desk.id, { center: center.clone(), radius: extent });
    this.addIsland(island);
  }

  buildRing(desk, agents, radius) {
    const n = agents.length;
    const holder = new THREE.Group();
    const step = (Math.PI * 2) / n;
    agents.forEach((a, i) => {
      const ang = -Math.PI / 2 + step * (i + 0.5);
      const island = new THREE.Group();
      island.position.set(Math.cos(ang) * radius, 0, Math.sin(ang) * radius);
      island.add(this.makeTile(desk.color));
      this.addRobot(a, desk, island, 0, 0, 1);
      this.addIsland(island);
    });
    const ring = new THREE.Mesh(new THREE.RingGeometry(radius - 0.06, radius + 0.06, 96),
      new THREE.MeshBasicMaterial({ color: desk.color, transparent: true, opacity: 0.35, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = -0.9;
    holder.add(ring);
    const { obj } = this.makeLabel(desk.name, 'desk-tag', () => this.onDesk?.(desk.id));
    obj.element.style.setProperty('--c', desk.color);
    obj.position.set(0, 0.8, radius);
    holder.add(obj);
    this.layer.add(holder);
    this.deskInfo.set(desk.id, { center: new THREE.Vector3(0, 0, 0), radius: radius + 3, ring: true });
  }

  addEmblem(parent, color) {
    const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.5, 0), this.rimMat(color));
    m.position.y = 1.1;
    m.userData.spin = true;
    parent.add(m);
    this.emblems = this.emblems || [];
    this.emblems.push(m);
  }

  addDeskRing(island, desk, radius, y, labelY) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.07, 6, 72),
      new THREE.MeshBasicMaterial({ color: desk.color, transparent: true, opacity: 0.7 }));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = y - 0.35;
    island.add(ring);
    const { obj } = this.makeLabel(desk.name, 'desk-tag', () => this.onDesk?.(desk.id));
    obj.element.style.setProperty('--c', desk.color);
    obj.position.set(0, labelY, radius * 0.15);
    island.add(obj);
  }

  /** Update scene from fresh data; rebuild only if the agent set changed. */
  sync(data, now = Date.now()) {
    const key = layoutKey(data);
    if (key !== this.key) {
      this.emblems = [];
      this.build(data);
      this.key = key;
    }
    for (const a of data.agents) {
      const r = this.robots.get(a.id);
      if (!r) continue;
      const s = effectiveStatus(a, now);
      r.setStatus(s);
      r.label.dataset.status = s;
      r.label.title = `${a.name} — ${STATUS_LABEL[s]}`;
      if (r.label.querySelector('.txt').textContent !== a.name) r.label.querySelector('.txt').textContent = a.name;
    }
    this.recent = recentAgents(data);
  }

  bindPointer(el) {
    let down = null;
    el.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
    el.addEventListener('pointerup', e => {
      if (!down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      const quick = performance.now() - down.t < 500;
      down = null;
      if (moved > 8 || !quick) return;
      const id = this.pick(e.clientX, e.clientY);
      if (id) this.onPick(id);
    });
  }

  pick(cx, cy) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const v = new THREE.Vector2(((cx - rect.left) / rect.width) * 2 - 1, -((cy - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(v, this.camera);
    const hits = this.raycaster.intersectObjects([...this.robots.values()].map(r => r.hit), false);
    return hits[0]?.object.userData.agentId ?? null;
  }

  flyTo(target, dist) {
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    if (dir.y < 0.45) { dir.y = 0.45; dir.normalize(); }
    this.fly = {
      t: 0,
      dur: this.motion < 1 ? 0.01 : 1.1,
      fromPos: this.camera.position.clone(),
      fromTarget: this.controls.target.clone(),
      toTarget: target.clone(),
      toPos: target.clone().add(dir.multiplyScalar(dist)),
    };
  }

  focusAgent(id) {
    const r = this.robots.get(id);
    if (!r) return;
    const p = new THREE.Vector3();
    r.group.getWorldPosition(p);
    p.y += 1;
    if (this.mobile) {
      // Bottom sheet covers the lower half: aim below the robot so it sits higher on screen.
      const toCam = this.camera.position.clone().sub(p).setY(0).normalize();
      p.addScaledVector(toCam, 3.2);
    }
    this.flyTo(p, r.group.scale.x > 1 ? 13 : this.mobile ? 12 : 9);
    this.selected = id;
    for (const [rid, rob] of this.robots) rob.label.classList.toggle('sel', rid === id);
  }

  clearSelection() {
    this.selected = null;
    for (const rob of this.robots.values()) rob.label.classList.remove('sel');
  }

  focusDesk(id) {
    const d = this.deskInfo.get(id);
    if (!d) return;
    this.flyTo(d.center, d.ring ? d.radius * 2.1 : d.radius * 3 + 6);
  }

  resetView() {
    this.fly = {
      t: 0, dur: this.motion < 1 ? 0.01 : 1.1,
      fromPos: this.camera.position.clone(), fromTarget: this.controls.target.clone(),
      toPos: this.home.pos.clone(), toTarget: this.home.target.clone(),
    };
  }

  resize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.labels.setSize(w, h);
  }

  frame(dt, t) {
    if (this.fly) {
      const f = this.fly;
      f.t = Math.min(1, f.t + dt / f.dur);
      const k = easeInOut(f.t);
      this.camera.position.lerpVectors(f.fromPos, f.toPos, k);
      this.controls.target.lerpVectors(f.fromTarget, f.toTarget, k);
      if (f.t >= 1) this.fly = null;
    }
    // Keep the orbit target near the colony.
    const tg = this.controls.target;
    tg.y = Math.max(-1, Math.min(4, tg.y));
    const len = Math.hypot(tg.x, tg.z);
    if (len > 34) { tg.x *= 34 / len; tg.z *= 34 / len; }
    this.controls.update();

    for (const r of this.robots.values()) r.update(t, this.motion);
    for (const isl of this.islands) {
      isl.position.y = isl.userData.baseY + Math.sin(t * 0.5 + isl.userData.phase) * 0.14 * this.motion;
    }
    for (const e of this.emblems || []) e.rotation.y = t * 0.8 * this.motion;
    this.ambient.update(dt, t, this.motion, this.recent, this.robots, HUB_ID);

    const far = this.camera.position.distanceTo(tg) > (this.mobile ? LABEL_FAR * 0.75 : LABEL_FAR);
    this.labels.domElement.classList.toggle('far', far);

    this.renderer.render(this.scene, this.camera);
    this.labels.render(this.scene, this.camera);
  }
}
