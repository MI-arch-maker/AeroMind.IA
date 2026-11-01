// Drone MALE à empennage en V — modèle conceptuel paramétrique reconstitué depuis une vue 2D.
// P3-02 fix — materials reference (indicative, not certified):
//   shell: carbon-fiber composite (density ~1600 kg/m3, modulus ~70 GPa)
//   spars: carbon-fiber tube (density ~1600 kg/m3, modulus ~230 GPa)
//   rotors: glass-filled nylon (density ~1300 kg/m3)
//   electronics housing: ABS (density ~1050 kg/m3)
// Values are indicative for mass estimation only — NOT for FEA or flight certification.
// Unités : millimètres. span_mm approxime l'envergure; épaisseur et détail restent modifiables.
// Toutes les cotes sont indicatives, non relevées sur plan industriel.
$fn=48; span_mm=860; thickness_mm=11; scale_factor=span_mm/860;
module wing() { linear_extrude(height=thickness_mm,center=true,convexity=8) polygon(points=[[125,0], [15,55], [-45,430], [-78,430], [-95,30], [-130,-430], [-96,-430], [-12,-55]]); }
module fuselage() { hull() { translate([165,0,1.7]) scale([1,1,8]) sphere(r=1,$fn=32);
translate([125,0,1.7]) scale([1,13,18]) sphere(r=1,$fn=32);
translate([50,0,1.7]) scale([1,18,23]) sphere(r=1,$fn=32);
translate([-60,0,1.7]) scale([1,15,20]) sphere(r=1,$fn=32);
translate([-155,0,1.7]) scale([1,9,13]) sphere(r=1,$fn=32) } }
module airframe() { scale([scale_factor,scale_factor,scale_factor]) union() { wing(); fuselage(); for(s=[-1,1]) translate([-156,0,0]) rotate([s*28,0,0]) linear_extrude(height=8,center=true) polygon([[-38,0],[-4,0],[24,57],[4,62]]);  translate([-163,0,2]) rotate([0,90,0]) cylinder(h=18,r=13,center=true); translate([-166,0,2]) for(a=[0:180:180]) rotate([a,0,0]) translate([0,31,0]) cube([4,47,5],center=true); for(s=[-1,1]) { hull() { translate([16,s*54,-5]) sphere(r=3); translate([0,s*82,-27]) sphere(r=3); } translate([0,s*82,-31]) rotate([90,0,0]) difference() { cylinder(h=8,r=12,center=true,$fn=32); cylinder(h=10,r=4,center=true,$fn=24); } } for(s=[-1,1]) for(x=[12,-55]) translate([x,s*206,6]) linear_extrude(height=1) offset(r=2) square([42,18],center=true); } }
airframe();
