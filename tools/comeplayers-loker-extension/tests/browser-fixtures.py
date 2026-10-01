"""Exercises the actual content script against isolated DOM fixtures, never Facebook."""
from pathlib import Path
import os
from playwright.sync_api import sync_playwright
import json, time
script = (Path(__file__).resolve().parents[1] / 'facebook.js').read_text()
# Synthetic URL only in the test copy; no navigation or connection to Facebook.
script = script.replace('location.href', 'globalThis.__fixtureURL').replace('location.pathname', 'new URL(globalThis.__fixtureURL).pathname')
results=[]
base='https://www.facebook.com/groups/example/'
text='Lowongan resmi\nWhatsApp Admin: +6281234567890\nhttps://wa.me/6281234567890'
boot="""window.listeners=[];window.dispatches=0;window.chrome={runtime:{id:'fixture',onMessage:{addListener:f=>listeners.push(f)},sendMessage:async m=>{if(m.dispatch)window.dispatches++;return {allowed:window.allow!==false};}}};"""
def article(message, post='123'):
    return f'<article role="article"><div data-ad-preview="message" dir="auto">{message}</div><a href="/groups/example/posts/{post}/">Waktu</a></article>'
def run_case(browser,name,html,kind='group_scan',url=base,allow=True,stage='CP_LOKER_RUN',check=None):
    context=browser.new_context();page=context.new_page()
    page.set_content('<html><head><base href="https://www.facebook.com/"></head><body><style>body{font:16px sans-serif}article,[role=dialog]{padding:20px;border:1px solid #ddd;margin:10px}[contenteditable]{min-height:30px;border:1px solid black}button{padding:10px}</style>'+html+'</body></html>')
    page.evaluate(boot);page.evaluate('(u)=>window.__fixtureURL=u',url);page.evaluate('(a)=>window.allow=a',allow);page.add_script_tag(content=script)
    job={'id':'job','lease':'lease','kind':kind,'target':url,'text':text,'banner':None,'expiresAt':int(time.time()*1000)+120000}
    result=page.evaluate("""async ({job,stage})=>await new Promise(resolve=>listeners[0]({type:stage,job,ref:job.target},{id:'fixture'},resolve))""",{'job':job,'stage':stage})
    calls=page.evaluate('dispatches')
    if check: check(result,calls,page)
    results.append({'name':name,'result':result['status'],'dispatches':calls,'passed':True})
    context.close()
def eq(a,b):
    assert a==b,(a,b)
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.getenv('CHROMIUM_PATH', '/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
    seeker=article('Info loker apa aja','123')+article('Saya mencari pekerjaan','124')+article('Butuh kerja secepatnya','125')+article('Kami membuka lowongan, cari kerja di sini','126')
    run_case(browser,'scan chooses only job seekers',seeker,check=lambda r,c,p:(eq(len(r['discovered']),3),eq(c,1),eq(r['status'],'skipped')))
    run_case(browser,'disabled dispatch cannot submit',seeker,allow=False,check=lambda r,c,p:(eq(r['status'],'uncertain'),eq(c,1)))
    run_case(browser,'wrong Facebook route never clicks','<button>Post</button>',kind='group_post',url='https://www.facebook.com/messages/',check=lambda r,c,p:(eq(r['status'],'uncertain'),eq(c,0)))
    post_html='''<button id="open" onclick="document.getElementById('composer').hidden=false">Write something...</button><div role="dialog" id="composer" hidden><h2>Create post</h2><div role="textbox" contenteditable="true" aria-label="Write post" id="editor"></div><button id="post">Post</button></div><div id="feed"></div><script>post.onclick=()=>{let value=editor.innerText;composer.remove();let a=document.createElement('article');a.setAttribute('role','article');let d=document.createElement('div');d.setAttribute('dir','auto');d.textContent=value;a.append(d);let link=document.createElement('a');link.href='/groups/example/posts/999/';link.textContent='Waktu';a.append(link);feed.append(a);window.clicked=true;};</script>'''
    run_case(browser,'group post requests reload verification',post_html,kind='group_post',check=lambda r,c,p:(eq(r['status'],'verify'),eq(c,1),eq(p.evaluate('clicked'),True)))
    run_case(browser,'post verified from fresh DOM without sending',article(text,'999'),kind='group_post',url=base+'posts/999/',stage='CP_LOKER_VERIFY',check=lambda r,c,p:(eq(r['status'],'sent'),eq(c,0)))
    comment_html='''<article role="article"><div data-ad-preview="message" dir="auto">Info loker apa aja</div><a href="/groups/example/posts/123/">Waktu</a><article role="article"><div>Someone else's comment</div><div contenteditable="true" role="textbox" aria-label="Write a reply" id="wrong"></div></article><form onsubmit="return false"><div contenteditable="true" role="textbox" aria-label="Write a public comment" id="editor"></div><button type="button" id="send">Post comment</button></form><div id="comments"></div></article><script>send.onclick=()=>{let d=document.createElement('div');d.setAttribute('dir','auto');d.textContent=editor.innerText;comments.append(d);editor.innerText='';window.clicked=true;};</script>'''
    run_case(browser,'comment sends to main post, not reply',comment_html,kind='group_comment',url=base+'posts/123/',check=lambda r,c,p:(eq(r['status'],'verify'),eq(c,1),eq(p.locator('#wrong').inner_text(),'')))
    missing=comment_html.replace('<button type="button" id="send">Post comment</button>','').split('<script>')[0]
    run_case(browser,'missing send button never fakes Enter success',missing,kind='group_comment',url=base+'posts/123/',check=lambda r,c,p:(eq(r['status'],'uncertain'),eq(c,0)))
    browser.close()
if os.getenv('LOKER_TEST_REPORT'):
    Path(os.environ['LOKER_TEST_REPORT']).write_text(json.dumps(results,indent=2))
print(json.dumps({'passed':len(results),'tests':results},indent=2))
