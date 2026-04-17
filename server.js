require('dotenv').config({ path: require('path').join(__dirname, '.env'), override: true });
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const Anthropic = require('@anthropic-ai/sdk');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'aisong-jwt-secret-change-in-production-' + Math.random();

// ─── Simple JSON user store (swap for MongoDB by setting MONGODB_URI later) ──
const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, '[]');

function readUsers() {
  try { return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')); }
  catch { return []; }
}
function writeUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}
function findUser(email) {
  return readUsers().find(u => u.email.toLowerCase() === email.toLowerCase());
}
function saveUser(user) {
  const users = readUsers();
  const idx = users.findIndex(u => u.id === user.id);
  if (idx >= 0) users[idx] = user; else users.push(user);
  writeUsers(users);
  return user;
}

// ─── Plan limits ──────────────────────────────────────────────────────────────
const PLANS = {
  free:    { name: 'Free',    songsPerMonth: 5,   price: 0,    features: ['5 songs/month', 'All languages', 'Basic voice'] },
  starter: { name: 'Starter', songsPerMonth: 50,  price: 9,    features: ['50 songs/month', 'Voice cloning', 'AI singing', 'Batch mode'] },
  pro:     { name: 'Pro',     songsPerMonth: 9999, price: 19,  features: ['Unlimited songs', 'All features', 'Priority AI', 'Download MP3'] },
};

function getMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}

function getUserUsage(user) {
  const mk = getMonthKey();
  if (!user.usage || user.usage.month !== mk) return 0;
  return user.usage.count || 0;
}

function incrementUsage(userId) {
  const users = readUsers();
  const user = users.find(u => u.id === userId);
  if (!user) return;
  const mk = getMonthKey();
  if (!user.usage || user.usage.month !== mk) user.usage = { month: mk, count: 0 };
  user.usage.count++;
  writeUsers(users);
}

// ─── Auth middleware ──────────────────────────────────────────────────────────
function authMiddleware(req, res, next) {
  const header = req.headers['authorization'] || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token expired or invalid' });
  }
}

function optionalAuth(req, res, next) {
  const header = req.headers['authorization'] || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (token) {
    try { req.user = jwt.verify(token, JWT_SECRET); } catch {}
  }
  next();
}

// ─── Anthropic client ─────────────────────────────────────────────────────────
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── Middleware ───────────────────────────────────────────────────────────────
app.set('trust proxy', 1); // Required for Render / any reverse proxy (fixes rate-limit X-Forwarded-For error)
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Explicit root route (needed for Render)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Rate limiting
const limiter = rateLimit({ windowMs: 60 * 1000, max: 30, message: { error: 'Too many requests, please wait a moment.' } });
app.use('/api/', limiter);

