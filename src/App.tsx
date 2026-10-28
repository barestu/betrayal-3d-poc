import React, { useEffect, useReducer, useRef } from 'react';
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
function App() {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<ReturnType<typeof createScene>>();
  const state = useRef(initial());
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
    scene.current = createScene(host.current!, discover, draw); refresh(); scene.current.frame();
    const keyboard = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('button, input, select, textarea') || e.repeat) return;
      if (e.key.toLowerCase() === 'q') actions.current.rotate(-1);
      if (e.key.toLowerCase() === 'e') actions.current.rotate(1);
      if (e.key === 'Enter') actions.current.place();
      if (e.key === 'Escape') { actions.current.cancelPreview(); actions.current.dismiss(); }
    };
    window.addEventListener('keydown', keyboard);
    return () => { window.removeEventListener('keydown', keyboard); scene.current?.dispose(); };
  }, []);
  const locked = s.busy || !!s.card || !!s.preview;
  return <main>
    <div ref={host} className="scene" />
    <header>
      <div className="brand"><span className="sigil">⌘</span><div><small>BETRAYAL / SPATIAL STUDY</small><h1>The house unfolds<span>.</span></h1></div></div>
      <div className="header-actions"><span className="badge">3D SANDBOX</span><button onClick={reset}>Reset ↺</button></div>
    </header>
    <nav className="floors" aria-label="Floor">{(['upper', 'ground', 'basement'] as Floor[]).map((f, i) => <button key={f} className={s.floor === f ? 'selected' : ''} disabled={locked} onClick={() => floor(f)}><small>0{3 - i}</small>{f === 'upper' ? 'Upper floor' : f === 'ground' ? 'Ground floor' : 'Basement'}</button>)}</nav>
    <aside className="info"><small>AN UNFINISHED HOUSE</small><h2>Open a door.<br />Let the dark in.</h2><p>Explore the house one room at a time. Follow the gold rings to discover what lies beyond.</p><div className="stats"><div><strong>{s.rooms.filter(r => r.floor === s.floor).length.toString().padStart(2, '0')}</strong><span>rooms on floor</span></div><div><strong>{s.stack.length.toString().padStart(2, '0')}</strong><span>undiscovered</span></div></div><button className="quiet" disabled={s.busy || !!s.card} onClick={() => scene.current?.frame()}>↗ Recenter view</button></aside>
    {s.preview && <section className="placement panel"><small>ROOM DISCOVERED</small><h2>{s.preview.room.tile.name}</h2><p>{s.preview.room.tile.blurb}</p>{s.preview.room.tile.rules && <p className="room-rules">{s.preview.room.tile.rules}</p>}<p className={valid() ? 'valid' : 'invalid'}>{valid() ? '✓ Doorways connect' : '↻ Rotate to connect the doorway'}</p><div className="row"><button onClick={() => rotate(-1)}>↶ Q</button><button onClick={() => rotate(1)}>E ↷</button><button className="primary" disabled={!valid()} onClick={place}>Place room ↵</button><button onClick={cancelPreview}>Cancel</button></div></section>}
    {s.card && !s.busy && <section className="card-info panel"><small>{s.card.type.toUpperCase()} / REVEALED</small><h2>{s.card.title}</h2><p className="flavor">{s.card.text}</p>{s.card.rules && <p>{s.card.rules}</p>}{s.card.roll && <><small>ROLL · {s.card.roll.stat}</small><div className="roll-table">{s.card.roll.bands.map(b => <div key={b.range}><strong>{b.range}</strong><span>{b.text}</span></div>)}</div></>}<button className="primary" onClick={dismiss}>Dismiss card →</button><small className="note">Visual study · effects are not resolved</small></section>}
    <footer><div className="status"><span className={s.busy ? 'dot pulse' : 'dot'} /><span>{s.message}</span></div><div className="bottom"><div className="deck-buttons">{(['item', 'event', 'omen'] as Deck[]).map(d => <button className={`deck ${d}`} key={d} disabled={locked || !s.decks[d].length} onClick={() => draw(d)}><span className="deck-icon">{d === 'item' ? '◇' : d === 'event' ? '≋' : '☾'}</span><span><small>DRAW {d.toUpperCase()}</small><b>{s.decks[d].length} cards</b></span><span>↗</span></button>)}</div><div className="tools"><button disabled={locked || !s.last} onClick={() => draw(s.last!.type, true)}>Replay last draw</button><small>DRAG TO ORBIT · SCROLL TO ZOOM<br />RIGHT-DRAG TO PAN</small></div></div></footer>
  </main>;
}
createRoot(document.getElementById('root')!).render(<App />);
