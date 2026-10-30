import { useEffect, useMemo, useState, type Dispatch, type MouseEvent as ReactMouseEvent, type ReactNode, type SetStateAction } from "react";
import { Activity, Building2, CloudSnow, MapPin, Mountain, Pause, Play, Plus, RotateCcw, Route, Shrub, ThermometerSun, Trash2, TreePine, Waves, Wheat } from "lucide-react";
import type { ConceptConfig, MissionWaypoint, SimulationResult } from "../lib/aeroEngine";
import { droneCatalog, type DroneCatalogDesign } from "../lib/droneCatalog";
import { ParametricDronePreview } from "./ParametricDronePreview";
import { useLanguage } from "../contexts/LanguageContext";
import "./aero-test-field-station.css";

type Environment = "forest" | "urban" | "flatland" | "mountain" | "scrubland" | "snow" | "hot" | "sea";
type LucideIcon = typeof Building2;

type Props = {
  config: ConceptConfig;
  setConfig: Dispatch<SetStateAction<ConceptConfig>>;
  simulation: SimulationResult;
  isRunning: boolean;
  onRunSimulation: (config?: ConceptConfig) => void;
  onOpenBuilder: () => void;
};

const AXIS_TICKS = [0, 25, 50, 75, 100];
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const fieldScreenPoint = (point: MissionWaypoint, altitudeLimit: number) => ({
  x: 8 + clamp(point.x, 0, 100) * 0.84,
  y: 42 + (100 - clamp(point.y, 0, 100)) * 0.44 - clamp(point.altitudeM / Math.max(altitudeLimit, 1), 0, 1) * 10,
});

function emptyMissionPlan(config: ConceptConfig) {
  return { operationName: "Itinéraire terrain personnalisé", radiusKm: 1, returnAltitudeM: Math.max(5, Math.min(config.altitudeM || 30, 100)), lostLinkAction: "return" as const, homeX: 50, homeY: 82, waypoints: [] as MissionWaypoint[] };
}

/* === Per-environment photorealistic scenes =============================
   Each scene draws a layered photorealistic terrain with multi-stop gradients,
   atmospheric perspective (depth haze), horizon glow, ground texture, shadows,
   and 3D-feel silhouettes (not flat shapes). pointer-events: none is forced
   via the .afs-env-svg rule so clicks always reach the field. */

const FOREST_DECOR: ReactNode = (
  <svg className="afs-env-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
    <defs>
      <linearGradient id="forest-sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#2d4a3a" />
        <stop offset="45%" stopColor="#3a5e44" />
        <stop offset="100%" stopColor="#1a2e22" />
      </linearGradient>
      <radialGradient id="forest-light" cx="68%" cy="22%" r="42%">
        <stop offset="0%" stopColor="rgba(180,220,160,0.55)" />
        <stop offset="100%" stopColor="rgba(180,220,160,0)" />
      </radialGradient>
      <linearGradient id="forest-ground" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#1f3320" />
        <stop offset="100%" stopColor="#0a160c" />
      </linearGradient>
    </defs>
    <rect x="0" y="0" width="100" height="68" fill="url(#forest-sky)" />
    <rect x="0" y="0" width="100" height="68" fill="url(#forest-light)" />
    <rect x="0" y="68" width="100" height="32" fill="url(#forest-ground)" />
    {/* Distant tree line (atmospheric haze) */}
    <path d="M0,68 L4,52 L8,58 L12,48 L16,54 L22,46 L28,56 L34,50 L40,54 L46,48 L52,56 L58,52 L64,48 L70,56 L76,52 L82,48 L88,54 L94,50 L100,58 L100,68 Z" fill="rgba(60,90,68,0.55)" />
    {/* Mid trees */}
    <path d="M0,72 L3,60 L6,66 L10,58 L14,64 L18,56 L22,64 L26,58 L30,66 L34,60 L38,66 L42,58 L46,64 L50,60 L54,66 L58,58 L62,64 L66,60 L70,66 L74,58 L78,64 L82,60 L86,66 L90,58 L94,64 L98,60 L100,66 L100,72 Z" fill="rgba(40,70,48,0.78)" />
    {/* Foreground detailed pines */}
    {[[6,80,2.2],[12,84,1.8],[20,78,2.5],[28,82,2],[36,76,2.4],[44,82,1.9],[52,78,2.3],[60,84,2],[68,76,2.5],[76,82,2],[84,78,2.2],[92,84,1.8],[14,90,1.6],[40,92,1.5],[66,90,1.7],[88,92,1.6]].map(([x,y,s],i)=>(
      <g key={`ft${i}`} transform={`translate(${x} ${y}) scale(${s})`}>
        <rect x="-0.3" y="0" width="0.6" height="3" fill="#1a0e08" />
        <path d="M-2.4,0 L2.4,0 L0,-5.2 Z" fill="#1e3a1e" />
        <path d="M-1.8,-2.8 L1.8,-2.8 L0,-6.4 Z" fill="#245218" />
        <path d="M-1.2,-5 L1.2,-5 L0,-7.4 Z" fill="#2a5e22" />
      </g>
    ))}
    {/* Ground texture dots (moss/leaves) */}
    {Array.from({length: 40}).map((_,i)=>{
      const gx = (i*23)%100, gy = 70 + ((i*17)%30);
      return <circle key={`g${i}`} cx={gx} cy={gy} r="0.3" fill="rgba(50,80,40,0.6)" />;
    })}
    {/* Sun ray through canopy */}
    <path d="M62,18 L70,40 L66,68 L60,40 Z" fill="rgba(220,240,180,0.18)" />
  </svg>
);

