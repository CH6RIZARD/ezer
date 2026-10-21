# EZER: build and install (no Expo payments, ever)

**EZER never uses Expo's cloud build service. There is nothing to buy.** Never
run `eas build` without `--local`, and never tell the owner to buy EAS builds,
build credits or an Expo plan. Both phones always get builds from the SAME
commit (CLAUDE.md, "Every build is BOTH platforms"). Run every command below
yourself; the owner only clicks Yes on a Windows admin (UAC) prompt.

Two apps:
- **Android** = the React Native / Expo app in `apps/mobile`. Built by
  `eas build --local` on GitHub Actions' runner: free, uses no EAS build
  credits (the `EXPO_TOKEN` repo secret is only a login).
- **iPhone** = the native SwiftUI app in `apps/ios`. It is NOT an Expo build:
  `eas build -p ios`, `expo prebuild`, Xcode and a Mac are all irrelevant. It is
  built with xtool on a Vast Linux box and installed from this PC through WSL.

## 0. Commit and push first

Both builds read committed, pushed code.

```bash
git push origin <branch>
git rev-parse --short HEAD        # the SHA both builds must show
```

## 1. Android (about 16 min)

```bash
gh workflow run "EAS local Android build" --repo CH6RIZARD/ezer --ref <branch> -f profile=preview
gh run list --workflow "EAS local Android build" -L 1 --json databaseId,headSha,status   # headSha must be your SHA
gh run watch <id>
gh run download <id> --dir /e/tmp/ezer-build-<id>
cp /e/tmp/ezer-build-<id>/ezer-aab/ezer.aab /e/tmp/ezer-build-<id>/ezer.apk   # preview = an APK despite the name
"$LOCALAPPDATA/Android/Sdk/platform-tools/adb.exe" install -r /e/tmp/ezer-build-<id>/ezer.apk
```

- Use `profile=preview` for phones (APK). The default, `production`, is a Play
  Store AAB that can't be sideloaded.
- adb is NOT on PATH: `C:\Users\chiagozie\AppData\Local\Android\Sdk\platform-tools\adb.exe`.
- `adb devices` must list the S22 (`R5CYA0GF6FP`). If Windows instead shows
  "Unknown USB Device (Device Descriptor Request Failed)", it's physical: a
  data cable, the phone unlocked, USB mode "File transfer", USB debugging
  allowed. Restarting the port from software didn't fix it (Oct 20 2026).
- Install only after the phone has been idle (see HANDOFF.md).

## 2. iPhone build (about 35 s)

```bash
bash scripts/remote-build.sh ios   # streams `git archive HEAD apps/ios` to the box → E:\tmp\Ezer.ipa
```

- The box is Vast instance 56970625, labelled "ezer-build". It is the default in
  `scripts/remote-build.sh`, with key `~/.ssh/vast_ed25519`. Override it with
  `VAST_SSH="-p <port> root@<ip>"`.
- **Box unreachable, stopped, or its start stuck "queued": don't wait for it.**
  Rent a new one and set it up (about 15 min, mostly the 2 GB Xcode upload):

  ```bash
  export PYTHONIOENCODING=utf-8      # vastai crashes on this PC without it
  vastai search offers 'reliability>0.98 cpu_ram>=32 disk_space>=120 inet_up>=200 cpu_cores_effective>=8 verified=true rentable=true' -o dph
  vastai create instance <offer_id> --image ubuntu:24.04 --disk 120 --ssh --direct --label ezer-build
  vastai show instance <id> --raw    # public_ipaddr, and ports["22/tcp"][0].HostPort once it is running
  K="-i $HOME/.ssh/vast_ed25519 -o StrictHostKeyChecking=no"
  ssh $K -p <port> root@<ip> "mkdir -p /root/ezer"
  scp $K -P <port> scripts/box-ezer-setup.sh root@<ip>:/root/ezer/setup.sh    # copy it BEFORE running it
  scp $K -P <port> /e/Xcode_27.xip root@<ip>:/root/ezer/Xcode.xip
  ssh $K -p <port> root@<ip> "cd /root/ezer && bash setup.sh"                 # ends with SETUP_DONE
  ```

  Then set the new `-p <port> root@<ip>` as the default in
  `scripts/remote-build.sh` and commit it. If an offer never leaves
  "loading", destroy it and take the next one.
- Don't build the iPhone app in local WSL: it runs out of memory on this 16 GB PC.

## 3. iPhone install (1–2 min)

The iPhone stays plugged into **Windows**, where the Apple Devices app's
`AppleMobileDeviceProcess` listens on 127.0.0.1:27015. WSL reaches it through a
port forward, 172.17.0.1:27015 → 127.0.0.1:27015 (`netsh interface portproxy`).

```bash
wsl -d Ubuntu -- bash -lic "USBMUXD_SOCKET_ADDRESS=172.17.0.1:27015 idevice_id -l"   # prints 00008101-000E0C400C08001E
wsl -d Ubuntu -- bash -lic "mkdir -p ~/apps/ipa && cp /mnt/e/tmp/Ezer.ipa ~/apps/ipa/Ezer.ipa && cd ~/apps/ipa && USBMUXD_SOCKET_ADDRESS=172.17.0.1:27015 xtool install Ezer.ipa"
```

It ends with `Successfully installed!`. Signing uses the Apple ID saved in
xtool on this PC; that ID is never sent to the box.

### When it breaks (all of these happened and were fixed on Oct 20 2026)

Run admin steps yourself:
`Start-Process powershell -Verb RunAs -Wait -WindowStyle Hidden -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','E:\tmp\<script>.ps1'`,
with the script writing its output to a log you then read.

- **`Wsl/Service/CreateInstance/MountDisk/HCS/E_ACCESSDENIED`.** As admin, run
  `icacls "E:\WSL\Ubuntu\ext4.vhdx" /grant "*S-1-5-83-0:(F)"`, then
  `wsl --shutdown`, then start WSL from an admin process:
  `Start-Process wsl -ArgumentList '-d','Ubuntu','--','sleep','14400' -WindowStyle Hidden`.
  While that VM stays up, normal (non-admin) `wsl` commands work.
- **`idevice_id`: "Unable to retrieve device list", or xtool: "Operation now in progress".**
  Nothing is listening on 172.17.0.1:27015, because WSL was restarted after the
  forward was set up. As admin, run `Restart-Service iphlpsvc -Force`. Check
  with `Get-NetTCPConnection -LocalPort 27015 -State Listen`, which should list
  both 172.17.0.1 and 127.0.0.1.
- **Never `usbipd attach` or `usbipd bind --force` the iPhone.** Inside WSL it
  fails with `LockdownClient.Error.muxError` or "RX transfer stalled", and
  force-binding takes the phone away from Windows until it is replugged. If it
  has happened, run `usbipd unbind --busid <id>` as admin, then replug.
- **Provisioning 409, "There are no current IOS devices on this team matching
  the provided device IDs".** This is transient: run the install again.

## Never

- `eas build` without `--local`, Expo cloud builds, or buying EAS/Expo plans or build credits.
- `"local": true` in eas.json (not a real key), `expo prebuild` for iOS, or Xcode/Mac steps.
- Building or installing only one platform.
- Telling the owner to run any of this. Run it yourself.
