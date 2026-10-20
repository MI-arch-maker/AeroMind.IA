from pathlib import Path
import ast, html, json, math
OUT=Path(__file__).parent
# Read only the declarative aircraft data, without rerunning mesh generation.
source=(OUT/'generate_cad.py').read_text()
tree=ast.parse(source)
D=None
for node in tree.body:
    if isinstance(node,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='D' for t in node.targets):
        D=[{kw.arg:ast.literal_eval(kw.value) for kw in item.keywords} for item in node.value.elts]; break
if D is None: raise RuntimeError('Could not load parametric aircraft profiles')

W,H=780,382

def path_pts(points, sx, sy, cx, cy):
    return ' '.join(f'{cx+y*sx:.1f},{cy-x*sy:.1f}' for x,y in points)

def draw(d):
    # Make each object fit the same engineering drawing frame, keeping plan proportions.
    xs=[p[0] for p in d['wing']]; ys=[p[1] for p in d['wing']]
    sx=min(335/max(abs(y) for y in ys), 1.0)
    sy=min(0.50, 235/(max(xs)-min(xs)))
    cx,cy=390,184
    wing=path_pts(d['wing'],sx,sy,cx,cy)
    left=[(x,-y) for x,y in d['wing']]
    # Loft-like orthographic fuselage silhouette derived from CAD station widths.
    st=d['fus']
    side_a=[(cx+y*sx*.72,cy-x*sy) for x,y,h in st]
    side_b=[(cx-y*sx*.72,cy-x*sy) for x,y,h in reversed(st)]
    fus='M '+' L '.join(f'{x:.1f},{y:.1f}' for x,y in side_a+side_b)+' Z'
    def p(x,y): return (cx+y*sx,cy-x*sy)
    # Main shape and thin technical surface lines clipped to the airframe footprint.
    lines=[]
    for frac in [.18,.38,.60,.78]:
        y=max(abs(a[1]) for a in d['wing'])*frac
        # chord-like rays from forward/high swept edge to trailing edge
        a=p(-35,y); b=p(110,y*.25)
        c=p(-35,-y); e=p(110,-y*.25)
        lines += [f'<path d="M{a[0]:.1f},{a[1]:.1f} L{b[0]:.1f},{b[1]:.1f}" class="surface"/>',f'<path d="M{c[0]:.1f},{c[1]:.1f} L{e[0]:.1f},{e[1]:.1f}" class="surface"/>']
    # Panel outlines as deliberately simplified technical access hatches.
    for x in [28,-46]:
        for side in [-1,1]:
            y=side*d['span']*.23
            ax,ay=p(x,y); bx,by=p(x-23,y+side*10)
            lines.append(f'<path d="M{ax:.1f},{ay:.1f} l{(bx-ax):.1f},{(by-ay):.1f} l-2,12 l-28,0 z" class="panel"/>')
    # centerline and nose/canopy geometry
    nose=p(max(xs),0); tail=p(min(xs),0)
    canopy_top=p(105,0); canopy_bot=p(24,0)
    mid=p(0,0)
    rotor_markup=[]
    for x,y in d.get('lift_rotors',[]):
        rx,ry=p(x,y); rotor_markup.append(f'<g transform="translate({rx:.1f} {ry:.1f})"><circle r="18" class="rotorGlow"/><circle r="13" class="rotor"/><path d="M-10 0 H10 M0-10 V10" class="thin"/></g>')
    for x,y in d.get('duct_rotors',[]):
        rx,ry=p(x,y); rotor_markup.append(f'<g transform="translate({rx:.1f} {ry:.1f})"><circle r="21" class="duct"/><circle r="14" class="rotor"/><path d="M-10 0 H10 M0-10 V10" class="thin"/></g>')
    engine=''
    if d.get('pusher'):
        tx,ty=p(min(xs)+5,0); engine=f'<g transform="translate({tx:.1f} {ty:.1f})"><circle r="13" class="motor"/><circle r="4" class="hub"/><path d="M-5 -19 Q0 -5 5 -3 Q12 -1 18 1 M5 19 Q0 5 -5 3 Q-12 1 -18 -1" class="prop"/></g>'
    elif not d.get('lift_rotors') and not d.get('duct_rotors'):
        tx,ty=p(min(xs)+22,0); engine=f'<g transform="translate({tx:.1f} {ty:.1f})"><circle r="9" class="motor"/><path d="M-20 0 Q0 -5 20 0 M-20 0 Q0 5 20 0" class="prop"/></g>'
    # Tail shape and tiny actuator marks
    tailbits=[]
    if d.get('tail')=='v':
        for side in [-1,1]:
            a=p(-155,side*18); b=p(-205,side*92)
            tailbits.append(f'<path d="M{a[0]:.1f},{a[1]:.1f} L{b[0]:.1f},{b[1]:.1f}" class="control"/>')
    if d.get('tail')=='wingtip':
        for side in [-1,1]:
            a=p(-140,side*d['span']*.42); b=p(-162,side*d['span']*.48)
            tailbits.append(f'<path d="M{a[0]:.1f},{a[1]:.1f} L{b[0]:.1f},{b[1]:.1f}" class="control"/>')
    # Dimension line uses the model's conceptual span and is explicitly marked as such.
    half=max(abs(y) for y in ys)*sx
    ydim=334
    metadata=f"{d['type'].upper()} · ENVERGURE CONCEPT {d['span']/1000:.2f} M"
    svg=f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="{html.escape(d['name'])} — vue en plan technique">\n<defs><linearGradient id="wing" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#b5fff0"/><stop offset=".48" stop-color="#3dc5bb"/><stop offset="1" stop-color="#123f4a"/></linearGradient><linearGradient id="fuse" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#a7fff0"/><stop offset=".48" stop-color="#2da69f"/><stop offset="1" stop-color="#d9fff8"/></linearGradient><filter id="glow" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter><radialGradient id="bg"><stop stop-color="#102f35"/><stop offset="1" stop-color="#06141a"/></radialGradient></defs>
