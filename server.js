require('dotenv').config({ path: require('path').join(__dirname, '.env'), override: true });
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const Anthropic = require('@anthropic-ai/sdk');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;

// Anthropic client
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Explicit root route (needed for some deployment platforms)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Rate limiting
const limiter = rateLimit({ windowMs: 60 * 1000, max: 30, message: { error: 'Too many requests, please wait a moment.' } });
app.use('/api/', limiter);

// Multer for voice uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, 'public/audio');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => cb(null, `voice_${uuidv4()}${path.extname(file.originalname)}`)
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// ─── Languages ───────────────────────────────────────────────────────────────
const LANGUAGES = [
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'ta', name: 'Tamil', nativeName: 'தமிழ்' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिंदी' },
  { code: 'te', name: 'Telugu', nativeName: 'తెలుగు' },
  { code: 'kn', name: 'Kannada', nativeName: 'ಕನ್ನಡ' },
  { code: 'ml', name: 'Malayalam', nativeName: 'മലയാളം' },
  { code: 'mr', name: 'Marathi', nativeName: 'मराठी' },
  { code: 'bn', name: 'Bengali', nativeName: 'বাংলা' },
  { code: 'gu', name: 'Gujarati', nativeName: 'ગુજરાતી' },
  { code: 'pa', name: 'Punjabi', nativeName: 'ਪੰਜਾਬੀ' },
  { code: 'ur', name: 'Urdu', nativeName: 'اردو' },
  { code: 'es', name: 'Spanish', nativeName: 'Español' },
  { code: 'fr', name: 'French', nativeName: 'Français' },
  { code: 'de', name: 'German', nativeName: 'Deutsch' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português' },
  { code: 'it', name: 'Italian', nativeName: 'Italiano' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語' },
  { code: 'ko', name: 'Korean', nativeName: '한국어' },
  { code: 'zh', name: 'Chinese (Mandarin)', nativeName: '普通话' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский' },
  { code: 'tr', name: 'Turkish', nativeName: 'Türkçe' },
  { code: 'th', name: 'Thai', nativeName: 'ภาษาไทย' },
  { code: 'vi', name: 'Vietnamese', nativeName: 'Tiếng Việt' },
  { code: 'id', name: 'Indonesian', nativeName: 'Bahasa Indonesia' },
  { code: 'ms', name: 'Malay', nativeName: 'Bahasa Melayu' },
  { code: 'sw', name: 'Swahili', nativeName: 'Kiswahili' },
  { code: 'nl', name: 'Dutch', nativeName: 'Nederlands' },
  { code: 'pl', name: 'Polish', nativeName: 'Polski' },
  { code: 'sv', name: 'Swedish', nativeName: 'Svenska' },
  { code: 'no', name: 'Norwegian', nativeName: 'Norsk' },
  { code: 'da', name: 'Danish', nativeName: 'Dansk' },
  { code: 'fi', name: 'Finnish', nativeName: 'Suomi' },
  { code: 'he', name: 'Hebrew', nativeName: 'עברית' },
  { code: 'fa', name: 'Persian', nativeName: 'فارسی' },
  { code: 'el', name: 'Greek', nativeName: 'Ελληνικά' },
  { code: 'ro', name: 'Romanian', nativeName: 'Română' },
  { code: 'hu', name: 'Hungarian', nativeName: 'Magyar' },
  { code: 'cs', name: 'Czech', nativeName: 'Čeština' },
  { code: 'uk', name: 'Ukrainian', nativeName: 'Українська' },
  { code: 'si', name: 'Sinhala', nativeName: 'සිංහල' },
  { code: 'ne', name: 'Nepali', nativeName: 'नेपाली' },
  { code: 'my', name: 'Burmese', nativeName: 'မြန်မာဘာသာ' },
  { code: 'km', name: 'Khmer', nativeName: 'ភាសាខ្មែរ' }
];

// ─── Genre/Mood Definitions ───────────────────────────────────────────────────
const GENRES = ['Pop', 'R&B', 'Classical', 'Folk', 'Hip-Hop', 'Rock', 'Jazz', 'Electronic', 'Devotional/Spiritual', 'Indie', 'Soul', 'Country', 'Reggae', 'Latin'];
const MOODS = ['Happy', 'Romantic', 'Sad', 'Empowering', 'Nostalgic', 'Peaceful', 'Energetic', 'Spiritual', 'Melancholic', 'Playful', 'Longing', 'Hopeful'];

// ─── GET: Languages, Genres, Moods ───────────────────────────────────────────
app.get('/api/languages', (req, res) => res.json(LANGUAGES));
app.get('/api/genres', (req, res) => res.json(GENRES));
app.get('/api/moods', (req, res) => res.json(MOODS));

// ─── POST: Upload voice sample ────────────────────────────────────────────────
app.post('/api/upload-voice', upload.single('voice'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No voice file uploaded' });
  res.json({
    success: true,
    voiceId: req.file.filename,
    voiceUrl: `/audio/${req.file.filename}`,
    message: 'Voice sample uploaded successfully'
  });
});

// ─── POST: Generate lyrics ────────────────────────────────────────────────────
app.post('/api/generate-lyrics', async (req, res) => {
  const { theme, genre, mood, language, customPrompt, artistStyle } = req.body;

  if (!language) return res.status(400).json({ error: 'Language is required' });

  const langObj = LANGUAGES.find(l => l.code === language) || { name: 'English' };
  const langName = langObj.name;

  const prompt = `You are a professional, award-winning songwriter.
Write complete, original song lyrics in ${langName}.

Song details:
- Theme/Topic: ${theme || 'love and life'}
- Genre: ${genre || 'Pop'}
- Mood: ${mood || 'Romantic'}
${artistStyle ? `- Style inspired by: ${artistStyle}` : ''}
${customPrompt ? `- Additional direction: ${customPrompt}` : ''}

Requirements:
1. Write ENTIRELY in ${langName} — every single word
2. Include: 2-3 verses, a catchy chorus (repeated), and a bridge
3. Mark sections clearly: [Verse 1], [Chorus], [Verse 2], [Bridge], [Chorus], [Outro]
4. Make the lyrics poetic, emotionally resonant, and singable
5. Ensure natural flow and rhythm for singing
6. Create a song title that fits the theme

Format your response as JSON:
{
  "title": "Song Title",
  "language": "${langName}",
  "genre": "${genre || 'Pop'}",
  "mood": "${mood || 'Romantic'}",
  "lyrics": "full lyrics with section markers",
  "englishTranslation": "complete English translation of the lyrics",
  "musicalNotes": "2-3 sentences describing the suggested melody, tempo, and instrumentation",
  "singingSuggestions": "2-3 tips for how to sing this song expressively"
}`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }]
    });

    const text = response.content[0].text;
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Invalid response format');

    const songData = JSON.parse(jsonMatch[0]);
    songData.id = uuidv4();
    songData.createdAt = new Date().toISOString();

    res.json({ success: true, song: songData });
  } catch (err) {
    console.error('Lyrics generation error:', err.message);
    res.status(500).json({ error: err.message || 'Failed to generate lyrics' });
  }
});

