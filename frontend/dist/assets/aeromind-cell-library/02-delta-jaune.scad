// Delta tactique à bande jaune — modèle conceptuel paramétrique reconstitué depuis une vue 2D.
// P3-02 fix — materials reference (indicative, not certified):
//   shell: carbon-fiber composite (density ~1600 kg/m3, modulus ~70 GPa)
//   spars: carbon-fiber tube (density ~1600 kg/m3, modulus ~230 GPa)
//   rotors: glass-filled nylon (density ~1300 kg/m3)
//   electronics housing: ABS (density ~1050 kg/m3)
// Values are indicative for mass estimation only — NOT for FEA or flight certification.
// Unités : millimètres. span_mm approxime l'envergure; épaisseur et détail restent modifiables.
// Toutes les cotes sont indicatives, non relevées sur plan industriel.
$fn=48; span_mm=680; thickness_mm=11; scale_factor=span_mm/680;
module wing() { linear_extrude(height=thickness_mm,center=true,convexity=8) polygon(points=[[175,0], [-18,55], [-62,340], [-105,340], [-95,22], [-125,-340], [-82,-340], [-5,-48]]); }
module fuselage() { hull() { translate([170,0,1.7]) scale([1,2,9]) sphere(r=1,$fn=32);
translate([110,0,1.7]) scale([1,12,18]) sphere(r=1,$fn=32);
translate([15,0,1.7]) scale([1,18,22]) sphere(r=1,$fn=32);
translate([-90,0,1.7]) scale([1,14,18]) sphere(r=1,$fn=32);
translate([-155,0,1.7]) scale([1,7,12]) sphere(r=1,$fn=32) } }
module airframe() { scale([scale_factor,scale_factor,scale_factor]) union() { wing(); fuselage(); for (s=[-1,1]) translate([-140,s*332,18]) rotate([0,90,0]) linear_extrude(height=16,center=true) polygon([[-20,0],[0,46],[20,40],[12,0]]);  for(s=[-1,1]) for(x=[12,-55]) translate([x,s*163,6]) linear_extrude(height=1) offset(r=2) square([42,18],center=true); translate([100,0,6]) cube([10,34,1]); } }
airframe();
