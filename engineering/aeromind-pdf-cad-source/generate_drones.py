"""P1-20 fix — DEPRECATED. Use generate_cad.py instead.

This script is kept for historical reference but MUST NOT be executed:
  - It overwrites manifest.json with a 5-field schema (vs generate_cad.py's
    11-field schema), breaking frontend consumers.
  - It uses a hardcoded polygon for all 8 cells, ignoring the per-cell `wing`
    data, which would replace the published SCAD files with generic geometry.

To regenerate the cell library, run:
    python3 engineering/aeromind-pdf-cad-source/generate_cad.py
"""
import sys
print("ERROR: generate_drones.py is deprecated (P1-20). Use generate_cad.py instead.", file=sys.stderr)
sys.exit(1)

# --- Everything below is the original (now-unreachable) code, kept for audit ---
if False:  # dead-code guard
# Normalized top-view airframe silhouettes, with geometry detail sets and palette.
models=[
 dict(id='01-aile-delta-noire',name='Aile delta furtive',type='Aile volante',color='#303943',accent='#e7edf2',wing='M22 112 Q26 99 54 89 L164 28 Q176 22 181 29 L170 97 L258 104 Q285 108 298 112 Q285 117 258 120 L170 127 L181 194 Q176 201 164 195 L54 135 Q26 125 22 112 Z',body='M32 112 Q39 104 62 105 L259 108 Q286 109 296 112 Q286 115 259 116 L62 119 Q39 120 32 112 Z',fins=['M42 98 L24 91 L20 80 L50 91 Z','M42 126 L20 143 L24 132 L50 124 Z'],panels=[(90,75,22,12),(112,83,18,10),(93,142,23,12),(116,132,20,10),(154,65,24,12),(151,151,25,12)]),
 dict(id='02-delta-jaune',name='Delta tactique à bande jaune',type='Aile delta',color='#454b52',accent='#ffcb32',wing='M23 112 Q48 93 88 77 L166 42 L250 82 Q277 97 299 112 Q277 127 250 142 L166 182 L88 147 Q48 131 23 112 Z',body='M28 112 Q38 106 75 107 L282 109 Q296 110 300 112 Q296 114 282 115 L75 117 Q38 118 28 112 Z',fins=['M57 98 L42 88 L50 80 L69 95 Z','M57 126 L50 144 L42 136 L69 125 Z'],panels=[(106,86,28,14),(108,133,28,14),(168,70,30,13),(168,141,30,13),(230,92,22,12)]),
 dict(id='03-delta-prop-gris',name='Delta gris à hélice arrière',type='Aile volante propulsive',color='#aeb6bd',accent='#68747f',wing='M20 111 Q42 100 70 85 L164 34 Q173 31 176 38 L169 98 L254 102 Q279 105 300 111 Q279 118 254 121 L169 125 L176 184 Q173 191 164 188 L70 138 Q42 123 20 111 Z',body='M22 111 Q34 105 67 106 L260 108 L282 111 L260 114 L67 116 Q34 117 22 111 Z',fins=['M44 95 L31 82 L34 75 L58 91 Z','M44 127 L34 147 L31 140 L58 125 Z'],panels=[(103,80,25,13),(103,133,25,13),(147,59,28,14),(147,151,28,14),(220,89,23,12)],prop='rear'),
 dict(id='04-maq9',name='Drone MALE à empennage en V',type='Voilure fixe, hélice arrière',color='#a9b9c0',accent='#526773',wing='M40 108 Q72 103 112 100 L238 91 L245 97 L184 110 L244 124 L238 131 L112 121 Q72 119 40 116 Z',body='M22 112 Q32 101 74 103 L258 107 Q277 109 289 112 Q277 115 258 117 L74 121 Q32 123 22 112 Z',fins=['M258 106 L284 84 L290 88 L278 111 Z','M258 118 L284 140 L290 136 L278 113 Z'],panels=[(120,91,20,10),(120,123,20,10),(166,93,18,9),(166,121,18,9)],gear=True),
 dict(id='05-delta-prop-arriere',name='Aile volante argent à propulseur',type='Aile volante propulsive',color='#c3c8cb',accent='#58636a',wing='M18 112 Q43 99 81 75 L166 31 Q174 28 177 36 L170 99 L248 105 Q273 107 299 112 Q273 117 248 120 L170 125 L177 187 Q174 195 166 191 L81 149 Q43 125 18 112 Z',body='M22 112 Q34 104 70 106 L255 108 Q285 109 298 112 Q285 115 255 116 L70 118 Q34 120 22 112 Z',fins=['M48 92 L28 77 L38 74 L61 88 Z','M48 132 L38 150 L28 147 L61 126 Z'],panels=[(104,80,26,14),(104,132,26,14),(151,59,27,14),(151,151,27,14)],prop='rear'),
 dict(id='06-vtol-rouge',name='VTOL hybride rouge',type='Voilure fixe VTOL',color='#b52831',accent='#252d36',wing='M22 112 Q52 106 99 105 L250 68 L257 76 L181 108 L257 146 L250 154 L99 119 Q52 118 22 112 Z',body='M21 112 Q32 101 72 104 L261 108 Q283 109 296 112 Q283 115 261 116 L72 120 Q32 123 21 112 Z',fins=['M40 105 L23 87 L29 82 L53 101 Z','M40 119 L29 142 L23 137 L53 117 Z'],panels=[(102,103,30,8),(169,91,28,8),(169,125,28,8)],rotors=[(81,72),(81,152),(219,60),(219,164)]),
 dict(id='07-quad-duct',name='Quadrirotor à conduits annulaires',type='VTOL multirotor caréné',color='#68786e',accent='#c1c8bd',body='M76 112 Q79 92 105 88 L201 88 Q226 91 229 112 Q226 133 201 136 L105 136 Q79 132 76 112 Z',wing='M104 90 L112 76 L190 76 L201 90 L201 134 L190 148 L112 148 L104 134 Z',fins=[],panels=[(119,97,60,12),(119,117,60,12)],rotors=[(57,63),(248,63),(57,161),(248,161)],duct=True),
 dict(id='08-aile-droite-blanc',name='Drone d’attaque à ailes droites',type='Voilure fixe, double dérive',color='#d6d8d6',accent='#66717a',wing='M72 112 L95 91 L231 88 L238 96 L183 108 L267 99 L279 105 L279 119 L267 125 L183 116 L238 128 L231 136 L95 133 Z',body='M25 112 Q34 103 79 105 L263 108 Q283 109 298 112 Q283 115 263 116 L79 119 Q34 121 25 112 Z',fins=['M238 104 L273 83 L280 87 L272 110 Z','M238 120 L272 141 L280 137 L272 114 Z'],panels=[(119,94,22,10),(119,120,22,10),(158,93,24,10),(158,121,24,10)],gear=True),
]

