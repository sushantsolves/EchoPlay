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

  let tracks = [];
  let currentIndex = -1;
  let repeatMode = "all"; // off | all | one
  let shuffle = false;
  let shuffledOrder = [];
  let toastTimer;

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
  function fileTitle(file) {
    return file.name.replace(/\.[^/.]+$/, "");
  }
  function addFiles(fileCollection) {
    const incoming = Array.from(fileCollection || []).filter(file =>
      file.type.startsWith("audio/") || /\.(mp3|m4a|aac|wav|ogg|flac|opus|weba)$/i.test(file.name)
    );
    if (!incoming.length) {
      showToast("No supported audio files found. Try MP3, M4A, WAV or OGG.");
      return;
    }
    const existing = new Set(tracks.map(track => `${track.file.name}:${track.file.size}:${track.file.lastModified}`));
    const fresh = incoming.filter(file => !existing.has(`${file.name}:${file.size}:${file.lastModified}`));
    tracks.push(...fresh.map(file => ({
      id: (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`),
      file,
      title: fileTitle(file),
      url: URL.createObjectURL(file)
    })));
    if (!tracks.length) return;
    if (currentIndex === -1 && tracks.length) updateCurrentInfo(false);
    renderTracks();
    showToast(fresh.length ? `Added ${fresh.length} track${fresh.length === 1 ? "" : "s"}.` : "Those tracks are already in your library.");
    fileInput.value = "";
    folderInput.value = "";
  }
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
      cover.textContent = index === currentIndex && !audio.paused ? "♫" : "♪";
      const text = document.createElement("div");
      text.className = "track-text";
      const title = document.createElement("span");
      title.className = "track-title";
      title.textContent = track.title;
      const subtitle = document.createElement("span");
      subtitle.className = "track-subtitle";
      subtitle.textContent = track.file.webkitRelativePath ? track.file.webkitRelativePath.split("/").slice(0, -1).join(" / ") || "Local file" : "Local audio";
      text.append(title, subtitle);
      const length = document.createElement("span");
      length.className = "track-duration";
      length.textContent = index === currentIndex && Number.isFinite(audio.duration) ? formatTime(audio.duration) : "";
      const play = document.createElement("button");
      play.className = "track-play";
      play.title = "Play track";
      play.setAttribute("aria-label", `Play ${track.title}`);
      play.textContent = index === currentIndex && !audio.paused ? "Ⅱ" : "▶";
      play.addEventListener("click", event => { event.stopPropagation(); selectTrack(index, true); });
      row.append(cover, text, length, play);
      row.addEventListener("click", () => selectTrack(index, true));
      row.addEventListener("keydown", event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); selectTrack(index, true); } });
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
    nowArtist.textContent = track.file.webkitRelativePath ? track.file.webkitRelativePath.split("/").slice(0, -1).join(" / ") || "Local audio" : "Local audio";
    coverArt.textContent = "♫";
    playButton.textContent = playing ? "Ⅱ" : "▶";
    playButton.setAttribute("aria-label", playing ? "Pause" : "Play");
    if ("mediaSession" in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title,
        artist: "EchoPlay · Local audio",
        album: "Your library"
      });
    }
  }
  async function selectTrack(index, autoplay) {
    if (index < 0 || index >= tracks.length) return;
    currentIndex = index;
    audio.src = tracks[index].url;
    audio.load();
    updateCurrentInfo(false);
    renderTracks();
    if (autoplay) {
      try {
        await audio.play();
        updateCurrentInfo(true);
      } catch (error) {
        showToast("Playback could not start. Try tapping Play again.");
      }
    }
  }
  async function togglePlay() {
    if (!tracks.length) { showToast("Add audio files first."); return; }
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
  function makeShuffleOrder() {
    shuffledOrder = tracks.map((_, index) => index);
    for (let i = shuffledOrder.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffledOrder[i], shuffledOrder[j]] = [shuffledOrder[j], shuffledOrder[i]];
    }
    if (shuffledOrder.length > 1 && shuffledOrder[0] === currentIndex) [shuffledOrder[0], shuffledOrder[1]] = [shuffledOrder[1], shuffledOrder[0]];
  }
  async function skipNext(automatic = false) {
    if (!tracks.length) return;
    if (automatic && repeatMode === "one") {
      audio.currentTime = 0;
      try { await audio.play(); } catch {}
      return;
    }
    const next = nextIndex();
    if (next === -1) {
      audio.pause();
      audio.currentTime = 0;
      updateCurrentInfo(false);
      renderTracks();
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
    showToast(repeatLabel.textContent);
  }

  document.getElementById("addFilesButton").addEventListener("click", () => fileInput.click());
  document.getElementById("addFolderButton").addEventListener("click", () => folderInput.click());
  fileInput.addEventListener("change", () => addFiles(fileInput.files));
  folderInput.addEventListener("change", () => addFiles(folderInput.files));
  document.getElementById("clearButton").addEventListener("click", () => {
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    tracks.forEach(track => URL.revokeObjectURL(track.url));
    tracks = []; currentIndex = -1; shuffledOrder = [];
    updateCurrentInfo(false); renderTracks(); progress.value = "0"; currentTime.textContent = "0:00"; duration.textContent = "0:00";
    showToast("Library cleared.");
  });
  playButton.addEventListener("click", togglePlay);
  nextButton.addEventListener("click", () => skipNext(false));
  previousButton.addEventListener("click", async () => { const prev = previousIndex(); if (prev !== -1) await selectTrack(prev, true); });
  repeatButton.addEventListener("click", cycleRepeat);
  shuffleButton.addEventListener("click", () => {
    shuffle = !shuffle;
    shuffleButton.classList.toggle("active", shuffle);
    shuffleButton.setAttribute("aria-pressed", String(shuffle));
    if (shuffle) makeShuffleOrder(); else shuffledOrder = [];
    showToast(shuffle ? "Shuffle on" : "Shuffle off");
  });
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
  progress.addEventListener("input", () => {
    if (Number.isFinite(audio.duration) && audio.duration > 0) audio.currentTime = Number(progress.value) / 1000 * audio.duration;
  });
  volume.addEventListener("input", () => { audio.volume = Number(volume.value); });
  audio.volume = Number(volume.value);

  document.getElementById("themeButton").addEventListener("click", () => {
    document.body.classList.toggle("light");
    document.getElementById("themeButton").textContent = document.body.classList.contains("light") ? "☾" : "☼";
  });

  if ("mediaSession" in navigator) {
    navigator.mediaSession.setActionHandler("play", togglePlay);
    navigator.mediaSession.setActionHandler("pause", () => audio.pause());
    navigator.mediaSession.setActionHandler("previoustrack", () => previousButton.click());
    navigator.mediaSession.setActionHandler("nexttrack", () => nextButton.click());
    navigator.mediaSession.setActionHandler("seekto", details => { if (Number.isFinite(audio.duration) && details.seekTime != null) audio.currentTime = details.seekTime; });
  }
  const dropZone = document.getElementById("dropZone");
  ["dragenter", "dragover"].forEach(type => dropZone.addEventListener(type, event => { event.preventDefault(); dropZone.classList.add("dragging"); }));
  ["dragleave", "drop"].forEach(type => dropZone.addEventListener(type, event => { event.preventDefault(); dropZone.classList.remove("dragging"); }));
  dropZone.addEventListener("drop", event => addFiles(event.dataTransfer.files));

  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    window.addEventListener("load", () => navigator.serviceWorker.register("./service-worker.js").catch(() => {}));
  }
})();
