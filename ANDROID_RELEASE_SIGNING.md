# Android release signing

Debug APKs are signed with a throwaway debug key and are not suitable for giving to scrutineers. Release builds are
shrunk (R8) and signed with **your** key. Status: configured in `android/app/build.gradle.kts` and the workflow,
but not yet test-built, so do a first release build in a safe place and install it on a real phone.

## 1. Create the keystore (once)
```bash
keytool -genkeypair -v -keystore votewatch-release.jks -alias votewatch \
  -keyalg RSA -keysize 4096 -validity 10000
```
Keep the `.jks` file and both passwords in a password manager **and** a second offline backup. If you lose the key you
cannot ship updates that install over the old app. Never commit it (`.gitignore` already excludes `*.jks`/`*.keystore`).

## 2. Local build
Add to `android/local.properties` (git-ignored): `KEYSTORE_PATH`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`, then
`cd android && gradle assembleRelease`. The APK is in `app/build/outputs/apk/release/`.

## 3. Build in GitHub Actions
Add repository secrets: `ANDROID_KEYSTORE_BASE64` (`base64 -w0 votewatch-release.jks`), `ANDROID_KEYSTORE_PASSWORD`,
`ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`, plus the existing `SUPABASE_URL` / `SUPABASE_ANON_KEY`.
Then Actions > Build Android APK > Run workflow > tick **release**.

## 4. Before each release
- Bump `versionCode` (must always increase) and `versionName` in `android/app/build.gradle.kts`.
- Smoke test the release APK: sign in, download locations, enter a tally offline, sync, export. R8 can break reflection;
  `proguard-rules.pro` covers Tink and Room, but only a real run proves it.
- Distribute the APK over a channel you control and publish its SHA-256 so scrutineers can verify it.

## Known follow-up
`androidx.security:security-crypto` is deprecated. It still works; plan to move token storage to Android Keystore directly.
