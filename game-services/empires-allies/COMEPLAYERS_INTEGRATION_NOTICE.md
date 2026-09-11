# CP Empires & Allies integration notice

This directory contains the user-supplied **Raise the Empires** preservation project and a ComePlayers integration wrapper.

- The preservation server code is licensed under GPL-3.0. The original `LICENSE` and `README.md` are preserved.
- The original game name, artwork, SWF files, audio, trademarks, and other historical assets may be owned by their respective rights holders and are not automatically covered by the server code's GPL license.
- Before making this game publicly available or monetizing it, obtain appropriate permission or replace historical assets and branding with original ComePlayers assets.
- The ComePlayers wrapper does not use the bundled Adobe Flash Player executable. Browser playback uses Ruffle.
- The public wrapper disables legacy session-switching, save-editor, cheat, and patch routes because those routes are unsafe on a shared hosted server.

For production, deploy this service at a same-site subdomain such as `https://empires.comeplayers.com` and persist the `/app/instance` directory.
