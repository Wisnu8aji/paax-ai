import type { DetectedElement } from '../di-types';

export interface EvidenceBox { x: number; y: number; w: number; h: number; }

/** Only normalized coordinates can be safely overlaid without an explicit transform. */
export function isNormalizedEvidenceBox(box: EvidenceBox): boolean {
  return [box.x, box.y, box.w, box.h].every(Number.isFinite)
    && box.x >= 0 && box.y >= 0 && box.w > 0 && box.h > 0
    && box.x + box.w <= 1 && box.y + box.h <= 1;
}

export function pagePointAtViewport(input: { x: number; y: number; panX: number; panY: number; zoom: number; baseWidth: number }): { x: number; y: number } {
  return { x: (input.x - input.panX) / input.zoom / input.baseWidth, y: (input.y - input.panY) / input.zoom / input.baseWidth };
}

export function RealPageSvg(props: {
  imageUrl: string;
  elements: DetectedElement[];
  selectedElementId: string | null;
  onSelectElement: (id: string | null) => void;
}) {
  const overlays = props.elements.filter((element) => isNormalizedEvidenceBox(element.bbox));
  return (
    <svg viewBox="0 0 1 1" width="100%" height="100%" preserveAspectRatio="none" role="img" aria-label="Drawing page source">
      <image href={props.imageUrl} x="0" y="0" width="1" height="1" preserveAspectRatio="none" />
      {overlays.map((element) => (
        <rect
          key={element.id}
          data-evidence-id={element.id}
          x={element.bbox.x}
          y={element.bbox.y}
          width={element.bbox.w}
          height={element.bbox.h}
          fill={element.id === props.selectedElementId ? 'rgba(78, 179, 255, 0.20)' : 'transparent'}
          stroke={element.id === props.selectedElementId ? 'var(--di-accent)' : 'rgba(255, 194, 92, 0.95)'}
          strokeWidth={element.id === props.selectedElementId ? 0.006 : 0.003}
          vectorEffect="non-scaling-stroke"
          style={{ cursor: 'pointer' }}
          onClick={(event) => { event.stopPropagation(); props.onSelectElement(element.id); }}
        />
      ))}
    </svg>
  );
}
