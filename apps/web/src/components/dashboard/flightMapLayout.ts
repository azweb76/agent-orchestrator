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
        x: 14 + j * 4,
        y: 38 + i * 9 + j * 3,
        heading: flight.active ? 8 + j * 12 : -20 + j * 10,
      },
    });
  });

  lanes.en_route.forEach((flight, i) => {
    const j = jitter(flight.id, 2);
    const progress = 0.32 + ((i + j) % 3) * 0.1;
    out.push({
      flight,
      laneIndex: i,
      point: {
        x: 28 + progress * 42,
        y: 28 + Math.sin(progress * Math.PI) * 18 + (i % 2 === 0 ? -6 : 8) + j * 4,
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
        x: 72 + j * 5,
        y: 34 + i * 10 + j * 4,
        heading: flight.turbulence ? 25 + j * 30 : 18 + j * 12,
      },
    });
  });

  lanes.landed.forEach((flight, i) => {
    const j = jitter(flight.id, 4);
    out.push({
      flight,
      laneIndex: i,
      point: {
        x: 86 + j * 3,
        y: 42 + i * 9 + j * 2,
        heading: 90 + j * 20,
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
