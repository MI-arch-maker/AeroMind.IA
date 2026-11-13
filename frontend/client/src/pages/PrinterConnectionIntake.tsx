import { useState } from "react";
import { Cable, CircleAlert, PlugZap, Router, ShieldCheck, Usb } from "lucide-react";
import type { PrinterConnectionProfile, PrinterTransport } from "@/lib/printer-adapter-contract";
import "./printer-connection-intake.css";

const transports: Array<{ id: PrinterTransport; label: string; icon: typeof Usb }> = [
  { id: "usb-serial", label: "USB / série", icon: Usb },
  { id: "octoprint-http", label: "OctoPrint / HTTP", icon: Router },
  { id: "moonraker-http", label: "Moonraker / Klipper HTTP", icon: Router },
  { id: "vendor-api", label: "API constructeur", icon: PlugZap },
  { id: "other", label: "Autre / à qualifier", icon: Cable },
];
export default function PrinterConnectionIntake() {
  const [profiles, setProfiles] = useState<PrinterConnectionProfile[]>([]);
  const [name, setName] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [model, setModel] = useState("");
  const [transport, setTransport] = useState<PrinterTransport>("usb-serial");
  const [endpoint, setEndpoint] = useState("");
  const [notice, setNotice] = useState("");
  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const profile: PrinterConnectionProfile = {
      id: `printer-profile-${Date.now()}`,
      displayName: name.trim() || `${manufacturer.trim()} ${model.trim()}`.trim(),
      manufacturer: manufacturer.trim(),
      model: model.trim(),
      transport,
      ...(endpoint.trim() ? { endpoint: endpoint.trim() } : {}),
      state: "draft",
      createdAt: new Date().toISOString(),
    };
    setProfiles(items => [profile, ...items]);
    setName(""); setManufacturer(""); setModel(""); setEndpoint("");
    setNotice("Profil ajouté au brouillon local · aucune connexion ni commande n’a été tentée.");
  };
  return <section className="pci-shell" aria-labelledby="pci-title">
    <header className="pci-head"><div><span>PRINTER INTEGRATION INTAKE</span><h3 id="pci-title">Préparer un profil d’imprimante</h3><p>Prise en charge extensible via adaptateurs ciblés par modèle, firmware et protocole.</p></div><span className="pci-readonly"><ShieldCheck size={14}/> READ-ONLY / PAS DE PILOTAGE</span></header>
    <div className="pci-warning"><CircleAlert size={16}/><span>Le dépôt d’un profil ne connecte pas l’imprimante. Aucun scan réseau, identifiant, handshake, G-code ou ordre de fabrication n’est envoyé. « Toute imprimante » exige un adaptateur compatible avec son modèle et son firmware.</span></div>
    <form onSubmit={submit} className="pci-form">
      <label>Nom de profil<input value={name} onChange={event=>setName(event.target.value)} placeholder="Ex. Atelier — imprimante 01" /></label>
      <label>Fabricant<input required value={manufacturer} onChange={event=>setManufacturer(event.target.value)} placeholder="Fabricant" /></label>
      <label>Modèle / firmware<input required value={model} onChange={event=>setModel(event.target.value)} placeholder="Modèle exact et version firmware" /></label>
      <label>Transport / protocole<select value={transport} onChange={event=>setTransport(event.target.value as PrinterTransport)}>{transports.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
      {(transport.includes("http")||transport==="vendor-api")&&<label>Adresse locale (facultative)<input value={endpoint} onChange={event=>setEndpoint(event.target.value)} placeholder="hôte ou URL — aucune connexion ne sera tentée" /></label>}
      <button type="submit">ENREGISTRER COMME BROUILLON</button>
    </form>
    {notice&&<p role="status" className="pci-notice">{notice}</p>}
    <div className="pci-profiles"><div className="pci-profile-heading"><strong>Profils préparés</strong><span>{profiles.length} · stockage local à cette vue</span></div>{profiles.length?profiles.map(profile=>{const adapter=transports.find(item=>item.id===profile.transport)!;const Icon=adapter.icon;return <article key={profile.id}><Icon size={16}/><div><strong>{profile.displayName}</strong><small>{profile.manufacturer} {profile.model} · {adapter.label}{profile.endpoint?` · ${profile.endpoint}`:""}</small></div><span className="pci-draft">BROUILLON · NON CONNECTÉ</span></article>;}):<p className="pci-empty">Aucun profil. Enregistrez d’abord le fabricant, le modèle et le protocole visé.</p>}</div>
  </section>;
}
