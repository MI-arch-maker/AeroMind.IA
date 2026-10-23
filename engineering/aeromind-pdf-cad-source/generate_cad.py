from pathlib import Path
import json, math
import numpy as np
import trimesh
from shapely.geometry import Polygon
from matplotlib import pyplot as plt
from mpl_toolkits.mplot3d.art3d import Poly3DCollection

OUT=Path(__file__).parent
# Dimensions are illustrative millimetres, scaled to the user's PDF proportions; nose is +X.
D=[
 dict(id='01-aile-delta-noire', name='Aile delta furtive', type='Aile volante furtive', span=720, chord=330, color='#303943', accent='#d5dce0', wing=[(160,0),(-10,38),(-150,350),(-172,350),(-145,20),(-156,-350),(-135,-350),(-4,-42)], fus=[(145,2,8), (110,10,15),(45,15,18),(-40,13,16),(-135,5,9)], fins=[(-132,334,-20),(-132,-334,-20)], tail='wingtip', hatch=True),
 dict(id='02-delta-jaune', name='Delta tactique à bande jaune', type='Aile delta tactique', span=680, chord=360, color='#50565b', accent='#f4c62e', wing=[(175,0),(-18,55),(-62,340),(-105,340),(-95,22),(-125,-340),(-82,-340),(-5,-48)], fus=[(170,2,9),(110,12,18),(15,18,22),(-90,14,18),(-155,7,12)], fins=[(-112,300,-24),(-112,-300,-24)], tail='wingtip', hatch=True, band=True),
 dict(id='03-delta-prop-gris', name='Delta gris à hélice arrière', type='Aile volante propulsive', span=700, chord=350, color='#aeb9c0', accent='#596771', wing=[(165,0),(-8,42),(-135,345),(-160,345),(-138,20),(-146,-345),(-120,-345),(-3,-42)], fus=[(158,2,10),(112,13,20),(40,17,23),(-60,14,18),(-140,8,13)], fins=[(-128,328,-22),(-128,-328,-22)], tail='wingtip', pusher=True, hatch=True),
 dict(id='04-maq9', name='Drone MALE à empennage en V', type='Voilure fixe MALE', span=860, chord=270, color='#a8b9c2', accent='#596b75', wing=[(125,0),(15,55),(-45,430),(-78,430),(-95,30),(-130,-430),(-96,-430),(-12,-55)], fus=[(165,1,8),(125,13,18),(50,18,23),(-60,15,20),(-155,9,13)], tail='v', pusher=True, gear=True, hatch=True),
 dict(id='05-delta-prop-arriere', name='Aile volante argent à propulseur', type='Aile volante à pointe épaisse', span=740, chord=375, color='#c0c8cc', accent='#64727a', wing=[(185,0),(-8,40),(-130,360),(-156,360),(-148,28),(-175,-360),(-145,-360),(-5,-40)], fus=[(175,2,9),(118,12,18),(30,17,22),(-70,15,20),(-155,8,13)], fins=[(-140,340,-22),(-140,-340,-22)], tail='wingtip', pusher=True, hatch=True),
 dict(id='06-vtol-rouge', name='VTOL hybride rouge', type='Aile fixe à quatre rotors de sustentation', span=820, chord=300, color='#a82933', accent='#2c343b', wing=[(170,0),(15,48),(-45,400),(-76,400),(-95,26),(-126,-400),(-94,-400),(-12,-48)], fus=[(175,2,9),(125,12,18),(40,18,22),(-65,15,19),(-155,8,13)], tail='v', lift_rotors=[(-5,-285),(-5,285),(-15,-360),(-15,360)], pusher=True, gear=True),
 dict(id='07-quad-duct', name='Quadrirotor à conduits annulaires', type='VTOL quadrirotor à hélices carénées', span=560, chord=340, color='#69786f', accent='#aebbb2', wing=[(100,-120),(110,-150),(-110,-150),(-100,-120),(-100,120),(-110,150),(110,150),(100,120)], fus=[(100,2,12),(65,42,38),(0,55,46),(-65,42,38),(-100,3,14)], duct_rotors=[(135,-190),(135,190),(-135,-190),(-135,190)], hatch=True),
 dict(id='08-attaque-blanc', name='Cellule à ailes droites · variante non armée', type='Voilure fixe à double dérive · maquette sans charge offensive', span=760, chord=290, color='#d2d5d4', accent='#63717a', wing=[(178,0),(45,52),(-20,380),(-55,380),(-100,30),(-132,-380),(-94,-380),(-12,-50)], fus=[(185,2,9),(135,14,20),(50,19,24),(-60,17,20),(-150,9,14)], tail='twinfin', pusher=False, gear=True, hatch=True)
]

