require('dotenv').config();
const express = require('express');
const rateLimit = require('express-rate-limit');
const admin = require('firebase-admin');
const axios = require('axios');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.static(__dirname));

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

const serviceAccount = JSON.parse(
  Buffer.from(process.env.GOOGLE_CREDENTIALS, "base64").toString("utf8")
);

const empireConfig = {
    links: {
        triangulet: "https://tri.pengpowers.xyz/",
        blooket: "https://blooket.com/",
        blacket: "https://blacket.org",
        boofet: "https://blooket.nekoweb.org/",
        discordTOS: "https://discord.com/terms",
        discord: "https://discord.gg/v2hhPtywgu"
    },
    rules: "1: Do not say anything racist, sexist, ableist, or ageist. We have a zero-tolerance policy for any language that attacks someone’s race, gender, identity, or disability. This includes slurs, 'jokes' based on stereotypes, and any form of supremacy or dehumanization. 2: Do not talk about sensitive historical events such as 9/11 or Germany 1939. 3: Do not attempt to exploit or hack this group; we are here to build a community, so do not ruin the experience for others. 4: Respect the staff of the Blob Empire; they work hard to keep this group intact and secure. 5: Do not share links to scams, phishing sites, or malicious software. This includes 'Free Nitro' scams, suspicious gift links, and unauthorized QR code logins. Sharing any link designed to steal accounts or personal data will result in an immediate permanent ban. 6: Variable and API Integrity; do not use variables or scripts to disrupt our services. Respect the 300ms rate limits and do not attempt to spam or manipulate our APIs. 7: Follow discord TOS which can be found at https://discord.com/terms",
    name: "Blob Empire",
    pronunciation: "blawb em-py-er",
    owner: "Blob_raccoon",
    discord: "https://discord.gg/v2hhPtywgu"
};

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://blob-empire-15875-default-rtdb.firebaseio.com"
});

const db = admin.database();
const DISCORD_WEBHOOK = "https://discord.com/api/webhooks/1482525202620481566/4r4WhMyIImUj9O6qpTtX7E2FwEheO3lRkM9a9ffbtt4z4Eqa9RI3e_guzIkHL-1PW-Zz";

const ipToUsername = new Map();
const enlistedIPs = new Set();

const sendLimit = rateLimit({
  windowMs: 300,
  max: 1,
  message: { error: "Cooldown active" }
});

app.get('/data/config', (req, res) => {
  res.json(empireConfig);
});

app.get('/data/currentannounce', async (req, res) => {
  try {
    const snap = await db.ref('announcement').get();
    const data = snap.val();
    if (data && data.expiry > Date.now()) {
      res.json({ text: data.text });
    } else {
      res.json({ text: null });
    }
  } catch (e) { res.status(500).send(); }
});

app.get('/data/members', async (req, res) => {
  try {
    const snap = await db.ref('members').get();
    const members = [];
    snap.forEach(child => { members.push(child.val().name); });
    res.json(members);
  } catch (e) { res.status(500).send(); }
});

app.get('/data/messages', async (req, res) => {
  try {
    const snap = await db.ref('chat').orderByKey().limitToFirst(50).get();
    res.json(snap.val() || {});
  } catch (e) { res.status(500).send(); }
});

const lastSent = new Map();
const COOLDOWN_MS = 300;

app.post('/api/send', (req, res) => {
  const { username, message } = req.body;
  const userIP = req.ip;
  const now = Date.now();

  if (lastSent.has(userIP)) {
    const timePassed = now - lastSent.get(userIP);
    if (timePassed < COOLDOWN_MS) {
      return res.status(429).json({ 
        error: "Too many messages", 
        retryAfter: COOLDOWN_MS - timePassed 
      });
    }
  }

  if (!username || !message) {
    return res.status(400).json({ error: "Missing data" });
  }

  lastSent.set(userIP, now);

  db.ref('chat').push({
    user: username,
    text: message,
    timestamp: admin.database.ServerValue.TIMESTAMP
  }).catch(err => console.error("DB Error:", err));

  res.json({ success: true });
});

app.post('/api/announce', async (req, res) => {
    const { text, durationHours, password } = req.body;

    if (password !== ADMIN_PASSWORD) {
        return res.status(403).json({ error: "Unauthorized" });
    }

    if (!text) return res.status(400).json({ error: "Text required" });

    const expiry = Date.now() + (durationHours || 24) * 60 * 60 * 1000;

    try {
        await db.ref('announcement').set({
            text: text,
            expiry: expiry
        });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: "Database error" });
    }
});
app.post('/api/enlist', async (req, res) => {
  const { username } = req.body;
  const userIP = req.ip;
  if (enlistedIPs.has(userIP)) return res.status(403).json({ error: "Already enlisted" });
  if (!username) return res.status(400).json({ error: "Username required" });
  await db.ref('members').push({ name: username });
  enlistedIPs.add(userIP);
  try {
    await axios.post(DISCORD_WEBHOOK, {
      embeds: [{ title: "New Recruit", description: `**${username}** joined`, color: 3066993 }]
    });
  } catch (e) {}
  res.json({ success: true });
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(3000, () => console.log('Server Active'));
