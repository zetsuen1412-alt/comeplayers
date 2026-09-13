"use client";

import { authenticatedFetchJson } from '@/lib/authenticatedFetch';
import type { WorkspaceState, closeWorkspace } from './workspace-model';

type Snapshot = { state: WorkspaceState; revision: number; updatedAt: string };
export type PersistenceStatus = { ready: boolean; pending: boolean; busy: boolean; error: string; revision: number };
const endpoint = '/api/admin/payroll/workspace';
let state: WorkspaceState = {}, revision = 0, epoch = 0;
let exclusive = false;
let dirty = false, ready = false, error = '', saving: Promise<void> | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(fn => fn());
const sync = () => window.dispatchEvent(new Event('storage'));
export function subscribePayroll(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }
export function payrollStatus(): PersistenceStatus { return {ready,pending:dirty||!!saving||exclusive,busy:exclusive,error,revision}; }
export function clearPayroll() { epoch++; clearTimeout(timer); state={};revision=0;ready=false;exclusive=false;dirty=false;error='';saving=null;notify(); }
export async function loadPayroll() {
  if(dirty || saving || exclusive) return;
  const generation=epoch, startedRevision=revision;
  try {
    const result=await authenticatedFetchJson<Snapshot>(endpoint);
    if(generation!==epoch || dirty || saving || exclusive || startedRevision!==revision) return;
    state=result.state;revision=result.revision;ready=true;error='';sync();notify();
  } catch(e) { if(generation===epoch) {error=e instanceof Error?e.message:'Gagal memuat payroll';notify();} throw e; }
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
      if(!dirty) {state=result.state;sync();}
    }catch(e){if(generation===epoch){dirty=true;error=e instanceof Error?e.message:'Penyimpanan gagal';}throw e;}
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
  } catch(e) {if(generation===epoch)error=e instanceof Error?e.message:'Closing gagal; muat ulang untuk memeriksa hasil.';throw e;}
  finally {if(generation===epoch){exclusive=false;notify();}}
}
export function exportUnsavedPayroll() {
  const url=URL.createObjectURL(new Blob([JSON.stringify({revision,state},null,2)],{type:'application/json'}));
  const link=document.createElement('a');link.href=url;link.download='ComePlayers-payroll-belum-tersimpan.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
