import type { FlightBoardFlight, FlightBoardLanes } from './flightBoardModel';

/** Percent coordinates inside the top-down map (0–100). */
export interface FlightMapPoint {
  x: number;
  y: number;
  /** Degrees clockwise from east (right). */
  heading: number;
}

export interface PositionedFlight {
  flight: FlightBoardFlight;
  point: FlightMapPoint;
  laneIndex: number;
}

/** Stable pseudo-random offset from an id (keeps planes from stacking perfectly). */
function jitter(id: string, salt: number): number {
  let h = salt * 2654435761;
  for (let i = 0; i < id.length; i += 1) h = (h ^ id.charCodeAt(i)) * 16777619;
  return ((h >>> 0) % 1000) / 1000;
}

/**
 * Place flights on the map:
 * boarding near origin apron, en route along the corridor,
 * approach near destination, landed on destination apron.
 */
export function positionFlights(lanes: FlightBoardLanes): PositionedFlight[] {
  const out: PositionedFlight[] = [];

  lanes.boarding.forEach((flight, i) => {
    const j = jitter(flight.id, 1);
    out.push({
      flight,
      laneIndex: i,
      point: {
        x: 12 + (i % 2) * 5 + j * 2,
        y: 32 + i * 14 + j * 2,
        heading: flight.active ? 8 + j * 12 : -15 + j * 8,
      },
    });
  });

  lanes.en_route.forEach((flight, i) => {
    const j = jitter(flight.id, 2);
    const progress = 0.28 + ((i + j) % 3) * 0.12;
    out.push({
      flight,
      laneIndex: i,
      point: {
        x: 30 + progress * 38,
        y: 26 + Math.sin(progress * Math.PI) * 16 + (i % 2 === 0 ? -8 : 10) + j * 3,
        heading: 12 + Math.sin(progress * Math.PI) * 18,
      },
    });
  });

  lanes.approach.forEach((flight, i) => {
    const j = jitter(flight.id, 3);
    out.push({
      flight,
      laneIndex: i,
      point: {
        x: 70 + (i % 2) * 4 + j * 3,
        y: 30 + i * 14 + j * 3,
        heading: 18 + j * 12,
      },
    });
  });

  lanes.landed.forEach((flight, i) => {
    const j = jitter(flight.id, 4);
    out.push({
      flight,
      laneIndex: i,
      point: {
        x: 84 + (i % 2) * 3 + j * 2,
        y: 36 + i * 14 + j * 2,
        heading: 95 + j * 15,
      },
    });
  });

  return out;
}

/** Radar blip angle (degrees) + radius (0–1) from map position. */
export function radarPolar(point: FlightMapPoint): { angle: number; radius: number } {
  const cx = 50;
  const cy = 50;
  const dx = point.x - cx;
  const dy = point.y - cy;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  return { angle, radius: Math.min(0.92, dist / 55) };
}
