// Makes the solar declination visible on the globe: Earth's axis and a line
// to the sun, both passing through Earth's centre, the equator ring, the
// latitude where the sun is overhead today, the two tropics, and an arc
// between the equator plane and the sun line labelled with the angle.
//
// Parts inside the globe are drawn faintly so the lines read as going
// through the Earth.

import * as THREE from "./vendor/three.module.min.js";
import { subsolarPoint, earthToScene } from "./sun.js";

const TILT = 23.44;
const UP = new THREE.Vector3(0, 1, 0);

function rod(color, radius, length) {
  const geom = new THREE.CylinderGeometry(radius, radius, length, 12, 1, true);
  const front = new THREE.Mesh(geom, new THREE.MeshBasicMaterial({ color, transparent: true }));
  const inside = new THREE.Mesh(geom, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.3, depthTest: false }));
  front.renderOrder = 12;
  inside.renderOrder = 12;
  const g = new THREE.Group();
  g.add(front, inside);
  g.userData.materials = [front.material, inside.material];
  return g;
}

function ring(color, segments = 160) {
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(new Float32Array((segments + 1) * 3), 3));
  const line = new THREE.Line(geom, new THREE.LineBasicMaterial({ color, transparent: true }));
  line.renderOrder = 12;
  line.frustumCulled = false;
  line.userData.segments = segments;
  return line;
}

// Fill `line` with a circle of latitude `lat` (degrees) around axis `n`.
function setParallel(line, n, lat, radius = 1.004) {
  const a = Math.abs(n.y) < 0.9 ? UP : new THREE.Vector3(1, 0, 0);
  const u = new THREE.Vector3().crossVectors(n, a).normalize();
  const v = new THREE.Vector3().crossVectors(n, u);
  const p = (lat * Math.PI) / 180;
  const c = n.clone().multiplyScalar(Math.sin(p) * radius);
  const r = Math.cos(p) * radius;
  const pos = line.geometry.attributes.position;
  const s = line.userData.segments;
  for (let i = 0; i <= s; i++) {
    const t = (i / s) * Math.PI * 2;
    pos.setXYZ(i, c.x + r * (Math.cos(t) * u.x + Math.sin(t) * v.x), c.y + r * (Math.cos(t) * u.y + Math.sin(t) * v.y), c.z + r * (Math.cos(t) * u.z + Math.sin(t) * v.z));
  }
  pos.needsUpdate = true;
}

function point(rodGroup, from, to) {
  const dir = to.clone().sub(from);
  rodGroup.position.copy(from).add(to).multiplyScalar(0.5);
  rodGroup.quaternion.setFromUnitVectors(UP, dir.normalize());
}

