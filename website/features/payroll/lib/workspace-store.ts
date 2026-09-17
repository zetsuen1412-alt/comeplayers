"use client";

import { useEffect, useState } from 'react';
import type { PayrollActor } from '@/lib/payrollAccess';
import { authenticatedFetchJson } from '@/lib/authenticatedFetch';
import { canonical, workspaceKeys, type WorkspaceState, type closeWorkspace } from './workspace-model';

type Snapshot = { actor?: PayrollActor; state: WorkspaceState; revision: number; updatedAt: string };
export type PersistenceStatus = { ready: boolean; pending: boolean; busy: boolean; error: string; revision: number; actor: PayrollActor | null };
const endpoint = '/api/admin/payroll/workspace';
let state: WorkspaceState = {}, revision = 0, epoch = 0;
let exclusive = false;
let actor: PayrollActor | null = null;
export const getPayrollActor = () => actor;
export function usePayrollActor() {
  const [current,setCurrent]=useState(getPayrollActor);
  useEffect(()=>subscribePayroll(()=>setCurrent(getPayrollActor())),[]);
  return current;
}
function recordFailure(e: unknown, fallback: string) {
  const status=(e as {status?:number})?.status;
  if(status===401||status===403) { clearPayroll(); sync(); }
  error=e instanceof Error?e.message:fallback;notify();
}
let dirty = false, ready = false, error = '', saving: Promise<void> | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(fn => fn());
const sync = () => window.dispatchEvent(new Event('storage'));
export function subscribePayroll(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }
export function payrollStatus(): PersistenceStatus { return {ready,pending:dirty||!!saving||exclusive,busy:exclusive,error,revision,actor}; }
export function clearPayroll() { epoch++; clearTimeout(timer); actor=null;state={};revision=0;ready=false;exclusive=false;dirty=false;error='';saving=null;notify(); }
// Group related synchronous edits so a rejected order cannot leave reserved stock behind.
export function withPayrollBatch<T>(update: () => T): T {
  const previous=structuredClone(state), wasDirty=dirty;
  try { return update(); }
  catch(e) { state=previous;dirty=wasDirty;clearTimeout(timer);if(dirty)timer=setTimeout(()=>{void flushPayroll().catch(()=>{});},200);sync();notify();throw e; }
}
export async function loadPayroll() {
  if(dirty || saving || exclusive) return;
  const generation=epoch, startedRevision=revision;
  try {
    const result=await authenticatedFetchJson<Snapshot>(endpoint);
    if(generation!==epoch || dirty || saving || exclusive || startedRevision!==revision) return;
    state=result.state;revision=result.revision;actor=result.actor??null;ready=true;error='';sync();notify();
  } catch(e) { if(generation===epoch) {recordFailure(e,'Gagal memuat payroll');} throw e; }
}
export const payrollStorage = {
  getItem(key:string) { return key in state ? JSON.stringify(state[key]) : null; },
  setItem(key:string,raw:string) {
    if(!ready || error || exclusive) throw new Error(error || 'Payroll sedang diproses atau belum siap.');
    const value=JSON.parse(raw);
    if(JSON.stringify(state[key])===JSON.stringify(value)) return;
    state={...state,[key]:value};dirty=true;notify();
    clearTimeout(timer);timer=setTimeout(()=>{void flushPayroll().catch(()=>{});},200);
  },
  removeItem(key:string) {
    if(!(key in state)) return;
    if(!ready || error || exclusive) throw new Error(error || 'Payroll belum siap.');
    state={...state};delete state[key];dirty=true;notify();
    clearTimeout(timer);timer=setTimeout(()=>{void flushPayroll().catch(()=>{});},200);
  },
};
export async function flushPayroll(): Promise<void> {
  clearTimeout(timer);
  if(saving) {await saving;return flushPayroll();}
  if(error) throw new Error(error);
  if(!dirty) return;
  const generation=epoch, sent=structuredClone(state), expectedRevision=revision;
  dirty=false;
  saving=(async()=>{
    try {
      const result=await authenticatedFetchJson<Snapshot>(endpoint,{method:'POST',body:JSON.stringify({action:'save',expectedRevision,state:sent})});
      if(generation!==epoch)return;
      revision=result.revision;
      if(!dirty) state=result.state;
      else {
        // Preserve newer local edits while accepting server attribution for saved annotations.
        const confirmed=new Map(((result.state[workspaceKeys.history]??[]) as {id:string}[]).map(row=>[row.id,row]));
        if(Array.isArray(state[workspaceKeys.history])) state[workspaceKeys.history]=(state[workspaceKeys.history] as {id:string}[]).map(row=>confirmed.get(row.id)??row);
        if(canonical(state[workspaceKeys.lock])===canonical(sent[workspaceKeys.lock])&&result.state[workspaceKeys.lock])state[workspaceKeys.lock]=result.state[workspaceKeys.lock];
      }
      sync();
    }catch(e){if(generation===epoch){dirty=true;recordFailure(e,'Penyimpanan gagal');}throw e;}
    finally {if(generation===epoch){saving=null;notify();}}
  })();notify();await saving;
  if(dirty) await flushPayroll();
}
export async function closePayroll() {
  if(exclusive)throw new Error('Closing sedang diproses.');
  exclusive=true;notify();const generation=epoch;
  try {
    await flushPayroll();
    if(!ready||error)throw new Error(error||'Payroll belum siap');
    const result=await authenticatedFetchJson<Snapshot & Omit<ReturnType<typeof closeWorkspace>,'state'>>(endpoint,{method:'POST',body:JSON.stringify({action:'close',expectedRevision:revision})});
    if(generation!==epoch)throw new Error('Sesi telah berubah.');
    state=result.state;revision=result.revision;sync();return result;
  } catch(e) {if(generation===epoch)recordFailure(e,'Closing gagal; muat ulang untuk memeriksa hasil.');throw e;}
  finally {if(generation===epoch){exclusive=false;notify();}}
}
export function exportUnsavedPayroll() {
  const url=URL.createObjectURL(new Blob([JSON.stringify({revision,state},null,2)],{type:'application/json'}));
  const link=document.createElement('a');link.href=url;link.download='ComePlayers-payroll-belum-tersimpan.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
