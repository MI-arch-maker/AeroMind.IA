import {describe,it,expect,vi} from "vitest";
import {subscribeToActiveDrone} from "./hardwareControl";

describe("cockpit → LabBench : propagation dédiée de configuration drone",()=>{
 it("met à jour le LabBench sans rechargement après le changement du drone actif",async()=>{
   const values=[{airframe:"quadcopter",motorCount:4,massKg:1.2},{airframe:"vtol",motorCount:6,massKg:5.1}];let index=0;
   const fetcher=vi.fn(async()=>({ok:true,json:async()=>({config:values[Math.min(index++,1)]})} as Response));
   const received:unknown[]=[];const stop=subscribeToActiveDrone("project-restored",value=>received.push(value),fetcher as typeof fetch);
   const waitFor=(predicate:()=>boolean)=>new Promise<void>((resolve,reject)=>{const start=Date.now();const timer=setInterval(()=>{if(predicate()){clearInterval(timer);resolve();}else if(Date.now()-start>1500){clearInterval(timer);reject(new Error("timeout propagation cockpit → LabBench"));}},10);});
   try {
     await waitFor(()=>received.length===1);
     const sender=new BroadcastChannel("aeromind-workspace-sync");sender.postMessage({type:"workspace",payload:{activeProjectId:"project-restored"}});
     await waitFor(()=>received.length===2);sender.close();
     expect(received[0]).toMatchObject({motorCount:4});expect(received[1]).toMatchObject({airframe:"vtol",motorCount:6,massKg:5.1});expect(fetcher).toHaveBeenCalledTimes(2);
   } finally {stop();}
 });
 it("gère un projet restauré sans drone/catalogue par une configuration serveur vide gérée",async()=>{
   const fetcher=vi.fn().mockResolvedValue({ok:false,json:async()=>({})});
   expect(await (await import("./hardwareControl")).loadActiveDrone("project-restored",fetcher as unknown as typeof fetch)).toBeNull();
 });
});
