import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from "react";
import { Search, Package, Cpu, Battery, Radio, Camera, Shield, Wrench, Key, Frame, Fan } from "lucide-react";

// ===========================================================================
// MaterialLibraryView — Extended material library catalog (v7)
//
// Fetches the catalog from /api/materials/catalog (10 categories, 30+ items).
// All items are NON-WEAPONIZED (AeroMind contract). Includes motors, ESCs,
// propellers, frames, FC, GPS, batteries, cameras, gimbals, LIDAR, thermal,
// multispectral, payloads (drop mechanism, agricultural sprayer, lighting,
// comms relay, gas detector), safety (parachute, strobe, flare), maintenance
// (torque screwdriver, prop balancer), and armament HARDWARE (switches, PDB,
// magnetic connectors — NOT weapons).
// ===========================================================================

type MaterialItem = {
  id: string;
  category: string;
  label: string;
  manufacturer?: string;
  partNumber?: string;
  massKg?: number;
  dimensions?: string;
  electrical?: string;
  interfaces?: string;
  use?: string;
  compatibleAirframes: string[];
  catalogSource: string;
  weaponized: boolean;
  notes?: string;
};

type Category = {
  id: string;
  label: string;
  icon: string;
  description: string;
};

type CatalogResponse = {
  categories: Category[];
  items: MaterialItem[];
  totalCount: number;
  weaponizedItems: number;
};

const CATEGORY_ICONS: Record<string, typeof Cpu> = {
  propulsion: Fan,
  energy: Battery,
  structure: Frame,
  avionics: Cpu,
  communication: Radio,
  optical: Camera,
  "payload-non-weaponized": Package,
  safety: Shield,
  maintenance: Wrench,
  "armament-hardware": Key,
};

export type MaterialLibraryHandle = {
  refresh: () => void;
};

export const MaterialLibraryView = forwardRef<MaterialLibraryHandle, { }>(
  function MaterialLibraryView(_props, ref) {
    const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
    const [search, setSearch] = useState("");
    const [loading, setLoading] = useState(false);

    const refresh = async () => {
      setLoading(true);
      try {
        const url = new URL("/api/materials/catalog", window.location.origin);
        if (selectedCategory) url.searchParams.set("category", selectedCategory);
        if (search.trim()) url.searchParams.set("q", search.trim());
        const r = await fetch(url.toString(), { credentials: "include" });
        if (r.ok) setCatalog(await r.json());
      } catch {
        // ignore — keep last catalog
      } finally {
        setLoading(false);
      }
    };

    useImperativeHandle(ref, () => ({ refresh }));

    useEffect(() => { void refresh(); }, []);
    useEffect(() => { void refresh(); }, [selectedCategory, search]);

    const categories = catalog?.categories ?? [];
    const items = catalog?.items ?? [];

    return (
      <div className="lb-materials">
        {/* Search + category filter */}
        <div className="lb-materials-toolbar">
          <div className="lb-materials-search">
            <Search size={14} />
            <input
              type="text"
              placeholder="Rechercher (label, fabricant, part number, usage)…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <span className="lb-materials-count">
            {loading ? "Chargement…" : `${items.length} / ${catalog?.totalCount ?? 0} références`}
          </span>
        </div>

        {/* Category chips */}
        <div className="lb-materials-categories">
          <button
            className={`lb-materials-chip ${selectedCategory === null ? "is-active" : ""}`}
            onClick={() => setSelectedCategory(null)}
          >
            Toutes ({catalog?.totalCount ?? 0})
          </button>
          {categories.map((c) => {
            const Icon = CATEGORY_ICONS[c.id] ?? Package;
            const count = items.filter((it) => it.category === c.id).length;
            const isActive = selectedCategory === c.id;
            return (
              <button
                key={c.id}
                className={`lb-materials-chip ${isActive ? "is-active" : ""}`}
                onClick={() => setSelectedCategory(isActive ? null : c.id)}
                title={c.description}
              >
                <Icon size={13} />
                <span>{c.label}</span>
                <span className="lb-materials-chip-count">{count}</span>
              </button>
            );
          })}
        </div>

        {/* Items grid */}
        {items.length === 0 && !loading ? (
          <p className="lb-empty-state">Aucune référence trouvée pour ce filtre.</p>
        ) : (
          <div className="lb-materials-grid">
            {items.map((item) => {
              const Icon = CATEGORY_ICONS[item.category] ?? Package;
              return (
                <article key={item.id} className="lb-material-card">
                  <div className="lb-material-card-head">
                    <Icon size={18} />
                    <div>
                      <strong>{item.label}</strong>
                      {item.manufacturer && <small>{item.manufacturer}</small>}
                    </div>
                  </div>
                  <div className="lb-material-card-meta">
                    {item.partNumber && (
                      <span><b>PN</b> {item.partNumber}</span>
                    )}
                    {item.massKg != null && (
                      <span><b>Masse</b> {item.massKg} kg</span>
                    )}
                    {item.dimensions && (
                      <span><b>Dim.</b> {item.dimensions}</span>
                    )}
                    {item.electrical && (
                      <span><b>Élec.</b> {item.electrical}</span>
                    )}
                    {item.interfaces && (
                      <span><b>I/O</b> {item.interfaces}</span>
                    )}
                    {item.compatibleAirframes && item.compatibleAirframes.length > 0 && (
                      <span><b>Airframes</b> {item.compatibleAirframes.join(", ")}</span>
                    )}
                  </div>
                  {item.use && <p className="lb-material-card-use">{item.use}</p>}
                  <div className="lb-material-card-foot">
                    <span className={`lb-materials-source lb-source-${item.catalogSource}`}>
                      {item.catalogSource === "manufacturer" ? "Fabricant" : item.catalogSource === "user" ? "Personnalisé" : "Concept"}
                    </span>
                    <span className="lb-materials-weaponized">
                      {item.weaponized ? "ARMÉ" : "non-armé"}
                    </span>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    );
  }
);