def svg(m):
    details=[]
    for x,y,w,h in m.get('panels',[]):
        details.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="2.5" class="panel"/>')
    for p in m.get('fins',[]): details.append(f'<path d="{p}" class="fin"/>')
    if m.get('prop'):
        details.append('<path d="M286 101 Q304 99 307 106 L307 118 Q304 125 286 123Z" class="engine"/><path d="M299 108 L310 99 M299 116 L310 125" class="thin"/>')
    if m.get('gear'):
        details.extend(['<path d="M118 117 L112 157 M212 116 L218 157" class="thin"/>','<circle cx="111" cy="161" r="4" class="wheel"/><circle cx="219" cy="161" r="4" class="wheel"/>'])
    for x,y in m.get('rotors',[]):
        if m.get('duct'):
            details.append(f'<circle cx="{x}" cy="{y}" r="20" class="duct"/><circle cx="{x}" cy="{y}" r="13" class="rotor"/>')
            for dx,dy in [(0,-11),(8,-8),(11,0),(8,8),(0,11),(-8,8),(-11,0),(-8,-8)]:
                details.append(f'<path d="M{x} {y} L{x+dx} {y+dy}" class="thin"/>')
        else:
            details.append(f'<path d="M{x-7} {y} Q{x} {y-4} {x+7} {y} Q{x} {y+4} {x-7} {y}Z" class="engine"/><path d="M{x-12} {y-3} L{x+12} {y+3} M{x-12} {y+3} L{x+12} {y-3}" class="thin"/>')
    if m.get('id')=='01-aile-delta-noire':
        details.append('<path d="M243 101 L249 123" stroke="#f0f3f5" stroke-width="5"/>')
    if m.get('id')=='02-delta-jaune':
        details.append('<path d="M252 91 Q245 112 252 133" stroke="#ffcb32" stroke-width="6" fill="none"/>')
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 224" role="img" aria-label="{html.escape(m['name'])}">
<defs><linearGradient id="body" x2="0" y2="1"><stop stop-color="{m['color']}"/><stop offset="1" stop-color="{m['accent']}"/></linearGradient><linearGradient id="wing" x2="1" y2="1"><stop stop-color="{m['color']}"/><stop offset="1" stop-color="{m['accent']}"/></linearGradient></defs>
<g stroke-linejoin="round" stroke-linecap="round"><path d="{m['wing']}" fill="url(#wing)" stroke="#26323a" stroke-width="2.4"/><path d="{m['body']}" fill="url(#body)" stroke="#202b33" stroke-width="2.2"/><path d="M57 108 Q68 112 57 116" fill="none" stroke="#dfe8ec" stroke-width="1.2"/>{''.join(details)}<path d="M60 112 L275 112" stroke="#ffffff" stroke-opacity=".13" stroke-width="1"/></g>
<style>.panel{{fill:none;stroke:#243039;stroke-width:1.5;opacity:.75}}.fin{{fill:{m['color']};stroke:#202b33;stroke-width:2}}.thin{{stroke:#26343d;stroke-width:1.6;fill:none}}.engine{{fill:#29353c;stroke:#182228;stroke-width:1.4}}.wheel{{fill:#303940;stroke:#182228;stroke-width:1.5}}.duct{{fill:#47584e;stroke:#26342d;stroke-width:3}}.rotor{{fill:#cbd0c7;stroke:#324038;stroke-width:1.5}}</style></svg>'''

# SVG + editable parametric CAD scripts using normalized planform, extruded to user-adjustable scale.
for m in models:
    (OUT/(m['id']+'.svg')).write_text(svg(m))
    scad=f'''// Parametric concept CAD — {m['name']}\n// Reconstructed from a 2D PDF image; no scale/dimensions were supplied.\n// Set span_mm to desired overall wingspan; thickness_mm controls the shell.\nspan_mm=600; thickness_mm=12; detail_depth=1.2;\nscale_factor=span_mm/280;\nmodule planform() {{\n  // Approximate planform vertices sampled from the supplied reference.\n  linear_extrude(height=thickness_mm, center=true, convexity=8)\n    polygon(points=[[-140,0],[-112,-20],[-67,-46],[6,-78],[18,-74],[13,-15],[100,-10],[138,0],[100,10],[13,15],[18,74],[6,78],[-67,46],[-112,20]]);\n}}\nmodule fuselage() {{\n  rotate([90,0,90]) linear_extrude(height=280*scale_factor, center=true)\n    hull() {{ translate([-7,0]) circle(r=9,$fn=32); translate([7,0]) circle(r=13,$fn=32); }}\n}}\nmodule concept_airframe() {{\n  scale([scale_factor,scale_factor,scale_factor]) union() {{\n    planform();\n    // centerline fuselage and modest dorsal fairing\n    fuselage();\n    translate([0,0,thickness_mm/2]) linear_extrude(height=detail_depth)\n      polygon(points=[[-90,-5],[-72,-9],[105,-7],[133,0],[105,7],[-72,9],[-90,5]]);\n  }}\n}}\nconcept_airframe();\n'''
    # Adjust free-flight CAD model form comment and feature by identity
    (OUT/(m['id']+'.scad')).write_text(scad)
# Contact-sheet SVG, 4 columns x 2 rows; each cell is native vector geometry.
W,H=1280,680
cells=[]
for i,m in enumerate(models):
    x=20+(i%4)*315; y=20+(i//4)*330
    cells.append(f'<g transform="translate({x},{y})"><rect width="300" height="310" rx="18" fill="#f5f7f8" stroke="#dbe1e4"/><g transform="translate(0,12)">{svg(m).replace("<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 320 224\" role=\"img\" aria-label=\""+html.escape(m["name"])+"\">","<g transform=\"scale(.9375)\">").replace('</svg>','</g>')}</g><text x="16" y="264" font-family="Arial,sans-serif" font-size="15" font-weight="700" fill="#18232a">{html.escape(m['name'])}</text><text x="16" y="286" font-family="Arial,sans-serif" font-size="12" fill="#58666f">{html.escape(m['type'])}</text><text x="16" y="301" font-family="Arial,sans-serif" font-size="10" fill="#76838a">Références PDF : pages indicatives 1–10</text></g>')
(OUT/'aperçu-drones.svg').write_text(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}"><rect width="100%" height="100%" fill="#e9eef1"/>{"".join(cells)}</svg>')
# HTML preview grid with original SVGs embedded.
html_cards=[]
for m in models:
    html_cards.append(f'<article><img src="{m["id"]}.svg" alt="{html.escape(m["name"])}"><h2>{html.escape(m["name"])}</h2><p>{html.escape(m["type"])}</p><a href="{m["id"]}.svg">SVG</a> · <a href="{m["id"]}.scad">OpenSCAD</a></article>')
page='''<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>AeroMinD — concepts vectoriels de drones</title><style>*{box-sizing:border-box}body{margin:0;background:#e9eef1;color:#17232b;font:15px/1.5 system-ui,sans-serif}header{padding:28px max(24px,calc((100vw - 1320px)/2));background:#13232d;color:white}header p{color:#c6d1d6;max-width:900px}main{max-width:1320px;margin:auto;padding:28px;display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:18px}article{padding:12px;background:white;border:1px solid #d6dfe3;border-radius:16px;box-shadow:0 6px 20px #182b3410}img{width:100%;height:200px;object-fit:contain;background:#f4f6f7;border-radius:10px}h2{font-size:17px;margin:12px 0 2px}p{margin:0 0 8px;color:#63717a}a{color:#126481}</style><header><h1>Bibliothèque vectorielle — concepts de drones</h1><p>Huit silhouettes 2D stylisées, reconstruites depuis les images du PDF. Chaque tuile est une illustration SVG indépendante et est accompagnée d’une source OpenSCAD paramétrique conceptuelle. Les géométries ne sont pas dimensionnées pour fabrication.</p></header><main>''' + ''.join(html_cards) + '</main></html>'
(OUT/'index.html').write_text(page)
(OUT/'manifest.json').write_text(json.dumps([{'id':m['id'],'name':m['name'],'type':m['type'],'svg':m['id']+'.svg','cad':m['id']+'.scad'} for m in models],ensure_ascii=False,indent=2))
print('Generated',len(models),'SVG + SCAD assets at',OUT)
