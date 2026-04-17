/* ── AI Song Generator — Frontend App ──────────────────────────────────────── */
'use strict';

// ── State ────────────────────────────────────────────────────────────────────
const state = {
  languages: [],
  genres: [],
  moods: [],
  selectedLanguage: null,
  selectedGenre: null,
  selectedMood: null,
  currentSong: null,
  voiceRecording: null,
  voiceSettings: { pitch: 1.0, rate: 0.9, volume: 0.9, voiceName: '' },
  library: JSON.parse(localStorage.getItem('songLibrary') || '[]'),
  ttsUtterance: null,
  isSpeaking: false,
  mediaRecorder: null,
  audioChunks: [],
  recordedBlob: null,
  analyserNode: null,
  animFrameId: null,
};

// ── DOM Helpers ───────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt) e.textContent = txt; return e; };

// ── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  initTabs();
  await loadData();
  initChips();
  initLanguageSearch();
  initVoiceStudio();
  initVoiceChanger();
  initGenerateForm();
  initBatchForm();
  initLibrary();
  initModal();
  initAISinging();
  initVoiceCloning();
  initSongVoiceConverter();
  animateHeroWave();
  populateTranslateSelects();
});

// ── Tab Navigation ────────────────────────────────────────────────────────────
function initTabs() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
      btn.classList.add('active');
      $(`tab-${tab}`).classList.remove('hidden');
      if (tab === 'library') renderLibrary();
    });
  });
}

// ── Load API Data ─────────────────────────────────────────────────────────────
async function loadData() {
  try {
    const [langs, genres, moods] = await Promise.all([
      fetch('/api/languages').then(r => r.json()),
      fetch('/api/genres').then(r => r.json()),
      fetch('/api/moods').then(r => r.json()),
    ]);
    state.languages = langs;
    state.genres = genres;
    state.moods = moods;
  } catch (e) {
    // Fallback data for local preview
    state.languages = [
      { code: 'en', name: 'English', nativeName: 'English' },
      { code: 'ta', name: 'Tamil', nativeName: 'தமிழ்' },
      { code: 'hi', name: 'Hindi', nativeName: 'हिंदी' },
      { code: 'te', name: 'Telugu', nativeName: 'తెలుగు' },
      { code: 'es', name: 'Spanish', nativeName: 'Español' },
      { code: 'fr', name: 'French', nativeName: 'Français' },
      { code: 'ja', name: 'Japanese', nativeName: '日本語' },
      { code: 'ko', name: 'Korean', nativeName: '한국어' },
      { code: 'ar', name: 'Arabic', nativeName: 'العربية' },
      { code: 'zh', name: 'Chinese (Mandarin)', nativeName: '普通话' },
    ];
    state.genres = ['Pop', 'R&B', 'Classical', 'Folk', 'Hip-Hop', 'Rock', 'Jazz', 'Electronic', 'Devotional/Spiritual', 'Indie', 'Soul', 'Country'];
    state.moods = ['Happy', 'Romantic', 'Sad', 'Empowering', 'Nostalgic', 'Peaceful', 'Energetic', 'Spiritual', 'Melancholic', 'Hopeful'];
  }
}

// ── Chip Grids (Genre & Mood) ─────────────────────────────────────────────────
function initChips() {
  buildChips('genreChips', state.genres, 'genre');
  buildChips('moodChips', state.moods, 'mood');
}
function buildChips(containerId, items, type) {
  const container = $(containerId);
  if (!container) return;
  container.innerHTML = '';
  items.forEach(item => {
    const chip = el('button', 'chip', item);
    chip.type = 'button';
    chip.addEventListener('click', () => {
      container.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      state[`selected${type.charAt(0).toUpperCase() + type.slice(1)}`] = item;
    });
    container.appendChild(chip);
  });
}

// ── Language Search ───────────────────────────────────────────────────────────
function initLanguageSearch() {
  const input = $('langSearch');
  const dropdown = $('langDropdown');
  const pill = $('selectedLangPill');

  // Position the dropdown using fixed coordinates (avoids backdrop-filter clipping bug)
  function positionDropdown() {
    const rect = input.getBoundingClientRect();
    dropdown.style.top  = (rect.bottom + 4) + 'px';
    dropdown.style.left = rect.left + 'px';
    dropdown.style.width = rect.width + 'px';
  }

  function renderDropdown(filter = '') {
    dropdown.innerHTML = '';
    const filtered = state.languages.filter(l =>
      l.name.toLowerCase().includes(filter.toLowerCase()) ||
      l.nativeName.toLowerCase().includes(filter.toLowerCase())
    );
    filtered.forEach(lang => {
      const item = el('div', `lang-dropdown-item${state.selectedLanguage?.code === lang.code ? ' selected' : ''}`);
      const nameSpan = el('span', '', lang.name);
      const nativeSpan = el('span', 'native', lang.nativeName);
      item.appendChild(nameSpan);
      item.appendChild(nativeSpan);
      item.addEventListener('mousedown', e => {
        e.preventDefault(); // prevent input blur before click registers
        selectLanguage(lang);
        dropdown.classList.add('hidden');
        input.value = '';
      });
      dropdown.appendChild(item);
    });
    if (!filtered.length) {
      const empty = el('div', 'lang-dropdown-item', 'No languages found');
      empty.style.color = 'var(--text-dim)';
      dropdown.appendChild(empty);
    }
  }

  input.addEventListener('focus', () => {
    renderDropdown(input.value);
    positionDropdown();
    dropdown.classList.remove('hidden');
  });
  input.addEventListener('input', () => {
    renderDropdown(input.value);
    positionDropdown();
    dropdown.classList.remove('hidden');
  });
  input.addEventListener('blur', () => {
    // Small delay so mousedown on item fires first
    setTimeout(() => dropdown.classList.add('hidden'), 150);
  });

  // Reposition on scroll/resize so it tracks the input
  window.addEventListener('scroll', () => {
    if (!dropdown.classList.contains('hidden')) positionDropdown();
  }, true);
  window.addEventListener('resize', () => {
    if (!dropdown.classList.contains('hidden')) positionDropdown();
  });

  function selectLanguage(lang) {
    state.selectedLanguage = lang;
    pill.innerHTML = `<span>${lang.name}</span><span class="native" style="color:var(--text-muted);margin:0 4px;">·</span><span>${lang.nativeName}</span><span class="pill-remove" title="Clear">✕</span>`;
    pill.classList.remove('hidden');
    pill.querySelector('.pill-remove').addEventListener('click', () => {
      state.selectedLanguage = null;
      pill.classList.add('hidden');
    });
  }

  populateTranslateSelect($('translateToSelect'));
}

