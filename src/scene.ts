import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Room, Door, Card, Deck, Floor, rotated, openings } from './model';

const colors = { item: '#b89b60', event: '#7997a4', omen: '#a884b6' };
const symbols = { item: '◇', event: '≋', omen: '☾' };
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
export function createScene(host: HTMLElement, onDoor: (door: Door) => void, onDeck: (deck: Deck) => void, onHover: (room: Room | null, x?: number, y?: number) => void, onRoom: (room: Room) => void, onExploreHover: (x?: number, y?: number) => void) {
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
  const cardScene = new THREE.Scene();
  cardScene.add(new THREE.HemisphereLight('#ffffff', '#777777', 2));
  const cardRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  cardRenderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  cardRenderer.outputColorSpace = THREE.SRGBColorSpace;
  cardRenderer.domElement.className = 'card-layer';
  host.appendChild(cardRenderer.domElement);
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
  const explorer = new THREE.Group(); scene.add(explorer);
  let ghost: THREE.Group | undefined, activeCard: THREE.Group | undefined;
  let diceGroup: THREE.Group | undefined, diceStart = 0;
  let explorerFloor: Floor = 'ground';
  let explorerRoom = { x: 0, z: 0 };
  let moving: { object: THREE.Object3D; start: number; duration: number; update: (t: number) => void; done: () => void } | undefined;
  let lastRooms: Room[] = [], lastFloor: Floor = 'ground', blocked = false;
  const material = (color: string) => new THREE.MeshStandardMaterial({ color, roughness: .85 });
  function box(parent: THREE.Object3D, x: number, y: number, z: number, w: number, h: number, d: number, color: string) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material(color));
    mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }
  box(explorer, 0, .2, 0, .56, .08, .56, '#b49b68');
  box(explorer, 0, .58, 0, .3, .55, .22, '#476f73');
  box(explorer, -.1, .3, 0, .11, .22, .13, '#303e40');
  box(explorer, .1, .3, 0, .11, .22, .13, '#303e40');
  box(explorer, -.2, .59, 0, .09, .38, .1, '#476f73');
  box(explorer, .2, .59, 0, .09, .38, .1, '#476f73');
  const head = new THREE.Mesh(new THREE.SphereGeometry(.14, 16, 12), material('#d1a77d'));
  head.position.y = 1.02; head.castShadow = true; explorer.add(head);
  explorer.position.set(-.8, 0, .5);
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
  function iconTexture(type: Deck) {
    const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = colors[type]; ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = '#202725'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '180px sans-serif'; ctx.fillText(symbols[type], 128, 128);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; return texture;
  }
  box(scene, 0, -.35, 0, 180, .3, 180, '#1e2929');
  function makeRoom(room: Room, hideName = false) {
    const group = new THREE.Group(); group.position.set(room.x * 3.2, 0, room.z * 3.2);
    const inside = new THREE.Group(); inside.rotation.y = -room.rotation * Math.PI / 2; group.add(inside);
    const descending = room.tile.id === 'upper-landing';
    if (descending) {
      // Leave an opening in the landing so the steps visibly descend below it.
      for (const x of [-1.02, 1.02]) {
        box(inside, x, -.02, 0, 1.04, .22, 3.08, '#333a34');
        box(inside, x, .1, 0, .97, .05, 2.94, '#827158');
      }
      for (const z of [-1.15, 1.15]) {
        box(inside, 0, -.02, z, 1, .22, .78, '#333a34');
        box(inside, 0, .1, z, 1, .05, .64, '#827158');
      }
      box(inside, 0, -.65, 0, 1, .05, 1.7, '#292f2b');
    } else {
      box(inside, 0, -.02, 0, 3.08, .22, 3.08, '#333a34');
      box(inside, 0, .1, 0, 2.94, .05, 2.94, room.floor === 'basement' ? '#696b60' : '#827158');
      for (let i = -3; i <= 3; i++) box(inside, i * .4, .13, 0, .015, .008, 2.9, '#514d40');
    }
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
      for (let i = 0; i < 6; i++) {
        if (descending) box(inside, 0, .04 - i * .11, .6 - i * .23, .95, .08, .24, '#b7aa8a');
        else box(inside, 0, .2 + i * .07, .6 - i * .23, .95, .14 + i * .14, .24, '#b7aa8a');
      }
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
    if (!hideName) label(group, room.tile.name);
    if (room.tile.cardIcon) {
      const icon = new THREE.Mesh(new THREE.PlaneGeometry(.35, .35), new THREE.MeshBasicMaterial({ map: iconTexture(room.tile.cardIcon), side: THREE.DoubleSide }));
      icon.rotation.x = -Math.PI / 2; icon.position.set(1.25, .18, 1.13); group.add(icon);
    }
    return group;
  }
  function paint(rooms: Room[], floor: Floor, locked = false) {
    lastRooms = rooms; lastFloor = floor; blocked = locked;
    explorer.visible = floor === explorerFloor;
    decks.position.z = Math.max(0, ...rooms.filter(r => r.floor === floor).map(r => r.z * 3.2)) + .8;
    clear(board); clear(markers);
    if (locked) { renderer.domElement.style.cursor = ""; onExploreHover(); }
    rooms.filter(r => r.floor === floor).forEach(r => { const mesh = makeRoom(r); mesh.userData.key = `${r.x},${r.z}`; mesh.userData.room = r; board.add(mesh); });
    if (!locked) openings(rooms, floor).forEach(door => {
      const marker = new THREE.Mesh(new THREE.RingGeometry(.2, .33, 32), new THREE.MeshBasicMaterial({ color: '#d4ba78', side: THREE.DoubleSide }));
      marker.rotation.x = -Math.PI / 2; marker.position.set((door.room.x + (door.x - door.room.x) * .65) * 3.2, .18, (door.room.z + (door.z - door.room.z) * .65) * 3.2);
      marker.userData.door = door; markers.add(marker);
      const hitArea = new THREE.Mesh(new THREE.PlaneGeometry(3.08, 3.08), new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide }));
      hitArea.rotation.x = -Math.PI / 2; hitArea.position.set(door.x * 3.2, .18, door.z * 3.2); hitArea.userData.door = door; markers.add(hitArea);
    });
  }
  function preview(room?: Room, valid = true) {
    if (ghost) { scene.remove(ghost); clear(ghost); ghost = undefined; }
    if (!room) return;
    ghost = makeRoom(room, true); ghost.position.y = .7;
    ghost.traverse(obj => { const mesh = obj as THREE.Mesh; if (mesh.material) for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) { m.transparent = true; m.opacity = .48; if ('color' in m) (m as THREE.MeshStandardMaterial).color.set(valid ? '#94c8a2' : '#cf7064'); } });
    scene.add(ghost);
  }
  function frame(view: 'isometric' | 'topdown' | 'front' | 'recenter' = 'isometric') {
    const visible = lastRooms.filter(r => r.floor === lastFloor);
    const x = visible.reduce((sum, r) => sum + r.x * 3.2, 0) / visible.length;
    const z = visible.reduce((sum, r) => sum + r.z * 3.2, 0) / visible.length;
    const span = Math.max(9, ...visible.map(r => Math.max(Math.abs(r.x * 3.2 - x), Math.abs(r.z * 3.2 - z)) * 2 + 5)) * .614125;
    if (view === 'recenter') {
      const direction = camera.position.clone().sub(controls.target).normalize();
      camera.position.set(x, 0, z).addScaledVector(direction, Math.min(controls.maxDistance, span * 2.42));
      controls.target.set(x, 0, z); controls.update(); return;
    }
    controls.target.set(x, 0, z);
    if (view === 'topdown') camera.position.set(x, span * 2.4, z + .01);
    else if (view === 'front') camera.position.set(x, span, z + span * 2);
    else camera.position.set(x + span, span * 1.4, z + span * 1.7);
    controls.update();
  }
  function moveCamera(forward: number, right: number, rotation: number) {
    const offset = camera.position.clone().sub(controls.target);
    if (rotation) offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), rotation);
    const direction = new THREE.Vector3(-offset.x, 0, -offset.z).normalize();
    const shift = direction.clone().multiplyScalar(forward).add(new THREE.Vector3(-direction.z, 0, direction.x).multiplyScalar(right));
    controls.target.add(shift); camera.position.copy(controls.target).add(offset); controls.update();
  }
  function moveExplorer(room: Room, done: () => void, failed: () => void = () => {}, transfer = false) {
    if (room.floor !== explorerFloor) {
      if (!transfer) { failed(); return; }
      explorerFloor = room.floor; explorerRoom = { x: room.x, z: room.z }; explorer.position.set(room.x * 3.2 - 1.12, 0, room.z * 3.2); explorer.visible = lastFloor === explorerFloor; done(); return;
    }
    const rooms = lastRooms.filter(r => r.floor === explorerFloor), startRoom = rooms.find(r => r.x === explorerRoom.x && r.z === explorerRoom.z);
    if (!startRoom) { failed(); return; }
    const queue: Room[][] = [[startRoom]], visited = new Set([`${startRoom.x},${startRoom.z}`]);
    let path: Room[] | undefined;
    while (queue.length) {
      const current = queue.shift()!, last = current[current.length - 1];
      if (last.x === room.x && last.z === room.z) { path = current; break; }
      for (const direction of rotated(last.tile.doors, last.rotation)) {
        const [dx, dz] = [[0, -1], [1, 0], [0, 1], [-1, 0]][direction];
        const next = rooms.find(r => r.x === last.x + dx && r.z === last.z + dz);
        if (!next || visited.has(`${next.x},${next.z}`) || !rotated(next.tile.doors, next.rotation).includes((direction + 2) % 4)) continue;
        visited.add(`${next.x},${next.z}`); queue.push([...current, next]);
      }
    }
    if (!path) { failed(); return; }
    const points = [explorer.position.clone()];
    // Keep the explorer near the room perimeter, clear of central furniture.
    const ring = [[0, -1.12], [1.12, -1.12], [1.12, 0], [1.12, 1.12], [0, 1.12], [-1.12, 1.12], [-1.12, 0], [-1.12, -1.12]];
    const pointOnRing = (r: Room, index: number) => new THREE.Vector3(r.x * 3.2 + ring[index][0], 0, r.z * 3.2 + ring[index][1]);
    const walkRing = (r: Room, from: number, to: number) => {
      const clockwise = (to - from + 8) % 8, step = clockwise <= 4 ? 1 : -1;
      let index = from;
      while (index !== to) { index = (index + step + 8) % 8; points.push(pointOnRing(r, index)); }
    };
    let entry = 6;
    points.push(pointOnRing(path[0], entry));
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i];
      const direction = b.z < a.z ? 0 : b.x > a.x ? 1 : b.z > a.z ? 2 : 3;
      const exit = direction * 2;
      walkRing(a, entry, exit);
      points.push(new THREE.Vector3((a.x + b.x) * 1.6, 0, (a.z + b.z) * 1.6));
      entry = (exit + 4) % 8;
      points.push(pointOnRing(b, entry));
    }
    walkRing(room, entry, 6);
    if (points.length === 1) { done(); return; }
    animate(explorer, 180 * (points.length - 1), t => { const progress = t * (points.length - 1), index = Math.min(Math.floor(progress), points.length - 2); explorer.position.lerpVectors(points[index], points[index + 1], progress - index); explorer.position.y = Math.abs(Math.sin(progress * Math.PI * 2)) * .12; }, () => { explorer.position.y = 0; explorerRoom = { x: room.x, z: room.z }; done(); });
  }
  function resetExplorer() { explorerFloor = 'ground'; explorerRoom = { x: 0, z: 0 }; explorer.position.set(-.8, 0, .5); explorer.visible = lastFloor === explorerFloor; }
  function rollDice(values: number[]) {
    if (diceGroup) { scene.remove(diceGroup); clear(diceGroup); }
    diceGroup = new THREE.Group(); scene.add(diceGroup); diceStart = performance.now();
    const forward = new THREE.Vector3(); camera.getWorldDirection(forward);
    const center = camera.position.clone().addScaledVector(forward, 6);
    diceGroup.position.copy(center); diceGroup.quaternion.copy(camera.quaternion);
    values.forEach((value, i) => {
      const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 128;
      const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#e5dcc4'; ctx.fillRect(0, 0, 128, 128);
      ctx.strokeStyle = '#9b8964'; ctx.lineWidth = 5; ctx.strokeRect(4, 4, 120, 120);
      ctx.fillStyle = '#302f28'; ctx.font = 'bold 76px Georgia'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(value), 64, 68);
      const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
      const die = new THREE.Mesh(new THREE.BoxGeometry(.48, .48, .48), new THREE.MeshBasicMaterial({ map: texture }));
      die.position.set((i - (values.length - 1) / 2) * .62, 0, 0); diceGroup!.add(die);
    });
    const totalCanvas = document.createElement('canvas'); totalCanvas.width = 512; totalCanvas.height = 128;
    const totalCtx = totalCanvas.getContext('2d')!;
    totalCtx.fillStyle = '#172123'; totalCtx.fillRect(0, 0, 512, 128);
    totalCtx.fillStyle = '#e5dcc4'; totalCtx.textAlign = 'center'; totalCtx.textBaseline = 'middle';
    totalCtx.font = 'bold 64px sans-serif'; totalCtx.fillText(`TOTAL: ${values.reduce((sum, value) => sum + value, 0)}`, 256, 64);
    const totalTexture = new THREE.CanvasTexture(totalCanvas); totalTexture.colorSpace = THREE.SRGBColorSpace;
    const total = new THREE.Mesh(new THREE.PlaneGeometry(2, .5), new THREE.MeshBasicMaterial({ map: totalTexture }));
    total.position.set(0, -.8, 0); total.userData.diceTotal = true; total.visible = false; diceGroup.add(total);
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
      if (counts[type] > 0) {
        const icon = new THREE.Mesh(new THREE.PlaneGeometry(.8, .8), new THREE.MeshBasicMaterial({ map: iconTexture(type), side: THREE.DoubleSide }));
        icon.rotation.x = -Math.PI / 2; icon.position.set(0, (Math.min(counts[type], 6) - 1) * .035 + .019, 0); stack.add(icon);
      }
      label(stack, type.toUpperCase(), colors[type], 1.7);
    });
  }
  function draw(card: Card, done: () => void) {
    const group = new THREE.Group(); activeCard = group; cardScene.add(group);
    const canvas = document.createElement('canvas'); canvas.width = 600; canvas.height = 840;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#e5dcc4'; ctx.fillRect(0, 0, 600, 840); ctx.strokeStyle = colors[card.type]; ctx.lineWidth = 12; ctx.strokeRect(22, 22, 556, 796);
    ctx.fillStyle = colors[card.type]; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '100px sans-serif'; ctx.fillText(symbols[card.type], 500, 95);
    ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
    let y = 90;
    function write(text: string, font: string, line: number) {
      ctx.font = font; ctx.fillStyle = '#302f28'; let row = '';
      for (const word of text.split(/\s+/)) { if (ctx.measureText(row + word).width > 470 && row) { ctx.fillText(row, 65, y); y += line; row = ''; } row += word + ' '; }
      ctx.fillText(row, 65, y); y += line + 22;
    }
    write(card.type.toUpperCase(), '20px sans-serif', 28); write(card.title, 'bold 38px Georgia', 45); write(card.text, 'italic 25px Georgia', 34);
    write((card.rules ?? '').slice(0, 220) + ((card.rules?.length ?? 0) > 220 ? '…' : ''), '24px Georgia', 32);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2.8, .045), [material('#c6b58b'), material('#c6b58b'), material('#c6b58b'), material('#c6b58b'), new THREE.MeshBasicMaterial({ map: texture }), new THREE.MeshBasicMaterial({ map: iconTexture(card.type) })]);
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
    animate(object, 500, t => { object.position.lerpVectors(start, new THREE.Vector3(7, .2, 5.8 + decks.position.z), t * t); object.scale.setScalar(1 - t * .5); }, () => { cardScene.remove(object); clear(object); activeCard = undefined; controls.enabled = true; done(); });
  }
  function cancel() { moving = undefined; if (activeCard) { cardScene.remove(activeCard); clear(activeCard); activeCard = undefined; } preview(); controls.enabled = true; }
  const ray = new THREE.Raycaster(), pointer = new THREE.Vector2(); let down = [0, 0];
  const pointerDown = (e: PointerEvent) => { down = [e.clientX, e.clientY]; };
  const pointerMove = (e: PointerEvent) => {
    if (blocked || e.buttons) { onHover(null); onExploreHover(); renderer.domElement.style.cursor = ""; return; }
    const bounds = renderer.domElement.getBoundingClientRect(); pointer.set((e.clientX - bounds.left) / bounds.width * 2 - 1, -(e.clientY - bounds.top) / bounds.height * 2 + 1);
    ray.setFromCamera(pointer, camera);
    const hit = ray.intersectObjects([...markers.children, ...decks.children, ...board.children], true)[0];
    let target: THREE.Object3D | null = hit?.object ?? null;
    while (target && !target.userData.door && !target.userData.room && !target.userData.deck) target = target.parent;
    const door = !!target?.userData.door;
    renderer.domElement.style.cursor = door ? "pointer" : "";
    markers.children.forEach(marker => { if ((marker as THREE.Mesh).material instanceof THREE.MeshBasicMaterial && (marker as THREE.Mesh).material.visible) (marker as THREE.Mesh).scale.setScalar(door && marker.userData.door === target?.userData.door ? 1.35 : 1); });
    onExploreHover(door ? e.clientX : undefined, door ? e.clientY : undefined);
    let object: THREE.Object3D | null = door ? null : hit?.object ?? null;
    while (object && !object.userData.room) object = object.parent;
    onHover(object?.userData.room ?? null, e.clientX, e.clientY);
  };
  const pointerLeave = () => { onHover(null); onExploreHover(); renderer.domElement.style.cursor = ""; markers.children.forEach(marker => marker.scale.setScalar(1)); };
  const pointerUp = (e: PointerEvent) => {
    if (blocked || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;
    const bounds = renderer.domElement.getBoundingClientRect(); pointer.set((e.clientX - bounds.left) / bounds.width * 2 - 1, -(e.clientY - bounds.top) / bounds.height * 2 + 1);
    ray.setFromCamera(pointer, camera);
    const hit = ray.intersectObjects([...markers.children, ...decks.children, ...board.children], true)[0];
    if (!hit) return;
    let object: THREE.Object3D | null = hit.object;
    while (object) { if (object.userData.door) { onDoor(object.userData.door); break; } if (object.userData.deck) { onDeck(object.userData.deck); break; } if (object.userData.room) { onRoom(object.userData.room); break; } object = object.parent; }
  };
  renderer.domElement.addEventListener('pointerdown', pointerDown); renderer.domElement.addEventListener('pointerup', pointerUp);
  renderer.domElement.addEventListener('pointermove', pointerMove); renderer.domElement.addEventListener('pointerleave', pointerLeave);
  const observer = new ResizeObserver(() => { renderer.setSize(host.clientWidth, host.clientHeight); cardRenderer.setSize(host.clientWidth, host.clientHeight); camera.aspect = host.clientWidth / host.clientHeight; camera.updateProjectionMatrix(); }); observer.observe(host);
  renderer.setAnimationLoop(() => {
    if (moving) { const current = moving; const t = Math.min(1, (performance.now() - current.start) / current.duration); current.update(t); if (t === 1) { moving = undefined; current.done(); } }
    if (diceGroup) {
      const elapsed = performance.now() - diceStart;
      diceGroup.children.forEach((die, i) => { if (die.userData.diceTotal) { die.visible = elapsed >= (reduced ? 80 : 1000 + (diceGroup!.children.length - 2) * 80); return; } const t = Math.min(1, elapsed / (reduced ? 80 : 1000 + i * 80)); die.rotation.set((1 - t) * (8 + i), (1 - t) * (10 + i), (1 - t) * 4); die.position.y = Math.sin(t * Math.PI) * .5; });
      if (elapsed > 3500) { scene.remove(diceGroup); clear(diceGroup); diceGroup = undefined; }
    }
    // OrbitControls damping keeps moving the camera even while input is disabled.
    if (!activeCard) controls.update();
    renderer.render(scene, camera);
    cardRenderer.render(cardScene, camera);
  });
  return { paint, preview, frame, moveCamera, moveExplorer, resetExplorer, rollDice, settle, deckStacks, draw, dismiss, cancel, dispose() { cancel(); observer.disconnect(); renderer.setAnimationLoop(null); controls.dispose(); clear(scene); renderer.dispose(); cardRenderer.dispose(); renderer.domElement.remove(); cardRenderer.domElement.remove(); } };
}
