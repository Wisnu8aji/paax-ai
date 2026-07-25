'use client';

/**
 * SheetPlanSvg — renderer denah teknik dalam SVG murni.
 *
 * Menggambar "kertas" gambar kerja gelap ala CAD: grid axis berbubble,
 * dimension string, dinding, ruangan berwarna zona, plus overlay elemen
 * terdeteksi (kolom/balok/slab/shear wall) yang bisa diklik. Koordinat
 * dalam mm gambar; induk (DrawingCanvas) yang mengatur zoom/pan.
 */

import { memo } from 'react';
import type { DetectedElement, Sheet } from '../di-types';

export const PLAN_MARGIN = 2600; // mm ruang untuk bubble grid & dimensi

const ZONE_FILL: Record<string, string> = {
  office: 'var(--di-ov-room-office)',
  meeting: 'var(--di-ov-room-meeting)',
  open: 'var(--di-ov-room-open)',
  pantry: 'var(--di-ov-room-pantry)',
  service: 'var(--di-ov-room-service)',
  circulation: 'var(--di-ov-room-circulation)',
  void: 'transparent',
};

const CATEGORY_STROKE: Record<string, string> = {
  column: 'var(--di-ov-column)',
  beam: 'var(--di-ov-beam)',
  slab: 'var(--di-ov-slab)',
  'shear-wall': 'var(--di-ov-shear)',
  wall: 'var(--di-ov-wall)',
  stair: 'var(--di-ov-wall)',
};

export interface SheetPlanSvgProps {
  sheet: Sheet;
  elements: DetectedElement[];
  overlays: Record<string, boolean>;
  selectedElementId: string | null;
  hoveredElementId: string | null;
  onSelectElement?: (id: string | null) => void;
  onHoverElement?: (id: string | null) => void;
  /** render ringan untuk thumbnail (tanpa interaksi & label) */
  thumbnail?: boolean;
}

function GridLayer({ sheet, thumbnail }: { sheet: Sheet; thumbnail?: boolean }) {
  const { gridX, gridY, widthMm, heightMm } = sheet.geometry;
  const R = 700;
  return (
    <g>
      {gridX.map((g) => (
        <g key={`gx-${g.label}`}>
          <line x1={g.mm} y1={-PLAN_MARGIN / 2} x2={g.mm} y2={heightMm + 400} stroke="var(--di-grid-line)" strokeWidth={26} strokeDasharray="700 350 90 350" />
          {!thumbnail && (
            <>
              <circle cx={g.mm} cy={-PLAN_MARGIN / 2} r={R} fill="var(--di-panel)" stroke="var(--di-grid-line)" strokeWidth={40} />
              <text x={g.mm} y={-PLAN_MARGIN / 2 + 240} textAnchor="middle" fontSize={760} fill="var(--di-text2)" fontFamily="var(--di-font-mono)">
                {g.label}
              </text>
            </>
          )}
        </g>
      ))}
      {gridY.map((g) => (
        <g key={`gy-${g.label}`}>
          <line x1={-PLAN_MARGIN / 2} y1={g.mm} x2={widthMm + 400} y2={g.mm} stroke="var(--di-grid-line)" strokeWidth={26} strokeDasharray="700 350 90 350" />
          {!thumbnail && (
            <>
              <circle cx={-PLAN_MARGIN / 2} cy={g.mm} r={R} fill="var(--di-panel)" stroke="var(--di-grid-line)" strokeWidth={40} />
              <text x={-PLAN_MARGIN / 2} y={g.mm + 250} textAnchor="middle" fontSize={760} fill="var(--di-text2)" fontFamily="var(--di-font-mono)">
                {g.label}
              </text>
            </>
          )}
        </g>
      ))}
    </g>
  );
}

function DimensionLayer({ sheet }: { sheet: Sheet }) {
  const { gridX, widthMm } = sheet.geometry;
  const y = -PLAN_MARGIN - 500;
  const ticks = gridX.map((g) => g.mm);
  return (
    <g stroke="var(--di-grid-line)" strokeWidth={22}>
      <line x1={0} y1={y} x2={widthMm} y2={y} />
      {ticks.map((x, i) => (
        <g key={i}>
          <line x1={x} y1={y - 200} x2={x} y2={y + 200} />
          {i < ticks.length - 1 && (
            <text
              x={(x + ticks[i + 1]) / 2}
              y={y - 260}
              textAnchor="middle"
              fontSize={600}
              fill="var(--di-text3)"
              fontFamily="var(--di-font-mono)"
              stroke="none"
            >
              {ticks[i + 1] - x}
            </text>
          )}
        </g>
      ))}
      <text x={widthMm / 2} y={y - 1150} textAnchor="middle" fontSize={680} fill="var(--di-text2)" fontFamily="var(--di-font-mono)" stroke="none">
        {widthMm}
      </text>
    </g>
  );
}

