# Releasing the Android app

What Seth does by hand to put the game on Google Play. The code side is in
`docs/architecture/android.md`. Everything below is one-time setup except
the last section.

## 1. Accounts

1. **Google Play developer account** at <https://play.google.com/console>
   ($25 once, identity check can take a few days). A personal account must
   run a closed test with at least 12 testers for 14 days before it can
   publish to production, so start that early.
2. **AdMob account** at <https://admob.google.com>, linked to the same
   Google account. Add a payment profile later; ads can run before it.

## 2. The upload key (on your computer)

Needs Java (Android Studio includes it). Keep the file and passwords safe:
losing them means asking Google to reset the key.

```sh
keytool -genkeypair -v -keystore upload.jks -alias upload \
  -keyalg RSA -keysize 2048 -validity 10000
base64 -w0 upload.jks > upload.jks.b64     # macOS: base64 -i upload.jks -o upload.jks.b64
```

In GitHub, **Settings → Secrets and variables → Actions → Secrets**, add:

| Secret | Value |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | contents of `upload.jks.b64` |
| `ANDROID_KEYSTORE_PASSWORD` | the keystore password |
| `ANDROID_KEY_ALIAS` | `upload` |
| `ANDROID_KEY_PASSWORD` | the key password |

The next push to `main` (or **Actions → Android app → Run workflow**) makes a
signed `.aab`, downloadable from the run's artifacts.

## 3. Create the app in Play Console

1. **Create app**: name "Tower Defense" (or the store name you want), Game,
   Free, accept the declarations.
2. **Testing → Internal testing → Create new release**, upload the signed
   `.aab` from step 2 by hand (Play's API cannot upload an app's very first
   bundle). Let Google manage the app signing key when asked.
   The package name will read `io.github.sethrimer3.towerdefense` and can
   never change after this upload.
3. **Monetize → Products → In-app products → Create product**: ID
   `full_game` (or another ID, then set the `PLAY_PRODUCT_ID` variable), a
   name, a price, **Activate**. In-app products only appear after a bundle
   with the billing library is uploaded, which step 2 did.
4. **Setup → License testing**: add your Google account so test purchases
   are free.
5. **Testers**: add your account to the internal testing list and open the
   opt-in link on your phone.

## 4. AdMob

1. **Apps → Add app → Android**, pick it from Play once it is listed (or add
   it manually). Copy the **App ID** (`ca-app-pub-…~…`).
2. **Ad units → Add → Rewarded**, reward 1 "hour". Copy the **ad unit ID**
   (`ca-app-pub-…/…`).
3. **Privacy & messaging → GDPR** (and **US states**): create and publish a
   consent message for the app. The game shows it automatically.
4. In GitHub, **Settings → Secrets and variables → Actions → Variables**:

| Variable | Value |
|---|---|
| `ADMOB_APP_ID` | the App ID |
| `ADMOB_REWARDED_ID` | the rewarded ad unit ID |

Until these are set the app shows Google's test ads, which pay nothing and
are safe to tap. Never tap your own live ads: add your phone as a test
device in **AdMob → Settings → Test devices** before switching to real IDs.

## 5. Automatic uploads (optional, recommended)

So every merge to `main` lands in internal testing by itself:

1. In Google Cloud (Play Console → **Setup → API access** links there),
   create a service account and a JSON key.
2. In Play Console, **Users and permissions → Invite new user** with the
   service account's email; give it *Release apps to testing tracks* for
   this app.
3. Add the JSON file's contents as the `PLAY_SERVICE_ACCOUNT_JSON` secret.
4. Uploads arrive as drafts. After the first release is rolled out, add the
   variable `PLAY_RELEASE_STATUS` = `completed` so later ones roll out to
   internal testers automatically.

## 6. Before production

- **App content**: privacy policy URL
  `https://sethrimer3.github.io/TowerDefense/privacy.html`, ads: *Yes*,
  target audience (13+ matches the policy), content rating questionnaire.
- **Data safety**: declare what AdMob collects (device or other IDs,
  approximate location, app interactions, diagnostics; shared with Google
  for advertising; encrypted in transit) and that purchases go through
  Google Play. The game itself collects nothing.
- **Store listing**: short and full description, 512×512 icon
  (`public/GameIcon.png`), a 1024×500 feature graphic, at least two phone
  screenshots.
- Finish the closed test (12 testers, 14 days) if the account is personal.

## Each release after setup

Merge to `main`. CI builds a signed bundle with a higher version code and
(with step 5) puts it in internal testing. Check it on your phone, then in
Play Console **promote the release to Production** (or to closed testing
first). The web game on GitHub Pages updates on the same merge.