def mesh_poly_extrude(points, z0, z1, name, color):
    poly=Polygon(points)
    if not poly.is_valid: poly=poly.buffer(0)
    m=trimesh.creation.extrude_polygon(poly, height=z1-z0, engine='earcut')
    m.apply_translation([0,0,z0]); m.metadata['name']=name; m.visual.face_colors=trimesh.visual.color.hex_to_rgba(color)
    return m

def body_mesh(stations, color):
    # Stations [x, half-width, half-height], smoothly closed loft with rounded section rings.
    ring_n=32; verts=[]; faces=[]
    for x,w,h in stations:
        for k in range(ring_n):
            a=2*math.pi*k/ring_n
            verts.append([x,w*math.sin(a),1.7+h*math.cos(a)])
    for j in range(len(stations)-1):
        for k in range(ring_n):
            a=j*ring_n+k; b=j*ring_n+(k+1)%ring_n
            c=(j+1)*ring_n+(k+1)%ring_n; d=(j+1)*ring_n+k
            faces.extend([[a,b,c],[a,c,d]])
    # Rounded nose/tail caps as triangle fans.
    verts += [[stations[0][0],0,1.7],[stations[-1][0],0,1.7]]
    ci=len(verts)-2; cj=len(verts)-1
    for k in range(ring_n):
        faces.append([ci,(k+1)%ring_n,k])
        base=(len(stations)-1)*ring_n
        faces.append([cj,base+k,base+(k+1)%ring_n])
    m=trimesh.Trimesh(vertices=verts,faces=faces,process=True); m.metadata['name']='fuselage'; m.visual.face_colors=trimesh.visual.color.hex_to_rgba(color)
    return m

def fin_mesh(coords, y0, y1, color, name):
    # Profile in x/z extruded through thickness along Y.
    p=mesh_poly_extrude(coords,0,y1-y0,name,color)
    # local x,y,z -> world x,z,y (negative y-depth direction)
    T=np.array([[1,0,0,0],[0,0,-1,0],[0,1,0,0],[0,0,0,1]],float)
    p.apply_transform(T); p.apply_translation([0,y1,0]); return p

def cylinder_between(a,b,r,color,name,sections=24):
    a=np.array(a,float); b=np.array(b,float); v=b-a
    m=trimesh.creation.cylinder(radius=r,height=np.linalg.norm(v),sections=sections)
    m.apply_transform(trimesh.geometry.align_vectors([0,0,1],v)); m.apply_translation((a+b)/2)
    m.metadata['name']=name; m.visual.face_colors=trimesh.visual.color.hex_to_rgba(color); return m

def add_hatch(parts,x,y,length,width,color):
    p=trimesh.creation.box(extents=[length,width,1.2]); p.apply_translation([x,y,8]); p.visual.face_colors=trimesh.visual.color.hex_to_rgba(color); p.metadata['name']='access panel'; parts.append(p)