// Multer for voice uploads (disk storage)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, 'public/audio');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => cb(null, `voice_${uuidv4()}${path.extname(file.originalname)}`)
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });
const uploadLarge = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } }); // 50 MB for song converter

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
  { code: 'km', name: 'Khmer', nativeName: 'ភាសាខ្មែរ' },
  { code: 'lo', name: 'Lao', nativeName: 'ພາສາລາວ' },
  { code: 'mn', name: 'Mongolian', nativeName: 'Монгол' },
  { code: 'ka', name: 'Georgian', nativeName: 'ქართული' },
  { code: 'am', name: 'Amharic', nativeName: 'አማርኛ' },
  { code: 'ha', name: 'Hausa', nativeName: 'Hausa' },
  { code: 'yo', name: 'Yoruba', nativeName: 'Yorùbá' },
  { code: 'ig', name: 'Igbo', nativeName: 'Igbo' },
  { code: 'zu', name: 'Zulu', nativeName: 'isiZulu' },
  { code: 'af', name: 'Afrikaans', nativeName: 'Afrikaans' },
  { code: 'sq', name: 'Albanian', nativeName: 'Shqip' },
  { code: 'hy', name: 'Armenian', nativeName: 'Հայերեն' },
  { code: 'az', name: 'Azerbaijani', nativeName: 'Azərbaycan' },
  { code: 'be', name: 'Belarusian', nativeName: 'Беларуская' },
  { code: 'bg', name: 'Bulgarian', nativeName: 'Български' },
  { code: 'hr', name: 'Croatian', nativeName: 'Hrvatski' },
  { code: 'sk', name: 'Slovak', nativeName: 'Slovenčina' },
  { code: 'sl', name: 'Slovenian', nativeName: 'Slovenščina' },
  { code: 'sr', name: 'Serbian', nativeName: 'Српски' },
  { code: 'lt', name: 'Lithuanian', nativeName: 'Lietuvių' },
  { code: 'lv', name: 'Latvian', nativeName: 'Latviešu' },
  { code: 'et', name: 'Estonian', nativeName: 'Eesti' },
  { code: 'tl', name: 'Filipino/Tagalog', nativeName: 'Filipino' },
  { code: 'jv', name: 'Javanese', nativeName: 'Basa Jawa' },
  { code: 'su', name: 'Sundanese', nativeName: 'Basa Sunda' },
  { code: 'ceb', name: 'Cebuano', nativeName: 'Cebuano' },
  { code: 'mg', name: 'Malagasy', nativeName: 'Malagasy' },
  { code: 'cy', name: 'Welsh', nativeName: 'Cymraeg' },
  { code: 'ga', name: 'Irish', nativeName: 'Gaeilge' },
  { code: 'eu', name: 'Basque', nativeName: 'Euskara' },
  { code: 'ca', name: 'Catalan', nativeName: 'Català' },
  { code: 'gl', name: 'Galician', nativeName: 'Galego' },
  { code: 'la', name: 'Latin', nativeName: 'Latina' },
];

const GENRES = [
  'Pop', 'R&B', 'Classical', 'Folk', 'Hip-Hop', 'Rock', 'Jazz', 'Electronic',
  'Devotional/Spiritual', 'Indie', 'Soul', 'Country', 'Reggae', 'Latin',
  'Afrobeats', 'K-Pop', 'J-Pop', 'Bollywood', 'Lo-Fi', 'Trap', 'Gospel',
  'Metal', 'Blues', 'Bossa Nova', 'Salsa', 'Cumbia', 'Dancehall', 'Punk',
  'Ambient', 'Funk', 'Disco', 'EDM', 'Bhangra', 'Carnatic', 'Hindustani',
];
const MOODS = ['Happy', 'Romantic', 'Sad', 'Empowering', 'Nostalgic', 'Peaceful', 'Energetic', 'Spiritual', 'Melancholic', 'Playful', 'Longing', 'Hopeful', 'Angry', 'Dreamy', 'Fierce', 'Chill'];

// ─── GET: Meta ────────────────────────────────────────────────────────────────
app.get('/api/languages', (req, res) => res.json(LANGUAGES));
app.get('/api/genres', (req, res) => res.json(GENRES));
app.get('/api/moods', (req, res) => res.json(MOODS));
app.get('/api/plans', (req, res) => res.json(PLANS));

// ─── AUTH: Register ───────────────────────────────────────────────────────────
app.post('/api/auth/register', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Name, email and password are required' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  if (findUser(email)) return res.status(409).json({ error: 'An account with this email already exists' });

  const hash = await bcrypt.hash(password, 10);
  const user = {
    id: uuidv4(),
    name: name.trim(),
    email: email.toLowerCase().trim(),
    passwordHash: hash,
    plan: 'free',
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    usage: { month: getMonthKey(), count: 0 },
    createdAt: new Date().toISOString(),
  };
  saveUser(user);

  const token = jwt.sign({ id: user.id, email: user.email, plan: user.plan }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ success: true, token, user: { id: user.id, name: user.name, email: user.email, plan: user.plan } });
});

