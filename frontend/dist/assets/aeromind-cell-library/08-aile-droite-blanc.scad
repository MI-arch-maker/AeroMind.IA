// Cellule à ailes droites · variante non armée — modèle conceptuel paramétrique reconstitué depuis une vue 2D.
// P3-02 fix — materials reference (indicative, not certified):
//   shell: carbon-fiber composite (density ~1600 kg/m3, modulus ~70 GPa)
//   spars: carbon-fiber tube (density ~1600 kg/m3, modulus ~230 GPa)
//   rotors: glass-filled nylon (density ~1300 kg/m3)
//   electronics housing: ABS (density ~1050 kg/m3)
// Values are indicative for mass estimation only — NOT for FEA or flight certification.
// Unités : millimètres. span_mm approxime l'envergure; épaisseur et détail restent modifiables.
// Toutes les cotes sont indicatives, non relevées sur plan industriel.
$fn=48; span_mm=760; thickness_mm=11; scale_factor=span_mm/760;
module wing() { linear_extrude(height=thickness_mm,center=true,convexity=8) polygon(points=[[178,0], [45,52], [-20,380], [-55,380], [-100,30], [-132,-380], [-94,-380], [-12,-50]]); }
module fuselage() { hull() { translate([185,0,1.7]) scale([1,2,9]) sphere(r=1,$fn=32);
translate([135,0,1.7]) scale([1,14,20]) sphere(r=1,$fn=32);
translate([50,0,1.7]) scale([1,19,24]) sphere(r=1,$fn=32);
translate([-60,0,1.7]) scale([1,17,20]) sphere(r=1,$fn=32);
translate([-150,0,1.7]) scale([1,9,14]) sphere(r=1,$fn=32) } }
module airframe() { scale([scale_factor,scale_factor,scale_factor]) union() { wing(); fuselage(); for(s=[-1,1]) translate([-165,s*105,0]) rotate([s*25,0,0]) linear_extrude(height=8,center=true) polygon([[-35,0],[-3,0],[23,60],[5,67]]); translate([-170,0,0]) linear_extrude(height=5,center=true) polygon([[-185,-115],[-155,-120],[-128,0],[-155,120],[-185,115]]);  for(s=[-1,1]) { hull() { translate([16,s*54,-5]) sphere(r=3); translate([0,s*82,-27]) sphere(r=3); } translate([0,s*82,-31]) rotate([90,0,0]) difference() { cylinder(h=8,r=12,center=true,$fn=32); cylinder(h=10,r=4,center=true,$fn=24); } } for(s=[-1,1]) for(x=[12,-55]) translate([x,s*182,6]) linear_extrude(height=1) offset(r=2) square([42,18],center=true); } }
airframe();
