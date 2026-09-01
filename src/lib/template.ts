import type { ExtractedTable, FloorId } from "./types";

/**
 * Hard-coded starter venue so the app is fully usable before any API key
 * exists. Two rooms, to exercise the room switcher. Same shape as vision
 * output, so every downstream code path is identical.
 */
export interface TemplateRoom {
  name: string;
  floor: FloorId;
  tables: ExtractedTable[];
}

export const TEMPLATE_ROOMS: TemplateRoom[] = [
  {
    name: "Main Floor",
    floor: "white-oak",
    tables: [
      { number: 1, seats: 4, shape: "booth", x: 0.16, y: 0.13, w: 0.15, h: 0.12, area: "main" },
      { number: 2, seats: 4, shape: "booth", x: 0.34, y: 0.13, w: 0.15, h: 0.12, area: "main" },
      { number: 3, seats: 4, shape: "booth", x: 0.52, y: 0.13, w: 0.15, h: 0.12, area: "main" },
      { number: 4, seats: 4, shape: "square", x: 0.15, y: 0.37, w: 0.09, h: 0.12, area: "main" },
      { number: 5, seats: 4, shape: "square", x: 0.32, y: 0.37, w: 0.09, h: 0.12, area: "main" },
      { number: 6, seats: 4, shape: "square", x: 0.49, y: 0.37, w: 0.09, h: 0.12, area: "main" },
      { number: 7, seats: 4, shape: "square", x: 0.66, y: 0.37, w: 0.09, h: 0.12, area: "main" },
      { number: 8, seats: 2, shape: "square", x: 0.32, y: 0.58, w: 0.075, h: 0.1, area: "main" },
      { number: 9, seats: 2, shape: "square", x: 0.49, y: 0.58, w: 0.075, h: 0.1, area: "main" },
      { number: 10, seats: 6, shape: "rect", x: 0.79, y: 0.58, w: 0.13, h: 0.16, area: "main" },
      { number: 11, seats: 4, shape: "bar", x: 0.17, y: 0.78, w: 0.2, h: 0.06, area: "bar" },
      { number: 12, seats: 7, shape: "bar", x: 0.55, y: 0.85, w: 0.36, h: 0.06, area: "bar" },
    ],
  },
  {
    name: "Patio",
    floor: "reclaimed-chestnut",
    tables: [
      { number: 13, seats: 4, shape: "round", x: 0.26, y: 0.28, w: 0.13, h: 0.18, area: "patio" },
      { number: 14, seats: 4, shape: "round", x: 0.5, y: 0.28, w: 0.13, h: 0.18, area: "patio" },
      { number: 15, seats: 4, shape: "round", x: 0.74, y: 0.28, w: 0.13, h: 0.18, area: "patio" },
      { number: 16, seats: 2, shape: "round", x: 0.2, y: 0.66, w: 0.1, h: 0.14, area: "patio" },
      { number: 17, seats: 2, shape: "round", x: 0.4, y: 0.66, w: 0.1, h: 0.14, area: "patio" },
      { number: 18, seats: 2, shape: "round", x: 0.6, y: 0.66, w: 0.1, h: 0.14, area: "patio" },
      { number: 19, seats: 8, shape: "rect", x: 0.82, y: 0.66, w: 0.14, h: 0.22, area: "patio" },
    ],
  },
];