// ─── POST: Translate lyrics to another language ───────────────────────────────
app.post('/api/translate-lyrics', async (req, res) => {
  const { lyrics, targetLanguage } = req.body;
  if (!lyrics || !targetLanguage) return res.status(400).json({ error: 'Lyrics and target language required' });

  const langObj = LANGUAGES.find(l => l.code === targetLanguage) || { name: targetLanguage };

  const prompt = `Translate the following song lyrics into ${langObj.name}.
Preserve the poetic quality, rhythm, and emotional tone. Keep section markers like [Verse 1], [Chorus] etc.
Return JSON: { "translatedLyrics": "...", "language": "${langObj.name}" }

Lyrics to translate:
${lyrics}`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }]
    });

    const text = response.content[0].text;
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Invalid response');
    res.json({ success: true, ...JSON.parse(jsonMatch[0]) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST: Generate multiple songs (batch) ────────────────────────────────────
app.post('/api/generate-batch', async (req, res) => {
  const { count = 3, genre, mood, language, themes } = req.body;
  const batchCount = Math.min(parseInt(count), 5);

  const results = [];
  const themeList = themes && themes.length ? themes : [
    'love and longing', 'self-empowerment', 'nature and peace',
    'loss and healing', 'celebration of life', 'friendship', 'spiritual journey'
  ];

  for (let i = 0; i < batchCount; i++) {
    const theme = themeList[i % themeList.length];
    try {
      const resp = await fetch(`http://localhost:${PORT}/api/generate-lyrics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme, genre, mood, language })
      });
      const data = await resp.json();
      if (data.success) results.push(data.song);
    } catch (e) {
      console.error(`Batch song ${i + 1} failed:`, e.message);
    }
  }

  res.json({ success: true, songs: results, count: results.length });
});

// ─── GET: Voice synthesis info ────────────────────────────────────────────────
app.get('/api/voice-info', (req, res) => {
  res.json({
    message: 'Voice cloning is powered by browser Web Speech API for synthesis and MediaRecorder for capture.',
    supportedFeatures: [
      'Voice recording via microphone',
      'Real-time audio playback with recorded voice',
      'Browser-based text-to-speech with pitch/rate control',
      'Voice sample storage and reuse'
    ],
    integrationTip: 'For professional voice cloning, integrate ElevenLabs or PlayHT API by adding ELEVENLABS_API_KEY to your .env file.'
  });
});

// ─── POST: ElevenLabs TTS (optional) ─────────────────────────────────────────
app.post('/api/tts-elevenlabs', async (req, res) => {
  const { text, voiceId } = req.body;
  const apiKey = process.env.ELEVENLABS_API_KEY;

  if (!apiKey) {
    return res.status(503).json({
      error: 'ElevenLabs API key not configured',
      tip: 'Add ELEVENLABS_API_KEY to your .env file for AI voice synthesis'
    });
  }

  try {
    const { default: fetch } = await import('node-fetch');
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId || 'EXAVITQu4vr4xnSDxMaL'}`, {
      method: 'POST',
      headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, model_id: 'eleven_multilingual_v2', voice_settings: { stability: 0.5, similarity_boost: 0.75 } })
    });

    if (!response.ok) throw new Error(`ElevenLabs error: ${response.statusText}`);
    const audioBuffer = await response.arrayBuffer();
    res.set('Content-Type', 'audio/mpeg');
    res.send(Buffer.from(audioBuffer));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Replicate — AI Singing (Bark) ───────────────────────────────────────────
async function pollReplicate(predictionId) {
  const { default: fetch } = await import('node-fetch');
  const headers = { 'Authorization': `Bearer ${process.env.REPLICATE_API_KEY}` };
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 3000));
    const r = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, { headers });
    const p = await r.json();
    if (p.status === 'succeeded') return p.output;
    if (p.status === 'failed' || p.status === 'canceled') throw new Error(p.error || 'Prediction failed');
  }
  throw new Error('Prediction timed out after 3 minutes');
}