const URBAN_DECOR: ReactNode = (
  <svg className="afs-env-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
    <defs>
      <linearGradient id="urban-sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#1a2638" />
        <stop offset="55%" stopColor="#2c3a52" />
        <stop offset="100%" stopColor="#0a121e" />
      </linearGradient>
      <radialGradient id="urban-glow" cx="72%" cy="18%" r="38%">
        <stop offset="0%" stopColor="rgba(255,180,120,0.42)" />
        <stop offset="100%" stopColor="rgba(255,180,120,0)" />
      </radialGradient>
      <linearGradient id="urban-ground" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#1c2430" />
        <stop offset="100%" stopColor="#080c14" />
      </linearGradient>
    </defs>
    <rect x="0" y="0" width="100" height="100" fill="url(#urban-sky)" />
    <rect x="0" y="0" width="100" height="60" fill="url(#urban-glow)" />
    <rect x="0" y="78" width="100" height="22" fill="url(#urban-ground)" />
    {/* Far skyline buildings */}
    {[[2,40,5,18],[10,38,4,22],[16,42,5,15],[24,36,5,24],[32,40,4,18],[40,38,5,22],[48,42,4,15],[56,36,5,26],[64,40,4,18],[72,38,5,22],[80,42,4,15],[88,40,5,18],[94,38,4,22]].map(([x,yb,w,h],i)=>(
      <rect key={`fb${i}`} x={x} y={yb} width={w} height={h} fill="rgba(50,64,86,0.6)" />
    ))}
    {/* Mid buildings with windows */}
    {[[4,58,7,28],[14,52,9,36],[26,60,6,24],[36,50,10,40],[50,56,7,30],[60,54,8,34],[72,58,6,26],[82,52,9,38],[92,58,5,24]].map(([x,yb,w,h],i)=>(
      <g key={`mb${i}`}>
        <rect x={x} y={yb} width={w} height={h} fill="#22304a" />
        <rect x={x} y={yb} width={w} height="2" fill="rgba(120,140,180,0.4)" />
        {/* Window grid */}
        {Array.from({length: Math.floor(h/3)}).map((_,r)=>
          Array.from({length: Math.floor(w/2)}).map((_,c)=>{
            const lit = (i*7 + r*3 + c) % 4 === 0;
            return <rect key={`w${r}-${c}`} x={x+0.5+c*2} y={yb+2+r*3} width="1.2" height="1.6" fill={lit ? "rgba(255,210,140,0.85)" : "rgba(60,80,110,0.5)"} />;
          })
        )}
      </g>
    ))}
    {/* Street with perspective lines */}
    <line x1="0" y1="80" x2="100" y2="80" stroke="rgba(120,140,170,0.5)" strokeWidth="0.4" />
    <line x1="0" y1="86" x2="100" y2="86" stroke="rgba(120,140,170,0.3)" strokeWidth="0.3" strokeDasharray="2 1.5" />
    {/* Street lamps glow */}
    {[[12,78],[38,76],[64,78],[88,76]].map(([x,y],i)=>(
      <g key={`sl${i}`}>
        <circle cx={x} cy={y} r="1.4" fill="rgba(255,220,150,0.9)" />
        <circle cx={x} cy={y} r="3" fill="rgba(255,220,150,0.25)" />
      </g>
    ))}
  </svg>
);

const FLATLAND_DECOR: ReactNode = (
  <svg className="afs-env-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
    <defs>
      <linearGradient id="flat-sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#5a8caa" />
        <stop offset="50%" stopColor="#9ec0d4" />
        <stop offset="100%" stopColor="#d8b878" />
      </linearGradient>
      <radialGradient id="flat-sun" cx="30%" cy="20%" r="22%">
        <stop offset="0%" stopColor="rgba(255,240,200,0.85)" />
        <stop offset="100%" stopColor="rgba(255,240,200,0)" />
      </radialGradient>
      <linearGradient id="flat-ground" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#c8b478" />
        <stop offset="60%" stopColor="#9a8240" />
        <stop offset="100%" stopColor="#5a4820" />
      </linearGradient>
    </defs>
    <rect x="0" y="0" width="100" height="62" fill="url(#flat-sky)" />
    <rect x="0" y="0" width="100" height="62" fill="url(#flat-sun)" />
    <rect x="0" y="62" width="100" height="38" fill="url(#flat-ground)" />
    {/* Distant hills with haze */}
    <path d="M0,62 Q20,56 40,60 T80,58 T100,62 L100,64 L0,64 Z" fill="rgba(120,110,80,0.4)" />
    {/* Rolling foreground fields */}
    <path d="M0,72 Q25,68 50,72 T100,72 L100,100 L0,100 Z" fill="rgba(154,130,64,0.7)" />
    <path d="M0,82 Q30,78 60,82 T100,82 L100,100 L0,100 Z" fill="rgba(110,88,40,0.8)" />
    {/* Wheat stalks with realistic heads */}
    {Array.from({length: 28}).map((_,i)=>{
      const x = (i*3.6 + 2) % 100, y = 76 + ((i*11) % 22);
      const sway = Math.sin(i*1.3) * 2;
      return (
        <g key={`wh${i}`} transform={`translate(${x} ${y})`}>
          <line x1="0" y1="0" x2={sway} y2="-6" stroke="#8a6a30" strokeWidth="0.25" />
          <ellipse cx={sway-0.8} cy="-5.4" rx="0.5" ry="1.4" transform={`rotate(-22 ${sway-0.8} -5.4)`} fill="#d4a850" />
          <ellipse cx={sway+0.8} cy="-5.4" rx="0.5" ry="1.4" transform={`rotate(22 ${sway+0.8} -5.4)`} fill="#d4a850" />
          <ellipse cx={sway-0.55} cy="-3.4" rx="0.4" ry="1" transform={`rotate(-22 ${sway-0.55} -3.4)`} fill="#c89840" />
          <ellipse cx={sway+0.55} cy="-3.4" rx="0.4" ry="1" transform={`rotate(22 ${sway+0.55} -3.4)`} fill="#c89840" />
        </g>
      );
    })}
    {/* Cloud wisps */}
    <ellipse cx="60" cy="14" rx="14" ry="2" fill="rgba(255,255,255,0.4)" />
    <ellipse cx="80" cy="22" rx="10" ry="1.5" fill="rgba(255,255,255,0.3)" />
  </svg>
);

