"use client";

import { buildPlanks, floorSpec, seeded, shade } from "@/lib/floors";

interface Props {
  floorId: string;
  vw: number;
  vh: number;
  uid: string;
}

/**
 * Procedural floor. Planks first, then seams, then a stretched-turbulence
 * grain pass, then a very slight light falloff so the surface is not perfectly
 * even. No texture images, no gradients used decoratively.
 */
export default function Floor({ floorId, vw, vh, uid }: Props) {
  const spec = floorSpec(floorId);
  const planks = buildPlanks(spec, vw, vh);
  const rowH = vh / spec.rows;

  return (
    <>
      <defs>
        <filter id={`grain-${uid}`} x="0" y="0" width="100%" height="100%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency={`${spec.freq[0]} ${spec.freq[1]}`}
            numOctaves={5}
            seed={11}
            result="n"
          />
          {/* Map the noise's red channel to alpha, so grain reads as streaks. */}
          <feColorMatrix
            in="n"
            type="matrix"
            values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1.1 0 0 0 -0.35"
          />
        </filter>

        <filter id={`fibre-${uid}`} x="0" y="0" width="100%" height="100%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency={`${spec.freq[0] * 6} ${spec.freq[1] * 2.2}`}
            numOctaves={3}
            seed={29}
            result="n2"
          />
          <feColorMatrix
            in="n2"
            type="matrix"
            values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0.7 0 0 0 -0.34"
          />
        </filter>
      </defs>

      <rect x={0} y={0} width={vw} height={vh} fill={spec.base} />

      {planks.map((p, i) => (
        <rect key={i} x={p.x} y={p.y} width={p.w} height={p.h} fill={p.fill} />
      ))}

      {/* Butt joints (vertical) and board seams (horizontal). */}
      {spec.planks && (
        <g stroke={spec.seam} strokeWidth={0.9} opacity={0.75}>
          {planks.map((p, i) => (
            <line key={`v${i}`} x1={p.x} y1={p.y} x2={p.x} y2={p.y + p.h} />
          ))}
          {Array.from({ length: spec.rows + 1 }, (_, r) => (
            <line key={`h${r}`} x1={0} y1={r * rowH} x2={vw} y2={r * rowH} />
          ))}
        </g>
      )}

      {/* Long grain, then finer fibre. */}
      <rect
        x={0}
        y={0}
        width={vw}
        height={vh}
        fill={spec.grainColor}
        opacity={spec.grain}
        filter={`url(#grain-${uid})`}
      />
      <rect
        x={0}
        y={0}
        width={vw}
        height={vh}
        fill={shade(spec.grainColor, 40)}
        opacity={spec.grain * 0.55}
        filter={`url(#fibre-${uid})`}
      />

      {/* Uneven sheen: a few very faint bands, not a decorative gradient. */}
      {Array.from({ length: 5 }, (_, i) => (
        <rect
          key={`s${i}`}
          x={0}
          y={(vh / 5) * i}
          width={vw}
          height={vh / 5}
          fill="#ffffff"
          opacity={0.012 + seeded(i * 4.7) * 0.022}
        />
      ))}
    </>
  );
}
