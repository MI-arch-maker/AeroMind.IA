// Aile delta furtive — modèle conceptuel paramétrique reconstitué depuis une vue 2D.
// Unités : millimètres. span_mm approxime l'envergure; épaisseur et détail restent modifiables.
// Toutes les cotes sont indicatives, non relevées sur plan industriel.
$fn=48; span_mm=720; thickness_mm=11; scale_factor=span_mm/720;
module wing() { linear_extrude(height=thickness_mm,center=true,convexity=8) polygon(points=[[160,0], [-10,38], [-150,350], [-172,350], [-145,20], [-156,-350], [-135,-350], [-4,-42]]); }
module fuselage() { hull() { translate([145,0,1.7]) scale([1,2,8]) sphere(r=1,$fn=32);
translate([110,0,1.7]) scale([1,10,15]) sphere(r=1,$fn=32);
translate([45,0,1.7]) scale([1,15,18]) sphere(r=1,$fn=32);
translate([-40,0,1.7]) scale([1,13,16]) sphere(r=1,$fn=32);
translate([-135,0,1.7]) scale([1,5,9]) sphere(r=1,$fn=32) } }
module airframe() { scale([scale_factor,scale_factor,scale_factor]) union() { wing(); fuselage(); for (s=[-1,1]) translate([-140,s*352,18]) rotate([0,90,0]) linear_extrude(height=16,center=true) polygon([[-20,0],[0,46],[20,40],[12,0]]);  for(s=[-1,1]) for(x=[12,-55]) translate([x,s*173,6]) linear_extrude(height=1) offset(r=2) square([42,18],center=true); } }
airframe();