const MOUNTAIN_DECOR: ReactNode = (
  <svg className="afs-env-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
    <defs>
      <linearGradient id="mt-sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#3a5478" />
        <stop offset="55%" stopColor="#6a8aaa" />
        <stop offset="100%" stopColor="#c8d4e4" />
      </linearGradient>
      <radialGradient id="mt-sun" cx="78%" cy="14%" r="18%">
        <stop offset="0%" stopColor="rgba(255,240,200,0.75)" />
        <stop offset="100%" stopColor="rgba(255,240,200,0)" />
      </radialGradient>
      <linearGradient id="mt-rock" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#6a7a8a" />
        <stop offset="60%" stopColor="#3a4a5a" />
        <stop offset="100%" stopColor="#1a2638" />
      </linearGradient>
      <linearGradient id="mt-snow" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#f0f4fa" />
        <stop offset="100%" stopColor="#a8b8c8" />
      </linearGradient>
    </defs>
    <rect x="0" y="0" width="100" height="100" fill="url(#mt-sky)" />
    <rect x="0" y="0" width="100" height="50" fill="url(#mt-sun)" />
    {/* Farthest ridge (max haze) */}
    <path d="M0,52 L8,40 L16,48 L26,36 L36,46 L46,38 L56,48 L66,40 L76,50 L86,42 L100,52 L100,100 L0,100 Z" fill="rgba(140,158,180,0.5)" />
    {/* Mid ridge */}
    <path d="M0,64 L10,52 L20,60 L30,46 L42,58 L52,50 L64,62 L74,54 L86,60 L100,64 L100,100 L0,100 Z" fill="url(#mt-rock)" opacity="0.85" />
    {/* Foreground peaks with snow caps */}
    <path d="M2,84 L20,52 L38,84 Z" fill="#4a5a6a" />
    <path d="M14,68 L20,52 L26,68 Z" fill="url(#mt-snow)" />
    <path d="M30,86 L52,42 L74,86 Z" fill="#3a4a5a" />
    <path d="M44,56 L52,42 L60,56 Z" fill="url(#mt-snow)" />
    <path d="M66,84 L82,54 L98,84 Z" fill="#4a5a6a" />
    <path d="M76,64 L82,54 L88,64 Z" fill="url(#mt-snow)" />
    {/* Rock face shadows */}
    <path d="M20,52 L26,68 L20,72 Z" fill="rgba(20,30,40,0.4)" />
    <path d="M52,42 L60,56 L52,60 Z" fill="rgba(20,30,40,0.4)" />
    <path d="M82,54 L88,64 L82,68 Z" fill="rgba(20,30,40,0.4)" />
    {/* Valley floor */}
    <rect x="0" y="86" width="100" height="14" fill="rgba(20,30,45,0.85)" />
    {/* Scree rocks */}
    {[[8,90],[24,92],[40,88],[58,90],[74,92],[90,88]].map(([x,y],i)=>(
      <ellipse key={`r${i}`} cx={x} cy={y} rx="1.5" ry="0.6" fill="rgba(60,70,85,0.7)" />
    ))}
  </svg>
);

const SCRUBLAND_DECOR: ReactNode = (
  <svg className="afs-env-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
    <defs>
      <linearGradient id="scr-sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#c89868" />
        <stop offset="55%" stopColor="#d4a878" />
        <stop offset="100%" stopColor="#8a6038" />
      </linearGradient>
      <radialGradient id="scr-sun" cx="50%" cy="18%" r="24%">
        <stop offset="0%" stopColor="rgba(255,220,140,0.7)" />
        <stop offset="100%" stopColor="rgba(255,220,140,0)" />
      </radialGradient>
      <linearGradient id="scr-ground" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#9a6e3a" />
        <stop offset="100%" stopColor="#4a2e14" />
      </linearGradient>
    </defs>
    <rect x="0" y="0" width="100" height="100" fill="url(#scr-sky)" />
    <rect x="0" y="0" width="100" height="60" fill="url(#scr-sun)" />
    <rect x="0" y="68" width="100" height="32" fill="url(#scr-ground)" />
    {/* Dry earth patches with cracks */}
    <ellipse cx="22" cy="84" rx="18" ry="4" fill="rgba(120,80,40,0.55)" />
    <ellipse cx="62" cy="80" rx="22" ry="5" fill="rgba(120,80,40,0.55)" />
    <ellipse cx="90" cy="86" rx="11" ry="3" fill="rgba(120,80,40,0.55)" />
    <path d="M18,82 L26,86 M58,78 L66,82 M86,84 L92,88" stroke="rgba(80,50,20,0.4)" strokeWidth="0.2" />
    {/* Sparse maquis bushes with depth */}
    {[[6,76,1.4],[14,82,1.2],[22,74,1.5],[30,80,1.3],[38,72,1.6],[46,80,1.2],[54,76,1.4],[62,74,1.5],[72,80,1.3],[82,76,1.4],[90,82,1.2],[16,70,1],[44,68,1.1],[68,70,1],[86,68,1]].map(([x,y,s],i)=>(
      <g key={`sb${i}`} transform={`translate(${x} ${y}) scale(${s})`}>
        <ellipse cx="-1.4" cy="0.5" rx="1.5" ry="1.2" fill="#5a6e2a" />
        <ellipse cx="1.4" cy="0.5" rx="1.5" ry="1.2" fill="#6a7e34" />
        <ellipse cx="0" cy="-1.2" rx="1.8" ry="1.4" fill="#7a8e3e" />
        <ellipse cx="-0.6" cy="-1.8" rx="0.8" ry="0.6" fill="#8a9e48" />
        <line x1="0" y1="1.5" x2="0" y2="3" stroke="#3a2814" strokeWidth="0.3" />
      </g>
    ))}
    {/* Heat haze */}
    <path d="M0,40 Q15,38 30,40 T60,40 T100,40" stroke="rgba(220,200,160,0.18)" strokeWidth="0.3" fill="none" />
    <path d="M0,46 Q20,44 40,46 T80,46 T100,46" stroke="rgba(220,200,160,0.14)" strokeWidth="0.3" fill="none" />
  </svg>
);

