import { useEffect, useRef, useState } from "react";

/**
 * AeroMind · horizon artificiel animé.
 *
 * L'instrument interpole les valeurs reçues à chaque image (requestAnimationFrame)
 * afin de rester fluide même si le flux de simulation est échantillonné plus
 * lentement. Aucune donnée affichée n'est une mesure d'aéronef réel.
 */

type RawTarget = {
  pitchDeg: number;
  rollDeg: number;
  headingDeg: number;
  altitudeM: number;
  speedKmh: number;
  verticalSpeedMs: number;
  armed: boolean;
};

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

/** Interpolation amortie image par image vers la valeur cible. */
function useSmoothValues(target: RawTarget, rate: number): RawTarget {
  const [values, setValues] = useState(target);
  const targetRef = useRef(target);
  const valuesRef = useRef(target);
  const frameRef = useRef<number | null>(null);
  const lastRef = useRef<number>(0);
  targetRef.current = target;

  useEffect(() => {
    const reduceMotion =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduceMotion) {
      valuesRef.current = targetRef.current;
      setValues(targetRef.current);
      return;
    }

    const step = (time: number) => {
      const previous = lastRef.current || time;
      const dt = clamp((time - previous) / 1000, 0, 0.1);
      lastRef.current = time;
      const goal = targetRef.current;
      const current = valuesRef.current;
      const alpha = 1 - Math.exp(-rate * dt);
      const next: RawTarget = {
        pitchDeg: current.pitchDeg + (goal.pitchDeg - current.pitchDeg) * alpha,
        rollDeg: current.rollDeg + (goal.rollDeg - current.rollDeg) * alpha,
        headingDeg: current.headingDeg + (goal.headingDeg - current.headingDeg) * alpha,
        altitudeM: current.altitudeM + (goal.altitudeM - current.altitudeM) * alpha,
        speedKmh: current.speedKmh + (goal.speedKmh - current.speedKmh) * alpha,
        verticalSpeedMs:
          current.verticalSpeedMs + (goal.verticalSpeedMs - current.verticalSpeedMs) * alpha,
        armed: goal.armed,
      };
      valuesRef.current = next;
      setValues(next);
      frameRef.current = window.requestAnimationFrame(step);
    };

    frameRef.current = window.requestAnimationFrame(step);
    return () => {
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      lastRef.current = 0;
    };
  }, [rate]);

  return values;
}

const PITCH_PX_PER_DEG = 3.1;

