// QA ONLY: real native crypto/SQLite and two device identities; in-memory relay.
require('../src/secure/random');require('react-native-url-polyfill/auto');
const React=require('react'),{Text,ScrollView}=require('react-native'),{registerRootComponent}=require('expo');
const {File,Paths}=require('expo-file-system');
// This fixture must never contact a production service.
global.fetch=async()=>{throw Error('No network in private messaging fixture');};
function QA(){const[lines,setLines]=React.useState(['Private messaging integration - NOT FOR RELEASE']);React.useEffect(()=>{
 const results=[],log=text=>{results.push(text);console.log('CP_MESSENGER_QA '+text);setLines(v=>[...v,text]);};
 const assert=(condition,text)=>{if(!condition)throw Error(text);};
 (async()=>{
  const c=require('../src/secure/crypto'),{openVault}=require('../src/secure/vault'),{PrivateMessenger}=require('../src/secure/messenger');
  require('../src/runtime').supabase.auth.stopAutoRefresh();
  const a=new PrivateMessenger(await openVault(c.newId())),b=new PrivateMessenger(await openVault(c.newId()));
  const room={id:c.newId(),buyer_id:a.userId,seller_id:b.userId,room_type:'direct',status:'active',unread_count:0,created_at:new Date().toISOString()};
  const mail=new Map(),delivered=new Set();let offline=false,wire='';
  for(const [self,other]of [[a,b],[b,a]]){
   self.ready=true;await self.vault.put('meta','registered-device',self.vault.descriptor.deviceId);await self.saveRooms([{...room,other:{id:other.userId,username:'QA contact'}}]);
   self.api=async(path,method='GET',body)=>{
    if(offline)throw Error('offline fixture');
    if(path.startsWith('/api/messages/private/device'))return {identity:c.publicIdentity(other.vault.descriptor.identity)};
    if(path==='/api/messages/private/call-history')return {calls:[],scheduled:[]};
    if(path.startsWith('/api/messages/private/legacy'))return {messages:[]};
    if(path==='/api/messages/private/relay'){
     if(method==='POST'){wire+=JSON.stringify(body);if(!delivered.has(body.envelope.id))mail.set(body.envelope.id,{envelope:body.envelope,blob_id:null});return{received:delivered.has(body.envelope.id)};}
     if(method==='PATCH'){for(const id of body.ids){assert(mail.get(id)?.envelope.recipientId===self.userId,'wrong recipient ack');mail.delete(id);delivered.add(id);}return{ok:true};}
     return{messages:[...mail.values()].filter(m=>m.envelope.recipientId===self.userId)};
    }throw Error('Unhandled fixture endpoint '+path);
   };
  }
  const text='DEVICE-ONLY-'+c.newId();await a.send(room,text);await a.sync();assert(!wire.includes(text),'Plaintext escaped into relay');
  await b.sync();let received=(await b.messages(room.id))[0];assert(received.message===text,'Receiver history missing');assert(!mail.has(received.id),'Ciphertext not acked after durable store');
  await b.sync();await a.sync();assert((await a.messages(room.id))[0].delivery==='received','Delivery receipt missing');log('PASS native send/decrypt/durable receive/ACK/receipt without relay plaintext');
  await b.markRead(room.id,true,[received.id]);await b.sync();await a.sync();assert((await a.messages(room.id))[0].delivery==='read','Read receipt missing');
  let events=0;const stop=b.subscribe(()=>events++);await b.markRead(room.id,true,[received.id]);stop();assert(events===0,'Unchanged read caused refresh loop');log('PASS encrypted read receipts and no unchanged refresh loop');
  let sent=(await a.messages(room.id))[0];await a.edit(sent,'edited secret');await a.sync();await b.sync();assert((await b.messages(room.id))[0].message==='edited secret','Edit failed');
  sent=(await a.messages(room.id))[0];await a.edit(sent);await a.sync();await b.sync();assert(!!(await b.messages(room.id))[0].deleted_at,'Delete failed');log('PASS authenticated edits and deletion');
  offline=true;await a.send(room,'offline private message');await a.sync();assert((await a.messages(room.id))[0].delivery==='queued','Offline message not durable');offline=false;
  await a.sync();await b.sync();assert((await b.messages(room.id))[0].message==='offline private message','Offline retry failed');log('PASS offline encrypted outbox survives reconnect');
  await a.send(room,'tamper test');await a.sync();const queued=[...mail.values()].find(m=>m.envelope.senderId===a.userId);assert(queued,'No tamper fixture');queued.envelope.signature='00'.repeat(64);await b.sync();
  assert(mail.has(queued.envelope.id),'Invalid ciphertext was acknowledged');assert(!(await b.vault.get('message',queued.envelope.id)),'Invalid ciphertext entered history');log('PASS invalid signature retained in relay and rejected locally');
  const backup=require('../src/secure/backup'),key=c.hex(c.random()),archive=await backup.exportPrivateBackup(b.userId,key);await backup.restorePrivateBackup(b.userId,archive.uri,key);
  assert((await(await openVault(b.userId)).get('message',received.id)).deleted_at,'Restore resurrected deleted message');archive.delete();log('PASS real chat backup/restore preserves deletion and history');
  log('ALL NATIVE MESSAGING CHECKS PASSED');
 })().catch(e=>log('FAIL '+String(e.stack||e))).finally(()=>new File(Paths.document,'private-messaging-qa.json').write(JSON.stringify({results})));
 },[]);return React.createElement(ScrollView,{style:{flex:1,padding:24,paddingTop:50,backgroundColor:'#080b10'}},lines.map((line,i)=>React.createElement(Text,{key:i,style:{color:'#fff',marginBottom:18}},line)));}
registerRootComponent(QA);
