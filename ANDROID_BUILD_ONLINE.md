# Building the Android app online (no computer tools needed)

GitHub compiles the app for you and gives you an APK. The app has never been compiled before, so expect to fix some errors on the first runs;
send the error lines to Claude and repeat.

## 1. Make sure the build workflow is in your repo
Folders that start with a dot (like `.github`) are often skipped when dragging files into GitHub. Check your repo for `.github/workflows/build-apk.yml`.
If it is missing:
1. In the repo click **Add file > Create new file**.
2. In the name box type exactly `.github/workflows/build-apk.yml` (typing each `/` makes a folder).
3. Paste the contents of `.github/workflows/build-apk.yml` from the project zip and click **Commit changes**.

## 2. Add the two secrets
Repo > **Settings > Secrets and variables > Actions > New repository secret**:
- `SUPABASE_URL` = your Project URL
- `SUPABASE_ANON_KEY` = the anon public key (never the service_role key)

## 3. Run the build
Repo > **Actions** tab > **Build APK** > **Run workflow**. It takes several minutes. If it fails, open the run, open the failed step, and copy the
red error lines to Claude. When it succeeds, scroll to **Artifacts** and download `VoteWatchPNG-debug-apk`.

## 4. Install on a phone
Unzip the artifact, copy the `.apk` to an Android phone, open it and allow "install unknown apps" when asked. A debug APK is for testing only;
a signed release build is needed before wide distribution.
