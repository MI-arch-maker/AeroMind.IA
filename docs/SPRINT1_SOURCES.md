# Références techniques vérifiées — 15 novembre 2026

Le lecteur XDE `STEPCAFControl_Reader` traduit les assemblages, noms, matériaux et données GD&T prises en charge. Open CASCADE précise que certaines parties d’AP242 sont supportées, pas la totalité du protocole. Un import réussi ne constitue donc pas une preuve de fidélité complète à tous les profils AP242. [1]

Le calcul des volumes et centres est effectué sur les surfaces et solides B-Rep par les propriétés intégrales OCCT ; la triangulation est réservée à la visualisation. Les coordonnées de faces doivent appliquer la transformation de localisation et inverser l’ordre des triangles pour les faces d’orientation inversée. [2]

La densité nominale du Ti-6Al-4V retenue est 4430 kg/m³, selon la fiche Kyocera SGS. [3] La fiche TIMET indique 4420 kg/m³ à 22 °C ; cette différence souligne que la masse calculée n’est pas une métrologie de lot. [4] La densité nominale d’aluminium 7075 est 2810 kg/m³ d’après la fiche Smiths Metal. [5] La référence CFRP de 1600 kg/m³ correspond à une matrice époxy, fibres tissées 0/90°, fraction volumique de fibres de 50 %, à sec et à température ambiante. Elle n’est pas universelle pour tous les composites. [6]

Les paramètres PBR de roughness, metalness, anisotropie et trame sont des paramètres nominaux de rendu. Aucune mesure BRDF, spectrale, HDR photométrique, ou calibration écran ne figure dans l’archive. Il est interdit de qualifier ce rendu de calibration optique mesurée. Les tolérances d’annotation en micromètres sont des valeurs de spécification ; elles ne démontrent pas une exactitude géométrique ou une mesure physique au micron.

## References

[1]: https://github.com/Open-Cascade-SAS/OCCT/wiki/step "Documentation Open CASCADE STEP et XDE"
[2]: https://cadquery.readthedocs.io/en/stable/_modules/cadquery/occ_impl/shapes.html "Source CadQuery : opérations B-Rep, triangulation et orientation"
[3]: https://kyocera-sgstool.co.uk/titanium-resources/titanium-information-everything-you-need-to-know/ti-6al-4v-grade-5-titanium-alloy-data-sheet/ "Kyocera SGS : Ti-6Al-4V Grade 5"
[4]: https://www.timet.com/documents/datasheets/alpha-and-beta-alloys/timetal-6-4.pdf "TIMET : TIMETAL 6-4, densité à 22 degrés Celsius"
[5]: https://www.smithmetal.com/pdf/aluminium/7xxx/7075.pdf "Smiths Metal : fiche aluminium 7075"
[6]: https://www.performance-composites.com/carbonfibre/mechanicalproperties_2.asp "Performance Composites : carbone époxy tissé, données nominales"
