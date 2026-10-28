import data from './content.json';
export type Floor = 'ground' | 'upper' | 'basement';
export type Deck = 'item' | 'event' | 'omen';
export type Tile = { id: string; name: string; floors: string[]; doors: string[]; windows?: string[]; stairs?: { up?: boolean; down?: boolean }; cardIcon?: Deck; blurb?: string; rules?: string };
export type Card = { id: string; type: Deck; title: string; text: string; rules?: string; roll?: { stat: string; bands: { range: string; text: string }[] } };
export type Room = { tile: Tile; floor: Floor; x: number; z: number; rotation: number };
export type Door = { room: Room; direction: number; x: number; z: number };
export const content = data as unknown as { STARTING_TILES: Tile[]; LANDING_TILES: Tile[]; ROOM_TILES: Tile[]; ITEM_CARDS: Card[]; EVENT_CARDS: Card[]; OMEN_CARDS: Card[] };
export const directions = ['n', 'e', 's', 'w'];
export const offsets = [[0, -1], [1, 0], [0, 1], [-1, 0]];
export const rotated = (edges: string[] = [], rotation: number) => edges.map(d => (directions.indexOf(d) + rotation) % 4);
export const shuffle = <T,>(items: T[]) => {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [result[i], result[j]] = [result[j], result[i]]; }
  return result;
};
export function startingRooms(): Room[] {
  return [...content.STARTING_TILES.map((tile, x) => ({ tile, x, z: 0, rotation: 0, floor: 'ground' as Floor })),
    ...content.LANDING_TILES.map(tile => ({ tile, x: 0, z: 0, rotation: 0, floor: tile.floors[0] as Floor }))];
}
export function openings(rooms: Room[], floor: Floor): Door[] {
  return rooms.filter(r => r.floor === floor).flatMap(room => rotated(room.tile.doors, room.rotation).map(direction => ({ room, direction, x: room.x + offsets[direction][0], z: room.z + offsets[direction][1] }))).filter(d => !rooms.some(r => r.floor === floor && r.x === d.x && r.z === d.z));
}
