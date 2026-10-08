// Low-poly robots built from primitives, with per-status animation.
import * as THREE from 'three';

const STATUS_COLORS = {
  working: 0x3cff9e,
  idle: 0x5fb4ff,
  error: 0xff3b4e,
  scheduled: 0xffb020,
  never: 0x8a8f99,
};

// Geometry is shared by every robot.
const G = {
  body: new THREE.CapsuleGeometry(0.34, 0.36, 3, 10),
  head: new THREE.BoxGeometry(0.78, 0.56, 0.62),
  visor: new THREE.BoxGeometry(0.62, 0.22, 0.04),
  eye: new THREE.SphereGeometry(0.06, 8, 6),
  stem: new THREE.CylinderGeometry(0.025, 0.025, 0.3, 6),
  tip: new THREE.SphereGeometry(0.075, 10, 8),
  arm: new THREE.CapsuleGeometry(0.07, 0.34, 2, 6),
  hand: new THREE.SphereGeometry(0.09, 8, 6),
  base: new THREE.CylinderGeometry(0.3, 0.38, 0.16, 12),
  belt: new THREE.TorusGeometry(0.35, 0.045, 6, 18),
  ring: new THREE.RingGeometry(0.72, 0.9, 32),
  beacon: new THREE.OctahedronGeometry(0.14, 0),
  hit: new THREE.CylinderGeometry(0.6, 0.6, 1.9, 8),
};

/** Shared, theme-tinted materials. */
export function createRobotMaterials() {
  return {
    body: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.45, metalness: 0.15, flatShading: true }),
    trim: new THREE.MeshStandardMaterial({ color: 0x2b2f55, roughness: 0.6, metalness: 0.3, flatShading: true }),
    eye: new THREE.MeshBasicMaterial({ color: 0xffffff }),
    hit: new THREE.MeshBasicMaterial({ visible: false }),
    desk: new Map(),
  };
}

export function applyRobotTheme(mats, theme) {
  mats.body.color.setHex(theme.body);
  mats.trim.color.setHex(theme.trim);
}

function deskMaterial(mats, color) {
  if (!mats.desk.has(color)) {
    mats.desk.set(color, new THREE.MeshStandardMaterial({
      color, emissive: color, emissiveIntensity: 0.35, roughness: 0.4, flatShading: true,
    }));
  }
  return mats.desk.get(color);
}

export class Robot {
  constructor(agent, deskColor, mats, { scale = 1, shadows = false } = {}) {
    this.id = agent.id;
    this.status = 'idle';
    this.phase = Math.random() * Math.PI * 2;
    this.group = new THREE.Group();
    this.group.scale.setScalar(scale);
    this.group.userData.agentId = agent.id;

    const accent = deskMaterial(mats, deskColor);
    this.visorMat = new THREE.MeshBasicMaterial({ color: STATUS_COLORS.idle });
    this.ringMat = new THREE.MeshBasicMaterial({ color: STATUS_COLORS.idle, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false });
    this.beaconMat = new THREE.MeshBasicMaterial({ color: STATUS_COLORS.scheduled, transparent: true, opacity: 0.9 });
    this.tipMat = new THREE.MeshBasicMaterial({ color: deskColor });

    const ring = new THREE.Mesh(G.ring, this.ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.02;
    this.ring = ring;
    this.group.add(ring);

    const base = new THREE.Mesh(G.base, mats.trim);
    base.position.y = 0.08;
    this.group.add(base);

    // Everything above the base bobs together.
    const rig = new THREE.Group();
    this.rig = rig;
    this.group.add(rig);

    const body = new THREE.Mesh(G.body, mats.body);
    body.position.y = 0.62;
    const belt = new THREE.Mesh(G.belt, accent);
    belt.rotation.x = Math.PI / 2;
    belt.position.y = 0.58;
    rig.add(body, belt);

    const head = new THREE.Group();
    head.position.y = 1.32;
    this.head = head;
    const skull = new THREE.Mesh(G.head, mats.body);
    const visor = new THREE.Mesh(G.visor, this.visorMat);
    visor.position.set(0, 0.02, 0.315);
    const eyeL = new THREE.Mesh(G.eye, mats.eye);
    const eyeR = eyeL.clone();
    eyeL.position.set(-0.14, 0.02, 0.34);
    eyeR.position.set(0.14, 0.02, 0.34);
    this.eyes = [eyeL, eyeR];
    const stem = new THREE.Mesh(G.stem, mats.trim);
    stem.position.y = 0.42;
    const tip = new THREE.Mesh(G.tip, this.tipMat);
    tip.position.y = 0.6;
    this.tip = tip;
    head.add(skull, visor, eyeL, eyeR, stem, tip);
    rig.add(head);

    this.arms = [-1, 1].map(side => {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.44, 0.86, 0);
      const arm = new THREE.Mesh(G.arm, mats.body);
      arm.position.y = -0.22;
      const hand = new THREE.Mesh(G.hand, accent);
      hand.position.y = -0.46;
      pivot.add(arm, hand);
      pivot.rotation.z = side * 0.18;
      rig.add(pivot);
      return pivot;
    });

    const beacon = new THREE.Mesh(G.beacon, this.beaconMat);
    beacon.position.y = 2.25;
    beacon.visible = false;
    this.beacon = beacon;
    this.group.add(beacon);

    // Invisible, generous hit volume for easier tapping.
    const hit = new THREE.Mesh(G.hit, mats.hit);
    hit.position.y = 0.95;
    hit.userData.agentId = agent.id;
    this.hit = hit;
    this.group.add(hit);

    if (shadows) rig.traverse(o => { if (o.isMesh) o.castShadow = true; });
  }