// ─── AUTH: Login ──────────────────────────────────────────────────────────────
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

  const user = findUser(email);
  if (!user) return res.status(401).json({ error: 'No account found with this email' });

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: 'Incorrect password' });

  const token = jwt.sign({ id: user.id, email: user.email, plan: user.plan }, JWT_SECRET, { expiresIn: '30d' });
  res.json({
    success: true, token,
    user: { id: user.id, name: user.name, email: user.email, plan: user.plan },
    usage: { used: getUserUsage(user), limit: PLANS[user.plan].songsPerMonth },
  });
});

// ─── AUTH: Me ─────────────────────────────────────────────────────────────────
app.get('/api/auth/me', authMiddleware, (req, res) => {
  const user = readUsers().find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({
    user: { id: user.id, name: user.name, email: user.email, plan: user.plan },
    usage: { used: getUserUsage(user), limit: PLANS[user.plan].songsPerMonth },
  });
});

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

// ─── POST: Generate lyrics (with usage gating) ───────────────────────────────
app.post('/api/generate-lyrics', optionalAuth, async (req, res) => {
  // Usage gating
  if (req.user) {
    const user = readUsers().find(u => u.id === req.user.id);
    if (user) {
      const used = getUserUsage(user);
      const limit = PLANS[user.plan]?.songsPerMonth || 5;
      if (used >= limit) {
        return res.status(429).json({
          error: `You've used all ${limit} songs this month. Upgrade your plan to generate more!`,
          upgradeRequired: true,
          plan: user.plan,
          used, limit,
        });
      }
    }
  } else {
    // Anonymous usage: track via IP in memory (rough, for demo)
    // Allow up to 3 songs for unauthenticated users
    // (In production, use a proper session or IP-based counter)
  }

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

    // Increment usage for authenticated users
    if (req.user) incrementUsage(req.user.id);

    res.json({ success: true, song: songData });
  } catch (err) {
    console.error('Lyrics generation error:', err.message);
    res.status(500).json({ error: err.message || 'Failed to generate lyrics' });
  }
});

// ─── POST: Translate lyrics ───────────────────────────────────────────────────
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

// ─── POST: Batch generate ─────────────────────────────────────────────────────
app.post('/api/generate-batch', optionalAuth, async (req, res) => {
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
        headers: {
          'Content-Type': 'application/json',
          ...(req.headers.authorization ? { 'Authorization': req.headers.authorization } : {}),
        },
        body: JSON.stringify({ theme, genre, mood, language })
      });
      const data = await resp.json();
      if (data.success) results.push(data.song);
      if (data.upgradeRequired) break; // stop if usage exhausted
    } catch (e) {
      console.error(`Batch song ${i + 1} failed:`, e.message);
    }
  }

  res.json({ success: true, songs: results, count: results.length });
});

// ─── GET: Voice info ──────────────────────────────────────────────────────────
app.get('/api/voice-info', (req, res) => {
  res.json({ message: 'Voice cloning powered by ElevenLabs', supportedFeatures: ['Voice recording', 'Voice cloning', 'TTS'] });
});

