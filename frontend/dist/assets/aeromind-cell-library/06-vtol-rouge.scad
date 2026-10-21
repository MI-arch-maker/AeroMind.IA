// VTOL hybride rouge — modèle conceptuel paramétrique reconstitué depuis une vue 2D.
// Unités : millimètres. span_mm approxime l'envergure; épaisseur et détail restent modifiables.
// Toutes les cotes sont indicatives, non relevées sur plan industriel.
$fn=48; span_mm=820; thickness_mm=11; scale_factor=span_mm/820;
module wing() { linear_extrude(height=thickness_mm,center=true,convexity=8) polygon(points=[[170,0], [15,48], [-45,400], [-76,400], [-95,26], [-126,-400], [-94,-400], [-12,-48]]); }
module fuselage() { hull() { translate([175,0,1.7]) scale([1,2,9]) sphere(r=1,$fn=32);
translate([125,0,1.7]) scale([1,12,18]) sphere(r=1,$fn=32);
translate([40,0,1.7]) scale([1,18,22]) sphere(r=1,$fn=32);
translate([-65,0,1.7]) scale([1,15,19]) sphere(r=1,$fn=32);
translate([-155,0,1.7]) scale([1,8,13]) sphere(r=1,$fn=32) } }
module airframe() { scale([scale_factor,scale_factor,scale_factor]) union() { wing(); fuselage(); for(s=[-1,1]) translate([-156,0,0]) rotate([s*28,0,0]) linear_extrude(height=8,center=true) polygon([[-38,0],[-4,0],[24,57],[4,62]]); translate([-5,-285,28]) { cylinder(h=5,r=4,center=true,$fn=24); for(a=[0:120:240]) rotate([0,0,a]) translate([31,0,0]) cube([54,7,2],center=true); }
translate([-5,285,28]) { cylinder(h=5,r=4,center=true,$fn=24); for(a=[0:120:240]) rotate([0,0,a]) translate([31,0,0]) cube([54,7,2],center=true); }
translate([-15,-360,28]) { cylinder(h=5,r=4,center=true,$fn=24); for(a=[0:120:240]) rotate([0,0,a]) translate([31,0,0]) cube([54,7,2],center=true); }
translate([-15,360,28]) { cylinder(h=5,r=4,center=true,$fn=24); for(a=[0:120:240]) rotate([0,0,a]) translate([31,0,0]) cube([54,7,2],center=true); } translate([-163,0,2]) rotate([0,90,0]) cylinder(h=18,r=13,center=true); translate([-166,0,2]) for(a=[0:180:180]) rotate([a,0,0]) translate([0,31,0]) cube([4,47,5],center=true); translate([-5,-285,18]) cylinder(h=22,r=12,center=true); translate([-5,285,18]) cylinder(h=22,r=12,center=true); translate([-15,-360,18]) cylinder(h=22,r=12,center=true); translate([-15,360,18]) cylinder(h=22,r=12,center=true); for(s=[-1,1]) { hull() { translate([16,s*54,-5]) sphere(r=3); translate([0,s*82,-27]) sphere(r=3); } translate([0,s*82,-31]) rotate([90,0,0]) difference() { cylinder(h=8,r=12,center=true,$fn=32); cylinder(h=10,r=4,center=true,$fn=24); } } } }
airframe();
