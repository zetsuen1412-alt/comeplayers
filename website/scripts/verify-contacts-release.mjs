// Scoped integration test: only generated QA accounts are modified; all are removed in finally.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';
config({path:'.env.local',quiet:true});
const base=process.env.CONTACTS_TEST_URL || 'http://127.0.0.1:3014';
const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const accounts=[]; const roomIds=new Set(); let browser;
const suffix=randomUUID().slice(0,8);
async function account(label) {
  const username=`qa_${label}_${suffix}`;
  const email=`${username}@example.invalid`;
  const password=`Qa!${randomUUID()}Aa9`;
  const {data,error}=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{username}});
  if(error) throw error;
  accounts.push(data.user.id);
  const update=await admin.from('profiles').update({username,full_name:`QA ${label}`}).eq('id',data.user.id);
  if(update.error) throw update.error;
  const client=createClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const login=await client.auth.signInWithPassword({email,password}); if(login.error) throw login.error;
  return {id:data.user.id,username,session:login.data.session,client};
}
async function request(path,actor,method='GET',body,status=200) {
  const response=await fetch(base+path,{method,headers:{...(actor?{Authorization:`Bearer ${actor.session.access_token}`} : {}),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});
  const data=await response.json(); assert.equal(response.status,status,`${method} ${path}: ${JSON.stringify(data)}`); return data;
}
try {
  const a=await account('alpha'); const b=await account('bravo');
  await request('/api/messages/contacts',null,'GET',null,401);
  await request('/api/messages/blocks',null,'GET',null,401);
  const news=await request('/api/news'); assert.ok(Array.isArray(news.articles));
  const found=await request(`/api/messages/contacts?q=${b.username}`,a);
  assert.equal(found.users[0].id,b.id); assert.equal(found.users[0].email,undefined); assert.equal(found.users[0].phone_number,undefined);
  const chat=await request('/api/messages/contacts',a,'POST',{identifier:b.username}); roomIds.add(chat.room.id);
  const reversed=await request('/api/messages/contacts',b,'POST',{userId:a.id}); assert.equal(chat.room.id,reversed.room.id);
  await request(`/api/messages/rooms/${chat.room.id}/messages`,a,'POST',{message:'Hello from release QA'});
  const conv=await request(`/api/messages/rooms/${chat.room.id}`,b); assert.ok(conv.messages.some(m=>m.message==='Hello from release QA'));
  assert.ok((await request('/api/messages/contacts',b)).users.some(u=>u.id===a.id));
  await request('/api/messages/blocks',b,'POST',{userId:a.id});
  await request(`/api/messages/rooms/${chat.room.id}/messages`,a,'POST',{message:'Blocked QA'},403);
  assert.equal((await request(`/api/messages/contacts?q=${b.username}`,a)).users.length,0);
  assert.equal((await request(`/api/messages/rooms/${chat.room.id}`,b)).room.blocked_by_me,true);
  await request('/api/messages/blocks',b,'DELETE',{userId:a.id});
  await request(`/api/messages/rooms/${chat.room.id}/messages`,b,'POST',{message:'Unblocked QA'});
  const group=await request('/api/messages/groups',a,'POST',{title:`QA group ${suffix}`}); roomIds.add(group.room.id);
  await request(`/api/messages/rooms/${group.room.id}/members`,a,'POST',{identifier:b.username});
  const pending=await request('/api/messages/invitations',b); const invite=pending.received.find(i=>i.room_id===group.room.id); assert.ok(invite);
  await request('/api/messages/invitations',b,'PATCH',{invitationId:invite.id,action:'accept'});
  assert.ok((await request('/api/messages/rooms',b)).rooms.some(r=>r.id===group.room.id));
  console.log('PASS HTTP: auth, news, username search/privacy, direct-room reuse, message sync, recent contacts, block/unblock, group invite/accept.');
  browser=await chromium.launch({headless:true});
  const context=await browser.newContext({viewport:{width:1366,height:900}});
  const key=`sb-${new URL(url).hostname.split('.')[0]}-auth-token`;
  await context.addInitScript(({key,session})=>{window.localStorage.setItem(key,JSON.stringify(session));},{key,session:a.session});
  const page=await context.newPage(); const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`${base}/cpcommunity`,{waitUntil:'domcontentloaded'});
  await page.getByRole('button',{name:'Contacts',exact:true}).waitFor({timeout:60000});
  await page.getByRole('button',{name:'Contacts',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Messages and contacts'});
  await dialog.getByRole('textbox',{name:'Search chats or contacts'}).fill(b.username);
  await dialog.getByRole('button').filter({hasText:b.username}).click({timeout:30000});
  await page.getByRole('dialog',{name:b.username}).waitFor();
  await page.getByRole('textbox',{name:'Message',exact:true}).fill('Browser release QA');
  await page.getByRole('button',{name:'Send message',exact:true}).click();
  await page.getByText('Browser release QA',{exact:true}).waitFor({timeout:30000});
  await page.screenshot({path:'../tmp/contacts-desktop-verified.png'});
  await page.getByRole('button',{name:'Back to chats',exact:true}).click();
  await page.getByRole('button',{name:'Chats',exact:true}).click();
  await page.screenshot({path:'../tmp/contacts-chat-list-verified.png'});
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:'../tmp/contacts-small-screen-verified.png'});
  assert.deepEqual(errors,[],'No client runtime exceptions');
  console.log('PASS browser: authenticated Contacts search, open conversation, send message, desktop and 390px rendering, no runtime errors.');
} finally {
  if(browser) await browser.close();
  if(accounts.length && roomIds.size) { const result=await admin.from('admin_audit_logs').delete().in('admin_id',accounts).eq('action','create_group_chat').in('entity_id',[...roomIds]); if(result.error) console.error('QA audit cleanup:',result.error.message); }
  if(accounts.length) { const result=await admin.from('chat_communities').delete().in('owner_id',accounts); if(result.error) console.error('QA community cleanup:',result.error.message); }
  if(roomIds.size) { const result=await admin.from('chat_rooms').delete().in('id',[...roomIds]); if(result.error) console.error('QA room cleanup:',result.error.message); }
  for(const id of accounts) { const result=await admin.auth.admin.deleteUser(id); if(result.error) console.error('QA user cleanup:',id,result.error.message); }
  console.log('QA cleanup finished.');
}
