(() => {
  "use strict";
  const audio = document.getElementById("audio");
  const fileInput = document.getElementById("fileInput");
  const folderInput = document.getElementById("folderInput");
  const trackList = document.getElementById("trackList");
  const emptyState = document.getElementById("emptyState");
  const trackCount = document.getElementById("trackCount");
  const playButton = document.getElementById("playButton");
  const previousButton = document.getElementById("previousButton");
  const nextButton = document.getElementById("nextButton");
  const repeatButton = document.getElementById("repeatButton");
  const repeatLabel = document.getElementById("repeatLabel");
  const shuffleButton = document.getElementById("shuffleButton");
  const progress = document.getElementById("progress");
  const currentTime = document.getElementById("currentTime");
  const duration = document.getElementById("duration");
  const volume = document.getElementById("volume");
  const nowTitle = document.getElementById("nowTitle");
  const nowArtist = document.getElementById("nowArtist");
  const coverArt = document.getElementById("coverArt");
  const toast = document.getElementById("toast");

  const capacitorBridge = window.Capacitor;
  const isNative = Boolean(capacitorBridge?.isNativePlatform?.() && typeof capacitorBridge.nativePromise === "function");
  // Use Capacitor's bridge directly so this lightweight, non-bundled app does not
  // depend on a generated JavaScript plugin proxy.
  const native = isNative ? {
    call: (method, options = {}) => capacitorBridge.nativePromise("EchoPlayNative", method, options),
    getLibrary: () => capacitorBridge.nativePromise("EchoPlayNative", "getLibrary", {}),
    getPlaybackState: () => capacitorBridge.nativePromise("EchoPlayNative", "getPlaybackState", {}),
    pickAudioFiles: () => capacitorBridge.nativePromise("EchoPlayNative", "pickAudioFiles", {}),
    pickFolder: () => capacitorBridge.nativePromise("EchoPlayNative", "pickFolder", {}),
    playQueue: options => capacitorBridge.nativePromise("EchoPlayNative", "playQueue", options),
    togglePlay: () => capacitorBridge.nativePromise("EchoPlayNative", "togglePlay", {}),
    next: () => capacitorBridge.nativePromise("EchoPlayNative", "next", {}),
    previous: () => capacitorBridge.nativePromise("EchoPlayNative", "previous", {}),
    seekTo: options => capacitorBridge.nativePromise("EchoPlayNative", "seekTo", options),
    setRepeatMode: options => capacitorBridge.nativePromise("EchoPlayNative", "setRepeatMode", options),
    setShuffleEnabled: options => capacitorBridge.nativePromise("EchoPlayNative", "setShuffleEnabled", options),
    setVolume: options => capacitorBridge.nativePromise("EchoPlayNative", "setVolume", options),
    stopPlayback: () => capacitorBridge.nativePromise("EchoPlayNative", "stopPlayback", {}),
    clearLibrary: () => capacitorBridge.nativePromise("EchoPlayNative", "clearLibrary", {}),
    addListener: (eventName, callback) => capacitorBridge.nativeCallback("EchoPlayNative", "addListener", { eventName }, callback)
  } : null;

  let tracks = [];
  let currentIndex = -1;
  let repeatMode = "all";
  let shuffle = false;
  let shuffledOrder = [];
  let toastTimer;
  let nativeIsPlaying = false;
  let nativePosition = 0;
  let nativeDuration = 0;

  const formatTime = seconds => {
    if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60).toString().padStart(2, "0");
    return `${mins}:${secs}`;
  };

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
  }

  function trackName(track) { return track.name || track.file?.name || `${track.title || "Unknown audio"}`; }
  function trackDetail(track) { return track.folder || track.file?.webkitRelativePath?.split("/").slice(0, -1).join(" / ") || "Local audio"; }
  function fileTitle(file) { return file.name.replace(/\.[^/.]+$/, ""); }

  function renderTracks() {
    trackCount.textContent = `${tracks.length} track${tracks.length === 1 ? "" : "s"}`;
    emptyState.hidden = tracks.length > 0;
    trackList.replaceChildren();
    tracks.forEach((track, index) => {
      const row = document.createElement("div");
      row.className = `track-row${index === currentIndex ? " playing" : ""}`;
      row.setAttribute("role", "button");
      row.setAttribute("tabindex", "0");
      row.setAttribute("aria-label", `Play ${track.title}`);
      const cover = document.createElement("div");
      cover.className = "mini-cover";
      cover.textContent = index === currentIndex && (isNative ? nativeIsPlaying : !audio.paused) ? "♫" : "♪";
      const text = document.createElement("div");
      text.className = "track-text";
      const title = document.createElement("span");
      title.className = "track-title";
      title.textContent = track.title;
      const subtitle = document.createElement("span");
      subtitle.className = "track-subtitle";
      subtitle.textContent = trackDetail(track);
      text.append(title, subtitle);
      const length = document.createElement("span");
      length.className = "track-duration";
      length.textContent = index === currentIndex && (isNative ? nativeDuration > 0 : Number.isFinite(audio.duration))
        ? formatTime(isNative ? nativeDuration / 1000 : audio.duration) : "";
      const play = document.createElement("button");
      play.className = "track-play";
      play.title = "Play track";
      play.setAttribute("aria-label", `Play ${track.title}`);
      play.textContent = index === currentIndex && (isNative ? nativeIsPlaying : !audio.paused) ? "Ⅱ" : "▶";
      play.addEventListener("click", event => { event.stopPropagation(); selectTrack(index, true); });
      row.append(cover, text, length, play);
      row.addEventListener("click", () => selectTrack(index, true));
      row.addEventListener("keydown", event => {
        if (event.key === "Enter" || event.key === " ") { event.preventDefault(); selectTrack(index, true); }
      });
      trackList.append(row);
    });
  }

  function updateCurrentInfo(playing) {
    const track = tracks[currentIndex];
    if (!track) {
      nowTitle.textContent = "Nothing playing yet";
      nowArtist.textContent = "Add tracks to your library";
      coverArt.textContent = "♫";
      playButton.textContent = "▶";
      playButton.setAttribute("aria-label", "Play");
      return;
    }
    nowTitle.textContent = track.title;
    nowArtist.textContent = track.artist || trackDetail(track);
    coverArt.textContent = "♫";
    playButton.textContent = playing ? "Ⅱ" : "▶";
    playButton.setAttribute("aria-label", playing ? "Pause" : "Play");
    if (!isNative && "mediaSession" in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title,
        artist: track.artist || "EchoPlay · Local audio",
        album: "Your library"
      });
    }
  }

  function makeShuffleOrder() {
    shuffledOrder = tracks.map((_, index) => index);
    for (let i = shuffledOrder.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffledOrder[i], shuffledOrder[j]] = [shuffledOrder[j], shuffledOrder[i]];
    }
    if (shuffledOrder.length > 1 && shuffledOrder[0] === currentIndex) {
      [shuffledOrder[0], shuffledOrder[1]] = [shuffledOrder[1], shuffledOrder[0]];
    }
  }

  async function selectTrack(index, autoplay) {
    if (index < 0 || index >= tracks.length) return;
    currentIndex = index;
    updateCurrentInfo(false);
    renderTracks();
    if (isNative) {
      if (!autoplay) return;
      try {
        await native.playQueue({
          tracks: tracks.map(track => ({ uri: track.uri, title: track.title, artist: track.artist || "Local audio" })),
          startIndex: index
        });
        nativeIsPlaying = true;
        updateCurrentInfo(true);
        showToast(`Playing ${tracks[index].title}`);
      } catch (error) {
        showToast("Android playback could not start. Please try again.");
        console.error("EchoPlay native playback error:", error);
      }
      return;
    }
    audio.src = tracks[index].url;
    audio.load();
    if (autoplay) {
      try { await audio.play(); updateCurrentInfo(true); }
      catch (error) { showToast("Playback could not start. Try tapping Play again."); }
    }
  }

  async function togglePlay() {
    if (!tracks.length) { showToast("Add audio files first."); return; }
    if (isNative) {
      if (currentIndex < 0) { await selectTrack(0, true); return; }
      try {
        await native.togglePlay();
        const state = await native.getPlaybackState();
        applyNativeState(state);
      } catch (error) { showToast("Playback control failed. Try again."); }
      return;
    }
    if (currentIndex < 0) { await selectTrack(0, true); return; }
    if (audio.paused) {
      try { await audio.play(); updateCurrentInfo(true); }
      catch { showToast("Playback could not start. Select a track and try again."); }
    } else {
      audio.pause();
      updateCurrentInfo(false);
    }
    renderTracks();
  }

  function nextIndex() {
    if (!tracks.length) return -1;
    if (shuffle && tracks.length > 1) {
      if (!shuffledOrder.length) makeShuffleOrder();
      const currentPosition = shuffledOrder.indexOf(currentIndex);
      if (currentPosition < shuffledOrder.length - 1) return shuffledOrder[currentPosition + 1];
      if (repeatMode === "all") { makeShuffleOrder(); return shuffledOrder[0]; }
      return -1;
    }
    if (currentIndex < tracks.length - 1) return currentIndex + 1;
    return repeatMode === "all" ? 0 : -1;
  }

  function previousIndex() {
    if (!tracks.length) return -1;
    if (audio.currentTime > 3) return currentIndex;
    if (shuffle && shuffledOrder.length) {
      const pos = shuffledOrder.indexOf(currentIndex);
      if (pos > 0) return shuffledOrder[pos - 1];
      return repeatMode === "all" ? shuffledOrder[shuffledOrder.length - 1] : currentIndex;
    }
    if (currentIndex > 0) return currentIndex - 1;
    return repeatMode === "all" ? tracks.length - 1 : currentIndex;
  }

  async function skipNext(automatic = false) {
    if (!tracks.length) return;
    if (isNative) {
      try { await native.next(); } catch (error) { console.error(error); }
      return;
    }
    if (automatic && repeatMode === "one") {
      audio.currentTime = 0;
      try { await audio.play(); } catch {}
      return;
    }
    const next = nextIndex();
    if (next === -1) {
      audio.pause(); audio.currentTime = 0;
      updateCurrentInfo(false); renderTracks();
      return;
    }
    await selectTrack(next, true);
  }

  function cycleRepeat() {
    repeatMode = repeatMode === "all" ? "one" : repeatMode === "one" ? "off" : "all";
    repeatLabel.textContent = repeatMode === "all" ? "Repeat all" : repeatMode === "one" ? "Repeat one" : "Repeat off";
    repeatButton.classList.toggle("active", repeatMode !== "off");
    repeatButton.setAttribute("aria-pressed", String(repeatMode !== "off"));
    repeatButton.querySelector("span:first-child").textContent = repeatMode === "one" ? "⟳¹" : repeatMode === "off" ? "⟳̸" : "⟳";
    if (isNative) native.setRepeatMode({ mode: repeatMode }).catch(console.error);
    showToast(repeatLabel.textContent);
  }

  function applyNativeState(state) {
    if (!state) return;
    if (Number.isInteger(state.currentIndex) && state.currentIndex >= 0 && state.currentIndex < tracks.length) {
      currentIndex = state.currentIndex;
    }
    nativeIsPlaying = Boolean(state.isPlaying);
    nativePosition = Number(state.position || 0);
    nativeDuration = Number(state.duration || 0);
    currentTime.textContent = formatTime(nativePosition / 1000);
    duration.textContent = formatTime(nativeDuration / 1000);
    if (nativeDuration > 0) progress.value = String(Math.round(nativePosition / nativeDuration * 1000));
    updateCurrentInfo(nativeIsPlaying);
    renderTracks();
  }

  function updateNativeLibrary(result) {
    const previousId = currentIndex >= 0 ? tracks[currentIndex]?.id : null;
    tracks = (result?.tracks || []).map(track => ({
      ...track,
      id: track.id || track.uri,
      title: track.title || track.name?.replace(/\.[^/.]+$/, "") || "Unknown audio",
      artist: track.artist || "Local audio"
    }));
    currentIndex = previousId ? tracks.findIndex(track => track.id === previousId) : -1;
    if (currentIndex < 0 && tracks.length === 0) currentIndex = -1;
    renderTracks();
    if (currentIndex >= 0) updateCurrentInfo(nativeIsPlaying);
    else updateCurrentInfo(false);
  }

  async function importNativeFiles(method) {
    try {
      const result = await native[method]();
      if (result?.cancelled) return;
      updateNativeLibrary(result);
      const added = Number(result?.added || 0);
      if (added > 0 && currentIndex >= 0) {
        try {
          const state = await native.getPlaybackState();
          await native.playQueue({
            tracks: tracks.map(track => ({ uri: track.uri, title: track.title, artist: track.artist || "Local audio" })),
            startIndex: currentIndex,
            startPosition: Number(state.position || 0),
            playWhenReady: Boolean(state.isPlaying)
          });
        } catch (error) { console.error("Could not refresh the active queue:", error); }
      }
      showToast(added ? `Added ${added} track${added === 1 ? "" : "s"}.` : "No new supported audio tracks found.");
    } catch (error) {
      console.error(`EchoPlay ${method} error:`, error);
      showToast("Could not import music. Please try again.");
    }
  }

  document.getElementById("addFilesButton").addEventListener("click", () => {
    if (isNative) importNativeFiles("pickAudioFiles"); else fileInput.click();
  });
  document.getElementById("addFolderButton").addEventListener("click", () => {
    if (isNative) importNativeFiles("pickFolder"); else folderInput.click();
  });

  function addWebFiles(fileCollection) {
    const incoming = Array.from(fileCollection || []).filter(file =>
      file.type.startsWith("audio/") || /\.(mp3|m4a|aac|wav|ogg|flac|opus|weba)$/i.test(file.name)
    );
    if (!incoming.length) { showToast("No supported audio files found. Try MP3, M4A, WAV or OGG."); return; }
    const existing = new Set(tracks.map(track => `${track.file.name}:${track.file.size}:${track.file.lastModified}`));
    const fresh = incoming.filter(file => !existing.has(`${file.name}:${file.size}:${file.lastModified}`));
    tracks.push(...fresh.map(file => ({
      id: (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`),
      file, title: fileTitle(file), artist: "Local audio", url: URL.createObjectURL(file)
    })));
    if (currentIndex === -1 && tracks.length) updateCurrentInfo(false);
    renderTracks();
    showToast(fresh.length ? `Added ${fresh.length} track${fresh.length === 1 ? "" : "s"}.` : "Those tracks are already in your library.");
    fileInput.value = ""; folderInput.value = "";
  }

  fileInput.addEventListener("change", () => addWebFiles(fileInput.files));
  folderInput.addEventListener("change", () => addWebFiles(folderInput.files));

  document.getElementById("clearButton").addEventListener("click", async () => {
    if (isNative) {
      try { await native.stopPlayback(); await native.clearLibrary(); }
      catch (error) { console.error(error); showToast("Could not clear the library completely."); return; }
    } else {
      audio.pause(); audio.removeAttribute("src"); audio.load();
      tracks.forEach(track => URL.revokeObjectURL(track.url));
    }
    tracks = []; currentIndex = -1; nativeIsPlaying = false; nativePosition = 0; nativeDuration = 0;
    updateCurrentInfo(false); renderTracks(); progress.value = "0";
    currentTime.textContent = "0:00"; duration.textContent = "0:00";
    showToast("Library cleared.");
  });

  playButton.addEventListener("click", togglePlay);
  nextButton.addEventListener("click", () => skipNext(false));
  previousButton.addEventListener("click", async () => {
    if (isNative) { try { await native.previous(); } catch (error) { console.error(error); } return; }
    const prev = previousIndex(); if (prev !== -1) await selectTrack(prev, true);
  });
  repeatButton.addEventListener("click", cycleRepeat);
  shuffleButton.addEventListener("click", () => {
    shuffle = !shuffle;
    shuffleButton.classList.toggle("active", shuffle);
    shuffleButton.setAttribute("aria-pressed", String(shuffle));
    if (shuffle) makeShuffleOrder(); else shuffledOrder = [];
    if (isNative) native.setShuffleEnabled({ enabled: shuffle }).catch(console.error);
    showToast(shuffle ? "Shuffle on" : "Shuffle off");
  });

  if (!isNative) {
    audio.addEventListener("play", () => { updateCurrentInfo(true); renderTracks(); });
    audio.addEventListener("pause", () => { updateCurrentInfo(false); renderTracks(); });
    audio.addEventListener("ended", () => {
      if (repeatMode === "off" && !shuffle && currentIndex === tracks.length - 1) {
        updateCurrentInfo(false); renderTracks(); return;
      }
      skipNext(true);
    });
    audio.addEventListener("timeupdate", () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) progress.value = String(Math.round(audio.currentTime / audio.duration * 1000));
      currentTime.textContent = formatTime(audio.currentTime);
    });
    audio.addEventListener("loadedmetadata", () => { duration.textContent = formatTime(audio.duration); renderTracks(); });
    audio.addEventListener("error", () => { if (audio.src) showToast("This audio format may not be supported by your browser."); });
    volume.addEventListener("input", () => { audio.volume = Number(volume.value); });
    audio.volume = Number(volume.value);
    if ("mediaSession" in navigator) {
      navigator.mediaSession.setActionHandler("play", togglePlay);
      navigator.mediaSession.setActionHandler("pause", () => audio.pause());
      navigator.mediaSession.setActionHandler("previoustrack", () => previousButton.click());
      navigator.mediaSession.setActionHandler("nexttrack", () => nextButton.click());
      navigator.mediaSession.setActionHandler("seekto", details => {
        if (Number.isFinite(audio.duration) && details.seekTime != null) audio.currentTime = details.seekTime;
      });
    }
  } else {
    volume.addEventListener("input", () => native.setVolume({ volume: Number(volume.value) }).catch(console.error));
    progress.addEventListener("input", () => {
      if (nativeDuration > 0) native.seekTo({ position: Math.round(Number(progress.value) / 1000 * nativeDuration) }).catch(console.error);
    });
    native.addListener("playbackState", applyNativeState);
    native.setVolume({ volume: Number(volume.value) }).catch(console.error);
    native.getLibrary().then(async result => {
      updateNativeLibrary(result);
      try { applyNativeState(await native.getPlaybackState()); } catch (error) { console.error(error); }
    }).catch(error => {
      console.error("EchoPlay library restore error:", error);
      showToast("Could not restore your saved library.");
    });
    window.setInterval(() => native.getPlaybackState().then(applyNativeState).catch(() => {}), 1000);
  }

  document.getElementById("themeButton").addEventListener("click", () => {
    document.body.classList.toggle("light");
    document.getElementById("themeButton").innerHTML = `<span>${document.body.classList.contains("light") ? "☾" : "◐"}</span> Switch appearance`;
  });

  const dropZone = document.getElementById("dropZone");
  ["dragenter", "dragover"].forEach(type => dropZone.addEventListener(type, event => {
    event.preventDefault(); dropZone.classList.add("dragging");
  }));
  ["dragleave", "drop"].forEach(type => dropZone.addEventListener(type, event => {
    event.preventDefault(); dropZone.classList.remove("dragging");
  }));
  dropZone.addEventListener("drop", event => { if (!isNative) addWebFiles(event.dataTransfer.files); });

  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    window.addEventListener("load", () => navigator.serviceWorker.register("./service-worker.js").catch(() => {}));
  }

  if (isNative) {
    repeatLabel.textContent = "Repeat all";
    native.setRepeatMode({ mode: repeatMode }).catch(() => {});
  }
})();
