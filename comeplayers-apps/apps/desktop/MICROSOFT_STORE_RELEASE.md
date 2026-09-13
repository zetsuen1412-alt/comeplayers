# ComePlayers Microsoft Store release

Microsoft Store is the preferred Windows distribution channel when ComePlayers does not own a public Code Signing certificate. Microsoft signs accepted MSIX packages and delivers trusted automatic updates.

## Legal publisher

- Publisher display name: `PT COME PLAYERS DIGITAL`
- Product name: `ComePlayers`
- Website: `https://www.comeplayers.com`
- Contact email: `admin@comeplayers.com`
- Business Identification Number (NIB): `2407260058305`
- Registered office: `Bumi Parahyangan Kencana, Jl. Beo Blok B3 No. 5, RT 001/RW 014, Nagrak, Cangkuang, Kabupaten Bandung, Jawa Barat 40238, Indonesia`
- AHU approval: `AHU-A106377.AH.01.30.Tahun 2026`, dated `21 July 2026`
- NIB issued: `24 July 2026`

These values were cross-checked against the company establishment statement, Ministry of Law approval, and OSS NIB supplied by the company. The phone number and authorized representative entered in Partner Center must still exactly match current Indonesian government records.

## One-time owner verification

1. Open `https://storedeveloper.microsoft.com` and create a **Company** developer account.
2. Complete Microsoft identity verification as an authorized representative of PT COME PLAYERS DIGITAL.
3. Reserve the product name `ComePlayers`.
4. Open the product identity page and copy its **Package/Identity/Name** and **Publisher** values.

Microsoft requires the account owner to complete login, identity verification, agreements, and any requested legal documentation. These steps cannot be automated or completed by another party using invented identity information.

## Build the Store package

Install the Windows 10/11 SDK so `makeappx.exe` is available, then set the exact values copied from Partner Center:

```powershell
$env:COMEPLAYERS_STORE_IDENTITY_NAME = "value-from-partner-center"
$env:COMEPLAYERS_STORE_PUBLISHER_ID = "CN=value-from-partner-center"
npm run store:build --workspace @comeplayers/desktop
```

Output:

```text
apps/desktop/store-package/output/ComePlayers_VERSION_x64.msix
```

The Store build disables ComePlayers' direct installer updater because Microsoft Store manages application updates. The generated MSIX is intentionally for Partner Center submission only and must not be distributed directly before Microsoft signs it.
