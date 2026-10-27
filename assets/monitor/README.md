# FH3 Monitor artwork

The owner supplied `fh3-logo.png` on 2026-10-27 for use inside the Monitor and as its app icon.
The original image is preserved byte for byte, including its white background.

SHA-256: `92ff58f3c0cdc11f8361e1365043fde678bd8037320d0a5fffc1d4cb9466590e`.

Run `tools/generate-monitor-icons.ps1` on Windows to convert this source into the
multi-resolution Windows ICO and Android legacy launcher images. Android's adaptive
foreground uses an inset to keep the full logo inside circular launcher masks.
Notification small icons remain monochrome as required by Android; the launcher,
main header and Windows window/tray/toast use FH3 artwork.