def make_model(d):
    parts=[]; dark='#29353d'; bright=d['accent']
    parts.append(mesh_poly_extrude(d['wing'],-5,6,'main wing',d['color']))
    parts.append(body_mesh(d['fus'],d['accent']))
    # Low-profile cockpit / sensor blister on forward fuselage.
    canopy=trimesh.creation.icosphere(subdivisions=2,radius=1)
    canopy.apply_scale([34,10,5]); canopy.apply_translation([82,0,20]); canopy.visual.face_colors=trimesh.visual.color.hex_to_rgba('#344b59'); canopy.metadata['name']='sensor canopy'; parts.append(canopy)
    tail=d.get('tail')
    if tail=='wingtip':
        for side in [-1,1]:
            parts.append(fin_mesh([(-154,5),(-132,55),(-110,48),(-135,7)],side*344-3,side*344+3,d['color'],'wingtip fin'))
    elif tail=='v':
        parts.append(fin_mesh([(-143,5),(-205,67),(-184,73),(-120,13)],-4,4,d['color'],'V-tail left'))
        parts.append(fin_mesh([(-143,5),(-205,67),(-184,73),(-120,13)],-4,4,d['color'],'V-tail right'))
        parts[-1].apply_scale([1,-1,1])
    elif tail=='twinfin':
        for side in [-1,1]: parts.append(fin_mesh([(-152,5),(-205,64),(-183,70),(-130,12)],side*102-4,side*102+4,d['color'],'twin vertical tail'))
        parts.append(mesh_poly_extrude([(-185,-115),(-155,-120),(-128,0),(-155,120),(-185,115)],-2,3,'horizontal tailplane',d['accent']))
    if tail=='wingtip':
        for side in [-1,1]:
            parts.append(mesh_poly_extrude([(-145,side*240),(-182,side*255),(-205,side*280),(-165,side*270)],-3,3,'outer elevon',bright))
    # Distinct pusher propeller at tail; propeller blades are separate solids.
    if d.get('pusher'):
        parts.append(cylinder_between([-154,0,2],[-168,0,2],14,dark,'pusher motor'))
        for angle in [0,math.pi]:
            pts=[]
            for rr,ww in [(14,5),(54,11),(60,6),(30,2)]:
                aa=angle+(ww/rr if rr else 0); pts.append((-168+rr*math.cos(aa),ww*math.sin(aa)))
            blade=mesh_poly_extrude(pts,-1,1,'propeller blade',dark); parts.append(blade)
    if d.get('lift_rotors'):
        for x,y in d['lift_rotors']:
            # Compact lift nacelles on pylons and 3-blade rotors.
            parts.append(cylinder_between([x,y,6],[x,y,28],13,dark,'lift nacelle'))
            parts.append(cylinder_between([x,y,25],[x,y,32],4,'#c9cdd0','rotor hub'))
            for a in [0,2*math.pi/3,4*math.pi/3]:
                blade=mesh_poly_extrude([(x+9*math.cos(a),y+9*math.sin(a)),(x+57*math.cos(a+.10),y+57*math.sin(a+.10)),(x+63*math.cos(a+.17),y+63*math.sin(a+.17)),(x+17*math.cos(a+.18),y+17*math.sin(a+.18))],28,30,'lift rotor blade',dark); parts.append(blade)
    if d.get('duct_rotors'):
        for x,y in d['duct_rotors']:
            ring=trimesh.creation.annulus(r_min=36,r_max=48,height=24,sections=48)
            ring.apply_translation([x,y,0]); ring.visual.face_colors=trimesh.visual.color.hex_to_rgba(dark); ring.metadata['name']='annular rotor duct'; parts.append(ring)
            parts.append(cylinder_between([x,y,-8],[x,y,9],10,d['accent'],'fan hub'))
            for a in [0,math.pi/2,math.pi,3*math.pi/2]:
                blade=mesh_poly_extrude([(x+9*math.cos(a),y+9*math.sin(a)),(x+31*math.cos(a+.16),y+31*math.sin(a+.16)),(x+33*math.cos(a+.22),y+33*math.sin(a+.22)),(x+14*math.cos(a+.35),y+14*math.sin(a+.35))],-3,0,'ducted fan blade',d['accent']); parts.append(blade)
            # Short mounting arm between body and duct.
            parts.append(cylinder_between([x*.36,y*.36,0],[x,y,0],7,d['color'],'rotor support arm'))
    if d.get('gear'):
        for y in [-82,82]:
            parts.append(cylinder_between([15,y*.64,-4],[0,y,-30],4,'#303b42','landing gear strut'))
            wheel=trimesh.creation.torus(major_radius=10,minor_radius=4,major_sections=24,minor_sections=8)
            wheel.apply_transform(trimesh.transformations.rotation_matrix(math.pi/2,[1,0,0])); wheel.apply_translation([0,y,-33]); wheel.visual.face_colors=trimesh.visual.color.hex_to_rgba('#20282c'); wheel.metadata['name']='landing wheel'; parts.append(wheel)
    if d.get('hatch'):
        for y in [-d['span']*.24,d['span']*.24]:
            for x in [10,-55]: add_hatch(parts,x,y,48,25,dark)
    if d.get('band'):
        band=mesh_poly_extrude([(105,-16),(96,-16),(96,16),(105,16)],-6,7,'high-visibility stripe',bright); parts.append(band)
    if d.get('stores'):
        # Twin underwing pylons and cylindrical external stores.
        for y in [-170,170]:
            parts.append(cylinder_between([5,y,0],[-5,y,-18],5,dark,'hardpoint pylon'))
            parts.append(cylinder_between([-8,y,-20],[-100,y,-20],8,'#515d64','external payload pod'))
    # Independent coherent scene, with named components retained in OBJ.
    scene=trimesh.Scene()
    for i,p in enumerate(parts):
        scene.add_geometry(p,geom_name=f'{i:02d}_{p.metadata.get("name","component").replace(" ","_")}',node_name=f'{i:02d}')
    return scene,parts