// ─── POST: ElevenLabs TTS ─────────────────────────────────────────────────────
app.post('/api/tts-elevenlabs', async (req, res) => {
  const { text, voiceId } = req.body;
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'ElevenLabs API key not configured' });

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
    return res.status(400).json({ success: false, error: 'Replicate API key not set. Add REPLICATE_API_KEY to your .env file and restart.' });
  }
  const { lyrics, voiceStyle = 'en_speaker_6' } = req.body;
  if (!lyrics) return res.status(400).json({ success: false, error: 'No lyrics provided' });

  const lines = lyrics.replace(/\[(.*?)\]/g, '').trim().split('\n')
    .map(l => l.trim()).filter(Boolean).slice(0, 8);
  const prompt = lines.map(l => `♪ ${l} ♪`).join('\n');

  try {
    const { default: fetch } = await import('node-fetch');
    const createRes = await fetch('https://api.replicate.com/v1/models/suno-ai/bark/predictions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.REPLICATE_API_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'wait=30' },
      body: JSON.stringify({ input: { prompt, history_prompt: voiceStyle, text_temp: 0.7, waveform_temp: 0.7 } })
    });
    const prediction = await createRes.json();
    if (!createRes.ok) throw new Error(prediction.detail || JSON.stringify(prediction));

    let output = prediction.output;
    if (!output && prediction.id) output = await pollReplicate(prediction.id);

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
  if (!apiKey) return res.status(400).json({ success: false, error: 'ElevenLabs API key not set.' });
  if (!req.file) return res.status(400).json({ success: false, error: 'No voice file uploaded' });

  try {
    const { default: fetch } = await import('node-fetch');
    const { default: FormData } = await import('form-data');
    const form = new FormData();
    form.append('name', `My Voice ${Date.now()}`);
    form.append('description', 'AI Song Generator voice clone');
    // Use file stream from disk (multer disk storage saves to file path)
    form.append('files', fs.createReadStream(req.file.path), {
      filename: req.file.originalname || 'voice.webm',
      contentType: req.file.mimetype,
    });

    const r = await fetch('https://api.elevenlabs.io/v1/voices/add', {
      method: 'POST',
      headers: { 'xi-api-key': apiKey, ...form.getHeaders() },
      body: form,
    });
    const data = await r.json();
    // Clean up temp file
    fs.unlink(req.file.path, () => {});
    if (!r.ok) throw new Error(data.detail?.message || data.detail || JSON.stringify(data));
    res.json({ success: true, voiceId: data.voice_id, voiceName: 'My Voice Clone' });
  } catch (e) {
    if (req.file?.path) fs.unlink(req.file.path, () => {});
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

// ─── ElevenLabs Speech-to-Speech: "Sing in My Voice" ────────────────────────
// Converts a Bark-generated audio URL to the user's cloned voice
app.post('/api/convert-singing', async (req, res) => {
  const { audioUrl, voiceId } = req.body;
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return res.status(400).json({ success: false, error: 'ElevenLabs API key not configured' });
  if (!audioUrl || !voiceId) return res.status(400).json({ success: false, error: 'audioUrl and voiceId are required' });

  try {
    const { default: fetch } = await import('node-fetch');
    const { default: FormData } = await import('form-data');

    // Download the Bark source audio
    const audioRes = await fetch(audioUrl);
    if (!audioRes.ok) throw new Error('Failed to download source audio from Replicate');
    const audioBuffer = await audioRes.buffer();

    const form = new FormData();
    form.append('audio', audioBuffer, { filename: 'singing.wav', contentType: 'audio/wav' });
    form.append('model_id', 'eleven_multilingual_sts_v2');
    form.append('voice_settings', JSON.stringify({ stability: 0.5, similarity_boost: 0.85 }));

    const r = await fetch(`https://api.elevenlabs.io/v1/speech-to-speech/${voiceId}`, {
      method: 'POST',
      headers: { 'xi-api-key': apiKey, ...form.getHeaders() },
      body: form,
    });
    if (!r.ok) {
      const errData = await r.json().catch(() => ({}));
      throw new Error(errData.detail?.message || errData.detail || `ElevenLabs STS error: ${r.statusText}`);
    }
    const buf = await r.arrayBuffer();
    res.set('Content-Type', 'audio/mpeg');
    res.send(Buffer.from(buf));
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ─── Song Voice Converter: Upload song + voice → ElevenLabs STS ──────────────
app.post('/api/song-voice-converter',
  uploadLarge.fields([{ name: 'song', maxCount: 1 }, { name: 'voiceFile', maxCount: 1 }]),
  async (req, res) => {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) return res.status(400).json({ success: false, error: 'ElevenLabs API key not configured' });

    const songFile = req.files?.song?.[0];
    if (!songFile) return res.status(400).json({ success: false, error: 'No song file uploaded' });

    let voiceId = req.body.voiceId || null;

    try {
      const { default: fetch } = await import('node-fetch');
      const { default: FormData } = await import('form-data');

      // If a new voice file was uploaded, clone it first
      if (!voiceId && req.files?.voiceFile?.[0]) {
        const vf = req.files.voiceFile[0];
        const cloneForm = new FormData();
        cloneForm.append('name', `SVC Voice ${Date.now()}`);
        cloneForm.append('description', 'Song Voice Converter — auto cloned');
        cloneForm.append('files', fs.createReadStream(vf.path), {
          filename: vf.originalname || 'voice.mp3',
          contentType: vf.mimetype,
        });
        const cloneRes = await fetch('https://api.elevenlabs.io/v1/voices/add', {
          method: 'POST',
          headers: { 'xi-api-key': apiKey, ...cloneForm.getHeaders() },
          body: cloneForm,
        });
        const cloneData = await cloneRes.json();
        fs.unlink(vf.path, () => {});
        if (!cloneRes.ok) throw new Error(cloneData.detail?.message || cloneData.detail || 'Voice cloning failed');
        voiceId = cloneData.voice_id;
      }

      if (!voiceId) return res.status(400).json({ success: false, error: 'Provide an existing voiceId or upload a new voice file' });

      // Convert song through ElevenLabs Speech-to-Speech
      const stsForm = new FormData();
      stsForm.append('audio', fs.createReadStream(songFile.path), {
        filename: songFile.originalname || 'song.mp3',
        contentType: songFile.mimetype,
      });
      stsForm.append('model_id', 'eleven_multilingual_sts_v2');
      stsForm.append('voice_settings', JSON.stringify({ stability: 0.5, similarity_boost: 0.85 }));

      const stsRes = await fetch(`https://api.elevenlabs.io/v1/speech-to-speech/${voiceId}`, {
        method: 'POST',
        headers: { 'xi-api-key': apiKey, ...stsForm.getHeaders() },
        body: stsForm,
      });

      fs.unlink(songFile.path, () => {});

      if (!stsRes.ok) {
        const errData = await stsRes.json().catch(() => ({}));
        throw new Error(errData.detail?.message || errData.detail || `ElevenLabs STS error: ${stsRes.statusText}`);
      }

      const buf = await stsRes.arrayBuffer();
      res.set('Content-Type', 'audio/mpeg');
      res.set('Content-Disposition', 'attachment; filename="converted-voice.mp3"');
      res.send(Buffer.from(buf));
    } catch (e) {
      if (req.files?.song?.[0]?.path) fs.unlink(req.files.song[0].path, () => {});
      if (req.files?.voiceFile?.[0]?.path) fs.unlink(req.files.voiceFile[0].path, () => {});
      res.status(500).json({ success: false, error: e.message });
    }
  }
);

// ─── Proxy audio for download ─────────────────────────────────────────────────
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

// ─── Stripe: Checkout session ─────────────────────────────────────────────────
app.post('/api/stripe/checkout', authMiddleware, async (req, res) => {
  const { plan } = req.body;
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return res.status(503).json({ error: 'Stripe not configured yet. Add STRIPE_SECRET_KEY to your environment variables.' });
  }

  const priceIds = {
    starter: process.env.STRIPE_PRICE_STARTER,
    pro: process.env.STRIPE_PRICE_PRO,
  };
  if (!priceIds[plan]) return res.status(400).json({ error: 'Invalid plan' });
  if (!priceIds[plan]) return res.status(503).json({ error: `Stripe price ID for ${plan} plan not configured` });

  try {
    const stripe = require('stripe')(stripeKey);
    const user = readUsers().find(u => u.id === req.user.id);
    const baseUrl = process.env.APP_URL || `http://localhost:${PORT}`;

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer_email: user.email,
      line_items: [{ price: priceIds[plan], quantity: 1 }],
      success_url: `${baseUrl}/?payment=success&plan=${plan}`,
      cancel_url: `${baseUrl}/?payment=cancelled`,
      metadata: { userId: user.id, plan },
    });

    res.json({ success: true, url: session.url });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Stripe: Webhook (updates user plan after payment) ───────────────────────
app.post('/api/stripe/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!stripeKey) return res.status(200).json({ received: true });

    try {
      const stripe = require('stripe')(stripeKey);
      let event;
      if (webhookSecret) {
        event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], webhookSecret);
      } else {
        event = JSON.parse(req.body);
      }

      if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const userId = session.metadata?.userId;
        const plan = session.metadata?.plan;
        if (userId && plan) {
          const users = readUsers();
          const user = users.find(u => u.id === userId);
          if (user) {
            user.plan = plan;
            user.stripeCustomerId = session.customer;
            user.stripeSubscriptionId = session.subscription;
            writeUsers(users);
          }
        }
      }

      if (event.type === 'customer.subscription.deleted') {
        const sub = event.data.object;
        const users = readUsers();
        const user = users.find(u => u.stripeSubscriptionId === sub.id);
        if (user) {
          user.plan = 'free';
          user.stripeSubscriptionId = null;
          writeUsers(users);
        }
      }

      res.json({ received: true });
    } catch (e) {
      console.error('Webhook error:', e.message);
      res.status(400).json({ error: e.message });
    }
  }
);

