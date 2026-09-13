// Standalone native QA entry. Never imported by production index.js.
require('../src/secure/random');
require('react-native-url-polyfill/auto');
const React=require('react'),{Text,ScrollView}=require('react-native');
const {registerRootComponent}=require('expo');
const {registerGlobals,AudioSession}=require('@livekit/react-native');registerGlobals();
const {Room,RoomEvent,Track,createLocalAudioTrack,createLocalVideoTrack}=require('livekit-client');
const {PrivateMediaEncryption}=require('../src/secure/PrivateMediaEncryption');
const {random}=require('../src/secure/crypto');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function QA(){const[lines,setLines]=React.useState(['Private call native QA - NOT FOR RELEASE']);
 React.useEffect(()=>{const results=[];const log=text=>{results.push(text);console.log('CP_MEDIA_QA '+text);setLines(v=>[...v,text]);};
 const run=async(mode)=>{
  const config=await(await fetch('http://10.0.2.2:8089/config')).json();
  const failures=[],key=random(),tracks=[];let sender,receiver;
  const senderEncryption=mode==='plaintext'?null:new PrivateMediaEncryption('qa-receiver',e=>failures.push('sender: '+e.message));
  const receiverEncryption=new PrivateMediaEncryption('qa-sender',e=>failures.push('receiver: '+e.message));
  try{
   if(senderEncryption)await senderEncryption.initialize(key);
   await receiverEncryption.initialize(mode==='wrong-key'?random():key);
   sender=new Room(senderEncryption?{e2ee:{e2eeManager:senderEncryption},publishDefaults:{simulcast:false,videoCodec:'vp8'}}:{});
   receiver=new Room({e2ee:{e2eeManager:receiverEncryption}});
   if(senderEncryption)await sender.setE2EEEnabled(true);await receiver.setE2EEEnabled(true);
   await receiver.connect(config.url,config.tokens['qa-receiver'],{autoSubscribe:false});
   await sender.connect(config.url,config.tokens['qa-sender'],{autoSubscribe:false});
   for(const kind of ['audio','video']){
    const track=kind==='audio'?await createLocalAudioTrack():await createLocalVideoTrack({facingMode:'environment',resolution:{width:320,height:240,frameRate:10}});
    track.mediaStreamTrack.enabled=false;tracks.push(track);
    const pub=await sender.localParticipant.publishTrack(track,{source:kind==='audio'?Track.Source.Microphone:Track.Source.Camera,simulcast:false,videoCodec:'vp8'});
    if(senderEncryption)await senderEncryption.waitForTrack(pub.trackSid);track.mediaStreamTrack.enabled=true;
    if(mode!=='valid')break;
   }
   let decoded=0,audioPackets=0;
   for(let i=0;i<20;i++){
    await sleep(500);
    for(const p of receiver.remoteParticipants.values())for(const pub of p.trackPublications.values()){
     if(!pub.track)continue;const report=await pub.track.getRTCStatsReport();
     if(report)report.forEach(stat=>{if(stat.type==='inbound-rtp'){decoded=Math.max(decoded,stat.framesDecoded||0);if(stat.kind==='audio')audioPackets=Math.max(audioPackets,stat.packetsReceived||0);}});
    }
    if(mode==='valid'&&decoded>2&&audioPackets>2)break;
    if(mode!=='valid'&&failures.length)break;
   }
   if(mode==='valid'){if(failures.length||decoded<3||audioPackets<3)throw Error(JSON.stringify({failures,decoded,audioPackets}));log('PASS encrypted audio/video received: '+decoded+' video frames, '+audioPackets+' audio packets');}
   else {if(!failures.length)throw Error(mode+' was not rejected');log('PASS '+mode+' rejected: '+failures.join('; '));}
  }finally{for(const track of tracks)track.stop();await sender?.disconnect();await receiver?.disconnect();await senderEncryption?.dispose();await receiverEncryption.dispose();}
 };
 (async()=>{await AudioSession.startAudioSession();await run('valid');await run('wrong-key');await run('plaintext');log('ALL NATIVE MEDIA CHECKS PASSED');})().catch(e=>log('FAIL '+String(e.stack||e))).finally(async()=>{await AudioSession.stopAudioSession();await fetch('http://10.0.2.2:8089/report',{method:'POST',body:JSON.stringify({results})}).catch(()=>{});});
 },[]);
 return React.createElement(ScrollView,{style:{flex:1,padding:24,paddingTop:50,backgroundColor:'#080b10'}},lines.map((line,i)=>React.createElement(Text,{key:i,style:{color:'#fff',marginBottom:18}},line)));}
registerRootComponent(QA);
