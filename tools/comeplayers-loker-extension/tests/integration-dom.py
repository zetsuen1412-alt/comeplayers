"""Synthetic documents for the real unpacked extension integration suite.

This helper creates HTML only. It never starts a browser, makes a request, or
changes extension source, browser APIs, clocks, timers, or the current location.
The caller must fulfill only these exact URLs and deny all other network traffic.
"""
from __future__ import annotations

import importlib.util
from pathlib import Path
import re
import sys


GROUP_URL = "https://www.facebook.com/groups/example/"


def _fixture_module():
    name = "_comeplayers_loker_browser_fixtures"
    path = Path(__file__).with_name("browser-fixtures.py")
    existing = sys.modules.get(name)
    if existing is not None and Path(existing.__file__).resolve() == path.resolve():
        return existing
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError("Synthetic DOM fixture module could not be loaded.")
    module = importlib.util.module_from_spec(spec)
    # Register before execution: annotations/dataclasses can look up __module__.
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


HANDLER_JS = """
(() => {
  const body = document.body;
  const input = document.getElementById('photo-input');
  const editor = document.getElementById('editor');
  const preview = document.getElementById('preview');
  const comments = document.getElementById('comments');
  let send = document.getElementById('send');
  const smallPreview = body.dataset.smallCdnPreview === 'true';
  const focusSend = body.dataset.focusSend === 'true';
  const increment = key => { body.dataset[key] = String(Number(body.dataset[key] || 0) + 1); };
  window.addEventListener('beforeunload',event=>{
    if(input?.files.length||preview?.querySelector('img')||editor?.textContent.trim()) {
      event.preventDefault();event.returnValue='';
    }
  });
  if (input) input.addEventListener('change', () => {
    increment('attachmentChanges');
    const file = input.files[0];
    if (!file || !preview) return;
    body.dataset.lastFile=JSON.stringify({name:file.name,type:file.type,size:file.size});
    const image = document.createElement('img');
    image.src = smallPreview ? 'https://static.xx.fbcdn.net/synthetic-lowongan/attachment-64.svg' : URL.createObjectURL(file);
    image.alt = 'Lampiran gambar sintetis';
    if(smallPreview) {
      image.width=64;image.height=80;image.style.cssText='width:64px;height:80px';
      image.addEventListener('load',()=>{const rect=image.getBoundingClientRect();body.dataset.lastPreview=JSON.stringify({naturalWidth:image.naturalWidth,width:rect.width,height:rect.height,outsideForm:!document.getElementById('composer').contains(image)});});
    } else image.setAttribute('data-attachment-preview', 'true');
    preview.replaceChildren(image);
    const holder=document.getElementById('remove-controls');
    if(holder&&!holder.children.length) {
      const remove=document.createElement('button');remove.type='button';remove.setAttribute('aria-label','Hapus foto');remove.textContent='×';
      remove.onclick=()=>{increment('removeClicks');preview.replaceChildren();input.value='';holder.replaceChildren();};holder.append(remove);
    }
    if (send) { send.disabled = false; send.removeAttribute('aria-disabled'); }
  });
  function bindSend(control) { control.addEventListener('click', event => {
    event.preventDefault();
    increment('sendClicks');
    const image = preview && preview.querySelector('img');
    if (!image || !comments || !editor) return;
    const comment = document.createElement('div');
    comment.setAttribute('role', 'listitem');
    comment.setAttribute('data-comment-id', 'synthetic-new-' + body.dataset.syntheticPost);
    const actor = document.createElement('a');
    actor.href = '/profile.php?id=100';
    actor.textContent = 'Aktor sintetis';
    const submittedImage=smallPreview?document.createElement('img'):image;
    if(smallPreview)submittedImage.src=URL.createObjectURL(input.files[0]);
    comment.append(actor, submittedImage);
    comments.append(comment);
    editor.textContent = '';
    preview.replaceChildren();
    input.value='';
    document.getElementById('remove-controls')?.replaceChildren();
    send.disabled = true;
    send.setAttribute('aria-disabled', 'true');
  }); }
  if(send)bindSend(send);
  if(focusSend) editor.addEventListener('focus',()=>{
    if(!preview.querySelector('img')||send)return;
    send=document.createElement('div');send.id='send';send.setAttribute('role','button');send.setAttribute('aria-label','Posting komentar');send.tabIndex=0;
    send.style.cssText='width:16px;height:16px;padding:0;display:inline-block';send.textContent='➤';document.getElementById('composer').append(send);bindSend(send);
  });
})();
"""