export function ArtificialHorizon({
  pitchDeg,
  rollDeg,
  headingDeg,
  altitudeM,
  speedKmh,
  verticalSpeedMs,
  armed,
  compact = false,
}: RawTarget & { compact?: boolean }) {
  const smooth = useSmoothValues(
    { pitchDeg, rollDeg, headingDeg, altitudeM, speedKmh, verticalSpeedMs, armed },
    9
  );
  const ladder = [-30, -20, -10, -5, 5, 10, 20, 30];
  const heading = ((smooth.headingDeg % 360) + 360) % 360;
  const skyOffset = clamp(smooth.pitchDeg, -60, 60) * PITCH_PX_PER_DEG;

  return (
    <div className={`artificial-horizon ${compact ? "is-compact" : ""} ${armed ? "is-armed" : "is-idle"}`}>
      <div className="artificial-horizon-heading">
        <span className="horizon-mode">
          {armed ? "VOL SIMULÉ · CADRAGE ACTIF" : "BANC AU SOL · INSTRUMENT PRÊT"}
        </span>
        <strong>{heading.toFixed(0).padStart(3, "0")}°</strong>
        <span className="horizon-cardinal">
          {["N", "NE", "E", "SE", "S", "SO", "O", "NO"][Math.round(heading / 45) % 8]}
        </span>
      </div>
      <svg viewBox="0 0 220 220" role="img" aria-label={`Horizon artificiel simulé, assiette ${smooth.pitchDeg.toFixed(1)} degrés, inclinaison ${smooth.rollDeg.toFixed(1)} degrés`}>
        <defs>
          <clipPath id="horizon-clip">
            <circle cx="110" cy="110" r="88" />
          </clipPath>
          <linearGradient id="horizon-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0d3f63" />
            <stop offset="100%" stopColor="#1a86b8" />
          </linearGradient>
          <linearGradient id="horizon-ground" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6b4a22" />
            <stop offset="100%" stopColor="#2b1d0e" />
          </linearGradient>
        </defs>
        <g clipPath="url(#horizon-clip)">
          <g transform={`translate(110 110) rotate(${-smooth.rollDeg}) translate(0 ${skyOffset})`}>
            <rect x="-200" y="-260" width="400" height="260" fill="url(#horizon-sky)" />
            <rect x="-200" y="0" width="400" height="260" fill="url(#horizon-ground)" />
            <line x1="-200" y1="0" x2="200" y2="0" stroke="#e8f6ff" strokeWidth="1.6" />
            {ladder.map(angle => (
              <g key={angle} transform={`translate(0 ${-angle * PITCH_PX_PER_DEG})`}>
                <line
                  x1={angle > 0 ? 62 : 30}
                  y1="0"
                  x2={angle > 0 ? 90 : 62}
                  y2="0"
                  stroke="#dbe9f3"
                  strokeWidth="1.1"
                  opacity="0.85"
                />
                <line
                  x1={angle > 0 ? 130 : 158}
                  y1="0"
                  x2={angle > 0 ? 158 : 190}
                  y2="0"
                  stroke="#dbe9f3"
                  strokeWidth="1.1"
                  opacity="0.85"
                />
                <text x={angle > 0 ? 56 : 96} y="3.4" textAnchor="end" fontSize="7.4" fill="#dbe9f3" opacity="0.9">
                  {Math.abs(angle)}
                </text>
              </g>
            ))}
            <g opacity="0.9">
              <line x1="-200" y1={-45 * PITCH_PX_PER_DEG} x2="-150" y2={-45 * PITCH_PX_PER_DEG} stroke="#8fd3ff" strokeWidth="1" />
              <line x1="150" y1={-45 * PITCH_PX_PER_DEG} x2="200" y2={-45 * PITCH_PX_PER_DEG} stroke="#8fd3ff" strokeWidth="1" />
            </g>
          </g>
        </g>
        <circle cx="110" cy="110" r="88" fill="none" stroke="#2c4a5c" strokeWidth="1.4" />
        <circle cx="110" cy="110" r="70" fill="none" stroke="#274452" strokeWidth="0.8" opacity="0.7" />
        <g className="horizon-aircraft-symbol" fill="none" stroke="#f4be4f" strokeWidth="2.6" strokeLinecap="round">
          <line x1="60" y1="110" x2="88" y2="110" />
          <line x1="132" y1="110" x2="160" y2="110" />
          <circle cx="110" cy="110" r="2.6" fill="#f4be4f" stroke="none" />
        </g>
        <g className="horizon-roll-scale" stroke="#8ea6b4" strokeWidth="1" opacity="0.75">
          <line x1="110" y1="14" x2="110" y2="24" />
          <line x1="70" y1="26" x2="76" y2="35" transform="rotate(-30 110 110)" />
          <line x1="150" y1="26" x2="144" y2="35" transform="rotate(30 110 110)" />
          <line x1="26" y1="70" x2="35" y2="76" transform="rotate(-60 110 110)" />
          <line x1="194" y1="70" x2="185" y2="76" transform="rotate(60 110 110)" />
        </g>
        <polygon
          points="110,110 102,124 118,124"
          transform={`rotate(${-clamp(smooth.rollDeg, -75, 75)} 110 110)`}
          fill="none"
          stroke="#7fe0b0"
          strokeWidth="1.6"
          opacity="0.9"
        />
      </svg>
      <div className="artificial-horizon-tapes">
        <div className="horizon-tape tape-altitude">
          <small>ALTITUDE</small>
          <strong>{smooth.altitudeM.toFixed(0)} m</strong>
          <span className={smooth.verticalSpeedMs >= 0 ? "is-climb" : "is-descent"}>
            {smooth.verticalSpeedMs >= 0 ? "▲" : "▼"} {Math.abs(smooth.verticalSpeedMs).toFixed(1)} m/s
          </span>
        </div>
        <div className="horizon-tape tape-speed">
          <small>VITESSE</small>
          <strong>{smooth.speedKmh.toFixed(0)} km/h</strong>
          <span>assiette {smooth.pitchDeg.toFixed(1)}°</span>
        </div>
      </div>
      <div className="artificial-horizon-legend">
        Instrument simulé · valeurs d’avant-projet, jamais une mesure embarquée.
      </div>
    </div>
  );
}