const SNOW_DECOR: ReactNode = (
  <svg className="afs-env-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
    <defs>
      <linearGradient id="snow-sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#7a90a8" />
        <stop offset="55%" stopColor="#b8c8d8" />
        <stop offset="100%" stopColor="#e8eef4" />
      </linearGradient>
      <radialGradient id="snow-glow" cx="50%" cy="15%" r="30%">
        <stop offset="0%" stopColor="rgba(220,235,250,0.6)" />
        <stop offset="100%" stopColor="rgba(220,235,250,0)" />
      </radialGradient>
      <linearGradient id="snow-ground" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#f4f8fc" />
        <stop offset="60%" stopColor="#d4e0ec" />
        <stop offset="100%" stopColor="#a4b8cc" />
      </linearGradient>
    </defs>
    <rect x="0" y="0" width="100" height="100" fill="url(#snow-sky)" />
    <rect x="0" y="0" width="100" height="70" fill="url(#snow-glow)" />
    <rect x="0" y="68" width="100" height="32" fill="url(#snow-ground)" />
    {/* Drifts with shadows */}
    <ellipse cx="20" cy="78" rx="18" ry="4.5" fill="#ffffff" />
    <ellipse cx="20" cy="80" rx="14" ry="2.5" fill="rgba(160,180,200,0.4)" />
    <ellipse cx="60" cy="82" rx="26" ry="5.5" fill="#ffffff" />
    <ellipse cx="60" cy="84" rx="20" ry="3" fill="rgba(160,180,200,0.4)" />
    <ellipse cx="90" cy="76" rx="12" ry="3.8" fill="#ffffff" />
    <ellipse cx="90" cy="78" rx="9" ry="2" fill="rgba(160,180,200,0.4)" />
    {/* Distant pines snow-covered */}
    {[[6,66,1.2],[16,62,1.4],[28,68,1.1],[40,64,1.3],[54,66,1.2],[66,62,1.4],[78,68,1.1],[90,64,1.3]].map(([x,y,s],i)=>(
      <g key={`st${i}`} transform={`translate(${x} ${y}) scale(${s})`}>
        <path d="M-1.8,0 L1.8,0 L0,-4 Z" fill="#1a2e22" />
        <path d="M-1.8,0 L0,-1 L1.8,0 Z" fill="#ffffff" />
        <path d="M-1.2,-2 L1.2,-2 L0,-4.5 Z" fill="#245218" />
        <path d="M-1.2,-2 L0,-2.8 L1.2,-2 Z" fill="#ffffff" />
      </g>
    ))}
    {/* Snowflakes with varied sizes and opacity */}
    {Array.from({length: 26}).map((_,i)=>{
      const x = (i*37+5)%100, y = (i*23+8)%50;
      const s = 0.8 + (i%3)*0.3;
      const o = 0.5 + (i%4)*0.12;
      return (
        <g key={`sf${i}`} transform={`translate(${x} ${y}) scale(${s})`} opacity={o}>
          <line x1="-1.4" y1="0" x2="1.4" y2="0" stroke="#ffffff" strokeWidth="0.18" />
          <line x1="0" y1="-1.4" x2="0" y2="1.4" stroke="#ffffff" strokeWidth="0.18" />
          <line x1="-1" y1="-1" x2="1" y2="1" stroke="#ffffff" strokeWidth="0.18" />
          <line x1="-1" y1="1" x2="1" y2="-1" stroke="#ffffff" strokeWidth="0.18" />
        </g>
      );
    })}
  </svg>
);

const HOT_DECOR: ReactNode = (
  <svg className="afs-env-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
    <defs>
      <linearGradient id="hot-sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#c8362a" />
        <stop offset="35%" stopColor="#e8642a" />
        <stop offset="65%" stopColor="#e8a040" />
        <stop offset="100%" stopColor="#c87830" />
      </linearGradient>
      <radialGradient id="hot-sun" cx="74%" cy="22%" r="14%">
        <stop offset="0%" stopColor="rgba(255,250,200,1)" />
        <stop offset="60%" stopColor="rgba(255,210,120,0.7)" />
        <stop offset="100%" stopColor="rgba(255,210,120,0)" />
      </radialGradient>
      <linearGradient id="hot-sand" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#d4a050" />
        <stop offset="100%" stopColor="#6a3e1a" />
      </linearGradient>
    </defs>
    <rect x="0" y="0" width="100" height="100" fill="url(#hot-sky)" />
    <circle cx="74" cy="22" r="5.5" fill="url(#hot-sun)" />
    <circle cx="74" cy="22" r="3.5" fill="rgba(255,250,220,0.95)" />
    {/* Sun rays */}
    {Array.from({length: 16}).map((_,i)=>{
      const a = (i*22.5*Math.PI)/180;
      const r1 = 6.5, r2 = 10 + (i%2)*2;
      return <line key={`hr${i}`} x1={74+Math.cos(a)*r1} y1={22+Math.sin(a)*r1} x2={74+Math.cos(a)*r2} y2={22+Math.sin(a)*r2} stroke="rgba(255,240,180,0.65)" strokeWidth="0.4" />;
    })}
    {/* Heat shimmer waves */}
    {[38,44,50,56].map((y,i)=>(
      <path key={`hh${i}`} d={`M0 ${y} Q12 ${y-1.4} 24 ${y} T48 ${y} T72 ${y} T100 ${y}`} stroke="rgba(255,220,160,0.22)" strokeWidth="0.35" fill="none" />
    ))}
    {/* Dune layers with shadow */}
    <path d="M0,68 Q15,58 30,68 T60,68 T100,68 L100,100 L0,100 Z" fill="url(#hot-sand)" opacity="0.9" />
    <path d="M0,68 Q15,58 30,68 T60,68 T100,68 L100,72 L0,72 Z" fill="rgba(255,200,120,0.3)" />
    <path d="M0,82 Q22,76 44,82 T88,82 L100,82 L100,100 L0,100 Z" fill="#8a5028" />
    <path d="M0,82 Q22,76 44,82 T88,82 L100,82 L100,86 L0,86 Z" fill="rgba(180,120,60,0.35)" />
    {/* Sand ripples */}
    {[[10,76],[28,78],[46,74],[64,78],[82,76]].map(([x,y],i)=>(
      <ellipse key={`rp${i}`} cx={x} cy={y} rx="6" ry="0.5" fill="rgba(255,200,120,0.4)" />
    ))}
    {/* Distant haze line */}
    <rect x="0" y="64" width="100" height="2" fill="rgba(255,220,160,0.3)" />
  </svg>
);

const SEA_DECOR: ReactNode = (
  <svg className="afs-env-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
    <defs>
      <linearGradient id="sea-sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#1a3a5a" />
        <stop offset="40%" stopColor="#4a7a9a" />
        <stop offset="60%" stopColor="#e89858" />
        <stop offset="100%" stopColor="#2a4a6a" />
      </linearGradient>
      <radialGradient id="sea-sun" cx="50%" cy="40%" r="8%">
        <stop offset="0%" stopColor="rgba(255,240,180,1)" />
        <stop offset="100%" stopColor="rgba(255,240,180,0)" />
      </radialGradient>
      <linearGradient id="sea-water" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#5a8aaa" />
        <stop offset="50%" stopColor="#2a5a7a" />
        <stop offset="100%" stopColor="#0a2a4a" />
      </linearGradient>
    </defs>
    <rect x="0" y="0" width="100" height="100" fill="url(#sea-sky)" />
    {/* Horizon glow strip */}
    <rect x="0" y="46" width="100" height="3" fill="rgba(255,180,100,0.5)" />
    {/* Sun at horizon */}
    <circle cx="50" cy="40" r="3.5" fill="url(#sea-sun)" />
    <circle cx="50" cy="40" r="2.4" fill="rgba(255,240,200,0.95)" />
    {/* Water body */}
    <rect x="0" y="49" width="100" height="51" fill="url(#sea-water)" />
    {/* Sun reflection on water (golden path) */}
    <path d="M44,49 L56,49 L54,80 L46,80 Z" fill="rgba(255,200,120,0.32)" />
    <path d="M46,49 L54,49 L52,60 L48,60 Z" fill="rgba(255,220,140,0.45)" />
    {/* Wave layers with perspective */}
    {[50,54,58,62,66,70,74,78,82,86,90].map((y,i)=>(
      <path key={`wv${i}`} d={`M0 ${y} Q5 ${y-0.8} 10 ${y} T20 ${y} T30 ${y} T40 ${y} T50 ${y} T60 ${y} T70 ${y} T80 ${y} T90 ${y} T100 ${y}`} stroke="rgba(220,235,250,0.35)" strokeWidth="0.22" fill="none" />
    ))}
    {/* Foreground waves with foam */}
    <path d="M0,92 Q30,88 60,92 T100,92 L100,100 L0,100 Z" fill="#1a3a5a" />
    <path d="M0,92 Q30,88 60,92 T100,92" stroke="rgba(255,255,255,0.6)" strokeWidth="0.3" fill="none" />
    {/* Distant sailboat silhouette */}
    <g transform="translate(20 44)">
      <path d="M0,0 L0,-4 L3,0 Z" fill="rgba(20,30,50,0.7)" />
      <path d="M-1.5,0 L4,0 L2,1 L0,1 Z" fill="rgba(20,30,50,0.7)" />
    </g>
  </svg>
);