OBSERVATIONS_JS = """() => {
  const body = document.body;
  const file = document.getElementById('photo-input')?.files?.[0];
  const editor = document.getElementById('editor');
  const newComments = [...document.querySelectorAll('#comments > [data-comment-id^="synthetic-new-"]')];
  const images = newComments.flatMap(comment => [...comment.querySelectorAll('img')]);
  return {
    synthetic: body.dataset.syntheticUi === 'true',
    sends: Number(body.dataset.sendClicks || 0),
    fileChanges: Number(body.dataset.attachmentChanges || 0),
    removeClicks: Number(body.dataset.removeClicks || 0),
    lastFile: body.dataset.lastFile ? JSON.parse(body.dataset.lastFile) : (file ? {name: file.name, type: file.type, size: file.size} : null),
    lastPreview: body.dataset.lastPreview ? JSON.parse(body.dataset.lastPreview) : null,
    sendLabel:document.getElementById('send')?.getAttribute('aria-label'),
    attachmentFilesRemaining:file?1:0,
    editorCleared: !!editor && !editor.textContent.trim(),
    attachmentPreviewImages: document.querySelectorAll('#preview img').length,
    newTopLevelComments: newComments.length,
    newTopLevelCommentImages: images.length,
    loadedNewCommentImages: images.filter(image => image.complete && image.naturalWidth > 0).length
  };
}"""


def _document(content: str, css: str, post: str = "") -> str:
    return (
        '<!doctype html><html lang="id"><head><meta charset="utf-8">'
        '<title>Lowongan — DOM integration sintetis</title><link rel="icon" href="data:,">'
        '<style>' + css + '</style></head>'
        '<body data-synthetic-ui="true" data-synthetic-post="' + post + '" '
        + ('data-small-cdn-preview="true" data-focus-send="true" ' if post == '124' else '')
        + 'data-attachment-changes="0" data-send-clicks="0">'
        '<h1>Fixture sintetis extension Lowongan</h1>'
        '<p>Dokumen uji lokal yang diintercept. Bukan Facebook nyata; tidak ada komentar publik dikirim.</p>'
        + content + '</body></html>'
    )


def synthetic_pages() -> dict[str, str]:
    """Group scan, observed modal124, reviewed batch125→126→127, cleanup128.

    Post125 has a valid post-level composer but no image attachment control, so
    the extension can skip it immediately and proceed to the next approved post.
    Post124 has the observed post-root ``Tulis jawaban`` structure: FORMdepth7,
    sibling64×80HTTPS preview, TABLEdepth12 and postscope23. Its send control
    appears only after editor focus. Post128 uploads but has no send control.
    """
    fixtures = _fixture_module()
    pages = {}
    descriptions = {
        "123": "Postingan feed sintetis",
        "124": "Postingan modal Tulis jawaban sintetis",
        "125": "Postingan sintetis tanpa kontrol foto",
        "126": "Postingan feed batch sintetis",
        "127": "Postingan modal batch sintetis",
        "128": "Postingan sintetis tanpa kontrol kirim setelah upload",
    }
    group_content = ''.join(fixtures.article(post, message) for post, message in descriptions.items())
    pages[GROUP_URL] = _document(group_content, fixtures.CSS)
    for post in descriptions:
        modal = post in {"124", "125", "127"}
        content = fixtures.comment_fixture(
            modal=modal,
            placeholder="Tulis jawaban..." if modal else "Tulis komentar publik...",
            deep_wrappers=post == "124",
            nested_dialog=post == "124",
            preview_sibling=post == "124",
            small_cdn_preview=post == "124",
            focus_send=post == "124",
            live_preview_structure=post == "124",
            send=post != "128",
            enabled=False,
        )
        # Keep the shared fixture's structure, but supply independent native DOM
        # handlers instead of its test-global counters. No BOOT/runtime shim.
        content = content.split('<script>', 1)[0]
        content = content.replace('/groups/example/posts/123/', f'/groups/example/posts/{post}/')
        if post == "125":
            content = re.sub(r'<button\b[^>]*\bid="camera"[^>]*>.*?</button>', '', content)
            content = re.sub(r'<input\b[^>]*\bid="photo-input"[^>]*>', '', content)
        pages[f'{GROUP_URL}posts/{post}/'] = _document(content + '<script>' + HANDLER_JS + '</script>', fixtures.CSS, post)
    return pages


def synthetic_documents() -> dict[str, str]:
    """Alias for integration callers that name the mapping documents."""
    return synthetic_pages()


def synthetic_resources() -> dict[str, dict[str, str]]:
    """Exact synthetic CDN image supplied in memory, never from the network."""
    fixtures = _fixture_module()
    return {fixtures.CDN_PREVIEW:{'content_type':'image/svg+xml', 'body':fixtures.CDN_PREVIEW_BODY}}