function populateTranslateSelects() {
  populateTranslateSelect($('translateToSelect'));
}

function populateTranslateSelect(selectEl) {
  if (!selectEl) return;
  selectEl.innerHTML = '';
  state.languages.forEach(lang => {
    const opt = document.createElement('option');
    opt.value = lang.code;
    opt.textContent = `${lang.name} — ${lang.nativeName}`;
    selectEl.appendChild(opt);
  });

  // Also populate batch selects
  const batchLang = $('batchLanguage');
  const batchGenre = $('batchGenre');
  const batchMood = $('batchMood');

  if (batchLang) {
    batchLang.innerHTML = '<option value="">Any Language</option>';
    state.languages.forEach(lang => {
      const opt = document.createElement('option');
      opt.value = lang.code;
      opt.textContent = `${lang.name} — ${lang.nativeName}`;
      batchLang.appendChild(opt);
    });
  }
  if (batchGenre) {
    state.genres.forEach(g => {
      const opt = document.createElement('option');
      opt.value = g; opt.textContent = g;
      batchGenre.appendChild(opt);
    });
  }
  if (batchMood) {
    state.moods.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m; opt.textContent = m;
      batchMood.appendChild(opt);
    });
  }
}

// ── Generate Form ─────────────────────────────────────────────────────────────
function initGenerateForm() {
  $('generateBtn').addEventListener('click', handleGenerate);
  $('copySongBtn')?.addEventListener('click', copySong);
  $('saveSongBtn')?.addEventListener('click', saveSong);
  $('regenerateBtn')?.addEventListener('click', handleGenerate);
  $('playBtn')?.addEventListener('click', togglePlay);
  $('volumeSlider')?.addEventListener('input', e => {
    if (window.speechSynthesis) window.speechSynthesis.volume = parseFloat(e.target.value);
  });
  $('speedSelect')?.addEventListener('change', e => {
    state.voiceSettings.rate = parseFloat(e.target.value);
  });
  $('doTranslateBtn')?.addEventListener('click', handleTranslate);

  // Lyrics tabs
  document.querySelectorAll('.lyrics-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.lyrics-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.ltab-panel').forEach(p => p.classList.add('hidden'));
      tab.classList.add('active');
      $(`ltab-${tab.dataset.ltab}`)?.classList.remove('hidden');
    });
  });

  // Quick record from generate panel
  $('quickRecordBtn')?.addEventListener('click', () => {
    document.querySelector('.nav-btn[data-tab="voice"]').click();
  });
}

async function handleGenerate() {
  if (!state.selectedLanguage) {
    showToast('Please select a language first', 'error');
    $('langSearch').focus();
    return;
  }

  showLoading(true, 'Composing your song...', `Writing original ${state.selectedLanguage.name} lyrics`);

  const payload = {
    language: state.selectedLanguage.code,
    genre: state.selectedGenre,
    mood: state.selectedMood,
    theme: $('themeInput').value.trim(),
    artistStyle: $('artistStyle').value.trim(),
    customPrompt: $('customPrompt').value.trim(),
  };

  try {
    const authHdrs = (typeof Auth !== 'undefined') ? Auth.authHeaders() : {};
    const res = await fetch('/api/generate-lyrics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHdrs },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (data.upgradeRequired) {
      showLoading(false);
      showToast(data.error, 'error');
      if (typeof Auth !== 'undefined') Auth.openPricing();
      return;
    }
    if (!data.success) throw new Error(data.error || 'Generation failed');
    state.currentSong = data.song;
    displaySong(data.song);
    // Refresh usage after generation
    if (typeof Auth !== 'undefined') Auth.refreshMe();
    showToast(`"${data.song.title}" created!`, 'success');
  } catch (e) {
    showLoading(false);
    showToast(e.message, 'error');
  }
}

function showLoading(show, msg = '', sub = '') {
  $('outputPlaceholder').classList.add('hidden');
  $('songCard').classList.add('hidden');
  $('loadingCard').classList.toggle('hidden', !show);
  if (show) {
    $('loadingMessage').textContent = msg;
    $('loadingSubMessage').textContent = sub;
  }
}

function displaySong(song) {
  showLoading(false);
  $('songCard').classList.remove('hidden');

  $('songTitle').textContent = song.title;

  // Tags
  const tags = $('songTags');
  tags.innerHTML = '';
  [song.language, song.genre, song.mood].filter(Boolean).forEach((t, i) => {
    const tag = el('span', `song-tag${i === 0 ? ' primary' : ''}`, t);
    tags.appendChild(tag);
  });

  // Lyrics
  $('lyricsDisplay').textContent = song.lyrics || '';
  $('translationDisplay').textContent = song.englishTranslation || 'No translation available.';

  // Musical notes
  const notes = $('notesDisplay');
  notes.innerHTML = '';
  if (song.musicalNotes) {
    const h = el('h4', '', 'Musical Direction'); notes.appendChild(h);
    const p = el('p', '', song.musicalNotes); notes.appendChild(p);
  }
  if (song.singingSuggestions) {
    const h2 = el('h4', '', 'Singing Tips'); h2.style.marginTop = '16px'; notes.appendChild(h2);
    const p2 = el('p', '', song.singingSuggestions); notes.appendChild(p2);
  }

  // Reset player
  stopSpeech();
  $('progressFill').style.width = '0%';
  $('timeDisplay').textContent = '0:00 / 0:00';
  $('playIcon').textContent = '▶';
  drawPlayerWave();
}

// ── Voice Changer ─────────────────────────────────────────────────────────────
const VOICE_PRESETS = {
  natural:  { pitch: 1.00, rate: 0.90, label: 'Natural' },
  deep:     { pitch: 0.45, rate: 0.82, label: 'Deep Male' },
  soft:     { pitch: 1.45, rate: 0.82, label: 'Soft Female' },
  child:    { pitch: 1.90, rate: 1.10, label: 'Childlike' },
  elder:    { pitch: 0.65, rate: 0.72, label: 'Elder' },
  robot:    { pitch: 0.45, rate: 0.65, label: 'Robot' },
  whisper:  { pitch: 1.20, rate: 0.62, label: 'Whisper' },
  dramatic: { pitch: 0.75, rate: 0.70, label: 'Dramatic' },
};

// Separate VC settings so they don't clobber Voice Studio settings
const vcSettings = { pitch: 1.0, rate: 0.9, volume: 0.9, voiceName: '' };

