export type TableShape = "round" | "square" | "rect" | "booth" | "bar";

/** Floor material ids — see src/lib/floors.ts for the render recipes. */
export type FloorId =
  | "white-oak"
  | "walnut"
  | "smoked-ash"
  | "reclaimed-chestnut"
  | "ebonised-oak"
  | "poured-concrete";

export interface RoomRec {
  id: number;
  name: string;
  sort_order: number;
  image_path: string | null;
  image_w: number;
  image_h: number;
  floor: FloorId;
}

/**
 * x/y/w/h are NORMALISED to the room image: 0..1, x/y being the table CENTRE.
 * Never store pixels; the layout must survive any rescale or zoom level.
 */
export interface TableRec {
  id: number;
  room_id: number;
  number: number;
  seats: number;
  shape: TableShape;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  area: string | null;
  /** Tables sharing a group id are combined: they sit flush and are allowed to
   *  touch. They keep their own number, seat count and border. */
  group_id: number | null;
}

export interface BookingRec {
  id: number;
  table_id: number;
  name: string;
  party_size: number;
  date: string;
  start_min: number;
  end_min: number;
  phone: string | null;
  notes: string | null;
  created_at: string;
  sheet_synced: number;
}

export interface ExtractedTable {
  number: number;
  seats: number;
  shape: TableShape;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation?: number;
  area?: string | null;
}