export function createDeclination({ scene, sunDir, sunAzimuth, labelLayer }) {
  const group = new THREE.Group();
  scene.add(group);

  const axis = rod(0xe8eefc, 0.008, 3.0);
  const sunLine = rod(0xffc34d, 0.009, 3.4);
  const eqRef = rod(0x9fb4d8, 0.005, 1.5);
  const equator = ring(0x9fb4d8);
  const overhead = ring(0xffc34d);
  const tropicN = ring(0x9fb4d8);
  const tropicS = ring(0x9fb4d8);
  tropicN.material.opacity = tropicS.material.opacity = 0.35;
  const arc = ring(0xffc34d, 48);
  group.add(axis, sunLine, eqRef, equator, overhead, tropicN, tropicS, arc);

  const label = (text, cls) => {
    const el = document.createElement("span");
    el.className = `sky-label decl ${cls}`;
    el.textContent = text;
    labelLayer.appendChild(el);
    return el;
  };
  const caption = document.createElement("div");
  caption.className = "sky-status decl-caption";
  caption.style.display = "none";
  labelLayer.appendChild(caption);
  const labels = {
    north: label("N", "pole"),
    south: label("S", "pole"),
    sun: label("to the Sun ☀", "sun"),
    angle: label("", "angle"),
    eq: label("equator", "eq"),
  };

  const tmp = new THREE.Vector3();
  const anchors = {};

  function update(date, opacity) {
    group.visible = opacity > 0.01;
    if (!group.visible) return;
    // Earth's axis in the scene: the image of the Earth-fixed z axis.
    const m = earthToScene(date, sunAzimuth);
    const n = new THREE.Vector3(m[0][2], m[1][2], m[2][2]);

    const s = sunDir.clone().normalize();
    const dec = subsolarPoint(date).lat;
    // Direction in the equator plane that points most toward the sun.
    const e = s.clone().sub(n.clone().multiplyScalar(s.dot(n))).normalize();

    point(axis, n.clone().multiplyScalar(-1.5), n.clone().multiplyScalar(1.5));
    point(sunLine, s.clone().multiplyScalar(-1.5), s.clone().multiplyScalar(1.9));
    point(eqRef, new THREE.Vector3(), e.clone().multiplyScalar(1.5));
    setParallel(equator, n, 0);
    setParallel(overhead, n, dec, 1.006);
    setParallel(tropicN, n, TILT);
    setParallel(tropicS, n, -TILT);

    // Arc from the equator plane to the sun line, outside the globe.
    const pos = arc.geometry.attributes.position;
    const segs = arc.userData.segments;
    const R = 1.32;
    const d = (dec * Math.PI) / 180;
    for (let i = 0; i <= segs; i++) {
      const t = (d * i) / segs;
      tmp.copy(e).multiplyScalar(Math.cos(t) * R).add(n.clone().multiplyScalar(Math.sin(t) * R));
      pos.setXYZ(i, tmp.x, tmp.y, tmp.z);
    }
    pos.needsUpdate = true;

    for (const obj of [axis, sunLine, eqRef]) obj.userData.materials.forEach((mat, i) => (mat.opacity = opacity * (i ? 0.3 : 1)));
    for (const obj of [equator, overhead, arc]) obj.material.opacity = opacity;
    tropicN.material.opacity = tropicS.material.opacity = 0.35 * opacity;

    const mid = d / 2;
    anchors.north = n.clone().multiplyScalar(1.6);
    anchors.south = n.clone().multiplyScalar(-1.6);
    anchors.sun = s.clone().multiplyScalar(2.0);
    anchors.angle = e.clone().multiplyScalar(Math.cos(mid) * 1.42).add(n.clone().multiplyScalar(Math.sin(mid) * 1.42));
    anchors.eq = e.clone().multiplyScalar(1.55);
    const sign = dec >= 0 ? "+" : "−";
    const hemi = dec >= 0 ? "N" : "S";
    labels.angle.textContent = `δ ${sign}${Math.abs(dec).toFixed(1)}°`;
    const trend = subsolarPoint(new Date(date.getTime() + 86400000)).lat - dec;
    const season = Math.abs(dec) > 23.35 ? (dec > 0 ? " · June solstice" : " · December solstice")
      : Math.abs(dec) < 0.4 ? " · equinox" : ` · moving ${trend > 0 ? "north" : "south"} ${Math.abs(trend).toFixed(2)}° a day`;
    caption.innerHTML = `<b>Solar declination ${sign}${Math.abs(dec).toFixed(1)}°</b>${season}<br>` +
      `<span>The Sun line meets the equator plane at this angle, so the Sun is overhead at ${Math.abs(dec).toFixed(1)}°${hemi} today (gold circle). ` +
      `Earth's 23.4° tilt makes it swing between the two tropics (faint circles) every year.</span>`;
  }

  function updateLabels(camera, w, h, visible) {
    caption.style.display = visible ? "" : "none";
    for (const [k, el] of Object.entries(labels)) {
      const p = anchors[k];
      if (!visible || !p) {
        el.style.display = "none";
        continue;
      }
      tmp.copy(p).project(camera);
      if (tmp.z > 1 || Math.abs(tmp.x) > 1.05 || Math.abs(tmp.y) > 1.05) {
        el.style.display = "none";
        continue;
      }
      el.style.display = "";
      el.style.transform = `translate(${((tmp.x + 1) / 2 * w).toFixed(1)}px, ${((1 - tmp.y) / 2 * h).toFixed(1)}px)`;
    }
  }

  return {
    update,
    updateLabels,
    hide() {
      Object.values(labels).forEach((el) => (el.style.display = "none"));
      caption.style.display = "none";
    },
  };
}