function RoomsLayer({ sheet, visible, thumbnail }: { sheet: Sheet; visible: boolean; thumbnail?: boolean }) {
  return (
    <g>
      {sheet.geometry.rooms.map((r) => (
        <g key={r.code}>
          <rect
            x={r.x + 120}
            y={r.y + 120}
            width={r.w - 240}
            height={r.h - 240}
            fill={visible ? ZONE_FILL[r.zone] : 'transparent'}
            stroke="var(--di-paper-line)"
            strokeWidth={60}
          />
          {!thumbnail && r.zone !== 'void' && (
            <>
              <text x={r.x + r.w / 2} y={r.y + r.h / 2 - 160} textAnchor="middle" fontSize={620} fill="var(--di-paper-line)" fontFamily="var(--di-font-mono)" opacity={0.9}>
                {r.name}
              </text>
              <g>
                <rect x={r.x + r.w / 2 - 700} y={r.y + r.h / 2 + 80} width={1400} height={640} fill="none" stroke="var(--di-paper-line)" strokeWidth={30} opacity={0.65} />
                <text x={r.x + r.w / 2} y={r.y + r.h / 2 + 560} textAnchor="middle" fontSize={480} fill="var(--di-paper-line)" fontFamily="var(--di-font-mono)" opacity={0.8}>
                  {r.code}
                </text>
              </g>
            </>
          )}
        </g>
      ))}
    </g>
  );
}

function ElementOverlay({
  el,
  selected,
  hovered,
  interactive,
  onSelect,
  onHover,
}: {
  el: DetectedElement;
  selected: boolean;
  hovered: boolean;
  interactive: boolean;
  onSelect?: (id: string) => void;
  onHover?: (id: string | null) => void;
}) {
  const stroke = CATEGORY_STROKE[el.category] ?? 'var(--di-ov-wall)';
  const needsReview = el.verification === 'needs-review';
  const rejected = el.verification === 'rejected';
  const isColumn = el.category === 'column';
  const pad = isColumn ? 140 : 0;
  const strokeWidth = selected ? 170 : hovered ? 130 : isColumn ? 100 : 70;

  return (
    <g
      opacity={rejected ? 0.28 : 1}
      style={interactive ? { cursor: 'pointer' } : undefined}
      onClick={
        interactive
          ? (e) => {
              e.stopPropagation();
              onSelect?.(el.id);
            }
          : undefined
      }
      onMouseEnter={interactive ? () => onHover?.(el.id) : undefined}
      onMouseLeave={interactive ? () => onHover?.(null) : undefined}
      data-element-id={el.id}
    >
      {selected && (
        <rect
          x={el.bbox.x - pad - 260}
          y={el.bbox.y - pad - 260}
          width={el.bbox.w + (pad + 260) * 2}
          height={el.bbox.h + (pad + 260) * 2}
          fill="none"
          stroke="var(--di-accent)"
          strokeWidth={90}
          strokeDasharray="420 260"
        />
      )}
      <rect
        x={el.bbox.x - pad}
        y={el.bbox.y - pad}
        width={el.bbox.w + pad * 2}
        height={el.bbox.h + pad * 2}
        fill={isColumn ? stroke : selected || hovered ? `color-mix(in srgb, ${stroke} 18%, transparent)` : 'transparent'}
        stroke={needsReview ? 'var(--di-warn)' : stroke}
        strokeWidth={strokeWidth}
        strokeDasharray={needsReview ? '340 220' : undefined}
        rx={isColumn ? 60 : 0}
      />
    </g>
  );
}

