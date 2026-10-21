// Quadrirotor à conduits annulaires — modèle conceptuel paramétrique reconstitué depuis une vue 2D.
// Unités : millimètres. span_mm approxime l'envergure; épaisseur et détail restent modifiables.
// Toutes les cotes sont indicatives, non relevées sur plan industriel.
$fn=48; span_mm=560; thickness_mm=11; scale_factor=span_mm/560;
module wing() { linear_extrude(height=thickness_mm,center=true,convexity=8) polygon(points=[[100,-120], [110,-150], [-110,-150], [-100,-120], [-100,120], [-110,150], [110,150], [100,120]]); }
module fuselage() { hull() { translate([100,0,1.7]) scale([1,2,12]) sphere(r=1,$fn=32);
translate([65,0,1.7]) scale([1,42,38]) sphere(r=1,$fn=32);
translate([0,0,1.7]) scale([1,55,46]) sphere(r=1,$fn=32);
translate([-65,0,1.7]) scale([1,42,38]) sphere(r=1,$fn=32);
translate([-100,0,1.7]) scale([1,3,14]) sphere(r=1,$fn=32) } }
module airframe() { scale([scale_factor,scale_factor,scale_factor]) union() { wing(); fuselage();  translate([135,-190,0]) { difference() { cylinder(h=24,r=48,center=true,$fn=64); cylinder(h=26,r=36,center=true,$fn=64); } for(a=[0:90:270]) rotate([0,0,a]) translate([21,0,0]) cube([38,5,2],center=true); }
translate([135,190,0]) { difference() { cylinder(h=24,r=48,center=true,$fn=64); cylinder(h=26,r=36,center=true,$fn=64); } for(a=[0:90:270]) rotate([0,0,a]) translate([21,0,0]) cube([38,5,2],center=true); }
translate([-135,-190,0]) { difference() { cylinder(h=24,r=48,center=true,$fn=64); cylinder(h=26,r=36,center=true,$fn=64); } for(a=[0:90:270]) rotate([0,0,a]) translate([21,0,0]) cube([38,5,2],center=true); }
translate([-135,190,0]) { difference() { cylinder(h=24,r=48,center=true,$fn=64); cylinder(h=26,r=36,center=true,$fn=64); } for(a=[0:90:270]) rotate([0,0,a]) translate([21,0,0]) cube([38,5,2],center=true); } translate([135,-190,0]) for(a=[0:90:270]) rotate([0,0,a]) translate([20,0,1]) cube([38,5,2],center=true); translate([135,190,0]) for(a=[0:90:270]) rotate([0,0,a]) translate([20,0,1]) cube([38,5,2],center=true); translate([-135,-190,0]) for(a=[0:90:270]) rotate([0,0,a]) translate([20,0,1]) cube([38,5,2],center=true); translate([-135,190,0]) for(a=[0:90:270]) rotate([0,0,a]) translate([20,0,1]) cube([38,5,2],center=true); for(s=[-1,1]) for(x=[12,-55]) translate([x,s*134,6]) linear_extrude(height=1) offset(r=2) square([42,18],center=true); } }
airframe();