def save_render(d, parts):
    fig=plt.figure(figsize=(6.4,4.2),dpi=160,facecolor='#f2f5f6')
    ax=fig.add_subplot(111,projection='3d',computed_zorder=False); ax.set_facecolor('#f2f5f6')
    for mesh in parts:
        faces=mesh.faces
        if not len(faces): continue
        polys=mesh.vertices[faces]
        rgba=np.asarray(mesh.visual.face_colors[0],dtype=float)/255 if len(mesh.visual.face_colors) else np.array([.45,.5,.55,1])
        # simple directional facet shading for a crisp engineering-CAD appearance
        normals=mesh.face_normals
        light=np.array([-.3,-.55,.78]); light/=np.linalg.norm(light)
        shade=np.clip(.58+.42*np.maximum(0,normals@light),.42,1.0)
        colors=np.column_stack([np.clip(rgba[:3][None,:]*shade[:,None],0,1),np.full(len(shade),.98)])
        poly=Poly3DCollection(polys,facecolors=colors,edgecolors=(.12,.17,.20,.32),linewidths=.18)
        ax.add_collection3d(poly)
    allv=np.vstack([p.vertices for p in parts]); lo=allv.min(axis=0); hi=allv.max(axis=0); center=(lo+hi)/2
    span=max(hi-lo); ax.set_xlim(center[0]-span*.56,center[0]+span*.56); ax.set_ylim(center[1]-span*.56,center[1]+span*.56); ax.set_zlim(min(-span*.12,lo[2]-5),hi[2]+span*.10)
    ax.set_box_aspect((1,1,.42)); ax.view_init(elev=28,azim=-54,roll=0); ax.set_proj_type('ortho')
    ax.set_axis_off(); fig.subplots_adjust(0,0,1,1)
    fig.savefig(OUT/(d['id']+'-3d.svg'),format='svg',facecolor=fig.get_facecolor(),transparent=False,pad_inches=0)
    fig.savefig(OUT/(d['id']+'-3d.png'),format='png',facecolor=fig.get_facecolor(),pad_inches=0)
    plt.close(fig)

