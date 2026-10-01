# CODEX HANDOFF — Crazy Rich: World Tour — Gemini MCP + Character Rebuild

Tanggal handoff: 2026-10-01

## Scope
Proyek ini KHUSUS Crazy Rich: World Tour. Jangan campur dengan ComePlayers Marketplace, CP Empires & Allies, payroll, lowongan, atau proyek lain.

## Repository
- Repo: zetsuen1412-alt/comeplayers
- Branch: codex/crazy-rich-web-v30
- Folder game: Crazy-Rich-World-Tour-Unity-28.0/Web30/
- Website root Vercel: website/

## Status visual karakter
Target akhir tetap 10 playable 3D character units:
Alexia, Rindi, Kairo, Luna, Nox, Atlas, Zeno, Yuna, Mochi, Pip.

Visual reference yang disetujui user:
- anime-chibi collectible-quality 3D
- benar-benar volumetric 360°
- bisa dilihat dari semua sudut di papan
- bukan sprite/billboard
- bukan procedural generic doll
- sample yang ditunjukkan ke user HARUS memakai aset GLB yang sama dengan yang masuk game
- wajib 360° preview + screenshot in-game + sample video Idle/Walk/action

Alexia override terakhir:
- mata MERAH / CRIMSON
- silver/lavender layered hair
- black/white/gold headphones
- black/white jacket with gold details
- black shorts/belt
- chunky black/white/gold sneakers
- navy luggage with gold star

Model procedural/blender lama ditolak user karena sangat berbeda dari visual referensi. Jangan gunakan sebagai final atau bukti kemiripan.

Catatan aturan rebuild ada di:
Crazy-Rich-World-Tour-Unity-28.0/Web30/production/character-visual-rebuild.json

## Gemini cooperation plan
User memilih opsi integrasi langsung Gemini API -> MCP -> ChatGPT.

Connector Gemini sudah dibuat pada branch ini:

- website/app/api/crwt-gemini-mcp/route.ts
- website/app/api/crwt-gemini-mcp/health/route.ts
- Crazy-Rich-World-Tour-Unity-28.0/Web30/integrations/gemini-mcp/README_ID.md

Connector menyediakan tools:
- gemini_status
- gemini_analyze_reference
- gemini_generate_image
- gemini_character_turnaround

Default:
- analysis/text: gemini-3.8-flash
- image: gemini-3.1-flash-image
- optional image quality: gemini-3-pro-image

Latest connector commit before this handoff:
3aabb2d2f03191188b1b57b7a1fadd7ac53f1372

Build Vercel untuk commit connector sebelumnya 2f7cd949... berhasil.

## Required user-side secrets
JANGAN meminta user menempel API key di chat.

User harus mengatur sendiri di Vercel:
- GEMINI_API_KEY = API key dari Google AI Studio

Preview deployment branch Crazy Rich memakai Vercel Authentication, jadi jika akan dipakai sebagai remote MCP dari luar Vercel, buat juga:
- Deployment Protection -> Protection Bypass for Automation
- simpan secret bypass dengan aman

Jangan commit secret ke source.

## Next tasks for Codex

1. Verify latest branch deployment after commit 3aabb2d2...
2. Check health route:
   /api/crwt-gemini-mcp/health
3. Ensure health says geminiConfigured=true after user adds GEMINI_API_KEY.
4. Test MCP initialize, tools/list, and gemini_status.
5. Test gemini_analyze_reference with a trusted reference URL.
6. Test gemini_character_turnaround using APPROVED RED-EYED ALEXIA reference.
7. Compare all generated views for identity consistency BEFORE any 3D conversion.
8. Do not generate another fake/sample 3D if turnaround is inconsistent.
9. Once turnaround is approved, create actual 3D asset using all views.
10. Rig and animate only after visual fidelity passes.
11. Integrate exact reviewed GLB into board character selector.
12. Store SHA-256 of reviewed GLB and verify same GLB is used in-game.
13. Capture:
    - 360 turntable
    - in-game board screenshot
    - Idle
    - Walk on board
    - one action/Win or Skill clip

## Acceptance gate
Character is NOT final just because:
- GLB exports
- skeleton exists
- animation names exist
- browser loads
- character walks

Final means:
- visually close to approved reference
- correct face, hair, outfit, accessories, proportions
- full 360 coherent geometry
- deformation survives animation
- same model appears in-game
- user approves visual result

## Important
User was very dissatisfied with prior low-fidelity models. Prioritize visual likeness over speed.
