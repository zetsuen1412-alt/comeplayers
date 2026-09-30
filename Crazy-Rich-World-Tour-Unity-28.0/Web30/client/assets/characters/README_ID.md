# CRWT 23.0 Character Assets

`manifest.json` adalah registry karakter. Folder `glb/` berisi GLB glTF 2.0 rigged placeholder.

Kontrak asset final:
- pertahankan orientation Y-up dan karakter menghadap +Z;
- skeleton/skin boleh lebih kompleks, tetapi clip minimum: Idle, Walk, Jump, Skill, Win, Lose;
- karakter harus berdiri dekat origin;
- gunakan material/texture yang boleh didistribusikan oleh ComePlayers;
- jangan menambahkan Pendant/Artifact dependency ke model atau loadout.

File placeholder dibuat secara procedural untuk validasi pipeline dan dapat diganti oleh asset final tanpa perubahan backend.