def write_scad(d):
    pts=', '.join(f'[{x},{y}]' for x,y in d['wing'])
    fus=';\n'.join(f'translate([{x},0,1.7]) scale([1,{w},{h}]) sphere(r=1,$fn=32)' for x,w,h in d['fus'])
    tail=''
    if d.get('tail')=='wingtip': tail='for (s=[-1,1]) translate([-140,s*'+str(d['span']//2-8)+',18]) rotate([0,90,0]) linear_extrude(height=16,center=true) polygon([[-20,0],[0,46],[20,40],[12,0]]);'
    if d.get('tail')=='v': tail='for(s=[-1,1]) translate([-156,0,0]) rotate([s*28,0,0]) linear_extrude(height=8,center=true) polygon([[-38,0],[-4,0],[24,57],[4,62]]);'
    if d.get('tail')=='twinfin': tail='for(s=[-1,1]) translate([-165,s*105,0]) rotate([s*25,0,0]) linear_extrude(height=8,center=true) polygon([[-35,0],[-3,0],[23,60],[5,67]]);'
    rotors=''
    if d.get('lift_rotors'):
        rotors='\n'.join(f'translate([{x},{y},28]) {{ cylinder(h=5,r=4,center=true,$fn=24); for(a=[0:120:240]) rotate([0,0,a]) translate([31,0,0]) cube([54,7,2],center=true); }}' for x,y in d['lift_rotors'])
    if d.get('duct_rotors'):
        rotors='\n'.join(f'translate([{x},{y},0]) {{ difference() {{ cylinder(h=24,r=48,center=true,$fn=64); cylinder(h=26,r=36,center=true,$fn=64); }} for(a=[0:90:270]) rotate([0,0,a]) translate([21,0,0]) cube([38,5,2],center=true); }}' for x,y in d['duct_rotors'])
    extra=[]
    if d.get('pusher'):
        extra.append('translate([-163,0,2]) rotate([0,90,0]) cylinder(h=18,r=13,center=true); translate([-166,0,2]) for(a=[0:180:180]) rotate([a,0,0]) translate([0,31,0]) cube([4,47,5],center=true);')
    if d.get('lift_rotors'):
        extra.extend(f'translate([{x},{y},18]) cylinder(h=22,r=12,center=true);' for x,y in d['lift_rotors'])
    if d.get('duct_rotors'):
        extra.extend(f'translate([{x},{y},0]) for(a=[0:90:270]) rotate([0,0,a]) translate([20,0,1]) cube([38,5,2],center=true);' for x,y in d['duct_rotors'])
    if d.get('gear'):
        extra.append('for(s=[-1,1]) { hull() { translate([16,s*54,-5]) sphere(r=3); translate([0,s*82,-27]) sphere(r=3); } translate([0,s*82,-31]) rotate([90,0,0]) difference() { cylinder(h=8,r=12,center=true,$fn=32); cylinder(h=10,r=4,center=true,$fn=24); } }')
    if d.get('hatch'):
        extra.append('for(s=[-1,1]) for(x=[12,-55]) translate([x,s*'+str(round(d['span']*.24))+',6]) linear_extrude(height=1) offset(r=2) square([42,18],center=true);')
    if d.get('band'):
        extra.append('translate([100,0,6]) cube([10,34,1]);')
    if d.get('stores'):
        extra.append('for(s=[-1,1]) { translate([0,s*170,-10]) hull() { translate([35,0,0]) sphere(r=7); translate([-75,0,0]) sphere(r=7); } }')
    extra=' '.join(extra)
    code=f'''// {d['name']} — modèle conceptuel paramétrique reconstitué depuis une vue 2D.\n// Unités : millimètres. span_mm approxime l'envergure; épaisseur et détail restent modifiables.\n// Toutes les cotes sont indicatives, non relevées sur plan industriel.\n$fn=48; span_mm={d['span']}; thickness_mm=11; scale_factor=span_mm/{d['span']};\nmodule wing() {{ linear_extrude(height=thickness_mm,center=true,convexity=8) polygon(points=[{pts}]); }}\nmodule fuselage() {{ hull() {{ {fus} }} }}\nmodule airframe() {{ scale([scale_factor,scale_factor,scale_factor]) union() {{ wing(); fuselage(); {tail} {rotors} {extra} }} }}\nairframe();\n'''
    (OUT/(d['id']+'.scad')).write_text(code)

cards=[]; rows=[]
for i,d in enumerate(D,1):
    scene,parts=make_model(d)
    allmesh=trimesh.util.concatenate(parts)
    allmesh.export(OUT/(d['id']+'.stl'))
    scene.export(OUT/(d['id']+'.obj'),file_type='obj')
    save_render(d,parts); write_scad(d)
    checks=[p.is_watertight for p in parts if len(p.faces)]
    cards.append({'id':d['id'],'name':d['name'],'type':d['type'],'span_mm':d['span'],'render':d['id']+'-3d.svg','png':d['id']+'-3d.png','stl':d['id']+'.stl','obj':d['id']+'.obj','scad':d['id']+'.scad','parts':len(parts),'watertight_parts':sum(checks)})
    cards.append
    rows.append(f'''<article><img src="{d['id']}-3d.svg" alt="Rendu 3D {d['name']}"><div class="info"><h2>{d['name']}</h2><p>{d['type']} · envergure de concept {d['span']} mm</p><nav><a href="{d['id']}.stl">STL</a><a href="{d['id']}.obj">OBJ</a><a href="{d['id']}.scad">OpenSCAD paramétrique</a><a href="{d['id']}-3d.svg">Rendu vectoriel</a></nav></div></article>''')
page='''<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>AeroMinD — modèles CAD 3D de drones</title><style>*{box-sizing:border-box}body{margin:0;background:#e9eef1;color:#17232b;font:15px/1.5 system-ui,sans-serif}header{padding:26px max(24px,calc((100vw - 1280px)/2));background:#13232d;color:white}header p{color:#c6d1d6;max-width:980px}main{max-width:1280px;margin:auto;padding:26px;display:grid;grid-template-columns:repeat(auto-fit,minmax(360px,1fr));gap:18px}article{overflow:hidden;background:white;border:1px solid #d6dfe3;border-radius:16px;box-shadow:0 6px 20px #182b3410}img{width:100%;display:block;background:#f2f5f6}.info{padding:14px 17px}h2{font-size:18px;margin:0 0 2px}p{margin:0 0 12px;color:#63717a}nav{display:flex;flex-wrap:wrap;gap:12px}a{color:#126481;font-size:13px;font-weight:650}</style><header><h1>Modèles CAD paramétriques — flotte de drones</h1><p>Huit interprétations 3D distinctes dérivées des références 2D : planform, fuselage lofté, gouvernes, empennages, rotors, trains ou charges selon l’appareil. Chaque appareil inclut un rendu vectoriel en perspective, une source OpenSCAD et des maillages STL/OBJ. Volumes conceptuels, dimensions non vérifiées.</p></header><main>''' + ''.join(rows) + '</main></html>'
(OUT/'index.html').write_text(page)
(OUT/'manifest.json').write_text(json.dumps(cards,ensure_ascii=False,indent=2))
# Contact sheet in vector form using exact SVG model renders placed as images.
from matplotlib import image as mpimg
fig,axs=plt.subplots(2,4,figsize=(16,8),facecolor='#e9eef1')
for ax,d in zip(axs.flat,D):
    ax.imshow(mpimg.imread(OUT/(d['id']+'-3d.png'))); ax.set_title(d['name'],fontsize=10,fontweight='bold',pad=4); ax.axis('off')
fig.tight_layout(pad=1.2); fig.savefig(OUT/'planche-rendus-3d.png',dpi=160,facecolor=fig.get_facecolor()); plt.close(fig)
print('3D generation complete')
for c in cards: print(c['id'], 'components',c['parts'],'watertight',c['watertight_parts'],'/',c['parts'])