type EnvConfig = {
  label: string;
  Icon: LucideIcon;
  atmospheric: string;
  decor: ReactNode;
};

/** Single source of truth for every test environment.
 *  ENV_ORDER follows the cahier des charges verbatim:
 *  FORÊT, URBAIN, TERRE PLATE, MONTAGNE, BROUSSE, NEIGE, TEMPS CHAUD, MER. */
const ENV_CONFIG: Record<Environment, EnvConfig> = {
  forest:    { label: "Forêt",        Icon: TreePine,      atmospheric: "Humidité 78%",              decor: FOREST_DECOR },
  urban:     { label: "Zone urbaine", Icon: Building2,     atmospheric: "Vent urbain 8 km/h",        decor: URBAN_DECOR },
  flatland:  { label: "Terre plate",  Icon: Wheat,         atmospheric: "Vent 14 km/h",              decor: FLATLAND_DECOR },
  mountain:  { label: "Montagne",    Icon: Mountain,      atmospheric: "Altitude base 1240 m",      decor: MOUNTAIN_DECOR },
  scrubland: { label: "Brousse",      Icon: Shrub,         atmospheric: "Humidité 22%",              decor: SCRUBLAND_DECOR },
  snow:      { label: "Neige",        Icon: CloudSnow,     atmospheric: "Température -8°C",         decor: SNOW_DECOR },
  hot:       { label: "Temps chaud",  Icon: ThermometerSun, atmospheric: "Température 47°C",        decor: HOT_DECOR },
  sea:       { label: "Mer",          Icon: Waves,         atmospheric: "Marée 1.2 m / Vent 12 nds", decor: SEA_DECOR },
};

const ENV_ORDER: readonly Environment[] = ["forest", "urban", "flatland", "mountain", "scrubland", "snow", "hot", "sea"];

function TechnicalGrid({ lang }: { lang: string }) {
  return (
    <svg className="afs-grid" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      {Array.from({ length: 11 }).map((_, i) => (
        <line key={`gv${i}`} x1={i * 10} y1="0" x2={i * 10} y2="100" className="afs-grid-line" />
      ))}
      {Array.from({ length: 11 }).map((_, i) => (
        <line key={`gh${i}`} x1="0" y1={i * 10} x2="100" y2={i * 10} className="afs-grid-line" />
      ))}
      {AXIS_TICKS.map((tick) => (
        <g key={`tx${tick}`}>
          <line x1={tick} y1="0" x2={tick} y2="2.2" className="afs-grid-tick" />
          <text x={tick} y="-0.8" textAnchor="middle" className="afs-grid-label" lang={lang}>{tick}</text>
        </g>
      ))}
      {AXIS_TICKS.map((tick) => (
        <g key={`ty${tick}`}>
          <line x1="0" y1={tick} x2="2.2" y2={tick} className="afs-grid-tick" />
          <text x="-0.8" y={tick} dy="0.35" textAnchor="end" className="afs-grid-label" lang={lang}>{tick}</text>
        </g>
      ))}
    </svg>
  );
}