// ─── Contact Form ─────────────────────────────────────────────────────────────
app.post('/api/contact', async (req, res) => {
  const { name, email, subject, message } = req.body;
  if (!name || !email || !message) return res.status(400).json({ error: 'Name, email and message are required' });

  const ownerEmail = process.env.CONTACT_EMAIL || 'divyanarayanan2026@gmail.com';
  const emailPass = process.env.EMAIL_PASS;

  // If no email password configured, just log and return success
  if (!emailPass) {
    console.log(`📧 Contact form submission:\nFrom: ${name} <${email}>\nSubject: ${subject || 'General Inquiry'}\nMessage: ${message}`);
    return res.json({ success: true, message: 'Message received! We will get back to you soon.' });
  }

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: ownerEmail, pass: emailPass },
    });

    await transporter.sendMail({
      from: ownerEmail,
      to: ownerEmail,
      replyTo: `${name} <${email}>`,
      subject: `[AISongOnline] ${subject || 'New Contact Form Message'} — from ${name}`,
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#13112a;color:#f1eeff;padding:28px;border-radius:12px;">
          <h2 style="color:#c4b5fd;margin-bottom:20px;">🎵 New Contact Message — AISongOnline</h2>
          <table style="width:100%;border-collapse:collapse;">
            <tr><td style="padding:8px 0;color:#a09cc0;width:100px;">From:</td><td>${name}</td></tr>
            <tr><td style="padding:8px 0;color:#a09cc0;">Email:</td><td><a href="mailto:${email}" style="color:#c4b5fd;">${email}</a></td></tr>
            <tr><td style="padding:8px 0;color:#a09cc0;">Subject:</td><td>${subject || 'General Inquiry'}</td></tr>
          </table>
          <hr style="border-color:rgba(196,181,253,0.2);margin:16px 0;"/>
          <p style="line-height:1.7;color:#f1eeff;">${message.replace(/\n/g, '<br/>')}</p>
          <p style="color:#5e5a80;font-size:12px;margin-top:24px;">Sent from AISongOnline contact form</p>
        </div>
      `,
    });

    res.json({ success: true, message: 'Message sent! We will get back to you soon.' });
  } catch (e) {
    console.error('Contact form error:', e.message);
    res.status(500).json({ error: 'Failed to send message. Please try again.' });
  }
});

// ─── Start server ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🎵 AI Song Generator running at http://localhost:${PORT}`);
  console.log(`   ANTHROPIC_API_KEY:   ${process.env.ANTHROPIC_API_KEY ? '✓ Set' : '✗ Missing'}`);
  console.log(`   ELEVENLABS_API_KEY:  ${process.env.ELEVENLABS_API_KEY ? '✓ Set' : '○ Optional'}`);
  console.log(`   REPLICATE_API_KEY:   ${process.env.REPLICATE_API_KEY ? '✓ Set' : '○ Optional'}`);
  console.log(`   STRIPE_SECRET_KEY:   ${process.env.STRIPE_SECRET_KEY ? '✓ Set' : '○ Optional (payments)'}`);
  console.log(`   EMAIL_PASS:          ${process.env.EMAIL_PASS ? '✓ Set' : '○ Optional (contact form)'}\n`);
});
