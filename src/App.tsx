import React, { useEffect, useReducer, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createScene } from './scene';
import { Card, Deck, Door, Floor, Room, content, rotated, shuffle, startingRooms } from './model';
import './style.css';

function initial() {
  return { rooms: startingRooms(), floor: 'ground' as Floor, stack: shuffle(content.ROOM_TILES),
    decks: { item: shuffle(content.ITEM_CARDS), event: shuffle(content.EVENT_CARDS), omen: shuffle(content.OMEN_CARDS) },
    preview: null as { room: Room; door: Door; stack: typeof content.ROOM_TILES } | null,
    card: null as Card | null, last: null as Card | null, busy: false,
    message: 'Choose a glowing doorway to discover a room.', placed: 0 };
}
function Minimap({ rooms, floor }: { rooms: Room[]; floor: Floor }) {
  const visible = rooms.filter(room => room.floor === floor);
  if (!visible.length) return null;
  const minX = Math.min(...visible.map(room => room.x)), maxX = Math.max(...visible.map(room => room.x));
  const minZ = Math.min(...visible.map(room => room.z)), maxZ = Math.max(...visible.map(room => room.z));
  return <aside className="minimap" aria-label={`Map of ${floor} floor`}><small>{floor.toUpperCase()} FLOOR MAP</small>
    <svg viewBox={`${minX * 40 - 3} ${minZ * 40 - 3} ${(maxX - minX + 1) * 40 + 6} ${(maxZ - minZ + 1) * 40 + 6}`} role="img" aria-label={`${visible.length} rooms on the ${floor} floor`}>
      {visible.map(room => <g key={`${room.x},${room.z}`} transform={`translate(${room.x * 40},${room.z * 40})`}>
        <title>{room.tile.name}</title><rect x="1" y="1" width="38" height="38" rx="2" />
        {rotated(room.tile.doors, room.rotation).map(d => <line key={d} x1={d === 1 ? 39 : d === 3 ? 1 : 15} y1={d === 0 ? 1 : d === 2 ? 39 : 15} x2={d === 1 ? 39 : d === 3 ? 1 : 25} y2={d === 0 ? 1 : d === 2 ? 39 : 25} />)}
        {room.tile.cardIcon && <text x="20" y="24" className={room.tile.cardIcon}>{room.tile.cardIcon === 'item' ? '◇' : room.tile.cardIcon === 'event' ? '≋' : '☾'}</text>}
      </g>)}
    </svg></aside>;
}
function App() {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<ReturnType<typeof createScene>>();
  const state = useRef(initial());
  const [hovered, setHovered] = useState<{ room: Room; x: number; y: number } | null>(null);
  const [diceCount, setDiceCount] = useState(2);
  const [dice, setDice] = useState<number[]>([]);
  const [, render] = useReducer(n => n + 1, 0);
  const s = state.current;
  const counts = () => Object.fromEntries(Object.entries(state.current.decks).map(([key, cards]) => [key, cards.length])) as Record<Deck, number>;
  const valid = () => { const p = state.current.preview; return !!p && rotated(p.room.tile.doors, p.room.rotation).includes((p.door.direction + 2) % 4); };
  function refresh() {
    const s = state.current;
    scene.current?.paint(s.rooms, s.floor, s.busy || !!s.card || !!s.preview);
    scene.current?.preview(s.preview?.room, valid());
    scene.current?.deckStacks(counts()); render();
  }
  function discover(door: Door) {
    const s = state.current;
    if (s.busy || s.card || s.preview) return;
    const before = [...s.stack], skipped = [];
    let tile;
    while (s.stack.length) { const next = s.stack.pop()!; if (next.floors.includes(s.floor) && next.doors.length) { tile = next; break; } skipped.push(next); }
    s.stack.unshift(...skipped);
    if (!tile) { s.message = 'No rooms remain for this floor. Try another floor or reset.'; refresh(); return; }
    let rotation = 0;
    while (!rotated(tile.doors, rotation).includes((door.direction + 2) % 4)) rotation++;
    s.preview = { room: { tile, floor: s.floor, x: door.x, z: door.z, rotation }, door, stack: before };
    s.message = 'Rotate the room, then place it when its doorway connects.'; refresh();
  }
  function draw(deck: Deck, replay = false) {
    const s = state.current;
    if (s.busy || s.card || s.preview) return;
    const card = replay ? s.last : s.decks[deck].pop();
    if (!card) { s.message = 'This deck is empty. Reset to restore the cards.'; refresh(); return; }
    s.busy = true; s.card = card; s.last = card; s.message = 'Something waits in the dark…'; refresh();
    scene.current?.draw(card, () => { s.busy = false; s.message = 'Inspect the card, then dismiss it to continue.'; refresh(); });
  }
  function rotate(amount: number) {
    if (!state.current.preview) return;
    const room = state.current.preview.room; room.rotation = (room.rotation + amount + 4) % 4; refresh();
  }
  function cancelPreview() {
    const s = state.current; if (!s.preview) return;
    s.stack = s.preview.stack; s.preview = null; s.message = 'Choose a glowing doorway to discover a room.'; refresh();
  }
  function place() {
    const s = state.current;
    if (!s.preview || !valid() || s.busy) return;
    const room = s.preview.room;
    s.rooms.push(room); s.preview = null; s.busy = true; s.placed++; s.message = 'The house takes shape.'; refresh();
    scene.current?.settle(room, () => { s.busy = false; refresh(); if (room.tile.cardIcon) draw(room.tile.cardIcon); });
  }
  function dismiss() {
    const s = state.current; if (!s.card || s.busy) return;
    s.busy = true; render();
    scene.current?.dismiss(() => { s.card = null; s.busy = false; s.message = 'Choose a doorway, or draw another card.'; refresh(); });
  }
  function reset() { scene.current?.cancel(); state.current = initial(); refresh(); scene.current?.frame(); }
  function floor(value: Floor) { const s = state.current; if (s.busy || s.card || s.preview) return; s.floor = value; refresh(); scene.current?.frame(); }
  const actions = useRef({ rotate, place, cancelPreview, dismiss }); actions.current = { rotate, place, cancelPreview, dismiss };
  useEffect(() => {
    scene.current = createScene(host.current!, discover, draw, (room, x, y) => setHovered(room && x !== undefined && y !== undefined ? { room, x, y } : null)); refresh(); scene.current.frame();
    const held = new Set<string>();
    let previous = performance.now(), animation = 0;
    const tick = (now: number) => {
      const delta = Math.min((now - previous) / 1000, .05); previous = now;
      if (!state.current.busy && !state.current.card) {
        const axis = (positive: string, negative: string) => Number(held.has(positive)) - Number(held.has(negative));
        const forward = axis('w', 's'), right = axis('d', 'a');
        const rotation = state.current.preview ? 0 : axis('q', 'e');
        if (forward || right || rotation) scene.current?.moveCamera(forward * delta * 8, right * delta * 8, rotation * delta * 1.3);
      }
      animation = requestAnimationFrame(tick);
    };
    animation = requestAnimationFrame(tick);
    const keyboard = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('button, input, select, textarea, [contenteditable="true"]')) return;
      const key = e.key.toLowerCase();
      if (state.current.card || state.current.busy) { if (key === 'escape' && !e.repeat) actions.current.dismiss(); return; }
      if (state.current.preview && (key === 'q' || key === 'e')) { if (!e.repeat) actions.current.rotate(key === 'q' ? -1 : 1); return; }
      if (key === 'w' || key === 's' || key === 'a' || key === 'd' || key === 'q' || key === 'e') {
        e.preventDefault(); held.add(key);
      }
      if (!e.repeat && key === '1') scene.current?.frame('isometric');
      if (!e.repeat && key === '2') scene.current?.frame('topdown');
      if (!e.repeat && key === '3') scene.current?.frame('front');
      if (!e.repeat && key === '4') scene.current?.frame('recenter');
      if (e.repeat) return;
      if (e.key === 'Enter') actions.current.place();
      if (e.key === 'Escape') { actions.current.cancelPreview(); actions.current.dismiss(); }
    };
    const keyup = (e: KeyboardEvent) => held.delete(e.key.toLowerCase());
    const clearHeld = () => held.clear();
    window.addEventListener('keydown', keyboard);
    window.addEventListener('keyup', keyup); window.addEventListener('blur', clearHeld);
    return () => { cancelAnimationFrame(animation); window.removeEventListener('keydown', keyboard); window.removeEventListener('keyup', keyup); window.removeEventListener('blur', clearHeld); scene.current?.dispose(); };
  }, []);
  const locked = s.busy || !!s.card || !!s.preview;
  return <main>
    <div ref={host} className="scene" />
    {hovered && !s.preview && !s.card && !s.busy && hovered.room.floor === s.floor && <section className="room-hover panel" style={{ left: Math.min(hovered.x + 16, window.innerWidth - 300), top: Math.max(8, Math.min(hovered.y + 16, window.innerHeight - 220)) }}><small>ROOM INFORMATION</small><h2>{hovered.room.tile.name}</h2>{hovered.room.tile.blurb && <p>{hovered.room.tile.blurb}</p>}{hovered.room.tile.rules && <p>{hovered.room.tile.rules}</p>}{hovered.room.tile.cardIcon && <small><span className={`room-card-icon ${hovered.room.tile.cardIcon}`}>{hovered.room.tile.cardIcon === 'item' ? '◇' : hovered.room.tile.cardIcon === 'event' ? '≋' : '☾'}</span> DRAW {hovered.room.tile.cardIcon.toUpperCase()}</small>}</section>}
    <header>
      <div className="brand"><span className="sigil">⌘</span><div><small>BETRAYAL / SPATIAL STUDY</small><h1>The house unfolds<span>.</span></h1></div></div>
      <div className="header-actions"><span className="badge">3D SANDBOX</span><button onClick={reset}>Reset ↺</button></div>
    </header>
    <nav className="floors" aria-label="Floor">{(['upper', 'ground', 'basement'] as Floor[]).map((f, i) => <button key={f} className={s.floor === f ? 'selected' : ''} disabled={locked} onClick={() => floor(f)}><small>0{3 - i}</small>{f === 'upper' ? 'Upper floor' : f === 'ground' ? 'Ground floor' : 'Basement'}</button>)}</nav>
    <div className="camera-bar"><div className="camera-controls" aria-label="Camera views"><span className="camera-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 7h4l2-3h6l2 3h4v13H3z"/><circle cx="12" cy="13" r="4"/></svg></span><button className="quiet" disabled={s.busy || !!s.card} onClick={e => { scene.current?.frame('isometric'); e.currentTarget.blur(); }}>Isometric</button><button className="quiet" disabled={s.busy || !!s.card} onClick={e => { scene.current?.frame('topdown'); e.currentTarget.blur(); }}>Top-down</button><button className="quiet" disabled={s.busy || !!s.card} onClick={e => { scene.current?.frame('recenter'); e.currentTarget.blur(); }}>Recenter</button></div></div>
    <Minimap rooms={s.rooms} floor={s.floor} />
    <section className="dice-roller" aria-label="Dice roller"><small>DICE ROLLER</small><div className="dice-controls"><label>Dice <input type="number" min="1" max="8" value={diceCount} onChange={e => setDiceCount(Math.max(1, Math.min(8, Number(e.target.value) || 1)))} /></label><button onClick={() => { const values = Array.from({ length: diceCount }, () => Math.floor(Math.random() * 3)); setDice(values); scene.current?.rollDice(values); }}>Roll</button></div>{dice.length > 0 && <div className="dice-result" aria-live="polite"><span>{dice.map((value, index) => <b key={index}>{value}</b>)}</span><strong>Total: {dice.reduce((sum, value) => sum + value, 0)}</strong></div>}</section>
    <aside className="info"><small>AN UNFINISHED HOUSE</small><h2>Open a door.<br />Let the dark in.</h2><p>Explore the house one room at a time. Follow the gold rings to discover what lies beyond.</p><div className="stats"><div><strong>{s.rooms.filter(r => r.floor === s.floor).length.toString().padStart(2, '0')}</strong><span>rooms on floor</span></div><div><strong>{s.stack.length.toString().padStart(2, '0')}</strong><span>undiscovered</span></div></div></aside>
    {s.preview && <section className="placement panel"><small>EXPLORING AN UNEXPLORED ROOM</small><h2>{s.preview.room.tile.name}</h2><p>{s.preview.room.tile.blurb}</p>{s.preview.room.tile.rules && <p className="room-rules">{s.preview.room.tile.rules}</p>}<p className={valid() ? 'valid' : 'invalid'}>{valid() ? '✓ Doorways connect' : '↻ Rotate to connect the doorway'}</p><div className="row"><button onClick={() => rotate(-1)}>↶ Q</button><button onClick={() => rotate(1)}>E ↷</button><button className="primary" disabled={!valid()} onClick={place}>Place room ↵</button><button onClick={cancelPreview}>Cancel</button></div></section>}
    {s.card && !s.busy && <section className="card-info panel"><small>{s.card.type.toUpperCase()} / REVEALED</small><h2>{s.card.title}</h2><p className="flavor">{s.card.text}</p>{s.card.rules && <p>{s.card.rules}</p>}{s.card.roll && <><small>ROLL · {s.card.roll.stat}</small><div className="roll-table">{s.card.roll.bands.map(b => <div key={b.range}><strong>{b.range}</strong><span>{b.text}</span></div>)}</div></>}<button className="primary" onClick={dismiss}>Dismiss card →</button><small className="note">Visual study · effects are not resolved</small></section>}
    <footer><div className="status"><span className={s.busy ? 'dot pulse' : 'dot'} /><span>{s.message}</span></div><div className="bottom"><div className="deck-buttons">{(['item', 'event', 'omen'] as Deck[]).map(d => <button className={`deck ${d}`} key={d} disabled={locked || !s.decks[d].length} onClick={() => draw(d)}><span className="deck-icon">{d === 'item' ? '◇' : d === 'event' ? '≋' : '☾'}</span><span><small>DRAW {d.toUpperCase()}</small><b>{s.decks[d].length} cards</b></span><span>↗</span></button>)}</div><div className="tools"><button disabled={locked || !s.last} onClick={() => draw(s.last!.type, true)}>Replay last draw</button><small>WASD PAN · Q/E ROTATE<br />1 ISOMETRIC · 2 TOP-DOWN · 3 FRONT · 4 RECENTER<br />DRAG TO ORBIT · SCROLL TO ZOOM</small></div></div></footer>
  </main>;
}
createRoot(document.getElementById('root')!).render(<App />);
