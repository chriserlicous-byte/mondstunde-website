// Hörprobe auf der Startseite: Geschichte mit Textmitlauf, leisem Regen (Web Audio, damit die Lautstärke
// auch auf dem iPhone regelbar ist) und Stimmenvergleich. Lädt Audio erst beim ersten Tippen.
(function () {
  "use strict";
  const player = document.querySelector(".player");
  if (!player) return;

  const audio = player.querySelector(".story-audio");
  const playButton = player.querySelector(".play");
  const seek = player.querySelector(".seek");
  const now = player.querySelector(".now");
  const text = player.querySelector(".story-text");
  const moreButton = player.querySelector(".more-toggle");
  const rainButton = player.querySelector(".rain-toggle");
  const paragraphs = Array.from(text.querySelectorAll("p"));
  const starts = paragraphs.map((p) => parseFloat(p.dataset.start));
  const voiceButtons = Array.from(player.querySelectorAll(".voice"));
  const label = player.dataset;

  const RAIN_VOLUME = 0.2;
  let rainOn = true;
  let context, rainGain, rainSource, rainLoading;
  let current = -1;
  let seeking = false;

  const format = (seconds) => {
    const s = Math.max(0, Math.floor(seconds || 0));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  };

  // Regen: einmal laden, in Endlosschleife leise unter die Stimme legen.
  function ensureRain() {
    if (rainLoading) return rainLoading;
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return Promise.resolve();
    try { if (navigator.audioSession) navigator.audioSession.type = "playback"; } catch (e) {}
    context = new Context();
    rainGain = context.createGain();
    rainGain.gain.value = 0;
    rainGain.connect(context.destination);
    rainLoading = fetch(label.rain)
      .then((response) => response.arrayBuffer())
      .then((data) => new Promise((resolve, reject) => context.decodeAudioData(data, resolve, reject)))
      .then((buffer) => {
        rainSource = context.createBufferSource();
        rainSource.buffer = buffer;
        rainSource.loop = true;
        rainSource.connect(rainGain);
        rainSource.start();
        updateRain();
      })
      .catch(() => {});
    return rainLoading;
  }

  function updateRain() {
    if (!rainGain) return;
    const target = rainOn && !audio.paused ? RAIN_VOLUME : 0;
    rainGain.gain.setTargetAtTime(target, context.currentTime, target ? 0.6 : 0.25);
  }

  function setPlaying(playing) {
    player.classList.toggle("playing", playing);
    playButton.setAttribute("aria-label", playing ? label.labelPause : label.labelPlay);
    updateRain();
  }

  function highlight(time) {
    let index = -1;
    for (let i = 0; i < starts.length; i++) if (time >= starts[i] - 0.2) index = i;
    if (index === current) return;
    if (current >= 0) paragraphs[current].classList.remove("reading");
    current = index;
    if (index < 0) return;
    paragraphs[index].classList.add("reading");
    // Läuft die Stimme in den eingeklappten Teil, Text aufklappen.
    if (paragraphs[index].classList.contains("later") && text.classList.contains("collapsed")) expand(true);
  }

  function expand(open) {
    text.classList.toggle("collapsed", !open);
    moreButton.setAttribute("aria-expanded", String(open));
    moreButton.textContent = open ? label.labelLess : label.labelMore;
  }

  function stopVoices() {
    voiceButtons.forEach((button) => {
      button.classList.remove("on");
      if (button._clip) { button._clip.pause(); button._clip.currentTime = 0; }
    });
  }

  function play() {
    stopVoices();
    if (context && context.state === "suspended") context.resume();
    ensureRain();
    const result = audio.play();
    if (result && result.catch) result.catch(() => setPlaying(false));
  }

  playButton.addEventListener("click", () => (audio.paused ? play() : audio.pause()));
  audio.addEventListener("play", () => setPlaying(true));
  audio.addEventListener("pause", () => setPlaying(false));
  audio.addEventListener("ended", () => { setPlaying(false); highlight(-1); });
  audio.addEventListener("timeupdate", () => {
    if (!seeking) seek.value = audio.currentTime;
    now.textContent = format(audio.currentTime);
    player.style.setProperty("--progress", `${(audio.currentTime / seek.max) * 100}%`);
    highlight(audio.currentTime);
  });

  seek.addEventListener("input", () => {
    seeking = true;
    now.textContent = format(seek.value);
    player.style.setProperty("--progress", `${(seek.value / seek.max) * 100}%`);
  });
  seek.addEventListener("change", () => {
    audio.currentTime = parseFloat(seek.value);
    seeking = false;
    highlight(audio.currentTime);
  });

  // Absatz antippen: von dort vorlesen.
  paragraphs.forEach((p, i) => p.addEventListener("click", () => {
    if (window.getSelection && String(window.getSelection())) return;
    audio.currentTime = starts[i] + 0.05;
    if (audio.paused) play();
  }));

  moreButton.addEventListener("click", () => expand(text.classList.contains("collapsed")));

  rainButton.addEventListener("click", () => {
    rainOn = !rainOn;
    rainButton.setAttribute("aria-pressed", String(rainOn));
    rainButton.setAttribute("aria-label", rainOn ? label.rainOn : label.rainOff);
    if (rainOn && !audio.paused) ensureRain();
    updateRain();
  });

  // Stimmenvergleich: kurzer Anfang je Stimme; pausiert die Geschichte.
  voiceButtons.forEach((button) => button.addEventListener("click", () => {
    const wasOn = button.classList.contains("on");
    stopVoices();
    if (wasOn) return;
    if (!audio.paused) audio.pause();
    button._clip = button._clip || new Audio(button.dataset.src);
    button._clip.onended = () => button.classList.remove("on");
    button.classList.add("on");
    const result = button._clip.play();
    if (result && result.catch) result.catch(() => button.classList.remove("on"));
  }));

  // Sperrbildschirm und Kopfhörer-Tasten.
  if ("mediaSession" in navigator) {
    audio.addEventListener("play", () => {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: label.title,
          artist: "Mondstunde",
          artwork: [{ src: "/assets/icon-180.png", sizes: "180x180", type: "image/png" }],
        });
        navigator.mediaSession.setActionHandler("play", play);
        navigator.mediaSession.setActionHandler("pause", () => audio.pause());
      } catch (e) {}
    }, { once: true });
  }
})();
