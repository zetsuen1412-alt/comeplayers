import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { callRevisionEventsEnabled } from "../lib/callRevisionEvents";
import { RevisionTracker } from "../lib/live/refresh-queue";

test("call revision activation is explicit and defaults to fast polling", () => {
  for (const value of ["", "false", "TRUE", "1"]) assert.equal(callRevisionEventsEnabled(value),false);
  assert.equal(callRevisionEventsEnabled("true"),true);
});

test("call revision metadata does not invalidate unrelated page live topics", () => {
  const tracker=new RevisionTracker();
  assert.deepEqual(tracker.accept([{scope:"calls:aaaaaaaa-0000-4000-8000-000000000001",revision:1}]),[]);
});

test("authenticated active-call API advertises deployment readiness without an extra database query", async () => {
  for (const ready of [false,true]) {
    let queries=0;
    const query={select(){return query;},or(){return query;},order(){return query;},limit:async()=>({data:[],error:null})};
    const mocks:Record<string,unknown>={
      "next/server":{NextResponse:{json:(body:unknown,init?:ResponseInit)=>Response.json(body,init)}},
      "@/lib/serverSupabase":{requireAuthenticatedUser:async()=>({id:"actor"}),createSupabaseAdmin:()=>({from:(table:string)=>{queries++;assert.equal(table,"cp_calls");return query;}})},
      "@/lib/callPresence":{activeCallFilter:()=>"actor",visibleCallStatus:()=>{}},
      "@/lib/callRevisionEvents":{callRevisionEventsEnabled:()=>ready},
      "@/lib/accountApi":{accountApiError:()=>Response.json({error:"failed"},{status:500})},
    };
    const source=readFileSync("app/api/messages/calls/route.ts","utf8");
    const {outputText}=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}});
    const exports:{GET?:(r:Request)=>Promise<Response>}={};
    runInNewContext(outputText,{exports,require:(name:string)=>mocks[name]||{},console,URL,Date});
    const response=await exports.GET!(new Request("https://example.test/api/messages/calls?active=1"));
    assert.equal(response.status,200);assert.deepEqual(await response.json(),{callEventsReady:ready,calls:[]});
    assert.equal(queries,1);assert.equal(response.headers.get("cache-control"),"no-store");
  }
});
