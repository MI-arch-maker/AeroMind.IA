import {describe,it,expect,vi,afterEach} from "vitest";
import {coordinateInsideGeofence,hardwareModeAllowed,isEmergencyStop,loadActiveDrone} from "./hardwareControl";
const fence={minLatitude:45,maxLatitude:46,minLongitude:-74,maxLongitude:-73};
afterEach(()=>vi.unstubAllGlobals());
describe("contrôles matériels — garde-fous frontend",()=>{
 it("refuse le mode matériel si le flag serveur est désactivé",()=>expect(hardwareModeAllowed(false,true,true)).toBe(false));
 it("refuse l’armement visuel sans deux confirmations distinctes",()=>expect(hardwareModeAllowed(true,true,false)).toBe(false));
 it("refuse HARDWARE même avec flag et confirmations",()=>expect(hardwareModeAllowed(true,true,true)).toBe(false));
 it("reconnaît les limites geofence et rejette une position extérieure",()=>{expect(coordinateInsideGeofence(45.5,-73.5,fence)).toBe(true);expect(coordinateInsideGeofence(48,-73.5,fence)).toBe(false);});
 it("accepte un reçu d’arrêt d’urgence sans confirmation utilisateur",()=>expect(isEmergencyStop({disarmed:true,queue_purged:2})).toBe(true));
 it("récupère la configuration du drone depuis l’API serveur",async()=>{const f=vi.fn().mockResolvedValue({ok:true,json:async()=>({config:{airframe:"quadcopter",motorCount:8}})});expect(await loadActiveDrone("project-restored",f as unknown as typeof fetch)).toEqual({airframe:"quadcopter",motorCount:8});});
});
