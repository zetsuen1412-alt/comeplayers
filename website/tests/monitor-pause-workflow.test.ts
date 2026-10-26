import assert from "node:assert/strict";
import { test } from "node:test";
import { mobileWorkflow } from "../lib/payrollMobileWorkflow";
import { monitorPauseWorkflow, type MonitorPauseState } from "../lib/monitorPauseWorkflow";
const workflow=()=>mobileWorkflow({externalReference:"X800",operationalStatus:"in_progress",workerAssignments:[{id:"mobile:test"}]} as Parameters<typeof mobileWorkflow>[0],"F001",-100,
 [{order_ref:"X800",employee_code:"F001",chat_id:-100,status:"sent"}],
 [{order_ref:"X800",employee_code:"F001",chat_id:-100,status:"sent",action:"start"}]);
const state:MonitorPauseState={order_ref:"X800",start_event_id:"00000000-0000-4000-8000-000000000001",revision:0,paused:false,uncertain:false};
test("confirmed START enables PAUSE, PAUSE enables CONTINUE, and CONTINUE enables DONE",()=>{
 let value=monitorPauseWorkflow(workflow(),"in_progress",state,true);
 assert.equal(value.canPause,true);assert.equal(value.canDone,true);assert.equal(value.canContinue,false);
 value=monitorPauseWorkflow(workflow(),"in_progress",{...state,revision:1,paused:true},true);
 assert.equal(value.canPause,false);assert.equal(value.canDone,false);assert.equal(value.canContinue,true);assert.equal(value.paused,true);
 value=monitorPauseWorkflow(workflow(),"in_progress",{...state,revision:2},true);
 assert.equal(value.canPause,true);assert.equal(value.canDone,true);assert.equal(value.pauseRevision,2);
});
test("unknown PAUSE outcome and missing/malformed migrated state fail closed",()=>{
 for(const row of [{...state,uncertain:true},{...state,revision:"bad"},undefined]){
  const value=monitorPauseWorkflow(workflow(),"in_progress",row,true);
  assert.equal(value.deliveryUncertain,true);assert.equal(value.canDone,false);assert.equal(value.canPause,false);assert.equal(value.canContinue,false);
 }
});
test("before migration the existing START/DONE workflow remains available without PAUSE",()=>{
 const value=monitorPauseWorkflow(workflow(),"in_progress",undefined,false);
 assert.equal(value.canDone,true);assert.equal(value.canPause,false);assert.equal(value.canContinue,false);
});
