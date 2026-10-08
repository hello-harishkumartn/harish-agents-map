// Ambient life: drifting light particles, data packets to the hub, hub broadcast pulses.
import * as THREE from 'three';

export class Ambient {
  constructor(scene, mobile) {
    this.scene = scene;
    this.packets = [];
    this.pulses = [];
    this.clock = 0;
    this.packetGeo = new THREE.IcosahedronGeometry(0.11, 0);
    this.packetMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.pulseGeo = new THREE.RingGeometry(0.9, 1.05, 40);

    const n = mobile ? 120 : 260;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, r = 4 + Math.random() * 38;
      pos.set([Math.cos(a) * r, Math.random() * 14 - 2, Math.sin(a) * r], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.particleMat = new THREE.PointsMaterial({ size: 0.12, transparent: true, opacity: 0.55, depthWrite: false });
    this.particles = new THREE.Points(g, this.particleMat);
    scene.add(this.particles);
  }

  setTheme(t) {
    this.particleMat.color.setHex(t.particles);
    this.packetMat.color.setHex(t.particles);
  }

  spawnPacket(from, to) {
    const m = new THREE.Mesh(this.packetGeo, this.packetMat);
    const mid = from.clone().lerp(to, 0.5);
    mid.y += 4 + from.distanceTo(to) * 0.15;
    this.scene.add(m);
    this.packets.push({ m, from, mid, to, t: 0, dur: 2.2 + Math.random() * 0.8 });
  }

  spawnPulse(at, color) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false });
    const m = new THREE.Mesh(this.pulseGeo, mat);
    m.rotation.x = -Math.PI / 2;
    m.position.copy(at).setY(0.05);
    this.scene.add(m);
    this.pulses.push({ m, t: 0, dur: 2.6 });
  }

  /** recent: Set of agent ids with a recent feed item; robots: Map id -> Robot. */
  update(dt, t, motion, recent, robots, hubId) {
    this.particles.rotation.y = t * 0.01 * motion;
    this.particles.position.y = Math.sin(t * 0.2) * 0.5 * motion;

    this.clock += dt;
    if (this.clock > 2.4 / Math.max(motion, 0.34) && recent.size) {
      this.clock = 0;
      const hubPos = new THREE.Vector3();
      robots.get(hubId)?.group.getWorldPosition(hubPos);
      for (const id of recent) {
        const r = robots.get(id);
        if (!r) continue;
        if (id === hubId) { this.spawnPulse(hubPos, r.desk.color); continue; }
        const p = new THREE.Vector3();
        r.group.getWorldPosition(p);
        p.y += 1.6;
        this.spawnPacket(p, hubPos.clone().setY(2.4));
      }
    }

    this.packets = this.packets.filter(pk => {
      pk.t += dt / pk.dur;
      if (pk.t >= 1) { pk.m.removeFromParent(); return false; }
      const u = pk.t, iu = 1 - u;
      pk.m.position.copy(pk.from).multiplyScalar(iu * iu)
        .addScaledVector(pk.mid, 2 * iu * u).addScaledVector(pk.to, u * u);
      return true;
    });
    this.pulses = this.pulses.filter(p => {
      p.t += dt / p.dur;
      if (p.t >= 1) { p.m.removeFromParent(); p.m.material.dispose(); return false; }
      p.m.scale.setScalar(1 + p.t * 7);
      p.m.material.opacity = 0.6 * (1 - p.t);
      return true;
    });
  }
}