export function AeroTestFieldStation({ config, setConfig, simulation, isRunning, onRunSimulation, onOpenBuilder }: Props) {
  const { t, language } = useLanguage();
  const [routeEditMode, setRouteEditMode] = useState(false);
  const [selectedWaypointId, setSelectedWaypointId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [environment, setEnvironment] = useState<Environment>("urban");

  const route = config.missionPlan?.waypoints ?? [];
  const selectedWaypoint = route.find((point) => point.id === selectedWaypointId) ?? route[0];
  const hasUserSketch = Boolean(config.customSketch?.strokes.some((stroke) => stroke.tool !== "annotation"));
  const hasActiveUserDesign = Boolean(config.engineeringSelection?.droneId || config.platformProfile || hasUserSketch);
  const droneName = hasActiveUserDesign
    ? config.engineeringSelection?.droneLabel || config.designName || config.platformProfile || t("Drone personnalisé")
    : t("Aucun drone sélectionné");
  const catalogDesign = droneCatalog.find((item) => item.id === config.engineeringSelection?.droneId || item.id === config.platformProfile);
  const activeDesign = useMemo<DroneCatalogDesign | undefined>(() => {
    if (!hasActiveUserDesign || (!config.airframe && !config.modelType && !catalogDesign)) return undefined;
    const fallbackKey = config.airframe ?? catalogDesign?.key ?? "quadcopter";
    const modelType = config.modelType ?? catalogDesign?.modelType ?? (fallbackKey === "fixed-wing" ? "voilure-conventionnelle" : fallbackKey === "vtol" ? "tiltrotor" : "multirotor");
    return {
      ...(catalogDesign ?? {}),
      key: fallbackKey,
      modelType,
      id: config.engineeringSelection?.droneId ?? catalogDesign?.id ?? config.platformProfile ?? "user-drone",
      label: droneName,
      family: catalogDesign?.family ?? String(modelType),
      mission: catalogDesign?.mission ?? config.missionBrief ?? t("Cellule issue de la configuration AeroMind active."),
      specs: catalogDesign?.specs ?? `${config.wingspan.toFixed(1)} m · ${config.fuselageLength.toFixed(1)} m · ${Math.max(1, Math.round(config.motorCount ?? 4))} ${t("moteur(s)")}`,
      disciplines: catalogDesign?.disciplines ?? t("Configuration projet · dimensions · propulsion"),
      tone: catalogDesign?.tone ?? "cyan",
      configuration: { ...(catalogDesign?.configuration ?? {}), ...config },
      role: catalogDesign?.role ?? "civil",
      defenseUse: catalogDesign?.defenseUse ?? t("Visualisation de conception locale."),
      origin: catalogDesign?.origin ?? "aeromind-parametric",
    };
  }, [catalogDesign, config, droneName, hasActiveUserDesign, t]);

  const altitudeLimit = Math.max(1, config.altitudeM || 100, ...route.map((point) => point.altitudeM));
  const screenRoute = route.map((point) => fieldScreenPoint(point, altitudeLimit));
  const routePath = screenRoute.map((point) => `${point.x},${point.y}`).join(" ");
  const position = useMemo(() => {
    if (!route.length) return null;
    if (route.length === 1) return { ...fieldScreenPoint(route[0], altitudeLimit), yaw: 0, altitudeM: route[0].altitudeM };
    const scaled = clamp(progress, 0, 1) * (route.length - 1);
    const index = Math.min(Math.floor(scaled), route.length - 2);
    const mix = scaled - index;
    const a = route[index];
    const b = route[index + 1];
    const ax = fieldScreenPoint(a, altitudeLimit);
    const bx = fieldScreenPoint(b, altitudeLimit);
    return { x: ax.x + (bx.x - ax.x) * mix, y: ax.y + (bx.y - ax.y) * mix, yaw: Math.atan2(bx.y - ax.y, bx.x - ax.x) * 180 / Math.PI, altitudeM: a.altitudeM + (b.altitudeM - a.altitudeM) * mix };
  }, [altitudeLimit, progress, route]);

  useEffect(() => {
    if (!playing) return;
    if (route.length < 2) { setPlaying(false); return; }
    const timer = window.setInterval(() => setProgress((value) => Math.min(1, value + 0.0025)), 50);
    return () => window.clearInterval(timer);
  }, [playing, route.length]);
  useEffect(() => { setProgress(0); setPlaying(false); }, [config.engineeringSelection?.droneId, config.designName]);

  const updateRoute = (updater: (points: MissionWaypoint[]) => MissionWaypoint[]) => {
    setConfig((current) => {
      const plan = current.missionPlan ?? emptyMissionPlan(current);
      return { ...current, missionPlan: { ...plan, waypoints: updater(plan.waypoints) } };
    });
    setProgress(0);
    setPlaying(false);
  };
  const addWaypoint = (x: number, y: number) => {
    if (!hasActiveUserDesign) return;
    const id = `LOCAL-WP-${Date.now()}`;
    const point: MissionWaypoint = {
      id, name: `WP-${String(route.length + 1).padStart(2, "0")}`,
      x: Math.round(clamp(x, 0, 100)), y: Math.round(clamp(y, 0, 100)),
      altitudeM: Math.max(5, Math.round((config.altitudeM || 30) * 0.7)),
      speedKmh: Math.max(5, Math.round(config.cruiseSpeedKmh || 20)), action: "inspection",
    };
    updateRoute((points) => [...points, point]);
    setSelectedWaypointId(id);
  };
  const addWaypointAtCenter = () => addWaypoint(route.length ? (route[route.length - 1].x + 50) / 2 : 50, route.length ? (route[route.length - 1].y + 50) / 2 : 50);
  const updateWaypoint = (patch: Partial<MissionWaypoint>) => {
    if (!selectedWaypoint) return;
    updateRoute((points) => points.map((point) => point.id === selectedWaypoint.id ? { ...point, ...patch } : point));
  };
  const deleteWaypoint = (id: string) => {
    updateRoute((points) => points.filter((point) => point.id !== id));
    setSelectedWaypointId(route.find((point) => point.id !== id)?.id ?? null);
  };
  useEffect(() => { if (playing && progress >= 1) setPlaying(false); }, [playing, progress]);

  const handleFieldClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!routeEditMode || !hasActiveUserDesign) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const screenX = (event.clientX - rect.left) / rect.width * 100;
    const screenY = (event.clientY - rect.top) / rect.height * 100;
    addWaypoint((screenX - 8) / 0.84, 100 - (screenY - 42) / 0.44);
  };
  const resetPlayback = () => { setPlaying(false); setProgress(0); };

  const activeEnv = ENV_CONFIG[environment];
  const envLabel = t(activeEnv.label);
  const EnvBadgeIcon = activeEnv.Icon;
  const atmospheric = t(activeEnv.atmospheric);

  return (
    <main className={`aero-field-station afs-env--${environment}`}>
      <div className="afs-top-accent" aria-hidden="true" />
      <header className="afs-header">
        <div>
          <span className="afs-eyebrow">{t("AEROMIND / AEROLAB · SITE EXTÉRIEUR")}</span>
          <h2>{t("Terrain d’essais · vol simulé")}</h2>
          <p>{t("Le modèle affiché suit la cellule active et son plan de mission partagé.")}</p>
        </div>
        <div className={`afs-status ${playing ? "is-live" : ""}`}>
          <i />
          {playing ? t("SIMULATION EN COURS") : hasActiveUserDesign ? t("CELLULE ACTIVE") : t("SÉLECTION REQUISE")}
          <small>{t("LOCAL · SORTIE MATÉRIELLE DÉSACTIVÉE")}</small>
        </div>
      </header>

      <div className="afs-toolbar">
        <div className="afs-env-selector" role="group" aria-label={t("Sélecteur d’environnement de test")}>
          {ENV_ORDER.map((id) => {
            const { label, Icon } = ENV_CONFIG[id];
            return (
              <button key={id} type="button" className={`afs-env-btn ${environment === id ? "afs-env-btn--active" : ""}`} onClick={() => setEnvironment(id)} aria-pressed={environment === id} title={t(label)}>
                <Icon size={13} /><span>{t(label)}</span>
              </button>
            );
          })}
        </div>
        <div className="afs-drone-id">
          <span>{t("DRONE DU PROJET")}</span>
          <strong>{droneName}</strong>
          <small>{activeDesign ? `${activeDesign.modelType} · ${config.airframe ?? activeDesign.key} · ${Math.max(1, Math.round(config.motorCount ?? 1))} ${t("moteur(s)")}` : t("Aucun drone de démonstration ne sera affiché.")}</small>
        </div>
        <button type="button" className="afs-primary" disabled={!hasActiveUserDesign || route.length < 2 || isRunning} onClick={() => { if (playing) setPlaying(false); else { if (progress >= 1) setProgress(0); onRunSimulation(config); setPlaying(true); } }}>
          {playing ? <Pause size={15} /> : <Play size={15} />}{playing ? t("Pause du vol") : isRunning ? t("Calcul…") : t("Lancer le vol simulé")}
        </button>
        <button type="button" disabled={!route.length || isRunning} onClick={() => { setPlaying(false); onRunSimulation(config); }}><Activity size={14} />{t("Analyser")}</button>
        <button type="button" onClick={resetPlayback}><RotateCcw size={14} />{t("Réinitialiser")}</button>
        {!hasActiveUserDesign && <button type="button" className="afs-secondary" onClick={onOpenBuilder}>{t("Choisir / construire un drone")}</button>}
      </div>

      <div className="afs-layout">
        <aside className="afs-side-panel">
          <div className="afs-panel-block">
            <div className={`afs-env-badge afs-env-badge--${environment}`}>
              <EnvBadgeIcon size={14} />
              <strong>{t("ENVIRONNEMENT ACTIF")} · {envLabel.toUpperCase()}</strong>
            </div>
          </div>
          <div className="afs-panel-block">
            <span className="afs-panel-label">{t("DONNÉES ATMOSPHÉRIQUES")}</span>
            <div className={`afs-atmos afs-atmos--${environment}`}>{atmospheric}</div>
          </div>
          <div className="afs-panel-block">
            <span className="afs-panel-label">{t("TÉLÉMÉTRIE LOCALE")}</span>
            <ul className="afs-telemetry">
              <li><span>{t("Altitude")}</span><b>{position ? `${Math.round(position.altitudeM)} m` : "—"}</b></li>
              <li><span>{t("Cap")}</span><b>{position ? `${Math.round(((position.yaw % 360) + 360) % 360)}°` : "—"}</b></li>
              <li><span>{t("Waypoints")}</span><b>{route.length}</b></li>
              <li><span>{t("Avancement")}</span><b>{Math.round(progress * 100)}%</b></li>
              <li><span>{t("Envergure")}</span><b>{config.wingspan.toFixed(1)} m</b></li>
              <li><span>{t("Vitesse croisière")}</span><b>{Math.round(config.cruiseSpeedKmh)} km/h</b></li>
              <li><span>{t("Moteurs")}</span><b>{Math.max(1, Math.round(config.motorCount ?? 1))}</b></li>
            </ul>
          </div>
          {playing && <div className="afs-live-indicator" role="status" aria-live="polite"><i /><span>{t("INDICATEUR TEMPS RÉEL · VOL EN COURS")}</span></div>}
        </aside>

        <section className="afs-scene-card">
          <div className="afs-scene-heading">
            <div><span>{t("CHAMP EXTÉRIEUR · VUE DE TEST")}</span><strong>{config.missionPlan?.operationName || t("Itinéraire local")}</strong></div>
            <span className="afs-ref">{t("REPÈRE LOCAL X/Y/Z · SANS GPS")}</span>
          </div>
          <div className={`afs-field afs-field--${environment} ${routeEditMode ? "is-editing" : ""}`} onClick={handleFieldClick} role="img" aria-label={t("Terrain d’essai extérieur avec trajectoire locale du drone sélectionné")}>
            <div className="afs-field-vignette" />
            {activeEnv.decor}
            <TechnicalGrid lang={language} />
            <div className="afs-runway-marking" aria-hidden="true"><i /><b>{t("H-01")}</b></div>
            <svg className="afs-route-layer" viewBox="0 0 100 100" preserveAspectRatio="none" shapeRendering="geometricPrecision" aria-label={t("Itinéraire local dessiné sur le terrain")}>
              {screenRoute.length > 1 && (<>
                <polyline className="afs-route-shadow" points={routePath} />
                <polyline className="afs-route-line" points={routePath} />
                {screenRoute.slice(0, -1).map((p, i) => {
                  const next = screenRoute[i + 1];
                  const segLen = Math.hypot(next.x - p.x, next.y - p.y);
                  const ticks = Math.max(1, Math.round(segLen / 5));
                  return Array.from({ length: ticks + 1 }).map((_, k) => {
                    const r = ticks === 0 ? 0 : k / ticks;
                    const x = p.x + (next.x - p.x) * r;
                    const y = p.y + (next.y - p.y) * r;
                    const ang = Math.atan2(next.y - p.y, next.x - p.x) * 180 / Math.PI;
                    return <line key={`tk-${i}-${k}`} className="afs-route-tick" x1={x} y1={y - 0.5} x2={x} y2={y + 0.5} transform={`rotate(${ang} ${x} ${y})`} />;
                  });
                })}
                {position && <polyline className="afs-route-flown" points={`${screenRoute[0].x},${screenRoute[0].y} ${position.x},${position.y}`} />}
              </>)}
              {route.map((point, index) => {
                const plotted = screenRoute[index];
                return (
                  <g className={`afs-waypoint ${selectedWaypoint?.id === point.id ? "is-selected" : ""}`} key={point.id} onClick={(event) => { event.stopPropagation(); setSelectedWaypointId(point.id); }}>
                    <circle className="afs-wp-halo" cx={plotted.x} cy={plotted.y} r="1.4" />
                    <circle className="afs-wp-dot" cx={plotted.x} cy={plotted.y} r="0.55" />
                    <path className="afs-waypoint-cross" d={`M${plotted.x - 1.8},${plotted.y} L${plotted.x + 1.8},${plotted.y} M${plotted.x},${plotted.y - 1.8} L${plotted.x},${plotted.y + 1.8}`} />
                    <text className="afs-waypoint-label" x={plotted.x + 2.1} y={plotted.y - 1.6} lang={language}>{point.name || `WP-${index + 1}`}</text>
                  </g>
                );
              })}
            </svg>
            {activeDesign && position && (
              <div className="afs-aircraft-pro" data-testid="afs-selected-drone" style={{ left: `${position.x}%`, top: `${position.y}%` }} onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()} role="img" aria-label={`${droneName}, ${t("en vol simulé à")} ${Math.round(position.altitudeM)} ${t("mètres")}`}>
                {/* Ground shadow projected below the drone */}
                <div className="afs-drone-shadow" aria-hidden="true" />
                {/* Soft ambient glow halo */}
                <div className="afs-drone-halo" aria-hidden="true" />
                {/* Rotating drone body */}
                <div className="afs-drone-body" style={{ transform: `translate(-50%, -50%) rotate(${position.yaw}deg) scale(${0.9 + Math.min(0.5, position.altitudeM / 200)})` }}>
                  <ParametricDronePreview design={activeDesign} zoom={0.85} />
                </div>
                {/* Telemetry HUD tag */}
                <div className="afs-drone-hud">
                  <span className="afs-hud-name">{droneName}</span>
                  <span className="afs-hud-alt">{Math.round(position.altitudeM)} m</span>
                </div>
              </div>
            )}
            {!activeDesign && (
              <div className="afs-no-drone">
                <MapPin size={20} /><strong>{t("AUCUN DRONE CHARGÉ")}</strong>
                <span>{t("Sélectionnez votre cellule pour afficher son modèle réel ici. Aucun drone générique n’est substitué.")}</span>
                <button type="button" onClick={(event) => { event.stopPropagation(); onOpenBuilder(); }}>{t("Ouvrir le choix du drone")}</button>
              </div>
            )}
            {routeEditMode && hasActiveUserDesign && <div className="afs-edit-tip">{t("CLIQUEZ SUR LE TERRAIN POUR AJOUTER UN WAYPOINT")}</div>}
            <div className="afs-field-readout">
              <span>{route.length} {t("WP")} · {route.length >= 2 ? t("ROUTE ACTIVE") : t("AJOUTEZ DES POINTS")}</span>
              <span>{t("SIMULATION")} · {simulation.runId}</span>
            </div>
          </div>
          <div className="afs-field-legend">
            <span><i className="afs-legend-plan" /> {t("Plan prévu")}</span>
            <span><i className="afs-legend-flown" /> {t("Parcours simulé")}</span>
            <span><i className="afs-legend-drone" /> {t("Cellule active")}</span>
            <small>{t("Terrain illustratif ; plan local sans coordonnées de vol réelles.")}</small>
          </div>
        </section>

        <aside className="afs-route-card">
          <div className="afs-route-head">
            <div><span>{t("PLAN DE VOL · PROJET ACTIF")}</span><h3>{t("Itinéraire personnalisable")}</h3><small>{route.length} {t("point(s)")} · {config.missionPlan ? t("lié au plan AeroMind") : t("pas encore enregistré")}</small></div>
            <Route size={19} />
          </div>
          <div className="afs-route-actions">
            <button type="button" className={routeEditMode ? "is-active" : ""} disabled={!hasActiveUserDesign} onClick={() => setRouteEditMode((value) => !value)}>{routeEditMode ? t("Terminer le tracé") : t("Tracer sur le terrain")}</button>
            <button type="button" disabled={!hasActiveUserDesign} onClick={addWaypointAtCenter}><Plus size={14} />{t("Point")}</button>
          </div>
          {!hasActiveUserDesign && <p className="afs-empty-note">{t("Choisissez d’abord un drone dans AeroMind pour créer son itinéraire de test.")}</p>}
          {routeEditMode && hasActiveUserDesign && <p className="afs-instruction">{t("Mode tracé actif : cliquez dans le terrain pour placer des points. Les coordonnées restent locales (X/Y en %), sans GPS.")}</p>}
          <ol className="afs-waypoint-list">
            {route.map((point, index) => (
              <li key={point.id} className={selectedWaypoint?.id === point.id ? "is-selected" : ""}>
                <button type="button" className="afs-wp-select" onClick={() => setSelectedWaypointId(point.id)}>
                  <b>{String(index + 1).padStart(2, "0")}</b>
                  <span>{point.name || `WP-${index + 1}`}<small>X {point.x}% · Y {point.y}% · {point.altitudeM} m</small></span>
                </button>
                <button type="button" className="afs-wp-delete" aria-label={`${t("Supprimer")} ${point.name || `waypoint ${index + 1}`}`} onClick={() => deleteWaypoint(point.id)}><Trash2 size={13} /></button>
              </li>
            ))}
          </ol>
          {selectedWaypoint && (
            <div className="afs-wp-editor">
              <strong>{t("ÉDITER LE POINT SÉLECTIONNÉ")}</strong>
              <label>{t("Nom")}<input value={selectedWaypoint.name} onChange={(event) => updateWaypoint({ name: event.target.value })} /></label>
              <div>
                <label>{t("X")} · %<input type="number" min="0" max="100" value={selectedWaypoint.x} onChange={(event) => updateWaypoint({ x: clamp(Number(event.target.value), 0, 100) })} /></label>
                <label>{t("Y")} · %<input type="number" min="0" max="100" value={selectedWaypoint.y} onChange={(event) => updateWaypoint({ y: clamp(Number(event.target.value), 0, 100) })} /></label>
              </div>
              <div>
                <label>{t("Altitude")} · m<input type="number" min="0" max="6000" step="5" value={selectedWaypoint.altitudeM} onChange={(event) => updateWaypoint({ altitudeM: clamp(Number(event.target.value), 0, 6000) })} /></label>
                <label>{t("Vitesse")} · km/h<input type="number" min="0" max="300" value={selectedWaypoint.speedKmh} onChange={(event) => updateWaypoint({ speedKmh: clamp(Number(event.target.value), 0, 300) })} /></label>
              </div>
            </div>
          )}
          <div className="afs-route-footer"><span><i />{t("ITINÉRAIRE PARTAGÉ AVEC LE PROJET")}</span><small>{t("Les modifications du plan sont enregistrées localement.")}</small></div>
        </aside>

        <section className="afs-bottom-bar">
          <div className="afs-progress-block"><span>{t("AVANCEMENT DU VOL SIMULÉ")}</span><b>{Math.round(progress * 100)}%</b></div>
          <input aria-label={t("Progression de l’itinéraire simulé")} type="range" min="0" max="1000" value={Math.round(progress * 1000)} onChange={(event) => { setPlaying(false); setProgress(Number(event.target.value) / 1000); }} disabled={route.length < 2} />
          <div className="afs-bottom-meta">
            <span>{activeDesign ? `${droneName} · ${activeDesign.modelType}` : t("Cellule en attente")}</span>
            <span>{position ? `${t("ALT")} ${Math.round(position.altitudeM)} m · ${route.length} ${t("waypoint(s)")}` : t("Sélection et route requises")}</span>
          </div>
          <div className="afs-footer-strip" role="contentinfo">
            <span><b>{t("SIMULATION RUN ID")}</b><i>{simulation.runId}</i></span>
            <span><b>{t("ENV")}</b><i>{envLabel}</i></span>
            <span><b>{t("WP")}</b><i>{route.length}</i></span>
            <span><b>{t("TÉLÉMÉTRIE")}</b><i>{t("OK · LOCAL")}</i></span>
          </div>
        </section>
      </div>
      <p className="afs-safety-note">{t("Aperçu de conception AeroMind uniquement : scène visuelle et valeurs calculées par modèle. Ce n’est ni une image réelle d’essai, ni une mesure physique, ni une commande de drone.")}</p>
    </main>
  );
}
