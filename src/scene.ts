import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Room, Door, Card, Deck, Floor, rotated, openings } from './model';

const colors = { item: '#b89b60', event: '#7997a4', omen: '#a884b6' };
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
export function createScene(host: HTMLElement, onDoor: (door: Door) => void, onDeck: (deck: Deck) => void) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#111a1c');
  scene.fog = new THREE.Fog('#111a1c', 30, 70);
  const camera = new THREE.PerspectiveCamera(38, 1, .1, 100);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  host.appendChild(renderer.domElement);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI / 2.3;
  controls.minDistance = 5; controls.maxDistance = 40;
  scene.add(new THREE.HemisphereLight('#d4e3df', '#363329', 2.3));
  const light = new THREE.DirectionalLight('#ffe4b4', 3.2);
  light.position.set(4, 12, 7); light.castShadow = true;
  light.shadow.mapSize.set(2048, 2048);
  Object.assign(light.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20 });
  light.shadow.bias = -.001;
  scene.add(light);
  const board = new THREE.Group(), markers = new THREE.Group(), decks = new THREE.Group();
  scene.add(board, markers, decks);
  let ghost: THREE.Group | undefined, activeCard: THREE.Group | undefined;
  let moving: { object: THREE.Object3D; start: number; duration: number; update: (t: number) => void; done: () => void } | undefined;
  let lastRooms: Room[] = [], lastFloor: Floor = 'ground', blocked = false;
  const material = (color: string) => new THREE.MeshStandardMaterial({ color, roughness: .85 });
  function box(parent: THREE.Object3D, x: number, y: number, z: number, w: number, h: number, d: number, color: string) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material(color));
    mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }
  function label(parent: THREE.Object3D, text: string, color = '#e8dcc1', width = 2.5) {
    const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 96;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#202725'; ctx.fillRect(0, 0, 640, 96);
    ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.font = '32px Georgia'; ctx.fillText(text, 320, 61, 600);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, width * .15), new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide }));
    mesh.rotation.x = -Math.PI / 2; mesh.position.set(0, .16, 1.13); parent.add(mesh);
  }
  function clear(group: THREE.Object3D) {
    for (const child of [...group.children]) {
      child.traverse(obj => { const mesh = obj as THREE.Mesh; mesh.geometry?.dispose(); if (mesh.material) for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) { (m as THREE.MeshBasicMaterial).map?.dispose(); m.dispose(); } });
      group.remove(child);
    }
  }
  box(scene, 0, -.35, 0, 180, .3, 180, '#1e2929');
  function makeRoom(room: Room) {
    const group = new THREE.Group(); group.position.set(room.x * 3.2, 0, room.z * 3.2);
    const inside = new THREE.Group(); inside.rotation.y = -room.rotation * Math.PI / 2; group.add(inside);
    box(inside, 0, -.02, 0, 3.08, .22, 3.08, '#333a34');
    box(inside, 0, .1, 0, 2.94, .05, 2.94, room.floor === 'basement' ? '#696b60' : '#827158');
    for (let i = -3; i <= 3; i++) box(inside, i * .4, .13, 0, .015, .008, 2.9, '#514d40');
    for (let i = 0; i < 4; i++) {
      const wall = new THREE.Group(); wall.rotation.y = -i * Math.PI / 2; inside.add(wall);
      if (rotated(room.tile.doors, 0).includes(i)) {
        box(wall, -.99, .46, -1.46, .94, .68, .13, '#b0a389'); box(wall, .99, .46, -1.46, .94, .68, .13, '#b0a389');
        box(wall, 0, .15, -1.46, 1, .04, .19, '#c1a875');
      } else {
        box(wall, 0, .46, -1.46, 3, .68, .13, '#b0a389');
        if (rotated(room.tile.windows, 0).includes(i)) box(wall, 0, .52, -1.38, .85, .36, .03, '#5e939d');
      }
    }
    const id = room.tile.id;
    if (/stairs|staircase|landing/.test(id)) {
      for (let i = 0; i < 6; i++) box(inside, 0, .2 + i * .07, .6 - i * .23, .95, .14 + i * .14, .24, '#b7aa8a');
    } else if (/bed|nursery|quarters/.test(id)) {
      box(inside, -.35, .3, -.15, 1.1, .35, 1.65, '#51473c'); box(inside, -.35, .52, -.15, 1.05, .15, 1.55, '#647b78'); box(inside, -.35, .63, -.68, .8, .12, .35, '#d3c9aa');
    } else if (/library|laboratory|storeroom|larder|wine|kitchen/.test(id)) {
      for (const x of [-.9, .9]) { box(inside, x, .53, -.5, .48, .8, 1.25, '#51483a'); for (let i = 0; i < 4; i++) box(inside, x, .55, -.92 + i * .28, .5, .38, .16, ['#8b7655', '#586e67', '#9b6654'][i % 3]); }
    } else if (/crypt|grave|chapel|pentagram/.test(id)) {
      box(inside, 0, .32, -.35, .9, .4, 1.35, '#929188'); box(inside, 0, .58, -.35, 1.05, .12, 1.48, '#b7b3a1');
    } else if (/lake|garden|conservatory|patio/.test(id)) {
      box(inside, 0, .16, -.15, 1.9, .06, 1.6, /lake/.test(id) ? '#427c86' : '#516b4c');
      for (const x of [-.7, .7]) box(inside, x, .4, -.65, .35, .5, .35, '#76835b');
    } else {
      box(inside, 0, .55, -.15, 1.35, .13, .8, '#634e37');
      for (const x of [-.5, .5]) for (const z of [-.4, .1]) box(inside, x, .32, z, .1, .5, .1, '#493d30');
      box(inside, 0, .68, -.15, .24, .14, .24, '#bfaa76');
    }
    label(group, room.tile.name);
    if (room.tile.cardIcon) box(group, 1.26, .17, 1.15, .16, .05, .16, colors[room.tile.cardIcon]);
    return group;
  }
  function paint(rooms: Room[], floor: Floor, locked = false) {
    lastRooms = rooms; lastFloor = floor; blocked = locked;
    decks.position.z = Math.max(0, ...rooms.filter(r => r.floor === floor).map(r => r.z * 3.2)) + .8;
    clear(board); clear(markers);
    rooms.filter(r => r.floor === floor).forEach(r => { const mesh = makeRoom(r); mesh.userData.key = `${r.x},${r.z}`; board.add(mesh); });
    if (!locked) openings(rooms, floor).forEach(door => {
      const marker = new THREE.Mesh(new THREE.RingGeometry(.2, .33, 32), new THREE.MeshBasicMaterial({ color: '#d4ba78', side: THREE.DoubleSide }));
      marker.rotation.x = -Math.PI / 2; marker.position.set((door.room.x + (door.x - door.room.x) * .65) * 3.2, .18, (door.room.z + (door.z - door.room.z) * .65) * 3.2);
      marker.userData.door = door; markers.add(marker);
    });
  }
  function preview(room?: Room, valid = true) {
    if (ghost) { scene.remove(ghost); clear(ghost); ghost = undefined; }
    if (!room) return;
    ghost = makeRoom(room); ghost.position.y = .7;
    ghost.traverse(obj => { const mesh = obj as THREE.Mesh; if (mesh.material) for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) { m.transparent = true; m.opacity = .48; if ('color' in m) (m as THREE.MeshStandardMaterial).color.set(valid ? '#94c8a2' : '#cf7064'); } });
    scene.add(ghost);
  }
  function frame() {
    const visible = lastRooms.filter(r => r.floor === lastFloor);
    const x = visible.reduce((sum, r) => sum + r.x * 3.2, 0) / visible.length;
    const z = visible.reduce((sum, r) => sum + r.z * 3.2, 0) / visible.length;
    const span = Math.max(9, ...visible.map(r => Math.max(Math.abs(r.x * 3.2 - x), Math.abs(r.z * 3.2 - z)) * 2 + 5));
    controls.target.set(x, 0, z); camera.position.set(x + span, span * 1.4, z + span * 1.7); controls.update();
  }
  function animate(object: THREE.Object3D, duration: number, update: (t: number) => void, done: () => void) {
    moving = { object, duration: reduced ? 80 : duration, start: performance.now(), update, done };
  }
  function settle(room: Room, done: () => void) {
    const object = board.children.find(o => o.userData.key === `${room.x},${room.z}`)!;
    animate(object, 650, t => { object.position.y = 2.5 * Math.pow(1 - t, 3); }, done);
  }
  function deckStacks(counts: Record<Deck, number>) {
    clear(decks);
    (['item', 'event', 'omen'] as Deck[]).forEach((type, i) => {
      const stack = new THREE.Group(); stack.position.set(i * 2.1, 0, 5.8); stack.userData.deck = type; decks.add(stack);
      for (let j = 0; j < Math.min(counts[type], 6); j++) box(stack, 0, j * .035, 0, 1.35, .035, 1.9, j % 2 ? '#c5bc9f' : colors[type]);
      label(stack, type.toUpperCase(), colors[type], 1.7);
    });
  }
  function draw(card: Card, done: () => void) {
    const group = new THREE.Group(); activeCard = group; scene.add(group);
    const canvas = document.createElement('canvas'); canvas.width = 600; canvas.height = 840;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#e5dcc4'; ctx.fillRect(0, 0, 600, 840); ctx.strokeStyle = colors[card.type]; ctx.lineWidth = 12; ctx.strokeRect(22, 22, 556, 796);
    let y = 90;
    function write(text: string, font: string, line: number) {
      ctx.font = font; ctx.fillStyle = '#302f28'; let row = '';
      for (const word of text.split(/\s+/)) { if (ctx.measureText(row + word).width > 470 && row) { ctx.fillText(row, 65, y); y += line; row = ''; } row += word + ' '; }
      ctx.fillText(row, 65, y); y += line + 22;
    }
    write(card.type.toUpperCase(), '20px sans-serif', 28); write(card.title, 'bold 38px Georgia', 45); write(card.text, 'italic 25px Georgia', 34);
    write((card.rules ?? '').slice(0, 220) + ((card.rules?.length ?? 0) > 220 ? '…' : ''), '24px Georgia', 32);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2.8, .045), [material('#c6b58b'), material('#c6b58b'), material('#c6b58b'), material('#c6b58b'), new THREE.MeshBasicMaterial({ map: texture }), material(colors[card.type])]);
    group.add(mesh);
    const start = new THREE.Vector3((['item', 'event', 'omen'].indexOf(card.type)) * 2.1, .35, 5.8 + decks.position.z);
    const end = new THREE.Vector3(0, 0, -6).applyQuaternion(camera.quaternion).add(camera.position);
    const back = camera.quaternion.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI));
    controls.enabled = false;
    animate(group, 1200, t => {
      const ease = 1 - Math.pow(1 - t, 3); group.position.lerpVectors(start, end, ease); group.position.y += Math.sin(t * Math.PI) * 1.5;
      group.quaternion.slerpQuaternions(back, camera.quaternion, Math.max(0, (t - .2) / .8));
    }, done);
  }
  function dismiss(done: () => void) {
    if (!activeCard) { done(); return; }
    const object = activeCard, start = object.position.clone();
    animate(object, 500, t => { object.position.lerpVectors(start, new THREE.Vector3(7, .2, 5.8 + decks.position.z), t * t); object.scale.setScalar(1 - t * .5); }, () => { scene.remove(object); clear(object); activeCard = undefined; controls.enabled = true; done(); });
  }
  function cancel() { moving = undefined; if (activeCard) { scene.remove(activeCard); clear(activeCard); activeCard = undefined; } preview(); controls.enabled = true; }
  const ray = new THREE.Raycaster(), pointer = new THREE.Vector2(); let down = [0, 0];
  const pointerDown = (e: PointerEvent) => { down = [e.clientX, e.clientY]; };
  const pointerUp = (e: PointerEvent) => {
    if (blocked || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;
    const bounds = renderer.domElement.getBoundingClientRect(); pointer.set((e.clientX - bounds.left) / bounds.width * 2 - 1, -(e.clientY - bounds.top) / bounds.height * 2 + 1);
    ray.setFromCamera(pointer, camera);
    const hit = ray.intersectObjects([...markers.children, ...decks.children], true)[0];
    if (!hit) return; let object: THREE.Object3D | null = hit.object;
    while (object) { if (object.userData.door) { onDoor(object.userData.door); break; } if (object.userData.deck) { onDeck(object.userData.deck); break; } object = object.parent; }
  };
  renderer.domElement.addEventListener('pointerdown', pointerDown); renderer.domElement.addEventListener('pointerup', pointerUp);
  const observer = new ResizeObserver(() => { renderer.setSize(host.clientWidth, host.clientHeight); camera.aspect = host.clientWidth / host.clientHeight; camera.updateProjectionMatrix(); }); observer.observe(host);
  renderer.setAnimationLoop(() => {
    if (moving) { const current = moving; const t = Math.min(1, (performance.now() - current.start) / current.duration); current.update(t); if (t === 1) { moving = undefined; current.done(); } }
    controls.update(); renderer.render(scene, camera);
  });
  return { paint, preview, frame, settle, deckStacks, draw, dismiss, cancel, dispose() { cancel(); observer.disconnect(); renderer.setAnimationLoop(null); controls.dispose(); clear(scene); renderer.dispose(); renderer.domElement.remove(); } };
}
