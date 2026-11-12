// Delta gris à hélice arrière — modèle conceptuel paramétrique reconstitué depuis une vue 2D.
// P3-02 fix — materials reference (indicative, not certified):
//   shell: carbon-fiber composite (density ~1600 kg/m3, modulus ~70 GPa)
//   spars: carbon-fiber tube (density ~1600 kg/m3, modulus ~230 GPa)
//   rotors: glass-filled nylon (density ~1300 kg/m3)
//   electronics housing: ABS (density ~1050 kg/m3)
// Values are indicative for mass estimation only — NOT for FEA or flight certification.
// Unités : millimètres. span_mm approxime l'envergure; épaisseur et détail restent modifiables.
// Toutes les cotes sont indicatives, non relevées sur plan industriel.
$fn=48; span_mm=700; thickness_mm=11; scale_factor=span_mm/700;
module wing() { linear_extrude(height=thickness_mm,center=true,convexity=8) polygon(points=[[165,0], [-8,42], [-135,345], [-160,345], [-138,20], [-146,-345], [-120,-345], [-3,-42]]); }
module fuselage() { hull() { translate([158,0,1.7]) scale([1,2,10]) sphere(r=1,$fn=32);
translate([112,0,1.7]) scale([1,13,20]) sphere(r=1,$fn=32);
translate([40,0,1.7]) scale([1,17,23]) sphere(r=1,$fn=32);
translate([-60,0,1.7]) scale([1,14,18]) sphere(r=1,$fn=32);
translate([-140,0,1.7]) scale([1,8,13]) sphere(r=1,$fn=32) } }
module airframe() { scale([scale_factor,scale_factor,scale_factor]) union() { wing(); fuselage(); for (s=[-1,1]) translate([-140,s*342,18]) rotate([0,90,0]) linear_extrude(height=16,center=true) polygon([[-20,0],[0,46],[20,40],[12,0]]);  translate([-163,0,2]) rotate([0,90,0]) cylinder(h=18,r=13,center=true); translate([-166,0,2]) for(a=[0:180:180]) rotate([a,0,0]) translate([0,31,0]) cube([4,47,5],center=true); for(s=[-1,1]) for(x=[12,-55]) translate([x,s*168,6]) linear_extrude(height=1) offset(r=2) square([42,18],center=true); } }
airframe();