  setStatus(status) {
    if (status === this.status) return;
    this.status = status;
    const c = STATUS_COLORS[status] ?? STATUS_COLORS.idle;
    this.visorMat.color.setHex(c);
    this.ringMat.color.setHex(c);
    this.beacon.visible = status === 'scheduled';
    this.ring.scale.setScalar(1);
  }

  /** t: seconds; motion: 1 normal, ~0.2 reduced. */
  update(t, motion) {
    const s = this.status;
    const p = t + this.phase;
    let bob = 0, armA = 0.18, shakeX = 0, ringOp = 0.35, visorK = 0.6, headTurn = 0;

    if (s === 'working') {
      bob = Math.abs(Math.sin(p * 4)) * 0.12;
      armA = 0.18 + Math.sin(p * 6) * 0.6;
      ringOp = 0.55 + Math.sin(p * 5) * 0.35;
      this.ring.scale.setScalar(1 + (Math.sin(p * 5) + 1) * 0.08 * motion);
      visorK = 1;
      headTurn = Math.sin(p * 1.5) * 0.35;
    } else if (s === 'error') {
      shakeX = Math.sin(p * 40) * 0.04 * (Math.sin(p * 2) > 0.3 ? 1 : 0);
      ringOp = 0.7;
      visorK = 0.7 + Math.sin(p * 9) * 0.3;
      armA = 0.5;
    } else if (s === 'scheduled') {
      bob = Math.sin(p * 1.4) * 0.03;
      ringOp = 0.45;
      visorK = 0.75;
      this.beacon.rotation.y = p * 2;
      this.beacon.position.y = 2.25 + Math.sin(p * 3) * 0.08 * motion;
      this.beaconMat.opacity = 0.55 + (Math.sin(p * 4) + 1) * 0.22;
      headTurn = Math.sin(p * 0.6) * 0.2;
    } else if (s === 'never') {
      ringOp = 0.18;
      visorK = 0.25;
      armA = 0.1;
    } else {
      bob = Math.sin(p * 1.2) * 0.025;
      visorK = 0.5;
      headTurn = Math.sin(p * 0.4) * 0.25;
    }

    this.rig.position.y = bob * motion;
    this.rig.position.x = shakeX * motion;
    this.head.rotation.y = headTurn * motion;
    this.arms[0].rotation.x = (s === 'working' ? armA : 0) * motion;
    this.arms[1].rotation.x = (s === 'working' ? -armA : 0) * motion;
    this.arms[0].rotation.z = -(s === 'working' ? 0.3 : armA);
    this.arms[1].rotation.z = (s === 'working' ? 0.3 : armA);
    this.ringMat.opacity = ringOp;
    // Basic materials have no emissive; fake glow intensity by scaling colour.
    const base = STATUS_COLORS[s] ?? STATUS_COLORS.idle;
    this.visorMat.color.setHex(base).multiplyScalar(0.35 + 0.65 * visorK);
    const blink = Math.sin(p * 0.9) > 0.985 ? 0.15 : 1;
    for (const e of this.eyes) e.scale.y = s === 'never' ? 0.3 : blink;
  }

  dispose() {
    this.visorMat.dispose();
    this.ringMat.dispose();
    this.beaconMat.dispose();
    this.tipMat.dispose();
  }
}
