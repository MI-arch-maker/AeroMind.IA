export type DroneConfig = Record<string, unknown>;
export function hardwareModeAllowed(flag: boolean, firstConfirmation: boolean, secondConfirmation: boolean) {
  return flag && firstConfirmation && secondConfirmation;
}
export function coordinateInsideGeofence(latitude: number, longitude: number, fence: {minLatitude:number;maxLatitude:number;minLongitude:number;maxLongitude:number}) {
  return Number.isFinite(latitude) && Number.isFinite(longitude) && latitude >= fence.minLatitude && latitude <= fence.maxLatitude && longitude >= fence.minLongitude && longitude <= fence.maxLongitude;
}
export function isEmergencyStop(payload: {disarmed?:boolean;queue_purged?:number}) { return payload.disarmed === true && (payload.queue_purged ?? 0) >= 0; }
export async function loadActiveDrone(projectId: string, fetcher: typeof fetch = fetch): Promise<DroneConfig | null> {
  try {
    const response = await fetcher(`/api/projects/${encodeURIComponent(projectId)}/drone`, {credentials:"include"});
    if (!response.ok) return null;
    const body = await response.json();
    return body?.config && typeof body.config === "object" ? body.config as DroneConfig : null;
  } catch { return null; }
}
export function subscribeToActiveDrone(projectId: string, onConfig: (config: DroneConfig | null) => void, fetcher: typeof fetch = fetch) {
  let stopped=false;
  const refresh=async()=>{const config=await loadActiveDrone(projectId,fetcher);if(!stopped)onConfig(config);};
  void refresh();
  const channel=typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel("aeromind-workspace-sync");
  if(channel) channel.onmessage=(event)=>{if(event.data?.type==="workspace")void refresh();};
  const storageHandler=(event:StorageEvent)=>{if(event.key==="aeromind-blank-workspace-v3")void refresh();};
  if(typeof window!=="undefined")window.addEventListener("storage",storageHandler);
  return ()=>{stopped=true;channel?.close();if(typeof window!=="undefined")window.removeEventListener("storage",storageHandler);};
}
