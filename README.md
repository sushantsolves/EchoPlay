# EchoPlay 🎧

**Your music. Your rules.** EchoPlay is a personal, offline-first music player concept with a dark-purple interface, local file selection, queue playback, repeat modes, shuffle, seek, volume, and Media Session controls where supported.

## What works in this starter

- Add multiple local audio files, or select a folder in browsers that support folder selection.
- Play/pause, next/previous, seek, and volume.
- Repeat all, repeat one, or repeat off.
- Shuffle queue.
- Drag and drop audio files on desktop.
- Responsive mobile layout and light/dark theme toggle.
- PWA shell caching for offline access after the first visit (the selected music files are not uploaded).
- Media Session metadata and play/pause/next/previous actions where the browser supports them.

## Important limitations

- **Music is selected locally in the current session.** Browsers do not provide universal, permanent access to arbitrary phone folders. If you refresh the page, select the files again.
- Browser background playback and lock-screen controls vary by device/browser. For reliable Android background playback, we should finish the native Android wrapper and then use a native Media3 playback service. This starter uses HTML audio and is best treated as the first functional UI/prototype.
- Supported formats depend on the browser and operating system. MP3/AAC/M4A/WAV/OGG support is common, but not universal.
- This starter does not download music from streaming services and does not include copyrighted music.

## Run in VS Code

1. Install Node.js LTS (npm comes with it).
2. Extract the ZIP and open the `EchoPlay` folder in VS Code.
3. Open **Terminal → New Terminal**.
4. Run:

   ```bash
   npm install
   npm run start
   ```

5. Open the local URL Vite prints (usually `http://localhost:5173`).
6. Press **Choose files** and select audio from your computer.

For a quick static preview, you can also open `index.html` with VS Code Live Server. PWA/service-worker behavior requires localhost or HTTPS; the Vite dev server provides localhost.

## Build the website

```bash
npm install
npm run build
```

The production-ready static site is written to `www/`. You can deploy the contents of `www/` to Vercel, Netlify, or GitHub Pages. This first web version can be deployed for free.

## Android APK path (Windows)

Prerequisites:
- Android Studio with Android SDK installed.
- JDK compatible with the installed Android Gradle Plugin (Android Studio's bundled JBR is usually the easiest choice).
- Node.js LTS.

Then, from the project folder:

```bash
npm install
npm run build
npx cap add android
npx cap sync android
npx cap open android
```

Android Studio opens the native wrapper. Use **Build → Build Bundle(s) / APK(s) → Build APK(s)** to create a debug APK for testing. The generated APK is normally under `android/app/build/outputs/apk/debug/`.

If you edit web files, run `npm run build` and `npx cap sync android` again before rebuilding.

### Native playback caveat

Capacitor wraps the web player, but a WebView alone does not guarantee reliable long-running background audio. For the final Android product, implement a native Android Media3 `MediaSessionService` and connect the interface to it. That is the step that makes background playback, notifications, audio focus, and lock-screen behavior robust.

## Privacy

- No backend or account is required.
- No audio files are uploaded by this app.
- Clearing the library releases the temporary object URLs created for selected files.
"# EchoPlay" 