<rect width="780" height="382" fill="url(#bg)"/><g fill="none" stroke="#79e8df" stroke-opacity=".13" stroke-width="1"><path d="M84 194 H696 M390 67 V320" stroke-dasharray="4 9"/><circle cx="390" cy="190" r="124" stroke-dasharray="2 9"/></g>
<g font-family="monospace" letter-spacing="1.4"><text x="85" y="48" fill="#9adbd4" font-size="13" font-weight="700">AEROMIND / JUMEAU NUMÉRIQUE</text><text x="690" y="48" fill="#a5ddd6" font-size="12">↻ 0°</text><text x="85" y="359" fill="#8fcfc8" font-size="12" font-weight="700">{html.escape(metadata)}</text></g>
<g filter="url(#glow)"><polygon points="{wing}" fill="url(#wing)" fill-opacity=".9" stroke="#d9fff8" stroke-width="3" stroke-linejoin="round"/><path d="{fus}" fill="url(#fuse)" stroke="#e1fff9" stroke-width="2.6" stroke-linejoin="round"/><path d="M{tail[0]:.1f},{tail[1]:.1f} L{nose[0]:.1f},{nose[1]:.1f}" class="center"/><path d="M{canopy_top[0]:.1f},{canopy_top[1]:.1f} Q{cx+16:.1f},{cy-60:.1f} {canopy_bot[0]:.1f},{canopy_bot[1]:.1f} Q{cx-16:.1f},{cy-60:.1f} {canopy_top[0]:.1f},{canopy_top[1]:.1f} Z" class="cockpit"/><rect x="{mid[0]-7:.1f}" y="{mid[1]+18:.1f}" width="15" height="15" rx="4" class="sensor"/><path d="M{mid[0]-10:.1f},{mid[1]-2:.1f} h20" class="thin"/>{''.join(lines)}{''.join(tailbits)}{''.join(rotor_markup)}{engine}</g>
<g fill="none" stroke="#83ded7" stroke-width="1.4" opacity=".9"><path d="M{cx-half:.1f} {ydim} H{cx+half:.1f}" stroke-dasharray="6 5"/><path d="M{cx-half:.1f} {ydim-8} V{ydim+8} M{cx+half:.1f} {ydim-8} V{ydim+8}"/></g><circle cx="{cx}" cy="{ydim-3}" r="17" fill="#07151b" stroke="#9ff8ee" stroke-width="2"/><circle cx="{cx}" cy="{ydim-3}" r="5" fill="none" stroke="#9ff8ee"/><path d="M{cx-12} {ydim-3} q12 -14 24 0 q-12 14 -24 0" fill="none" stroke="#9ff8ee" stroke-width="1.4"/>
<style>.center{{fill:none;stroke:#dbfff8;stroke-width:1.4;stroke-opacity:.55;stroke-dasharray:9 5}}.cockpit{{fill:#16827f;stroke:#e0fff8;stroke-width:2}}.sensor{{fill:#edbf61;stroke:#fff2c7;stroke-width:1.5}}.thin{{fill:none;stroke:#eafffb;stroke-width:1.2;opacity:.72}}.panel{{fill:none;stroke:#d4fff8;stroke-width:1.4;stroke-opacity:.85}}.surface{{fill:none;stroke:#d3fff7;stroke-width:1.2;stroke-opacity:.62}}.control{{fill:none;stroke:#ecfff9;stroke-width:1.8;stroke-opacity:.82}}.motor{{fill:#0e3f49;stroke:#c8fff4;stroke-width:2}}.hub{{fill:#e3fff9}}.prop{{fill:none;stroke:#c8fff4;stroke-width:2;stroke-linecap:round}}.rotorGlow{{fill:#4be5d3;fill-opacity:.22;stroke:#cffff8;stroke-width:1}}.rotor{{fill:#133e46;stroke:#e1fff8;stroke-width:1.5}}.duct{{fill:#13424b;stroke:#d5fff8;stroke-width:2.5}}</style></svg>'''
    # CSS braces need literal single braces in final SVG after Python interpolation.
    return svg.replace('{{','{').replace('}}','}')

cards=[]; images=[]
for d in D:
    name=d['id']+'-hud.svg'; (OUT/name).write_text(draw(d))
    cards.append({'id':d['id'],'name':d['name'],'view':name,'obj':d['id']+'.obj','stl':d['id']+'.stl','scad':d['id']+'.scad'})
    images.append(f'<article><img src="{d["id"]}-3d.svg" alt="Rendu CAD 3D {html.escape(d["name"])}"><h2>{html.escape(d["name"])}</h2><nav><a href="{d["id"]}-3d.svg">CAD 3D · SVG</a><a href="{name}">HUD · SVG</a><a href="{d["id"]}-3d.png">PNG</a><a href="{d["id"]}.stl">STL</a><a href="{d["id"]}.obj">OBJ</a><a href="{d["id"]}.scad">OpenSCAD</a></nav></article>')
page='''<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>AeroMinD — bibliothèque CAD 3D</title><style>*{box-sizing:border-box}body{margin:0;background:#07151b;color:#c5eee8;font:14px/1.5 system-ui,sans-serif}header{padding:22px max(20px,calc((100vw - 1240px)/2));background:#0b2027;border-bottom:1px solid #1d4a51}header h1{margin:0;font-size:22px;letter-spacing:.04em}header p{margin:7px 0 0;color:#91bcb9;max-width:930px}main{max-width:1240px;margin:auto;padding:20px;display:grid;grid-template-columns:repeat(auto-fit,minmax(360px,1fr));gap:16px}article{overflow:hidden;background:#0b1d23;border:1px solid #1c4148;border-radius:10px;box-shadow:0 6px 22px #0003}img{width:100%;display:block}h2{font-size:15px;margin:10px 14px 5px;color:#d5fff7}nav{display:flex;gap:12px;flex-wrap:wrap;padding:0 14px 14px}a{color:#70ddd3;font:12px monospace;text-decoration:none}a:hover{text-decoration:underline}</style><header><h1>AEROMIND / JUMEAU NUMÉRIQUE</h1><p>Maquettes paramétriques CAO en rendu vectoriel, avec références HUD, OBJ, STL et sources OpenSCAD. Toutes les dimensions sont indicatives et non certifiées.</p></header><main>''' + ''.join(images) + '</main></html>'
(OUT/'index.html').write_text(page)
(OUT/'hud-manifest.json').write_text(json.dumps(cards,ensure_ascii=False,indent=2))
print('Generated HUD SVGs:',len(cards))