function initVoiceChanger() {
  // Slider sync
  const sliders = {
    vcPitch: { display: 'vcPitchVal', key: 'pitch' },
    vcRate:  { display: 'vcRateVal',  key: 'rate'  },
    vcVol:   { display: 'vcVolVal',   key: 'volume' },
  };
  Object.entries(sliders).forEach(([id, cfg]) => {
    const slider = $(id);
    if (!slider) return;
    slider.addEventListener('input', () => {
      const v = parseFloat(slider.value);
      $(cfg.display).textContent = v.toFixed(2);
      vcSettings[cfg.key] = v;
      // Deactivate any preset when manually adjusted
      document.querySelectorAll('.voice-preset').forEach(p => p.classList.remove('active'));
    });
  });

  // Presets
  document.querySelectorAll('.voice-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      const preset = VOICE_PRESETS[btn.dataset.preset];
      if (!preset) return;
      vcSettings.pitch  = preset.pitch;
      vcSettings.rate   = preset.rate;
      // Keep current volume
      applyVCtoSliders();
      document.querySelectorAll('.voice-preset').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // Voice select populate
  function loadVCVoices() {
    const voices = window.speechSynthesis?.getVoices() || [];
    const sel = $('vcVoiceSelect');
    if (!sel) return;
    const prev = sel.value;
    sel.innerHTML = '<option value="">Auto (match language)</option>';
    voices.forEach(v => {
      const opt = document.createElement('option');
      opt.value = v.name;
      opt.textContent = `${v.name} (${v.lang})`;
      sel.appendChild(opt);
    });
    if (prev) sel.value = prev;
    sel.addEventListener('change', () => { vcSettings.voiceName = sel.value; });
  }
  if (window.speechSynthesis) {
    loadVCVoices();
    window.speechSynthesis.onvoiceschanged = () => { loadVCVoices(); };
  }

  // Apply Voice button
  $('applyVoiceBtn')?.addEventListener('click', () => {
    if (!state.currentSong) { showToast('Generate a song first', 'error'); return; }
    stopSpeech();
    speakLyricsWithVC(state.currentSong.lyrics);
    showToast('Singing with new voice settings…', 'success');
  });
}

function applyVCtoSliders() {
  const pitch = $('vcPitch'), rate = $('vcRate'), vol = $('vcVol');
  if (pitch) { pitch.value = vcSettings.pitch; $('vcPitchVal').textContent = vcSettings.pitch.toFixed(2); }
  if (rate)  { rate.value  = vcSettings.rate;  $('vcRateVal').textContent  = vcSettings.rate.toFixed(2);  }
  if (vol)   { vol.value   = vcSettings.volume; $('vcVolVal').textContent  = vcSettings.volume.toFixed(2); }
}

function speakLyricsWithVC(text) {
  if (!window.speechSynthesis) { showToast('Speech synthesis not supported', 'error'); return; }
  stopSpeech();
  const clean = text.replace(/\[(.*?)\]/g, '').trim();
  const utter = new SpeechSynthesisUtterance(clean);
  utter.pitch  = vcSettings.pitch;
  utter.rate   = vcSettings.rate;
  utter.volume = vcSettings.volume;

  const voices = window.speechSynthesis.getVoices();

  // Explicit voice selection from VC panel
  if (vcSettings.voiceName) {
    const v = voices.find(v => v.name === vcSettings.voiceName);
    if (v) utter.voice = v;
  } else if (state.currentSong?.language) {
    // Try to auto-match language
    const langCode = state.languages.find(l => l.name === state.currentSong.language)?.code;
    if (langCode) {
      const match = voices.find(v => v.lang.startsWith(langCode));
      if (match) utter.voice = match;
    }
  }

  const startTime = Date.now();
  const estDuration = Math.max(clean.length * 60, 5000);

  utter.onstart = () => {
    state.isSpeaking = true;
    $('playIcon').textContent = '⏸';
    animateProgress(startTime, estDuration);
  };
  utter.onend = utter.onerror = () => {
    state.isSpeaking = false;
    $('playIcon').textContent = '▶';
    $('progressFill').style.width = '0%';
    $('timeDisplay').textContent = '0:00 / 0:00';
    cancelAnimationFrame(state.animFrameId);
  };

  state.ttsUtterance = utter;
  window.speechSynthesis.speak(utter);
}

// ── TTS Player ────────────────────────────────────────────────────────────────
function togglePlay() {
  if (state.isSpeaking) { stopSpeech(); return; }
  if (!state.currentSong) return;
  // Use VC settings for the main play button too
  speakLyricsWithVC(state.currentSong.lyrics);
}

function speakLyrics(text) {
  if (!window.speechSynthesis) { showToast('Speech synthesis not supported in this browser', 'error'); return; }
  stopSpeech();

  // Strip section markers for cleaner reading
  const clean = text.replace(/\[(.*?)\]/g, '').trim();
  const utter = new SpeechSynthesisUtterance(clean);
  utter.pitch = state.voiceSettings.pitch;
  utter.rate = parseFloat($('speedSelect')?.value || '0.9');
  utter.volume = parseFloat($('volumeSlider')?.value || '0.9');

  // Set voice
  const voices = window.speechSynthesis.getVoices();
  if (state.voiceSettings.voiceName) {
    const v = voices.find(v => v.name === state.voiceSettings.voiceName);
    if (v) utter.voice = v;
  }

  // Try to match language
  if (state.currentSong?.language) {
    const langCode = state.languages.find(l => l.name === state.currentSong.language)?.code;
    if (langCode) {
      const match = voices.find(v => v.lang.startsWith(langCode));
      if (match) utter.voice = match;
    }
  }

  let startTime = Date.now();
  const estDuration = Math.max(clean.length * 60, 5000); // rough estimate

  utter.onstart = () => {
    state.isSpeaking = true;
    $('playIcon').textContent = '⏸';
    animateProgress(startTime, estDuration);
  };
  utter.onend = utter.onerror = () => {
    state.isSpeaking = false;
    $('playIcon').textContent = '▶';
    $('progressFill').style.width = '0%';
    $('timeDisplay').textContent = '0:00 / 0:00';
    cancelAnimationFrame(state.animFrameId);
  };

  state.ttsUtterance = utter;
  window.speechSynthesis.speak(utter);
}

function stopSpeech() {
  if (window.speechSynthesis) window.speechSynthesis.cancel();
  state.isSpeaking = false;
  $('playIcon').textContent = '▶';
  cancelAnimationFrame(state.animFrameId);
}

function animateProgress(startTime, duration) {
  function tick() {
    const elapsed = Date.now() - startTime;
    const pct = Math.min((elapsed / duration) * 100, 98);
    $('progressFill').style.width = `${pct}%`;
    const secs = Math.floor(elapsed / 1000);
    const total = Math.floor(duration / 1000);
    $('timeDisplay').textContent = `${fmt(secs)} / ${fmt(total)}`;
    if (state.isSpeaking) state.animFrameId = requestAnimationFrame(tick);
  }
  tick();
}
function fmt(s) { return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`; }

// ── Translate Lyrics ──────────────────────────────────────────────────────────
async function handleTranslate() {
  if (!state.currentSong) return;
  const targetCode = $('translateToSelect').value;
  if (!targetCode) return;

  $('doTranslateBtn').disabled = true;
  $('doTranslateBtn').textContent = 'Translating...';

  try {
    const res = await fetch('/api/translate-lyrics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lyrics: state.currentSong.lyrics, targetLanguage: targetCode }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    $('translatedLyricsDisplay').textContent = data.translatedLyrics;
    showToast(`Translated to ${data.language}`, 'success');
  } catch (e) {
    showToast(e.message, 'error');
  } finally {
    $('doTranslateBtn').disabled = false;
    $('doTranslateBtn').textContent = 'Translate';
  }
}

// ── Copy & Save ───────────────────────────────────────────────────────────────
function copySong() {
  if (!state.currentSong) return;
  const text = `${state.currentSong.title}\n\n${state.currentSong.lyrics}`;
  navigator.clipboard.writeText(text).then(() => showToast('Lyrics copied!', 'success'));
}
function saveSong() {
  if (!state.currentSong) return;
  const exists = state.library.some(s => s.id === state.currentSong.id);
  if (exists) { showToast('Already in library', ''); return; }
  state.library.unshift(state.currentSong);
  localStorage.setItem('songLibrary', JSON.stringify(state.library));
  showToast(`"${state.currentSong.title}" saved to library`, 'success');
}

// ── Voice Studio ──────────────────────────────────────────────────────────────
function initVoiceStudio() {
  $('recordBtn').addEventListener('click', toggleRecording);
  $('stopRecordBtn').addEventListener('click', stopRecording);
  $('playRecordingBtn').addEventListener('click', playRecording);
  $('clearVoiceBtn').addEventListener('click', clearRecording);
  $('testVoiceBtn').addEventListener('click', testVoice);

  // File upload
  const fileInput = $('voiceFileInput');
  const uploadZone = $('voiceUploadZone');
  if (fileInput) {
    fileInput.addEventListener('change', e => {
      const file = e.target.files[0];
      if (!file) return;
      handleVoiceFileUpload(file);
    });
  }
  if (uploadZone) {
    uploadZone.addEventListener('dragover', e => { e.preventDefault(); uploadZone.style.borderColor = 'var(--accent)'; });
    uploadZone.addEventListener('dragleave', () => { uploadZone.style.borderColor = ''; });
    uploadZone.addEventListener('drop', e => {
      e.preventDefault(); uploadZone.style.borderColor = '';
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith('audio/')) handleVoiceFileUpload(file);
      else showToast('Please drop an audio file', 'error');
    });
  }

  // Sliders
  ['pitch', 'rate', 'vol'].forEach(key => {
    const slider = $(`${key}Slider`);
    const display = $(`${key}Val`);
    const stateKey = key === 'vol' ? 'volume' : key;
    if (slider) {
      slider.addEventListener('input', () => {
        display.textContent = parseFloat(slider.value).toFixed(2);
        state.voiceSettings[stateKey] = parseFloat(slider.value);
      });
    }
  });

  // Populate TTS voice list
  function loadVoices() {
    const voices = window.speechSynthesis?.getVoices() || [];
    const sel = $('voiceSelectTTS');
    if (!sel) return;
    sel.innerHTML = '<option value="">Auto (best for language)</option>';
    voices.forEach(v => {
      const opt = document.createElement('option');
      opt.value = v.name;
      opt.textContent = `${v.name} (${v.lang})`;
      sel.appendChild(opt);
    });
    sel.addEventListener('change', () => { state.voiceSettings.voiceName = sel.value; });
  }
  if (window.speechSynthesis) {
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }
}

async function toggleRecording() {
  if (state.mediaRecorder && state.mediaRecorder.state === 'recording') {
    stopRecording(); return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    state.audioChunks = [];
    state.mediaRecorder = new MediaRecorder(stream);
    state.mediaRecorder.ondataavailable = e => { if (e.data.size > 0) state.audioChunks.push(e.data); };
    state.mediaRecorder.onstop = () => {
      state.recordedBlob = new Blob(state.audioChunks, { type: 'audio/webm' });
      stream.getTracks().forEach(t => t.stop());
      $('stopRecordBtn').disabled = true;
      $('playRecordingBtn').disabled = false;
      $('clearVoiceBtn').disabled = false;
      $('recordBtn').classList.remove('recording');
      $('recordBtnText').textContent = 'Record Again';
      $('recordStatus').textContent = 'Recording complete — click Play Back to hear it';
      $('voiceCardName').textContent = `Custom recording (${new Date().toLocaleTimeString()})`;
      $('voiceStatusMini').innerHTML = `<span class="dot active"></span><span>Voice recorded</span>`;
      state.voiceRecording = state.recordedBlob;
      updateCloneBtn();
      cancelAnimationFrame(state.animFrameId);
      stopCanvas();
    };

    state.mediaRecorder.start(100);
    $('recordBtn').classList.add('recording');
    $('recordBtnText').textContent = 'Recording...';
    $('stopRecordBtn').disabled = false;
    $('recordStatus').textContent = 'Recording... speak clearly';
    visualizeVoice(stream);
  } catch (e) {
    showToast('Microphone access denied or unavailable', 'error');
  }
}

function stopRecording() {
  if (state.mediaRecorder && state.mediaRecorder.state !== 'inactive') state.mediaRecorder.stop();
}

function playRecording() {
  if (!state.recordedBlob) return;
  const url = URL.createObjectURL(state.recordedBlob);
  const audio = new Audio(url);
  audio.play();
  $('recordStatus').textContent = 'Playing back your recording...';
  audio.onended = () => { $('recordStatus').textContent = 'Playback complete'; URL.revokeObjectURL(url); };
}

function handleVoiceFileUpload(file) {
  state.recordedBlob = file;
  state.voiceRecording = file;
  const zone = $('voiceUploadZone');
  const label = $('uploadLabel');
  if (zone) zone.classList.add('has-file');
  if (label) label.textContent = `✓ ${file.name} (${(file.size/1024/1024).toFixed(1)} MB) — ready to clone`;
  $('playRecordingBtn').disabled = false;
  $('clearVoiceBtn').disabled = false;
  $('voiceCardName').textContent = file.name;
  $('voiceStatusMini').innerHTML = `<span class="dot active"></span><span>Voice file loaded</span>`;
  updateCloneBtn();
  showToast(`"${file.name}" loaded — click Clone My Voice!`, 'success');
}

function clearRecording() {
  state.recordedBlob = null;
  state.voiceRecording = null;
  const zone = $('voiceUploadZone');
  const label = $('uploadLabel');
  if (zone) zone.classList.remove('has-file');
  if (label) label.textContent = 'Click to choose a file or drag & drop here';
  updateCloneBtn();
  $('playRecordingBtn').disabled = true;
  $('clearVoiceBtn').disabled = true;
  $('recordBtnText').textContent = 'Start Recording';
  $('recordStatus').textContent = 'Ready to record';
  $('voiceCardName').textContent = 'No recording yet';
  $('voiceStatusMini').innerHTML = `<span class="dot inactive"></span><span>No voice recorded — using browser voice</span>`;
  clearCanvas();
}

function testVoice() {
  const testText = 'Hello! This is how your voice settings will sound when singing your songs.';
  const utter = new SpeechSynthesisUtterance(testText);
  utter.pitch = state.voiceSettings.pitch;
  utter.rate = state.voiceSettings.rate;
  utter.volume = state.voiceSettings.volume;
  const voices = window.speechSynthesis?.getVoices() || [];
  if (state.voiceSettings.voiceName) {
    const v = voices.find(v => v.name === state.voiceSettings.voiceName);
    if (v) utter.voice = v;
  }
  window.speechSynthesis?.speak(utter);
}

function visualizeVoice(stream) {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;
  const ctx = new AudioContext();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 256;
  const src = ctx.createMediaStreamSource(stream);
  src.connect(analyser);
  state.analyserNode = analyser;

  const canvas = $('voiceCanvas');
  const canvasCtx = canvas.getContext('2d');
  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);

  function draw() {
    state.animFrameId = requestAnimationFrame(draw);
    analyser.getByteFrequencyData(dataArray);
    canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
    const barWidth = (canvas.width / bufferLength) * 2.5;
    let x = 0;
    for (let i = 0; i < bufferLength; i++) {
      const barHeight = (dataArray[i] / 255) * canvas.height;
      const hue = (i / bufferLength) * 60 + 240;
      canvasCtx.fillStyle = `hsl(${hue}, 70%, 60%)`;
      canvasCtx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
      x += barWidth + 1;
    }
  }
  draw();
}

function stopCanvas() {
  cancelAnimationFrame(state.animFrameId);
}
function clearCanvas() {
  const canvas = $('voiceCanvas');
  if (canvas) canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
}

// ── Animated Waveform (hero & player) ────────────────────────────────────────
function animateHeroWave() {
  const canvas = $('heroWaveCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let t = 0;
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = 'rgba(167,139,250,0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = 0; x < canvas.width; x++) {
      const y = canvas.height/2 + Math.sin((x/canvas.width)*Math.PI*4 + t) * 18 + Math.sin((x/canvas.width)*Math.PI*8 + t*1.3) * 8;
      x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
    t += 0.04;
    requestAnimationFrame(draw);
  }
  draw();
}

function drawPlayerWave() {
  const canvas = $('playerWaveCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < 60; i++) {
    const h = Math.random() * 36 + 4;
    const x = (i / 60) * canvas.width;
    const alpha = state.isSpeaking ? 0.8 : 0.35;
    ctx.fillStyle = `rgba(167,139,250,${alpha})`;
    ctx.fillRect(x, (canvas.height - h) / 2, canvas.width / 62, h);
  }
}

// ── Batch ─────────────────────────────────────────────────────────────────────
function initBatchForm() {
  let count = 3;
  $('batchCount').textContent = count;
  $('countMinus').addEventListener('click', () => {
    if (count > 1) { count--; $('batchCount').textContent = count; }
  });
  $('countPlus').addEventListener('click', () => {
    if (count < 5) { count++; $('batchCount').textContent = count; }
  });
  $('batchGenerateBtn').addEventListener('click', async () => {
    const lang = $('batchLanguage').value;
    const genre = $('batchGenre').value;
    const mood = $('batchMood').value;
    const rawThemes = $('batchThemes').value.trim();
    const themes = rawThemes ? rawThemes.split('\n').map(s => s.trim()).filter(Boolean) : [];

    $('batchLoadingCard').classList.remove('hidden');
    $('batchResults').classList.add('hidden');
    $('batchLoadingMsg').textContent = `Generating ${count} songs...`;
    $('batchLoadingSub').textContent = 'This may take a minute';
    $('batchGenerateBtn').disabled = true;

    try {
      const res = await fetch('/api/generate-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count, language: lang || undefined, genre: genre || undefined, mood: mood || undefined, themes }),
      });
      const data = await res.json();
      $('batchLoadingCard').classList.add('hidden');
      if (data.songs && data.songs.length) {
        renderBatchGrid(data.songs);
        $('batchResults').classList.remove('hidden');
        showToast(`${data.songs.length} songs generated!`, 'success');
      } else {
        showToast('No songs returned — check your API key', 'error');
      }
    } catch (e) {
      $('batchLoadingCard').classList.add('hidden');
      showToast(e.message, 'error');
    } finally {
      $('batchGenerateBtn').disabled = false;
    }
  });
}

function renderBatchGrid(songs) {
  const grid = $('batchGrid');
  grid.innerHTML = '';
  songs.forEach(song => {
    const card = makeMiniCard(song, true);
    grid.appendChild(card);
  });
}

function makeMiniCard(song, showSave = false) {
  const card = el('div', 'mini-song-card');
  const title = el('div', 'mini-title', song.title);
  const tags = el('div', 'mini-tags');
  [song.language, song.genre, song.mood].filter(Boolean).forEach(t => {
    tags.appendChild(el('span', 'mini-tag', t));
  });
  const preview = el('div', 'mini-preview', song.lyrics?.substring(0, 200) + '...');
  const actions = el('div', 'mini-actions');

  const listenBtn = el('button', 'btn btn-outline', '▶ Listen');
  listenBtn.addEventListener('click', e => { e.stopPropagation(); speakLyricsModal(song); });
  actions.appendChild(listenBtn);

  const copyBtn = el('button', 'btn btn-outline', '📋 Copy');
  copyBtn.addEventListener('click', e => { e.stopPropagation(); navigator.clipboard.writeText(`${song.title}\n\n${song.lyrics}`).then(() => showToast('Copied!', 'success')); });
  actions.appendChild(copyBtn);

  if (showSave) {
    const saveBtn = el('button', 'btn btn-outline', '💾 Save');
    saveBtn.addEventListener('click', e => {
      e.stopPropagation();
      const exists = state.library.some(s => s.id === song.id);
      if (!exists) { state.library.unshift(song); localStorage.setItem('songLibrary', JSON.stringify(state.library)); }
      showToast('Saved to library', 'success');
    });
    actions.appendChild(saveBtn);
  }

  card.appendChild(title);
  card.appendChild(tags);
  card.appendChild(preview);
  card.appendChild(actions);
  card.addEventListener('click', () => openModal(song));
  return card;
}

function speakLyricsModal(song) {
  speakLyrics(song.lyrics);
}

// ── Library ───────────────────────────────────────────────────────────────────
function initLibrary() {
  $('librarySearch').addEventListener('input', () => renderLibrary($('librarySearch').value));
  $('clearLibraryBtn').addEventListener('click', () => {
    if (confirm('Clear all saved songs?')) {
      state.library = [];
      localStorage.setItem('songLibrary', '[]');
      renderLibrary();
    }
  });
}

function renderLibrary(query = '') {
  const grid = $('libraryGrid');
  const empty = $('libraryEmpty');
  const filtered = query
    ? state.library.filter(s => s.title?.toLowerCase().includes(query.toLowerCase()) || s.language?.toLowerCase().includes(query.toLowerCase()))
    : state.library;

  if (!filtered.length) {
    empty.classList.remove('hidden');
    grid.innerHTML = '';
    return;
  }
  empty.classList.add('hidden');
  grid.innerHTML = '';
  filtered.forEach(song => {
    const card = makeMiniCard(song, false);
    // Add delete button
    const delBtn = el('button', 'btn btn-danger-outline', '🗑');
    delBtn.title = 'Remove';
    delBtn.addEventListener('click', e => {
      e.stopPropagation();
      state.library = state.library.filter(s => s.id !== song.id);
      localStorage.setItem('songLibrary', JSON.stringify(state.library));
      renderLibrary(query);
    });
    card.querySelector('.mini-actions').appendChild(delBtn);
    grid.appendChild(card);
  });
}

// ── Modal ─────────────────────────────────────────────────────────────────────
function initModal() {
  $('modalClose').addEventListener('click', closeModal);
  $('modalOverlay').addEventListener('click', e => { if (e.target === $('modalOverlay')) closeModal(); });
}

function openModal(song) {
  const content = $('modalContent');
  content.innerHTML = '';
  const title = el('h2', 'modal-song-title', song.title);
  const tags = el('div', 'song-tags');
  [song.language, song.genre, song.mood].filter(Boolean).forEach((t, i) => {
    tags.appendChild(el('span', `song-tag${i === 0 ? ' primary' : ''}`, t));
  });
  tags.style.marginBottom = '20px';
  const lyrics = el('pre', 'modal-lyrics', song.lyrics);
  const actions = el('div', 'modal-actions');

  const playBtn = el('button', 'btn btn-primary', '▶ Listen');
  playBtn.addEventListener('click', () => speakLyricsModal(song));
  const copyBtn = el('button', 'btn btn-outline', '📋 Copy');
  copyBtn.addEventListener('click', () => navigator.clipboard.writeText(`${song.title}\n\n${song.lyrics}`).then(() => showToast('Copied!', 'success')));
  const saveBtn = el('button', 'btn btn-outline', '💾 Save');
  saveBtn.addEventListener('click', () => {
    const exists = state.library.some(s => s.id === song.id);
    if (!exists) { state.library.unshift(song); localStorage.setItem('songLibrary', JSON.stringify(state.library)); }
    showToast('Saved to library', 'success');
  });

  actions.appendChild(playBtn);
  actions.appendChild(copyBtn);
  actions.appendChild(saveBtn);
  content.appendChild(title);
  content.appendChild(tags);
  content.appendChild(lyrics);
  if (song.englishTranslation) {
    const transTitle = el('h4', '', 'English Translation');
    transTitle.style.cssText = 'color:var(--text-muted);margin:16px 0 8px;font-size:0.85rem;text-transform:uppercase;letter-spacing:0.06em;';
    const trans = el('pre', 'modal-lyrics', song.englishTranslation);
    content.appendChild(transTitle);
    content.appendChild(trans);
  }
  content.appendChild(actions);
  $('modalOverlay').classList.remove('hidden');
}

function closeModal() {
  $('modalOverlay').classList.add('hidden');
  stopSpeech();
}

// ── AI Singing (Replicate Bark) ───────────────────────────────────────────────
const singingState = { selectedVoice: 'en_speaker_6', currentGender: 'male', audioUrl: null, convertedBlob: null };

function initAISinging() {
  // Gender toggle
  document.querySelectorAll('.bark-gender-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.bark-gender-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      singingState.currentGender = btn.dataset.gender;
      // Show/hide style buttons for this gender
      document.querySelectorAll('.bvbtn').forEach(b => {
        if (b.dataset.gender === singingState.currentGender) {
          b.classList.remove('hidden');
        } else {
          b.classList.add('hidden');
          b.classList.remove('active');
        }
      });
      // Auto-select first visible style
      const firstVisible = document.querySelector(`.bvbtn[data-gender="${singingState.currentGender}"]`);
      if (firstVisible) {
        firstVisible.classList.add('active');
        singingState.selectedVoice = firstVisible.dataset.voice;
      }
    });
  });

  // Style buttons
  document.querySelectorAll('.bvbtn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll(`.bvbtn[data-gender="${singingState.currentGender}"]`).forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      singingState.selectedVoice = btn.dataset.voice;
    });
  });

  // "Use My Voice" toggle
  $('useMyVoiceToggle')?.addEventListener('change', updateSingingVoiceHint);

  $('generateSingingBtn')?.addEventListener('click', handleGenerateSinging);
  $('downloadSingingBtn')?.addEventListener('click', downloadSinging);

  updateSingingVoiceHint();
}

function updateSingingVoiceHint() {
  const hint = $('singingVoiceHint');
  const toggle = $('useMyVoiceToggle');
  if (!hint || !toggle) return;
  if (toggle.checked) {
    if (cloneState.voiceId) {
      hint.textContent = '✓ Will convert to your cloned voice after Bark generates';
      hint.style.color = '#4ade80';
    } else {
      hint.textContent = '⚠ No voice cloned yet — go to My Voice tab to clone first';
      hint.style.color = '#f59e0b';
      toggle.checked = false;
    }
  } else {
    hint.textContent = cloneState.voiceId ? 'Toggle on to sing in your cloned voice' : 'Clone your voice in the My Voice tab to enable';
    hint.style.color = '';
  }
}

async function handleGenerateSinging() {
  if (!state.currentSong) { showToast('Generate a song first', 'error'); return; }

  const btn = $('generateSingingBtn');
  const loading = $('singingLoading');
  const loadingMsg = $('singingLoadingMsg');
  const result = $('singingResult');
  const useMyVoice = $('useMyVoiceToggle')?.checked && cloneState.voiceId;

  btn.disabled = true;
  btn.innerHTML = '<span class="btn-icon">⏳</span> Generating…';
  loading.classList.remove('hidden');
  result.classList.add('hidden');

  try {
    // Step 1: Bark generates the raw singing
    if (loadingMsg) loadingMsg.textContent = 'Generating singing audio with Bark AI (30–90 sec)…';
    const res = await fetch('/api/generate-singing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lyrics: state.currentSong.lyrics, voiceStyle: singingState.selectedVoice }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    singingState.audioUrl = data.audioUrl;
    singingState.convertedBlob = null;

    // Step 2 (optional): Convert to cloned voice via ElevenLabs STS
    if (useMyVoice) {
      if (loadingMsg) loadingMsg.textContent = 'Converting to your voice (ElevenLabs STS)…';
      const stsRes = await fetch('/api/convert-singing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audioUrl: singingState.audioUrl, voiceId: cloneState.voiceId }),
      });
      if (!stsRes.ok) {
        const errData = await stsRes.json().catch(() => ({}));
        throw new Error(errData.error || 'Voice conversion failed');
      }
      const blob = await stsRes.blob();
      singingState.convertedBlob = blob;
      const url = URL.createObjectURL(blob);
      $('singingAudio').src = url;
      $('singingNote').textContent = 'Sang in your cloned voice · ElevenLabs STS + Bark AI';
    } else {
      $('singingAudio').src = data.audioUrl;
      $('singingNote').textContent = 'Powered by Bark AI · suno-ai/bark on Replicate';
    }

    result.classList.remove('hidden');
    showToast(useMyVoice ? 'Singing ready in your voice!' : 'Singing audio ready!', 'success');
  } catch (e) {
    showToast('Singing failed: ' + e.message, 'error');
  } finally {
    loading.classList.add('hidden');
    btn.disabled = false;
    btn.innerHTML = '<span class="btn-icon">🎵</span> Generate Singing';
  }
}

function downloadSinging() {
  const title = (state.currentSong?.title || 'song').replace(/[^a-z0-9]/gi, '-').toLowerCase();
  if (singingState.convertedBlob) {
    // Converted voice blob — download directly
    const a = document.createElement('a');
    a.href = URL.createObjectURL(singingState.convertedBlob);
    a.download = `${title}-my-voice.mp3`;
    a.click();
  } else if (singingState.audioUrl) {
    // Original Bark output — proxy download
    const a = document.createElement('a');
    a.href = `/api/proxy-audio?url=${encodeURIComponent(singingState.audioUrl)}&filename=${title}-singing.wav`;
    a.download = `${title}-singing.wav`;
    a.click();
  }
}

// ── Song Voice Converter ──────────────────────────────────────────────────────
const svcState = { songFile: null, voiceFile: null };

function initSongVoiceConverter() {
  const songZone = $('svcSongZone');
  const songInput = $('svcSongInput');
  const voiceZone = $('svcVoiceZone');
  const voiceInput = $('svcVoiceInput');
  const convertBtn = $('svcConvertBtn');
  const downloadBtn = $('svcDownloadBtn');

  // Song file pick
  if (songInput) {
    songInput.addEventListener('change', e => {
      const file = e.target.files[0];
      if (!file) return;
      svcState.songFile = file;
      $('svcSongLabel').textContent = `✓ ${file.name} (${(file.size/1024/1024).toFixed(1)} MB)`;
      if (songZone) songZone.classList.add('has-file');
      updateSvcConvertBtn();
    });
  }
  if (songZone) {
    songZone.addEventListener('dragover', e => { e.preventDefault(); songZone.style.borderColor = 'var(--accent)'; });
    songZone.addEventListener('dragleave', () => { songZone.style.borderColor = ''; });
    songZone.addEventListener('drop', e => {
      e.preventDefault(); songZone.style.borderColor = '';
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith('audio/')) {
        svcState.songFile = file;
        $('svcSongLabel').textContent = `✓ ${file.name} (${(file.size/1024/1024).toFixed(1)} MB)`;
        songZone.classList.add('has-file');
        updateSvcConvertBtn();
      } else showToast('Please drop an audio file', 'error');
    });
  }

  // Voice file pick
  if (voiceInput) {
    voiceInput.addEventListener('change', e => {
      const file = e.target.files[0];
      if (!file) return;
      svcState.voiceFile = file;
      $('svcVoiceLabel').textContent = `✓ ${file.name} (${(file.size/1024/1024).toFixed(1)} MB)`;
      if (voiceZone) voiceZone.classList.add('has-file');
      updateSvcConvertBtn();
    });
  }
  if (voiceZone) {
    voiceZone.addEventListener('dragover', e => { e.preventDefault(); voiceZone.style.borderColor = 'var(--accent)'; });
    voiceZone.addEventListener('dragleave', () => { voiceZone.style.borderColor = ''; });
    voiceZone.addEventListener('drop', e => {
      e.preventDefault(); voiceZone.style.borderColor = '';
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith('audio/')) {
        svcState.voiceFile = file;
        $('svcVoiceLabel').textContent = `✓ ${file.name} (${(file.size/1024/1024).toFixed(1)} MB)`;
        voiceZone.classList.add('has-file');
        updateSvcConvertBtn();
      }
    });
  }

  // Radio toggle for voice source
  document.querySelectorAll('input[name="svcVoiceSource"]').forEach(radio => {
    radio.addEventListener('change', () => {
      const newWrap = $('svcNewVoiceWrap');
      const isNew = $('svcUploadNew')?.checked;
      newWrap?.classList.toggle('hidden', !isNew);
      updateSvcConvertBtn();
      updateSvcExistingStatus();
    });
  });

  convertBtn?.addEventListener('click', handleSvcConvert);
  downloadBtn?.addEventListener('click', () => {
    const audio = $('svcAudio');
    if (!audio?.src) return;
    const a = document.createElement('a');
    a.href = audio.src;
    a.download = 'converted-voice.mp3';
    a.click();
  });

  updateSvcExistingStatus();
}

function updateSvcExistingStatus() {
  const statusEl = $('svcExistingStatus');
  if (!statusEl) return;
  if (cloneState.voiceId) {
    statusEl.textContent = '✓ Cloned voice ready';
    statusEl.classList.add('has-clone');
  } else {
    statusEl.textContent = 'No clone yet — record & clone your voice above first';
    statusEl.classList.remove('has-clone');
  }
}

function updateSvcConvertBtn() {
  const btn = $('svcConvertBtn');
  if (!btn) return;
  const isNewVoice = $('svcUploadNew')?.checked;
  const hasVoice = isNewVoice ? !!svcState.voiceFile : !!cloneState.voiceId;
  btn.disabled = !svcState.songFile || !hasVoice;
}

async function handleSvcConvert() {
  const isNewVoice = $('svcUploadNew')?.checked;
  const voiceId = isNewVoice ? null : cloneState.voiceId;

  if (!svcState.songFile) { showToast('Upload a song first', 'error'); return; }
  if (isNewVoice && !svcState.voiceFile) { showToast('Upload a voice sample first', 'error'); return; }
  if (!isNewVoice && !voiceId) { showToast('Clone your voice first in the My Voice tab', 'error'); return; }

  const btn = $('svcConvertBtn');
  const loading = $('svcLoading');
  const result = $('svcResult');

  btn.disabled = true;
  btn.innerHTML = '<span>⏳</span> Converting…';
  loading.classList.remove('hidden');
  result.classList.add('hidden');

  try {
    const form = new FormData();
    form.append('song', svcState.songFile);
    if (isNewVoice && svcState.voiceFile) form.append('voiceFile', svcState.voiceFile);
    if (voiceId) form.append('voiceId', voiceId);

    const res = await fetch('/api/song-voice-converter', { method: 'POST', body: form });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Conversion failed');
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    $('svcAudio').src = url;
    result.classList.remove('hidden');
    showToast('Voice conversion complete!', 'success');
  } catch (e) {
    showToast('Conversion failed: ' + e.message, 'error');
  } finally {
    loading.classList.add('hidden');
    btn.disabled = false;
    btn.innerHTML = '<span>🔄</span> Convert Vocals to This Voice';
  }
}

// ── Voice Cloning (ElevenLabs) ────────────────────────────────────────────────
const cloneState = { voiceId: null };

function initVoiceCloning() {
  const cloneBtn = $('cloneVoiceBtn');
  const testBtn  = $('testClonedVoiceBtn');
  const deleteBtn = $('deleteCloneBtn');

  // Load saved voice ID
  const saved = localStorage.getItem('clonedVoiceId');
  if (saved) {
    cloneState.voiceId = saved;
    showCloneResult(true);
  }

  cloneBtn?.addEventListener('click', handleCloneVoice);
  testBtn?.addEventListener('click', testClonedVoice);
  deleteBtn?.addEventListener('click', deleteClone);
}

function updateCloneBtn() {
  const btn = $('cloneVoiceBtn');
  const statusText = $('cloneStatusText');
  if (!btn) return;
  if (state.voiceRecording) {
    btn.disabled = false;
    if (statusText) statusText.textContent = 'Ready to clone your voice';
  } else {
    btn.disabled = true;
    if (statusText) statusText.textContent = 'Record your voice first to enable cloning';
  }
}

async function handleCloneVoice() {
  if (!state.voiceRecording) { showToast('Record your voice first', 'error'); return; }

  const btn = $('cloneVoiceBtn');
  const statusText = $('cloneStatusText');
  btn.disabled = true;
  btn.innerHTML = '<span>⏳</span> Cloning…';
  if (statusText) statusText.textContent = 'Uploading to ElevenLabs…';

  try {
    const formData = new FormData();
    formData.append('voiceFile', state.voiceRecording, 'voice.webm');

    const res = await fetch('/api/clone-voice', { method: 'POST', body: formData });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    cloneState.voiceId = data.voiceId;
    localStorage.setItem('clonedVoiceId', data.voiceId);
    showCloneResult(false);
    showToast('Voice cloned! It will be used in the Generate tab.', 'success');
  } catch (e) {
    showToast('Cloning failed: ' + e.message, 'error');
    if (statusText) statusText.textContent = 'Cloning failed — check ElevenLabs API key';
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span>🧬</span> Clone My Voice';
  }
}

function showCloneResult(fromSaved) {
  $('cloneResult')?.classList.remove('hidden');
  const statusText = $('cloneStatusText');
  if (statusText) statusText.textContent = fromSaved ? 'Cloned voice loaded from previous session' : 'Voice cloned successfully!';
  // Update dependent UI
  updateSvcExistingStatus();
  updateSvcConvertBtn();
  updateSingingVoiceHint();
}

async function testClonedVoice() {
  if (!cloneState.voiceId) return;
  const btn = $('testClonedVoiceBtn');
  btn.disabled = true;
  btn.textContent = '⏳ Generating…';
  try {
    const testText = 'Hello! This is my cloned AI voice. I can now sing your songs in this voice.';
    const res = await fetch('/api/tts-cloned', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: testText, voiceId: cloneState.voiceId }),
    });
    if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const audio = $('clonedAudio');
    audio.src = url;
    audio.classList.remove('hidden');
    audio.play();
    showToast('Playing cloned voice sample!', 'success');
  } catch (e) {
    showToast('Test failed: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '▶ Test Cloned Voice';
  }
}

function deleteClone() {
  cloneState.voiceId = null;
  localStorage.removeItem('clonedVoiceId');
  $('cloneResult')?.classList.add('hidden');
  const statusText = $('cloneStatusText');
  if (statusText) statusText.textContent = 'Clone removed. Record your voice again to create a new one.';
  showToast('Clone removed', '');
  updateSvcExistingStatus();
  updateSvcConvertBtn();
  updateSingingVoiceHint();
}

// ── Toast ─────────────────────────────────────────────────────────────────────
let toastTimer;
function showToast(msg, type = '') {
  const t = $('toast');
  t.textContent = msg;
  t.className = `toast${type ? ' ' + type : ''}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 3500);
}