app.post('/api/generate-singing', async (req, res) => {
  if (!process.env.REPLICATE_API_KEY) {
    return res.status(400).json({ success: false, error: 'Replicate API key not set. Add REPLICATE_API_KEY to your .env file and restart the server.' });
  }
  const { lyrics, voiceStyle = 'en_speaker_6' } = req.body;
  if (!lyrics) return res.status(400).json({ success: false, error: 'No lyrics provided' });

  // Take first 8 non-empty lines, add ♪ markers for singing
  const lines = lyrics.replace(/\[(.*?)\]/g, '').trim().split('\n')
    .map(l => l.trim()).filter(Boolean).slice(0, 8);
  const prompt = lines.map(l => `♪ ${l} ♪`).join('\n');

  try {
    const { default: fetch } = await import('node-fetch');
    const createRes = await fetch('https://api.replicate.com/v1/models/suno-ai/bark/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.REPLICATE_API_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'wait=30',
      },
      body: JSON.stringify({
        input: { prompt, history_prompt: voiceStyle, text_temp: 0.7, waveform_temp: 0.7 }
      })
    });
    const prediction = await createRes.json();
    if (!createRes.ok) throw new Error(prediction.detail || JSON.stringify(prediction));

    let output = prediction.output;
    if (!output && prediction.id) output = await pollReplicate(prediction.id);

    // Bark returns { audio_out: "url" } or just a URL string
    const audioUrl = (typeof output === 'object' && output !== null)
      ? (output.audio_out || Object.values(output)[0])
      : output;

    res.json({ success: true, audioUrl });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ─── ElevenLabs Voice Cloning ─────────────────────────────────────────────────
app.post('/api/clone-voice', upload.single('voiceFile'), async (req, res) => {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return res.status(400).json({ success: false, error: 'ElevenLabs API key not set. Add ELEVENLABS_API_KEY to your .env file.' });
  if (!req.file) return res.status(400).json({ success: false, error: 'No voice file uploaded' });

  try {
    const { default: fetch } = await import('node-fetch');
    const { default: FormData } = await import('form-data');
    const form = new FormData();
    form.append('name', `My Voice ${Date.now()}`);
    form.append('description', 'AI Song Generator voice clone');
    form.append('files', req.file.buffer, { filename: 'voice.webm', contentType: req.file.mimetype });

    const r = await fetch('https://api.elevenlabs.io/v1/voices/add', {
      method: 'POST',
      headers: { 'xi-api-key': apiKey, ...form.getHeaders() },
      body: form,
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.detail?.message || data.detail || JSON.stringify(data));
    res.json({ success: true, voiceId: data.voice_id, voiceName: `My Voice Clone` });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ─── ElevenLabs TTS with cloned voice ────────────────────────────────────────
app.post('/api/tts-cloned', async (req, res) => {
  const { text, voiceId } = req.body;
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey || !voiceId) return res.status(400).json({ success: false, error: 'Missing API key or voice ID' });

  try {
    const { default: fetch } = await import('node-fetch');
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, model_id: 'eleven_multilingual_v2', voice_settings: { stability: 0.5, similarity_boost: 0.85 } })
    });
    if (!r.ok) { const e = await r.json(); throw new Error(e.detail?.message || 'ElevenLabs error'); }
    const buf = await r.arrayBuffer();
    res.set('Content-Type', 'audio/mpeg');
    res.send(Buffer.from(buf));
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ─── Proxy audio URL for download ────────────────────────────────────────────
app.get('/api/proxy-audio', async (req, res) => {
  const { url, filename = 'song-ai-singing.wav' } = req.query;
  if (!url || !url.startsWith('https://')) return res.status(400).json({ error: 'Invalid URL' });
  try {
    const { default: fetch } = await import('node-fetch');
    const r = await fetch(url);
    if (!r.ok) throw new Error('Failed to fetch audio');
    res.setHeader('Content-Type', r.headers.get('content-type') || 'audio/wav');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    r.body.pipe(res);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Start server ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🎵 AI Song Generator running at http://localhost:${PORT}`);
  console.log(`   ANTHROPIC_API_KEY:  ${process.env.ANTHROPIC_API_KEY ? '✓ Set' : '✗ Missing — add to .env'}`);
  console.log(`   ELEVENLABS_API_KEY: ${process.env.ELEVENLABS_API_KEY ? '✓ Set' : '○ Optional (voice cloning)'}`);
  console.log(`   REPLICATE_API_KEY:  ${process.env.REPLICATE_API_KEY ? '✓ Set' : '○ Optional (AI singing)'}\n`);
});