/** Callout annotation (RC COLUMN 600x600 dsb.) seperti pada referensi. */
function CalloutLayer({ sheet }: { sheet: Sheet }) {
  if (sheet.floorId === 'ROOF') return null;
  const { widthMm } = sheet.geometry;
  const items = [
    { label: 'RC COLUMN', sub: '300x600', color: 'var(--di-ov-column)', tx: widthMm - 4200, ty: 1400, ax: widthMm - 3800, ay: 6900 },
    { label: 'RC BEAM', sub: '300x600', color: 'var(--di-ov-beam)', tx: widthMm - 4200, ty: 4600, ax: widthMm - 6200, ay: 7200 },
    { label: 'RC SLAB', sub: 't = 150mm', color: 'var(--di-ov-slab)', tx: widthMm - 4200, ty: 7800, ax: widthMm - 8600, ay: 10200 },
    { label: 'SHEAR WALL', sub: 't = 200mm', color: 'var(--di-ov-shear)', tx: widthMm - 4200, ty: 11000, ax: widthMm - 11400, ay: 9400 },
  ];
  const W = 5200;
  const H = 2100;
  return (
    <g>
      {items.map((c) => (
        <g key={c.label}>
          <line x1={c.tx} y1={c.ty + H / 2} x2={c.ax} y2={c.ay} stroke={c.color} strokeWidth={40} />
          <rect x={c.tx} y={c.ty} width={W} height={H} rx={220} fill="var(--di-panel)" stroke={c.color} strokeWidth={60} />
          <text x={c.tx + W / 2} y={c.ty + 880} textAnchor="middle" fontSize={640} fontWeight={700} fill={c.color} fontFamily="var(--di-font-mono)">
            {c.label}
          </text>
          <text x={c.tx + W / 2} y={c.ty + 1680} textAnchor="middle" fontSize={560} fill="var(--di-text2)" fontFamily="var(--di-font-mono)">
            {c.sub}
          </text>
        </g>
      ))}
    </g>
  );
}

export const SheetPlanSvg = memo(function SheetPlanSvg({
  sheet,
  elements,
  overlays,
  selectedElementId,
  hoveredElementId,
  onSelectElement,
  onHoverElement,
  thumbnail = false,
}: SheetPlanSvgProps) {
  const { widthMm, heightMm } = sheet.geometry;
  const vb = `${-PLAN_MARGIN - 1900} ${-PLAN_MARGIN - 1900} ${widthMm + (PLAN_MARGIN + 1900) * 2} ${heightMm + (PLAN_MARGIN + 1900) * 2}`;
  const interactive = !thumbnail;

  const visible = (cat: string) => overlays[cat] !== false;

  return (
    <svg
      viewBox={vb}
      width="100%"
      height="100%"
      style={{ display: 'block', background: 'var(--di-paper)', borderRadius: thumbnail ? 4 : 2 }}
      onClick={interactive ? () => onSelectElement?.(null) : undefined}
      role={thumbnail ? undefined : 'img'}
      aria-label={`${sheet.code} — ${sheet.title}`}
    >
      {/* Border kertas */}
      <rect
        x={-PLAN_MARGIN - 1500}
        y={-PLAN_MARGIN - 1500}
        width={widthMm + (PLAN_MARGIN + 1500) * 2}
        height={heightMm + (PLAN_MARGIN + 1500) * 2}
        fill="none"
        stroke="var(--di-grid-line)"
        strokeWidth={50}
      />
      {sheet.runId && sheet.pageIndex !== undefined && (
        <image
          href={`/api/document-intelligence/drawings/dem/${sheet.runId}/pages/${sheet.pageIndex}/image`}
          x={0}
          y={0}
          width={widthMm}
          height={heightMm}
          preserveAspectRatio="none"
        />
      )}
      {visible('grid-axis') && <GridLayer sheet={sheet} thumbnail={thumbnail} />}
      {!thumbnail && visible('dimension') && <DimensionLayer sheet={sheet} />}
      <RoomsLayer sheet={sheet} visible={visible('room')} thumbnail={thumbnail} />
      {/* Elemen: slab dulu (paling besar) → beam → shear wall → stair → column */}
      {(['slab', 'beam', 'shear-wall', 'wall', 'stair', 'column'] as const)
        .filter((cat) => visible(cat))
        .flatMap((cat) =>
          elements
            .filter((e) => e.sheetId === sheet.id && e.category === cat)
            .map((el) => (
              <ElementOverlay
                key={el.id}
                el={el}
                selected={el.id === selectedElementId}
                hovered={el.id === hoveredElementId}
                interactive={interactive}
                onSelect={(id) => onSelectElement?.(id)}
                onHover={onHoverElement}
              />
            )),
        )}
      {!thumbnail && <CalloutLayer sheet={sheet} />}
    </svg>
  );
});
