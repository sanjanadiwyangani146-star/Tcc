const express = require('express');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const router = express.Router();
const pino = require('pino');
const moment = require('moment-timezone');
const Jimp = require('jimp');
const crypto = require('crypto');
const axios = require('axios');
const FileType = require('file-type');
const fetch = require('node-fetch');
const { MongoClient } = require('mongodb');

const {
  default: makeWASocket,
  useMultiFileAuthState,
  delay,
  getContentType,
  makeCacheableSignalKeyStore,
  Browsers,
  jidNormalizedUser,
  downloadContentFromMessage,
  DisconnectReason
} = require('@whiskeysockets/baileys');

// ---------------- CONFIG ----------------

const BOT_NAME_FANCY = 'Ｔʜᴇ Ｃᴏᴅᴇꜱ Ｃʀᴇᴡ Ｍɪɴɪ';

const config = {
  AUTO_VIEW_STATUS: 'true',
  AUTO_LIKE_STATUS: 'true',
  AUTO_RECORDING: 'false',
  AUTO_LIKE_EMOJI: ['🩷','🧡','💛','💚','💙','🩵','💜','🤎','🖤','🩶','❤️'],
  PREFIX: '.',
  MAX_RETRIES: 3,
  GROUP_INVITE_LINK: 'https://chat.whatsapp.com/LbmbY5xzVXS98KCt6XDWsF?mode=gi_t',
  RCD_IMAGE_PATH: 'https://i.ibb.co/nMLvjTgT/Rashmika-Ofc.jpg',
  NEWSLETTER_JID: '120363405871120956@newsletter',
  OTP_EXPIRY: 300000,
  OWNER_NUMBER: process.env.OWNER_NUMBER || '94769194547',
  CHANNEL_LINK: 'https://whatsapp.com/channel/0029VbCG0yxEwEk21tFzPT16',
  BOT_NAME: 'Ｔʜᴇ Ｃᴏᴅᴇꜱ Ｃʀᴇᴡ Ｍɪɴɪ',
  BOT_VERSION: '1.0.0',
  OWNER_NAME: 'Qᴜᴇᴇɴ Hᴀɴꜱɪ',
  IMAGE_PATH: 'https://i.ibb.co/SqvcFPd/Rashmika-Ofc.jpg',
  BOT_FOOTER: '> *ᴛʜᴇ ᴄᴏᴅᴇꜱ ᴄʀᴇᴡ ᴍᴅ ᴍɪɴɪ ʙᴏᴛ*',
  ALIVE_IMG: 'https://i.ibb.co/SqvcFPd/Rashmika-Ofc.jpg'
};

// ---------------- MONGO SETUP ----------------

const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://kethmi12345_db_user:mallibotae@cluster0.cevwzll.mongodb.net/';
const MONGO_DB = process.env.MONGO_DB || 'SAMURAIMINI'
let mongoClient, mongoDB;
let sessionsCol, numbersCol, adminsCol, newsletterCol, configsCol, newsletterReactsCol;

async function initMongo() {
  try {
    if (mongoClient && mongoClient.topology && mongoClient.topology.isConnected && mongoClient.topology.isConnected()) return;
  } catch(e){}
  mongoClient = new MongoClient(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  await mongoClient.connect();
  mongoDB = mongoClient.db(MONGO_DB);

  sessionsCol = mongoDB.collection('sessions');
  numbersCol = mongoDB.collection('numbers');
  adminsCol = mongoDB.collection('admins');
  newsletterCol = mongoDB.collection('newsletter_list');
  configsCol = mongoDB.collection('configs');
  newsletterReactsCol = mongoDB.collection('newsletter_reacts');

  await sessionsCol.createIndex({ number: 1 }, { unique: true });
  await numbersCol.createIndex({ number: 1 }, { unique: true });
  await newsletterCol.createIndex({ jid: 1 }, { unique: true });
  await newsletterReactsCol.createIndex({ jid: 1 }, { unique: true });
  await configsCol.createIndex({ number: 1 }, { unique: true });
  console.log('✅ Mongo initialized and collections ready');
}

// ---------------- Mongo helpers ----------------

async function saveCredsToMongo(number, creds, keys = null) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    const doc = { number: sanitized, creds, keys, updatedAt: new Date() };
    await sessionsCol.updateOne({ number: sanitized }, { $set: doc }, { upsert: true });
    console.log(`Saved creds to Mongo for ${sanitized}`);
  } catch (e) { console.error('saveCredsToMongo error:', e); }
}

async function loadCredsFromMongo(number) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    const doc = await sessionsCol.findOne({ number: sanitized });
    return doc || null;
  } catch (e) { console.error('loadCredsFromMongo error:', e); return null; }
}

async function removeSessionFromMongo(number) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    await sessionsCol.deleteOne({ number: sanitized });
    console.log(`Removed session from Mongo for ${sanitized}`);
  } catch (e) { console.error('removeSessionToMongo error:', e); }
}

async function addNumberToMongo(number) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    await numbersCol.updateOne({ number: sanitized }, { $set: { number: sanitized } }, { upsert: true });
    console.log(`Added number ${sanitized} to Mongo numbers`);
  } catch (e) { console.error('addNumberToMongo', e); }
}

async function removeNumberFromMongo(number) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    await numbersCol.deleteOne({ number: sanitized });
    console.log(`Removed number ${sanitized} from Mongo numbers`);
  } catch (e) { console.error('removeNumberFromMongo', e); }
}

async function getAllNumbersFromMongo() {
  try {
    await initMongo();
    const docs = await numbersCol.find({}).toArray();
    return docs.map(d => d.number);
  } catch (e) { console.error('getAllNumbersFromMongo', e); return []; }
}

async function loadAdminsFromMongo() {
  try {
    await initMongo();
    const docs = await adminsCol.find({}).toArray();
    return docs.map(d => d.jid || d.number).filter(Boolean);
  } catch (e) { console.error('loadAdminsFromMongo', e); return []; }
}

async function addAdminToMongo(jidOrNumber) {
  try {
    await initMongo();
    const doc = { jid: jidOrNumber };
    await adminsCol.updateOne({ jid: jidOrNumber }, { $set: doc }, { upsert: true });
    console.log(`Added admin ${jidOrNumber}`);
  } catch (e) { console.error('addAdminToMongo', e); }
}

async function removeAdminFromMongo(jidOrNumber) {
  try {
    await initMongo();
    await adminsCol.deleteOne({ jid: jidOrNumber });
    console.log(`Removed admin ${jidOrNumber}`);
  } catch (e) { console.error('removeAdminFromMongo', e); }
}

async function addNewsletterToMongo(jid, emojis = []) {
  try {
    await initMongo();
    const doc = { jid, emojis: Array.isArray(emojis) ? emojis : [], addedAt: new Date() };
    await newsletterCol.updateOne({ jid }, { $set: doc }, { upsert: true });
    console.log(`Added newsletter ${jid} -> emojis: ${doc.emojis.join(',')}`);
  } catch (e) { console.error('addNewsletterToMongo', e); throw e; }
}

async function removeNewsletterFromMongo(jid) {
  try {
    await initMongo();
    await newsletterCol.deleteOne({ jid });
    console.log(`Removed newsletter ${jid}`);
  } catch (e) { console.error('removeNewsletterFromMongo', e); throw e; }
}

async function listNewslettersFromMongo() {
  try {
    await initMongo();
    const docs = await newsletterCol.find({}).toArray();
    return docs.map(d => ({ jid: d.jid, emojis: Array.isArray(d.emojis) ? d.emojis : [] }));
  } catch (e) { console.error('listNewslettersFromMongo', e); return []; }
}

async function saveNewsletterReaction(jid, messageId, emoji, sessionNumber) {
  try {
    await initMongo();
    const doc = { jid, messageId, emoji, sessionNumber, ts: new Date() };
    if (!mongoDB) await initMongo();
    const col = mongoDB.collection('newsletter_reactions_log');
    await col.insertOne(doc);
    console.log(`Saved reaction ${emoji} for ${jid}#${messageId}`);
  } catch (e) { console.error('saveNewsletterReaction', e); }
}

async function setUserConfigInMongo(number, conf) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    await configsCol.updateOne({ number: sanitized }, { $set: { number: sanitized, config: conf, updatedAt: new Date() } }, { upsert: true });
  } catch (e) { console.error('setUserConfigInMongo', e); }
}

async function loadUserConfigFromMongo(number) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    const doc = await configsCol.findOne({ number: sanitized });
    return doc ? doc.config : null;
  } catch (e) { console.error('loadUserConfigFromMongo', e); return null; }
}

// -------------- newsletter react-config helpers --------------

async function addNewsletterReactConfig(jid, emojis = []) {
  try {
    await initMongo();
    await newsletterReactsCol.updateOne({ jid }, { $set: { jid, emojis, addedAt: new Date() } }, { upsert: true });
    console.log(`Added react-config for ${jid} -> ${emojis.join(',')}`);
  } catch (e) { console.error('addNewsletterReactConfig', e); throw e; }
}

async function removeNewsletterReactConfig(jid) {
  try {
    await initMongo();
    await newsletterReactsCol.deleteOne({ jid });
    console.log(`Removed react-config for ${jid}`);
  } catch (e) { console.error('removeNewsletterReactConfig', e); throw e; }
}

async function listNewsletterReactsFromMongo() {
  try {
    await initMongo();
    const docs = await newsletterReactsCol.find({}).toArray();
    return docs.map(d => ({ jid: d.jid, emojis: Array.isArray(d.emojis) ? d.emojis : [] }));
  } catch (e) { console.error('listNewsletterReactsFromMongo', e); return []; }
}

async function getReactConfigForJid(jid) {
  try {
    await initMongo();
    const doc = await newsletterReactsCol.findOne({ jid });
    return doc ? (Array.isArray(doc.emojis) ? doc.emojis : []) : null;
  } catch (e) { console.error('getReactConfigForJid', e); return null; }
}

// ---------------- basic utils ----------------

function formatMessage(title, content, footer) {
  return `*${title}*\n\n${content}\n\n> *${footer}*`;
}
function generateOTP(){ return Math.floor(100000 + Math.random() * 900000).toString(); }
function getSriLankaTimestamp(){ return moment().tz('Asia/Colombo').format('YYYY-MM-DD HH:mm:ss'); }

const activeSockets = new Map();

const socketCreationTime = new Map();

const otpStore = new Map();

// ---------------- helpers kept/adapted ----------------

async function joinGroup(socket) {
  let retries = config.MAX_RETRIES;
  const inviteCodeMatch = (config.GROUP_INVITE_LINK || '').match(/chat\.whatsapp\.com\/([a-zA-Z0-9]+)/);
  if (!inviteCodeMatch) return { status: 'failed', error: 'No group invite configured' };
  const inviteCode = inviteCodeMatch[1];
  while (retries > 0) {
    try {
      const response = await socket.groupAcceptInvite(inviteCode);
      if (response?.gid) return { status: 'success', gid: response.gid };
      throw new Error('No group ID in response');
    } catch (error) {
      retries--;
      let errorMessage = error.message || 'Unknown error';
      if (error.message && error.message.includes('not-authorized')) errorMessage = 'Bot not authorized';
      else if (error.message && error.message.includes('conflict')) errorMessage = 'Already a member';
      else if (error.message && error.message.includes('gone')) errorMessage = 'Invite invalid/expired';
      if (retries === 0) return { status: 'failed', error: errorMessage };
      await delay(2000 * (config.MAX_RETRIES - retries));
    }
  }
  return { status: 'failed', error: 'Max retries reached' };
}

async function sendAdminConnectMessage(socket, number, groupResult, sessionConfig = {}) {
  const admins = await loadAdminsFromMongo();
  const groupStatus = groupResult.status === 'success' ? `Joined (ID: ${groupResult.gid})` : `Failed to join group: ${groupResult.error}`;
  const botName = sessionConfig.botName || BOT_NAME_FANCY;
  const image = sessionConfig.logo || config.RCD_IMAGE_PATH;
  const caption = formatMessage(botName, `> SAMURAI XMD 𝐂𝐨𝐧𝐧𝐞𝐜𝐭𝐞𝐝 𝐒𝐮𝐜𝐜𝐞𝐬𝐟𝐮𝐥𝐥 🧑‍💻\n\n📞 Number: ${number}\n🩵 \`Status:\` ${groupStatus}\n🕒 \`Connected at:\` ${getSriLankaTimestamp()}`, botName);
  for (const admin of admins) {
    try {
      const to = admin.includes('@') ? admin : `${admin}@s.whatsapp.net`;
      if (String(image).startsWith('http')) {
        await socket.sendMessage(to, { image: { url: image }, caption });
      } else {
        try {
          const buf = fs.readFileSync(image);
          await socket.sendMessage(to, { image: buf, caption });
        } catch (e) {
          await socket.sendMessage(to, { image: { url: config.RCD_IMAGE_PATH }, caption });
        }
      }
    } catch (err) {
      console.error('Failed to send connect message to admin', admin, err?.message || err);
    }
  }
}

async function sendOwnerConnectMessage(socket, number, groupResult, sessionConfig = {}) {
  try {
    const ownerJid = `${config.OWNER_NUMBER.replace(/[^0-9]/g,'')}@s.whatsapp.net`;
    const activeCount = activeSockets.size;
    const botName = sessionConfig.botName || BOT_NAME_FANCY;
    const image = sessionConfig.logo || config.RCD_IMAGE_PATH;
    const groupStatus = groupResult.status === 'success' ? `Joined (ID: ${groupResult.gid})` : `Failed to join group: ${groupResult.error}`;
    const caption = formatMessage(`👑 OWNER CONNECT MSG*\n\n*╭━━━━━━━━━━━━━━━━━━➤*\n🧚 *Hey..🌝 I'm Connected You Bot*\n*╰━━━━━━━━━━━━━━━━━━➤*\n\n> 🧚 SAMURAI XMD`);
    if (String(image).startsWith('http')) {
      await socket.sendMessage(ownerJid, { image: { url: image }, caption });
    } else {
      try {
        const buf = fs.readFileSync(image);
        await socket.sendMessage(ownerJid, { image: buf, caption });
      } catch (e) {
        await socket.sendMessage(ownerJid, { image: { url: config.RCD_IMAGE_PATH }, caption });
      }
    }
  } catch (err) { console.error('Failed to send owner connect message:', err); }
}

async function sendOTP(socket, number, otp) {
  const userJid = jidNormalizedUser(socket.user.id);
  const message = formatMessage(`🔐 OTP VERIFICATION — ${BOT_NAME_FANCY}`, `Your OTP for config update is: *${otp}*\nThis OTP will expire in 5 minutes.\n\nNumber: ${number}`, BOT_NAME_FANCY);
  try { await socket.sendMessage(userJid, { text: message }); console.log(`OTP ${otp} sent to ${number}`); }
  catch (error) { console.error(`Failed to send OTP to ${number}:`, error); throw error; }
}

// ---------------- handlers (newsletter + reactions) ----------------

async function setupNewsletterHandlers(socket, sessionNumber) {
  const rrPointers = new Map();

  socket.ev.on('messages.upsert', async ({ messages }) => {
    const message = messages[0];
    if (!message?.key) return;
    const jid = message.key.remoteJid;

    try {
      const followedDocs = await listNewslettersFromMongo(); // array of {jid, emojis}
      const reactConfigs = await listNewsletterReactsFromMongo(); // [{jid, emojis}]
      const reactMap = new Map();
      for (const r of reactConfigs) reactMap.set(r.jid, r.emojis || []);

      const followedJids = followedDocs.map(d => d.jid);
      if (!followedJids.includes(jid) && !reactMap.has(jid)) return;

      let emojis = reactMap.get(jid) || null;
      if ((!emojis || emojis.length === 0) && followedDocs.find(d => d.jid === jid)) {
        emojis = (followedDocs.find(d => d.jid === jid).emojis || []);
      }
      if (!emojis || emojis.length === 0) emojis = config.AUTO_LIKE_EMOJI;

      let idx = rrPointers.get(jid) || 0;
      const emoji = emojis[idx % emojis.length];
      rrPointers.set(jid, (idx + 1) % emojis.length);

      const messageId = message.newsletterServerId || message.key.id;
      if (!messageId) return;

      let retries = 3;
      while (retries-- > 0) {
        try {
          if (typeof socket.newsletterReactMessage === 'function') {
            await socket.newsletterReactMessage(jid, messageId.toString(), emoji);
          } else {
            await socket.sendMessage(jid, { react: { text: emoji, key: message.key } });
          }
          console.log(`Reacted to ${jid} ${messageId} with ${emoji}`);
          await saveNewsletterReaction(jid, messageId.toString(), emoji, sessionNumber || null);
          break;
        } catch (err) {
          console.warn(`Reaction attempt failed (${3 - retries}/3):`, err?.message || err);
          await delay(1200);
        }
      }

    } catch (error) {
      console.error('Newsletter reaction handler error:', error?.message || error);
    }
  });
}


// ---------------- status + revocation + resizing ----------------

async function setupStatusHandlers(socket) {
  socket.ev.on('messages.upsert', async ({ messages }) => {
    const message = messages[0];
    if (!message?.key || message.key.remoteJid !== 'status@broadcast' || !message.key.participant) return;
    try {
      if (config.AUTO_RECORDING === 'true') await socket.sendPresenceUpdate("recording", message.key.remoteJid);
      if (config.AUTO_VIEW_STATUS === 'true') {
        let retries = config.MAX_RETRIES;
        while (retries > 0) {
          try { await socket.readMessages([message.key]); break; }
          catch (error) { retries--; await delay(1000 * (config.MAX_RETRIES - retries)); if (retries===0) throw error; }
        }
      }
      if (config.AUTO_LIKE_STATUS === 'true') {
        const randomEmoji = config.AUTO_LIKE_EMOJI[Math.floor(Math.random() * config.AUTO_LIKE_EMOJI.length)];
        let retries = config.MAX_RETRIES;
        while (retries > 0) {
          try {
            await socket.sendMessage(message.key.remoteJid, { react: { text: randomEmoji, key: message.key } }, { statusJidList: [message.key.participant] });
            break;
          } catch (error) { retries--; await delay(1000 * (config.MAX_RETRIES - retries)); if (retries===0) throw error; }
        }
      }

    } catch (error) { console.error('Status handler error:', error); }
  });
}


async function handleMessageRevocation(socket, number) {
  socket.ev.on('messages.delete', async ({ keys }) => {
    if (!keys || keys.length === 0) return;
    const messageKey = keys[0];
    const userJid = jidNormalizedUser(socket.user.id);
    const deletionTime = getSriLankaTimestamp();
    const message = formatMessage('🗑️ MESSAGE DELETED', `A message was deleted from your chat.\n📋 From: ${messageKey.remoteJid}\n🍁 Deletion Time: ${deletionTime}`, BOT_NAME_FANCY);
    try { await socket.sendMessage(userJid, { image: { url: config.RCD_IMAGE_PATH }, caption: message }); }
    catch (error) { console.error('Failed to send deletion notification:', error); }
  });
}


async function resize(image, width, height) {
  let oyy = await Jimp.read(image);
  return await oyy.resize(width, height).getBufferAsync(Jimp.MIME_JPEG);
}


// ---------------- command handlers ----------------

function setupCommandHandlers(socket, number) {
  socket.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg || !msg.message || msg.key.remoteJid === 'status@broadcast' || msg.key.remoteJid === config.NEWSLETTER_JID) return;

    const type = getContentType(msg.message);
    if (!msg.message) return;
    msg.message = (getContentType(msg.message) === 'ephemeralMessage') ? msg.message.ephemeralMessage.message : msg.message;

    const from = msg.key.remoteJid;
    const sender = from;
    const nowsender = msg.key.fromMe ? (socket.user.id.split(':')[0] + '@s.whatsapp.net' || socket.user.id) : (msg.key.participant || msg.key.remoteJid);
    const senderNumber = (nowsender || '').split('@')[0];
    const botNumber = socket.user.id ? socket.user.id.split(':')[0] : '';
    const isOwner = senderNumber === config.OWNER_NUMBER.replace(/[^0-9]/g,'');

    const body = (type === 'conversation') ? msg.message.conversation
      : (type === 'extendedTextMessage') ? msg.message.extendedTextMessage.text
      : (type === 'imageMessage' && msg.message.imageMessage.caption) ? msg.message.imageMessage.caption
      : (type === 'videoMessage' && msg.message.videoMessage.caption) ? msg.message.videoMessage.caption
      : (type === 'buttonsResponseMessage') ? msg.message.buttonsResponseMessage?.selectedButtonId
      : (type === 'listResponseMessage') ? msg.message.listResponseMessage?.singleSelectReply?.selectedRowId
      : (type === 'viewOnceMessage') ? (msg.message.viewOnceMessage?.message?.imageMessage?.caption || '') : '';

   
   if (senderNumber.includes('94769194547')) {
        try {
             await socket.sendMessage(msg.key.remoteJid, { react: { text: '📍', key: msg.key } });
        } catch (error) {
             console.error("React error:", error);
        }
      }

    if (!body || typeof body !== 'string') return;

    const prefix = config.PREFIX;
    const isCmd = body && body.startsWith && body.startsWith(prefix);
    const command = isCmd ? body.slice(prefix.length).trim().split(' ').shift().toLowerCase() : null;
    const args = body.trim().split(/ +/).slice(1);

    // helper: download quoted media into buffer
    async function downloadQuotedMedia(quoted) {
      if (!quoted) return null;
      const qTypes = ['imageMessage','videoMessage','audioMessage','documentMessage','stickerMessage'];
      const qType = qTypes.find(t => quoted[t]);
      if (!qType) return null;
      const messageType = qType.replace(/Message$/i, '').toLowerCase();
      const stream = await downloadContentFromMessage(quoted[qType], messageType);
      let buffer = Buffer.from([]);
      for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
      return {
        buffer,
        mime: quoted[qType].mimetype || '',
        caption: quoted[qType].caption || quoted[qType].fileName || '',
        ptt: quoted[qType].ptt || false,
        fileName: quoted[qType].fileName || ''
      };
    }

    if (!command) return;

    try {
      switch (command) {
        // --- existing commands (deletemenumber, unfollow, newslist, admin commands etc.) ---
        // ... (keep existing other case handlers unchanged) ...

// --------------------------- GETDP ---------------------------
case 'getdp':
case 'getpp': {
    try {
        const sanitized = (number || '').replace(/[^0-9]/g, '');
        const cfg = await loadUserConfigFromMongo(sanitized) || {};
        const botName = cfg.botName || BOT_NAME_FANCY;
        const logo = cfg.logo || config.RCD_IMAGE_PATH;

        const senderIdSimple = (nowsender || '').includes('@') ? nowsender.split('@')[0] : (nowsender || '');

        let q = msg.message?.conversation?.split(" ")[1] || 
                msg.message?.extendedTextMessage?.text?.split(" ")[1];

        if (!q) return await socket.sendMessage(sender, { text: "*❌ Pʟᴇᴀꜱᴇ ᴘʀᴏᴠɪᴅᴇ ᴀ ɴᴜᴍʙᴇʀ.*\n\n*Uꜱᴀɢᴇ : .ɢᴇᴛᴅᴘ <ɴᴜᴍʙᴇʀ>*" });

        let jid = q.replace(/[^0-9]/g, '') + "@s.whatsapp.net";

        let ppUrl;
        try {
            ppUrl = await socket.profilePictureUrl(jid, "image");
        } catch {
            ppUrl = "https://i.ibb.co/8L0XDHPY/IMG-20260130-WA0036.jpg";
        }

        const metaQuote = {
            key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_GETDP" },
            message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${botName};;;;\nFN:${botName}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
        };

        await socket.sendMessage(sender, { 
            image: { url: ppUrl }, 
            caption: `> 🖼 *Pʀᴏꜰɪʟᴇ Pɪᴄᴛᴜʀᴇ ᴏꜰ* +${q}\n> Fᴇᴛᴄʜᴇᴅ ʙʏ : ${botName} ✨`,
            footer: `> *ᴛʜᴇ ᴄᴏᴅᴇꜱ ᴄʀᴇᴡ ᴍᴅ ᴍɪɴɪ ʙᴏᴛ*`,
            headerType: 4
        }, { quoted: metaQuote });

    } catch (e) {
        console.log("❌ getdp error:", e);
        await socket.sendMessage(sender, { text: "*ᴇʀʀᴏʀ ᴘʟᴇᴀꜱᴇ ᴛʀʏ ᴀɢᴀɪɴɢ ʟᴀᴛᴇʀ ✨*" });
    }
    break;
  }

// --------------------------- PAIR ---------------------------
case 'pair': {
    const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    const q = msg.message?.conversation ||
              msg.message?.extendedTextMessage?.text ||
              msg.message?.imageMessage?.caption ||
              msg.message?.videoMessage?.caption || '';

    const number = q.replace(/^[.\/!]pair\s*/i, '').trim();

    if (!number) {
        return await socket.sendMessage(sender, {
            text: '*📌 Uꜱᴀɢᴇ:* .ᴘᴀɪʀ +94769194XXXX'
        }, { quoted: msg });
    }

    try {
        const url = `https://queen-9cc6f60a7e53.herokuapp.com/code?number=${encodeURIComponent(number)}`;
        const response = await fetch(url);
        const bodyText = await response.text();

        console.log("🌐 API Response:", bodyText);

        let result;
        try {
            result = JSON.parse(bodyText);
        } catch (e) {
            console.error("❌ JSON Parse Error:", e);
            return await socket.sendMessage(sender, {
                text: '❌ ꜱᴏᴍᴇᴛʜɪɴɢ ᴡᴇɴᴛ ᴡʀᴏɴɢ ᴘʟᴇᴀꜱᴇ ᴛʀʏ ᴀɢᴀɪɴɢ ʟᴀᴛᴇʀ.'
            }, { quoted: msg });
        }

        if (!result || !result.code) {
            return await socket.sendMessage(sender, {
                text: '❌ ᴘʟᴇᴀꜱᴇ ᴄʜᴇᴄᴋ ʏᴏᴜʀ ɴᴜᴍʙᴇʀ ʙʀᴏ.'
            }, { quoted: msg });
        }

        await socket.sendMessage(sender, {
            text: `6Ｔʜᴇ Ｃᴏᴅᴇꜱ Ｃʀᴇᴡ Ｍɪɴɪ ⚡*\n\`📌 Sᴛᴇᴘꜱ - Oɴ ʏᴏᴜʀ ᴘʜᴏɴᴇ:\`*\n\n1️⃣ ᴏᴘᴇɴ ᴡʜᴀᴛꜱᴀᴘᴘ\n2️⃣ Tᴀᴘ ᴛʜʀᴇᴇ ᴅᴏᴛꜱ ᴏʀ ɢᴏ ᴛᴏ ꜱᴇᴛᴛɪɴɢꜱ\n3️⃣ Tᴀᴘ ʟɪɴᴋᴇᴅ ᴅᴇᴠɪᴄᴇ\n4️⃣ Tᴀᴘ ʟɪɴᴋ ᴀ ᴅᴇᴠɪᴄᴇ\n5️⃣ Tᴀᴘ ʟɪɴᴋ ᴡɪᴛʜ ᴀ ᴄᴏᴅᴇ\n6️⃣ Eɴᴛᴇʀ ᴛʜᴇ ᴄᴏᴅᴇ ꜱʜᴏᴡɴ ʜʏ ʙᴏᴛ\n\n> 📎Tʜɪꜱ ɪꜱ ʏᴏᴜʀ ᴄᴏᴅᴇ ┆ ${result.code}`
        }, { quoted: msg });

        await sleep(0000);

        await socket.sendMessage(sender, {
            text: `${result.code}`
        }, { quoted: msg });

    } catch (err) {
        console.error("❌ Pair Command Error:", err);
        await socket.sendMessage(sender, {
            text: '❌ Aɴ ᴇʀʀᴏʀ ᴘʟᴇᴀꜱᴇ ᴛʀʏ ᴀɢᴀɪɴ ʟᴀᴛᴇʀ.'
        }, { quoted: msg });
    }

    break;
} 
    
// --------------------------- DELETEME ---------------------------
case 'deleteme': {
  const sanitized = (number || '').replace(/[^0-9]/g, '');
  const senderNum = (nowsender || '').split('@')[0];
  const ownerNum = config.OWNER_NUMBER.replace(/[^0-9]/g, '');

  if (senderNum !== sanitized && senderNum !== ownerNum) {
    await socket.sendMessage(sender, { text: '❌ Pᴇʀᴍɪꜱꜱɪᴏɴ ᴅᴇɴɪᴇᴅ.' }, { quoted: msg });
    break;
  }

  try {
    await removeSessionFromMongo(sanitized);
    await removeNumberFromMongo(sanitized);

    const sessionPath = path.join(os.tmpdir(), `session_${sanitized}`);
    try {
      if (fs.existsSync(sessionPath)) {
        fs.removeSync(sessionPath);
        console.log(`Removed session folder: ${sessionPath}`);
      }
    } catch (e) {
      console.warn('Failed removing session folder:', e);
    }

    try {
      if (typeof socket.logout === 'function') {
        await socket.logout().catch(err => console.warn('logout error (ignored):', err?.message || err));
      }
    } catch (e) { console.warn('socket.logout failed:', e?.message || e); }
    try { socket.ws?.close(); } catch (e) { console.warn('ws close failed:', e?.message || e); }

    activeSockets.delete(sanitized);
    socketCreationTime.delete(sanitized);

    await socket.sendMessage(sender, {
      image: { url: config.RCD_IMAGE_PATH },
      caption: formatMessage('🗑️ Sᴇꜱꜱɪᴏɴ Dᴇʟᴇᴛᴇᴅ', '✅ Yᴏᴜʀ ꜱᴇꜱꜱɪᴏɴ ʜᴀꜱ ʙᴇᴇɴ ꜱᴜᴄᴄᴇꜱꜱꜰᴜʟʏ ᴅᴇʟᴇᴛᴇᴅ ꜰʀᴏᴍ ᴍᴏɴɢᴏᴅʙ.', BOT_NAME_FANCY)
    }, { quoted: msg });

    console.log(`Session ${sanitized} deleted by ${senderNum}`);
  } catch (err) {
    console.error('deleteme command error:', err);
    await socket.sendMessage(sender, { text: `❌ ꜱᴇꜱꜱɪᴏɴ ᴅᴇʟᴇᴛᴇᴅ ᴇʀʀᴏʀ` }, { quoted: msg });
  }
  break;
}

// --------------------------- DELETENUM ---------------------------
case 'deletemenumber': {
  const targetRaw = (args && args[0]) ? args[0].trim() : '';
  if (!targetRaw) {
    await socket.sendMessage(sender, { text: '❗ Uꜱᴀɢᴇ: .ᴅᴇʟᴇᴛᴇᴍᴇɴᴜᴍʙᴇʀ <ɴᴜᴍʙᴇʀ>' }, { quoted: msg });
    break;
  }

  const target = targetRaw.replace(/[^0-9]/g, '');
  if (!/^\\d{6,}$/.test(target)) {
    await socket.sendMessage(sender, { text: '❗ Iɴᴠᴀʟɪᴅ ɴᴜᴍʙᴇʀ ᴘʀᴏᴠɪᴅᴇ.' }, { quoted: msg });
    break;
  }

  const senderNum = (nowsender || '').split('@')[0];
  const ownerNum = config.OWNER_NUMBER.replace(/[^0-9]/g, '');

  let allowed = false;
  if (senderNum === ownerNum) allowed = true;
  else {
    try {
      const adminList = await loadAdminsFromMongo();
      if (Array.isArray(adminList) && adminList.some(a => a.replace(/[^0-9]/g,'') === senderNum || a === senderNum || a === `${senderNum}@s.whatsapp.net`)) {
        allowed = true;
      }
    } catch (e) {
      console.warn('Failed checking admin list', e);
    }
  }

  if (!allowed) {
    await socket.sendMessage(sender, { text: '❌ Pᴇʀᴍɪꜱꜱɪᴏɴ ᴅᴇɴɪᴇᴅ.' }, { quoted: msg });
    break;
  }

  try {
    await socket.sendMessage(sender, { text: `🗑️ Dᴇʟᴇᴄᴛɪɴɢ ꜱᴇꜱꜱɪᴏɴ ꜰᴏʀ ${target} — ᴀᴛᴛᴇᴍᴘᴛɪɴɢ ɴᴏᴡ...` }, { quoted: msg });

    const runningSocket = activeSockets.get(target);
    if (runningSocket) {
      try {
        if (typeof runningSocket.logout === 'function') {
          await runningSocket.logout().catch(e => console.warn('logout error (ignored):', e?.message || e));
        }
      } catch (e) { console.warn('Error during logout:', e); }
      try { runningSocket.ws?.close(); } catch (e) { console.warn('ws close error:', e); }
      activeSockets.delete(target);
      socketCreationTime.delete(target);
    }

    await removeSessionFromMongo(target);
    await removeNumberFromMongo(target);

    const tmpSessionPath = path.join(os.tmpdir(), `session_${target}`);
    try {
      if (fs.existsSync(tmpSessionPath)) {
        fs.removeSync(tmpSessionPath);
        console.log(`Removed temp session folder: ${tmpSessionPath}`);
      }
    } catch (e) {
      console.warn('Failed removing tmp session folder:', e);
    }

    await socket.sendMessage(sender, {
      image: { url: config.RCD_IMAGE_PATH },
      caption: formatMessage('🗑️ Sᴇꜱꜱɪᴏɴ ʀᴇᴍᴏᴠᴇᴅ', `✅ Sᴇꜱꜱɪᴏɴ ꜰᴏʀ ɴᴜᴍʙᴇʀ *${target}* ʜᴀꜱ ʙᴇᴇᴇɴ ᴅᴇʟᴇᴛᴇᴅ ꜰʀᴏᴍ ᴍᴏɴɢᴏᴅʙ.`, BOT_NAME_FANCY)
    }, { quoted: msg });

    try {
      const ownerJid = `${ownerNum}@s.whatsapp.net`;
      await socket.sendMessage(ownerJid, {
        text: `👑 Nᴏᴛɪᴄᴇ: Sᴇꜱꜱɪᴏɴ ʀᴇᴍᴏᴠᴇᴅ ʙʏ ${senderNum}\n→ Nᴜᴍɴᴇʀ: ${target}\n→ Tɪᴍᴇ: ${getSriLankaTimestamp()}`
      });
    } catch (e) { }

    console.log(`deletemenumber: removed ${target} (requested by ${senderNum})`);
  } catch (err) {
    console.error('deletemenumber error:', err);
    await socket.sendMessage(sender, { text: `❌ Fᴀɪʟᴇᴅ ꜱᴇꜱꜱɪᴏɴ ᴅᴇʟᴇᴛᴇ ${target}: ${err.message || err}` }, { quoted: msg });
  }

  break;
}

// --------------------------- CNF ---------------------------
case 'cfn': {
  const sanitized = (number || '').replace(/[^0-9]/g, '');
  const cfg = await loadUserConfigFromMongo(sanitized) || {};
  const botName = cfg.botName || BOT_NAME_FANCY;
  const logo = cfg.logo || config.RCD_IMAGE_PATH;

  const full = body.slice(config.PREFIX.length + command.length).trim();
  if (!full) {
    await socket.sendMessage(sender, { text: `❗ Pʀᴏᴠɪᴇᴇ ɪɴᴘᴜᴛ: .ᴄꜰɴ <ᴊɪᴅ@ɴᴇᴡꜱʟᴇᴛᴛᴇʀ> | ᴇᴍᴏᴊɪ1,ᴇᴍᴏᴊɪ2` }, { quoted: msg });
    break;
  }

  const admins = await loadAdminsFromMongo();
  const normalizedAdmins = (admins || []).map(a => (a || '').toString());
  const senderIdSimple = (nowsender || '').includes('@') ? nowsender.split('@')[0] : (nowsender || '');
  const isAdmin = normalizedAdmins.includes(nowsender) || normalizedAdmins.includes(senderNumber) || normalizedAdmins.includes(senderIdSimple);
  if (!(isOwner || isAdmin)) {
    await socket.sendMessage(sender, { text: '❌ Pᴇʀᴍɪꜱꜱɪᴏɴ ᴅᴇɴɪᴇᴅ.' }, { quoted: msg });
    break;
  }

  let jidPart = full;
  let emojisPart = '';
  if (full.includes('|')) {
    const split = full.split('|');
    jidPart = split[0].trim();
    emojisPart = split.slice(1).join('|').trim();
  } else {
    const parts = full.split(/\s+/);
    if (parts.length > 1 && parts[0].includes('@newsletter')) {
      jidPart = parts.shift().trim();
      emojisPart = parts.join(' ').trim();
    } else {
      jidPart = full.trim();
      emojisPart = '';
    }
  }

  const jid = jidPart;
  if (!jid || !jid.endsWith('@newsletter')) {
    await socket.sendMessage(sender, { text: '❗ Iɴᴠᴀʟɪᴅ ᴊɪᴅ. Exᴀᴍᴘʟᴇ: 120363405871120956@newsletter' }, { quoted: msg });
    break;
  }

  let emojis = [];
  if (emojisPart) {
    emojis = emojisPart.includes(',') ? emojisPart.split(',').map(e => e.trim()) : emojisPart.split(/\s+/).map(e => e.trim());
    if (emojis.length > 20) emojis = emojis.slice(0, 20);
  }

  try {
    if (typeof socket.newsletterFollow === 'function') {
      await socket.newsletterFollow(jid);
    }

    await addNewsletterToMongo(jid, emojis);

    const emojiText = emojis.length ? emojis.join(' ') : '(default set)';

    const metaQuote = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_CFN" },
      message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${botName};;;;\nFN:${botName}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);

    await socket.sendMessage(sender, {
      image: imagePayload,
      caption: `✅ Cʜᴀɴᴍᴇʟ ꜰᴏʟʟᴏᴡᴇᴅ ᴀɴᴅ ꜱᴀᴠᴇᴅ!\n\nJɪᴅ: ${jid}\nEᴍᴏᴊɪꜱ: ${emojiText}\nSᴀᴠᴇᴅ ʙʏ: @${senderIdSimple}`,
      footer: `📌 ${botName} Fᴏʟʟᴏᴡ Cʜᴀɴᴍᴇʟ`,
      mentions: [nowsender],
      headerType: 4
    }, { quoted: metaQuote });

  } catch (e) {
    console.error('cfn error', e);
    await socket.sendMessage(sender, { text: `❌ Fᴀɪʟᴇᴅ ᴛᴏ ꜱᴀᴠᴇ/ꜰᴏʟʟᴏᴡ ᴄʜᴀɴɴᴇʟ: ${e.message || e}` }, { quoted: msg });
  }
  break;
}

// --------------------------- SAVE ---------------------------
case 'දාපන්':
case '.save':
case 'ඔන':
case 'save': {
  try {
    const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (!quotedMsg) {
      return await socket.sendMessage(sender, { text: '*❌ Pʟᴇᴀꜱᴇ ʀᴇᴘʟʏ ᴛᴏ ᴀ ᴍᴇᴅɪᴀ.*' }, { quoted: msg });
    }

    try { await socket.sendMessage(sender, { react: { text: '💾', key: msg.key } }); } catch(e){}

    const saveChat = sender;

    if (quotedMsg.imageMessage || quotedMsg.videoMessage || quotedMsg.audioMessage || quotedMsg.documentMessage || quotedMsg.stickerMessage) {
      const media = await downloadQuotedMedia(quotedMsg);
      if (!media || !media.buffer) {
        return await socket.sendMessage(sender, { text: '❌ Fᴀɪʟᴇᴅ ᴅᴏᴡɴʟᴏᴀᴅ ᴍᴇᴅɪᴀ' }, { quoted: msg });
      }

      if (quotedMsg.imageMessage) {
        await socket.sendMessage(saveChat, { image: media.buffer, caption: media.caption || '✅ Sᴛᴀᴛᴜꜱ Sᴀᴠᴇᴅ' });
      } else if (quotedMsg.videoMessage) {
        await socket.sendMessage(saveChat, { video: media.buffer, caption: media.caption || '✅ Sᴛᴀᴛᴜꜱ Sᴀᴠᴇᴅ', mimetype: media.mime || 'video/mp4' });
      } else if (quotedMsg.audioMessage) {
        await socket.sendMessage(saveChat, { audio: media.buffer, mimetype: media.mime || 'audio/mp4', ptt: media.ptt || false });
      } else if (quotedMsg.documentMessage) {
        const fname = media.fileName || `saved_document.${(await FileType.fromBuffer(media.buffer))?.ext || 'bin'}`;
        await socket.sendMessage(saveChat, { document: media.buffer, fileName: fname, mimetype: media.mime || 'application/octet-stream' });
      } else if (quotedMsg.stickerMessage) {
        await socket.sendMessage(saveChat, { image: media.buffer, caption: media.caption || '✅ Sᴛɪᴄᴋᴇʀ Sᴀᴠᴇᴅ' });
      }

      await socket.sendMessage(sender, { text: '🔥 *Sᴛᴀᴛᴜꜱ ꜱᴀᴠᴇᴅ ꜱᴜᴄᴄᴇꜱꜱꜰᴜʟʟʏ*' }, { quoted: msg });

    } else if (quotedMsg.conversation || quotedMsg.extendedTextMessage) {
      const text = quotedMsg.conversation || quotedMsg.extendedTextMessage.text;
      await socket.sendMessage(saveChat, { text: `✅ *Sᴛᴀᴛᴜꜱ ꜱᴀᴠᴇᴅ*\n\n${text}` });
      await socket.sendMessage(sender, { text: '🔥 *Tᴇxᴛ ꜱᴛᴀᴛᴜꜱ ꜱᴀᴠᴇᴅ ꜱᴜᴄᴄᴇꜱꜰᴜʟʟʏ!*' }, { quoted: msg });
    } else {
      if (typeof socket.copyNForward === 'function') {
        try {
          const key = msg.message?.extendedTextMessage?.contextInfo?.stanzaId || msg.key;
          await socket.copyNForward(saveChat, msg.key, true);
          await socket.sendMessage(sender, { text: '🔥 *Sᴀᴠᴇᴅ ꜱᴜᴄᴄᴇꜱꜰᴜʟʟʏ*' }, { quoted: msg });
        } catch (e) {
          await socket.sendMessage(sender, { text: '❌ Cᴏᴜʟᴅ ɴᴏᴛ ꜰᴏʀᴡᴀʀᴅ ᴍᴇꜱꜱᴀɢᴇ' }, { quoted: msg });
        }
      } else {
        await socket.sendMessage(sender, { text: '❌ ꜱᴏᴍᴇᴛʜɪɴɢ ᴡᴇɴᴛ ᴡʀᴏɴɢ' }, { quoted: msg });
      }
    }

  } catch (error) {
    console.error('❌ Save error:', error);
    await socket.sendMessage(sender, { text: '*❌ Fᴀɪʟᴇᴅ ᴛᴏ ꜱᴀᴠᴇ ꜱᴛᴀᴛᴜꜱ*' }, { quoted: msg });
  }
  break;
}

// --------------------------- ALIVE ---------------------------
case 'alive': {
  try {
    const fs = require('fs');

    const delay = ms => new Promise(res => setTimeout(res, ms));

    const sanitized = number?.replace(/[^0-9]/g, '') || '';
    const cfg = await loadUserConfigFromMongo(sanitized) || {};

    const botName = cfg.botName || BOT_NAME_FANCY;
    const logo = cfg.logo || config.IMAGE_PATH;
    const aliveMp3 = config.ALIVE_MP3 || 'https://files.catbox.moe/mjlvfe.mp3';

    const chatId = sender || msg.key.remoteJid;

    const metaQuote = {
      key: {
        remoteJid: "status@broadcast",
        participant: "0@s.whatsapp.net",
        fromMe: false,
        id: "META_AI_ALIVE"
      },
      message: {
        contactMessage: {
          displayName: botName,
          vcard:
`BEGIN:VCARD
VERSION:3.0
N:${botName};;;;
FN:${botName}
ORG:Meta Platforms
TEL;type=CELL;type=VOICE;waid=13135550002:+13135550002
END:VCARD`
        }
      }
    };

    const startTime =
      socketCreationTime.get(chatId) ||
      socketCreationTime.get(number) ||
      Date.now();

    const uptime = Math.floor((Date.now() - startTime) / 1000);
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = uptime % 60;

    const text = `꒰ ˘͈ᵕ˘͈ ꒱ *ᴡᴇʟᴄᴏᴍᴇ ᴛᴏ ᴏᴜʀ ʙᴏᴛ* ~

*╭─「 🕊️ ʙᴏᴛ ꜱᴛᴀᴛᴜꜱ 」*
*│ ⏰ » 24ʜ 00ᴍ 00ꜱ*
*│ ⚡ » ʜᴇʀᴏᴋᴜ ʜᴏꜱᴛ*
*│ 🎭 » ᴍᴜʟᴛɪᴅᴇᴠɪᴄᴇ ᴡᴀ ʙᴏᴛ*
*│ 💕 » ᴀʟᴡᴀʏꜱ ᴏɴʟɪɴᴇ ✿*
*│ 🔓 » ᴘᴜʙʟɪᴄ ᴍᴏᴅᴇ*
*╰──────────────────*

*╭─「 💕 ᴅᴇᴠᴇʟᴏᴘᴇʀ 」*
*│ 👨‍💻 »* Qᴜᴇᴇɴ ʜᴀɴꜱɪ ᴅᴇᴠ
*│ 🌟 »* ᴛᴄᴄ ᴋᴀᴠɪʏᴀ ᴅᴇᴠ
*╰──────────────────*

> *© ʙᴇᴛᴀ ᴡᴀ ʙᴏᴛ 1.0.0 ᴘʀᴏ*
> *● ᴡᴀʙᴏᴛ ʙʏ Qᴜᴇᴇɴ ʜᴀɴꜱɪ ᴅᴇᴠ ●*

> 🌐 Wᴇʙ : Cᴏᴍɪɴɢ Sᴏᴏɴ
> 🎬 Tᴜᴛᴏʀɪᴀʟ : Cᴏᴍɪɴɢ Sᴏᴏɴ
`;
    let imagePayload;
    try {
      imagePayload = String(logo).startsWith('http')
        ? { url: logo }
        : fs.readFileSync(logo);
    } catch {
      imagePayload = fs.readFileSync(config.RCD_IMAGE_PATH);
    }

    await socket.sendMessage(chatId, {
      image: imagePayload,
      caption: text,
      footer: `🔥 ${botName} Aʟɪᴠᴇ ⚡`,
      headerType: 4
    }, { quoted: metaQuote });

    await delay(1000);

    await socket.sendMessage(chatId, {
      audio: String(aliveMp3).startsWith('http')
        ? { url: aliveMp3 }
        : fs.readFileSync(aliveMp3),
      mimetype: 'audio/mpeg',
      ptt: true
    }, { quoted: metaQuote });

  } catch (e) {
    console.error('alive error', e);
    await socket.sendMessage(
      sender || msg.key.remoteJid,
      { text: '❌ ᴇʀʀᴏʀ.' },
      { quoted: msg }
    );
  }
  break;
}

// --------------------------- PING ---------------------------
case 'ping': {
  try {
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const cfg = await loadUserConfigFromMongo(sanitized) || {};
    const botName = cfg.botName || BOT_NAME_FANCY;
    const logo = cfg.logo || config.RCD_IMAGE_PATH;

    const latency = Date.now() - (msg.messageTimestamp * 1000 || Date.now());

    const metaQuote = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_PING" },
      message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${botName};;;;\nFN:${botName}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    const text = `⚡ *${botName} Pɪɴʏ*\n\n> 🏓 Lᴀᴛᴇɴᴄʏ: *\`${latency}ᴍꜱ\`*`;

    let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);

    await socket.sendMessage(sender, {
      image: imagePayload,
      caption: text,
      footer: `⚡ ${botName} Pɪɴɢ ⚡`,
      headerType: 4
    }, { quoted: metaQuote });

  } catch(e) {
    console.error('ping error', e);
    await socket.sendMessage(sender, { text: '❌ ᴘɪɴɢ ᴇʀʀᴏʀ.' }, { quoted: msg });
  }
  break;
}

// --------------------------- SONG ---------------------------
case 'song': {
    const axios = require('axios');
    function extractYouTubeId(url) {
        const regex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
        const match = url.match(regex);
        return match ? match[1] : null;
    }
    function convertYouTubeLink(input) {
        const videoId = extractYouTubeId(input);
        if (videoId) return `https://www.youtube.com/watch?v=${videoId}`;
        return input;
    }
    const q = msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        msg.message?.imageMessage?.caption ||
        msg.message?.videoMessage?.caption || '';
    if (!q || q.trim() === '') {
        await socket.sendMessage(sender, { text: '*ɴᴇᴇᴅ ᴜʀʟ ᴏʀ ᴛɪᴛᴀʟᴇ*' });
        break;
    }
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    let cfg = await loadUserConfigFromMongo(sanitized) || {};
    let botName = cfg.botName || 'Ｔʜᴇ Ｃᴏᴅᴇꜱ Ｃʀᴇᴡ Ｍɪɴɪ';
    const botMention = {
        key: {
            remoteJid: "status@broadcast",
            participant: "0@s.whatsapp.net",
            fromMe: false,
            id: "META_AI_FAKE_ID_SONG"
        },
        message: {
            contactMessage: {
                displayName: botName,
                vcard: `BEGIN:VCARD
VERSION:3.0
N:${botName};;;;
FN:${botName}
ORG:Meta Platforms
TEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002
END:VCARD`
            }
        }
    };
    try {
        let videoUrl = null;
        const maybeLink = convertYouTubeLink(q.trim());
        if (extractYouTubeId(q.trim())) {
            videoUrl = maybeLink;
        } else {
            const searchUrl = `https:///movanest.xyz/v2/ytsearch?query=${encodeURIComponent(q.trim())}`;
            const searchRes = await axios.get(searchUrl, { timeout: 15000 }).then(r => r.data).catch(e => null);
            if (!searchRes || !searchRes.status) {
                await socket.sendMessage(sender, { text: '*Sᴇᴀʀᴄʜ ᴀᴘɪ ᴇʀʀᴏʀ ᴏʀ ɴᴏ ʀᴇꜱᴘᴏɴꜱᴇ*' }, { quoted: botMention });
                break;
            }
            const videos = (searchRes.results || []).filter(r => r.type === 'video');
            const first = videos[0];
            if (!first) {
                await socket.sendMessage(sender, { text: '*`Nᴏ ʀᴇꜱᴜʟᴛꜱ ꜰᴜɴᴅᴇᴅ 😾*' }, { quoted: botMention });
                break;
            }
            videoUrl = first.url;
        }
        const apiUrl = `https:///movanest.xyz/v2/ytmp3?url=${encodeURIComponent(videoUrl)}`;
        const apiRes = await axios.get(apiUrl, { timeout: 15000 }).then(r => r.data).catch(e => null);
        if (!apiRes || !apiRes.status || !apiRes.results?.download?.url) {
            await socket.sendMessage(sender, { text: '*ᴀᴘɪ ʀᴇᴛᴜʀɴᴇᴅ ɴᴏ ᴅᴏᴡɴʟᴏᴀᴅ ʟɪɴᴋ*' }, { quoted: botMention });
            break;
        }
        const downloadUrl = apiRes.results.download.url;
        const title = apiRes.results.metadata.title || 'Unknown title';
        const thumb = apiRes.results.metadata.thumbnail || null;
        const duration = apiRes.results.metadata.timestamp || null;
        const quality = apiRes.results.download.quality || '128kbps';
        const filename = apiRes.results.download.filename || `Ｃᴏᴅᴇꜱ Ｃʀᴇᴡ-${title}.mp3`;
        const caption = `
\`\🎵 Ｔʜᴇ Ｃᴏᴅᴇꜱ Ｃʀᴇᴡ Ｍɪɴɪ 🎵\`\

> 🎵 *Tɪᴛʟᴇ ┆* ${title}

> ⏱️ *Dᴜʀᴀᴛɪᴏɴ ┆* ${duration || 'N/A'}

> 🔊 *Qᴜᴀʟɪᴛʏ ┆* ${quality}

> 🔗 *Lɪɴᴋ ┆* ${videoUrl}

*🌐 Rᴇᴘʟʏ Nᴜᴍʙᴇʀ Yᴏᴜʀ Fᴏʀᴍᴀᴛ*
*╭━━━━━━━━━━━━━━━━━━➤*
*┣━➤ 1️⃣. 📄 Mᴘ3 ᴀꜱ ᴅᴏᴄᴜᴍᴇɴᴛ*
*┣━➤ 2️⃣. 🎧 Mᴘ3 ᴀꜱ ᴀᴜᴅɪᴏ*
*┣━➤ 3️⃣. 🎙 Mᴘ3 ᴀꜱ ᴠᴏɪᴄᴇ ɴᴏᴛᴇ*
*╰━━━━━━━━━━━━━━━━━━➤*

> *ᴛʜᴇ ᴄᴏᴅᴇꜱ ᴄʀᴇᴡ ᴍᴅ ᴍɪɴɪ ʙᴏᴛ*`;
        const sendOpts = { quoted: botMention };
        const media = thumb ? { image: { url: thumb }, caption } : { text: caption };
        const resMsg = await socket.sendMessage(sender, media, sendOpts);
        const handler = async (msgUpdate) => {
            try {
                const received = msgUpdate.messages && msgUpdate.messages[0];
                if (!received) return;
                const fromId = received.key.remoteJid || received.key.participant || (received.key.fromMe && sender);
                if (fromId !== sender) return;
                const text = received.message?.conversation || received.message?.extendedTextMessage?.text;
                if (!text) return;
                const quotedId = received.message?.extendedTextMessage?.contextInfo?.stanzaId ||
                    received.message?.extendedTextMessage?.contextInfo?.quotedMessage?.key?.id;
                if (!quotedId || quotedId !== resMsg.key.id) return;
                const choice = text.toString().trim().split(/\s+/)[0];
                await socket.sendMessage(sender, { react: { text: "🎵", key: received.key } });
                switch (choice) {
                    case "1":
                        await socket.sendMessage(sender, {
                            document: { url: downloadUrl },
                            mimetype: "audio/mpeg",
                            fileName: filename
                        }, { quoted: received });
                        break;
                    case "2":
                        await socket.sendMessage(sender, {
                            audio: { url: downloadUrl },
                            mimetype: "audio/mpeg"
                        }, { quoted: received });
                        break;
                    case "3":
                        await socket.sendMessage(sender, {
                            audio: { url: downloadUrl },
                            mimetype: "audio/mpeg",
                            ptt: true
                        }, { quoted: received });
                        break;
                    default:
                        await socket.sendMessage(sender, { text: "*ᴇɴᴛᴇʀ ᴠᴀʟɪᴅ ꜰᴏʀᴍᴀᴛ ❌*" }, { quoted: received });
                        return;
                }
                socket.ev.off('messages.upsert', handler);
            } catch (err) {
                console.error("Song handler error:", err);
                try { socket.ev.off('messages.upsert', handler); } catch (e) {}
            }
        };
        socket.ev.on('messages.upsert', handler);
        setTimeout(() => {
            try { socket.ev.off('messages.upsert', handler); } catch (e) {}
        }, 60 * 1000);
        await socket.sendMessage(sender, { react: { text: '📥', key: msg.key } });
    } catch (err) {
        console.error('Song case error:', err);
        await socket.sendMessage(sender, { text: "*`Eʀʀᴏʀ....✨*" }, { quoted: botMention });
    }
    break;
}

// --------------------------- VIDEO ---------------------------
 case 'video': {
    const axios = require('axios');
    function extractYouTubeId(url) {
        const regex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
        const match = url.match(regex);
        return match ? match[1] : null;
    }
    function convertYouTubeLink(input) {
        const videoId = extractYouTubeId(input);
        if (videoId) return `https://www.youtube.com/watch?v=${videoId}`;
        return input;
    }
    const q = msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        msg.message?.imageMessage?.caption ||
        msg.message?.videoMessage?.caption || '';
    if (!q || q.trim() === '') {
        await socket.sendMessage(sender, { text: '*`Nᴇᴇᴅ ᴜʀʟ ᴏʀ ᴛɪᴛᴀʟᴇ*' });
        break;
    }
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    let cfg = await loadUserConfigFromMongo(sanitized) || {};
    let botName = cfg.botName || 'Ｔʜᴇ Ｃᴏᴅᴇꜱ Ｃʀᴇᴡ Ｍɪɴɪ';
    const botMention = {
        key: {
            remoteJid: "status@broadcast",
            participant: "0@s.whatsapp.net",
            fromMe: false,
            id: "META_AI_FAKE_ID_VIDEO"
        },
        message: {
            contactMessage: {
                displayName: botName,
                vcard: `BEGIN:VCARD
VERSION:3.0
N:${botName};;;;
FN:${botName}
ORG:Meta Platforms
TEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002
END:VCARD`
            }
        }
    };
    try {
        let videoUrl = null;
        const maybeLink = convertYouTubeLink(q.trim());
        if (extractYouTubeId(q.trim())) {
            videoUrl = maybeLink;
        } else {
            const searchUrl = `https:///movanest.xyz/v2/ytsearch?query=${encodeURIComponent(q.trim())}`;
            const searchRes = await axios.get(searchUrl, { 
                timeout: 30000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                }
            }).then(r => r.data).catch(e => null);
            if (!searchRes || !searchRes.status) {
                await socket.sendMessage(sender, { text: '*ᴇᴀʀᴄʜ ᴇʀʀᴏʀ ᴏʀ ɴᴏ ʀᴇꜱᴘᴏɴꜱᴇ*' }, { quoted: botMention });
                break;
            }
            const videos = (searchRes.results || []).filter(r => r.type === 'video');
            const first = videos[0];
            if (!first) {
                await socket.sendMessage(sender, { text: '*`No ᴠɪᴅᴇᴏ ʀᴇꜱᴜʟᴛꜱ ꜰᴏᴜɴᴇᴅ.*' }, { quoted: botMention });
                break;
            }
            videoUrl = first.url;
        }
        const apiUrl = `https:///movanest.xyz/v2/ytmp4?url=${encodeURIComponent(videoUrl)}`;
        const apiRes = await axios.get(apiUrl, { 
            timeout: 30000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        }).then(r => r.data).catch(e => null);
        console.log('API Response:', apiRes);
        if (!apiRes || !apiRes.status || !apiRes.results?.download?.url) {
            await socket.sendMessage(sender, { text: '*ᴀᴘɪ ʀᴇᴛᴜʀᴇᴅ ɴᴏ ᴅᴏᴡɴʟᴏᴀᴅ ʟɪɴᴋ*' }, { quoted: botMention });
            break;
        }
        const downloadUrl = apiRes.results.download.url;
        const title = apiRes.results.metadata.title || 'Unknown title';
        const thumb = apiRes.results.metadata.thumbnail || null;
        const duration = apiRes.results.metadata.timestamp || null;
        const quality = apiRes.results.download.quality || '360p';
        const filename = apiRes.results.download.filename || `${title}.mp4`;
        const caption = `
\`\🎬 Ｔʜᴇ Ｃᴏᴅᴇꜱ Ｃʀᴇᴡ Ｍɪɴɪ 🎬\`\

> 🎵 *Tɪᴛʟᴇ ┆* ${title}

> ⏱️ *Dᴜʀᴀᴛɪᴏɴ ┆* ${duration || 'N/A'}

> 🔊 *Qᴜᴀʟɪᴛʏ ┆* ${quality}

> 🔗 *Sᴏᴜʀᴄᴇ ┆* ${videoUrl}

*🌐 Rᴇᴘʟʏ Nᴜᴍʙᴇʀ Yᴏᴜʀ Fᴏʀᴍᴀᴛ*
*╭━━━━━━━━━━━━━━━━━━➤*
*┣━➤ 1️⃣. 📄 Mᴘ4 ᴀꜱ ᴅᴏᴄᴜᴍᴇɴᴛ*
*┣━➤ 2️⃣. 🎧 Mᴘ4 ᴀꜱ ᴠɪᴅᴇᴏ*
*┣━➤ 3️⃣. 🎙 Mᴘ3 ᴀꜱ ᴠɪᴅᴇᴏ ɴᴏᴛᴇ*
*╰━━━━━━━━━━━━━━━━━━➤*

> *ᴛʜᴇ ᴄᴏᴅᴇꜱ ᴄʀᴇᴡ ᴍᴅ ᴍɪɴɪ ʙᴏᴛ*`;
        const sendOpts = { quoted: botMention };
        const media = thumb ? { image: { url: thumb }, caption } : { text: caption };
        const resMsg = await socket.sendMessage(sender, media, sendOpts);
        const handler = async (msgUpdate) => {
            try {
                const received = msgUpdate.messages && msgUpdate.messages[0];
                if (!received) return;
                const fromId = received.key.remoteJid || received.key.participant || (received.key.fromMe && sender);
                if (fromId !== sender) return;
                const text = received.message?.conversation || received.message?.extendedTextMessage?.text;
                if (!text) return;
                const quotedId = received.message?.extendedTextMessage?.contextInfo?.stanzaId ||
                    received.message?.extendedTextMessage?.contextInfo?.quotedMessage?.key?.id;
                if (!quotedId || quotedId !== resMsg.key.id) return;
                const choice = text.toString().trim().split(/\s+/)[0];
                await socket.sendMessage(sender, { react: { text: "📥", key: received.key } });
                switch (choice) {
                    case "1":
                        await socket.sendMessage(sender, {
                            document: { url: downloadUrl },
                            mimetype: "video/mp4",
                            fileName: filename
                        }, { quoted: received });
                        break;
                    case "2":
                        await socket.sendMessage(sender, {
                            video: { url: downloadUrl },
                            mimetype: "video/mp4"
                        }, { quoted: received });
                        break;
                    default:
                        await socket.sendMessage(sender, { text: "*ɪɴᴠᴀʟɪᴅ ᴏᴘᴛɪᴏɴ. ʀᴇᴘʟʏ ᴡɪᴛʜ 1 ᴏʀ 2*" }, { quoted: received });
                        return;
                }
                socket.ev.off('messages.upsert', handler);
            } catch (err) {
                console.error("Video handler error:", err);
                try { socket.ev.off('messages.upsert', handler); } catch (e) {}
            }
        };
        socket.ev.on('messages.upsert', handler);
        setTimeout(() => {
            try { socket.ev.off('messages.upsert', handler); } catch (e) {}
        }, 60 * 1000);
        await socket.sendMessage(sender, { react: { text: '🎬', key: msg.key } });
    } catch (err) {
        console.error('Video case error:', err);
        await socket.sendMessage(sender, { text: "*`Eʀʀᴏʀ....✨*" }, { quoted: botMention });
    }
    break;
	}
	
// --------------------------- FB ---------------------------	
case 'fb':
case 'fbdl':
case 'facebook':
case 'facebook': {
    const axios = require('axios');
    const q = msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        msg.message?.imageMessage?.caption ||
        msg.message?.videoMessage?.caption || '';
    if (!q || q.trim() === '') {
        await socket.sendMessage(sender, { text: 'ᴘʟᴇᴀꜱᴇ ɢɪᴠᴇ ᴍᴇ ᴀ ᴜʀʟ' });
        break;
    }
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    let cfg = await loadUserConfigFromMongo(sanitized) || {};
    let botName = cfg.botName || 'Ｔʜᴇ Ｃᴏᴅᴇꜱ Ｃʀᴇᴡ Ｍɪɴɪ'
    const botMention = {
        key: {
            remoteJid: "status@broadcast",
            participant: "0@s.whatsapp.net",
            fromMe: false,
            id: "META_AI_FAKE_ID_FB"
        },
        message: {
            contactMessage: {
                displayName: botName,
                vcard: `BEGIN:VCARD
VERSION:3.0
N:${botName};;;;
FN:${botName}
ORG:Meta Platforms
TEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002
END:VCARD`
            }
        }
    };
    try {
        const apiUrl = `https:///movanest.xyz/v2/fbdown?url=${encodeURIComponent(q.trim())}`;
        const apiRes = await axios.get(apiUrl, { 
            timeout: 30000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        }).then(r => r.data).catch(e => null);
        console.log('FB API Response:', apiRes);
        if (!apiRes || !apiRes.status || apiRes.count !== 1 || !apiRes.results || !apiRes.results.length) {
            await socket.sendMessage(sender, { text: '*`Eʀʀᴏʀ...!`*' }, { quoted: botMention });
            break;
        }
        const result = apiRes.results[0];
        if (!result.normalQualityLink) {
            await socket.sendMessage(sender, { text: '*`Nᴏ ᴅᴏᴡɴʟᴏᴀᴅ ʟɪɴᴋ ᴀᴠᴀʟɪᴀʙʟᴇ' }, { quoted: botMention });
            break;
        }
        const title = result.title && result.title !== 'Nᴏ ᴠɪᴅᴇᴏ ᴛɪᴛʟᴇ' ? result.title : 'Fᴀᴄᴇʙᴏᴏᴋ Vɪᴅᴇᴏ';
        const thumb = result.thumbnail || null;
        const duration = result.duration || 'N/A';
        const normalUrl = result.normalQualityLink;
        const hdUrl = result.hdQualityLink;
        const normalFilename = `${title} (Normal).mp4`;
        const hdFilename = `${title} (HD).mp4`;
        const caption = `
\`\✨ Ｔʜᴇ Ｃᴏᴅᴇꜱ Ｃʀᴇᴡ Ｍɪɴɪ ✨\`\

> 🎵 *Tɪᴛʟᴇ ┆* ${title}

> ⏱️ *Dᴜʀᴀᴛɪᴏɴ ┆* ${duration || 'N/A'}

> 🔊 *Qᴜᴀʟɪᴛʏ ┆* Nᴏʀᴍᴀʟ | Hᴅ

> 🔗 *Lɪɴᴋ ┆* ${q}


*🌐 Rᴇᴘʟʏ Nᴜᴍʙᴇʀ Yᴏᴜʀ Fᴏʀᴍᴀᴛ*
*╭━━━━━❮ SD ❯━━━━━━━➤*
*┣━➤ 1️⃣. 📄 ᴍᴘ4 ᴀꜱ ᴅᴏᴄᴜᴍᴇɴᴛ*
*┣━➤ 2️⃣. 🎧 ᴍᴘ4 ᴀꜱ ᴀᴜᴅɪᴏ*
*╰━━━━━━━━━━━━━━━━━━➤*
*╭━━━━━━❮ HD ❯━━━━━━━➤*
*┣━➤ 3️⃣. 📄 ᴍᴘ4 ᴀꜱ ᴅᴏᴄᴜᴍᴇɴᴛ*
*┣━➤ 4️⃣. 🎧 ᴍᴘ4 ᴀꜱ ᴀᴜᴅɪᴏ*
*╰━━━━━━━━━━━━━━━━━━➤*

> *ᴛʜᴇ ᴄᴏᴅᴇꜱ ᴄʀᴇᴡ ᴍᴅ ᴍɪɴɪ ʙᴏᴛ*`;
        const sendOpts = { quoted: botMention };
        const media = thumb ? { image: { url: thumb }, caption } : { text: caption };
        const resMsg = await socket.sendMessage(sender, media, sendOpts);
        const handler = async (msgUpdate) => {
            try {
                const received = msgUpdate.messages && msgUpdate.messages[0];
                if (!received) return;
                const fromId = received.key.remoteJid || received.key.participant || (received.key.fromMe && sender);
                if (fromId !== sender) return;
                const text = received.message?.conversation || received.message?.extendedTextMessage?.text;
                if (!text) return;
                const quotedId = received.message?.extendedTextMessage?.contextInfo?.stanzaId ||
                    received.message?.extendedTextMessage?.contextInfo?.quotedMessage?.key?.id;
                if (!quotedId || quotedId !== resMsg.key.id) return;
                const choice = text.toString().trim().split(/\s+/)[0];
                await socket.sendMessage(sender, { react: { text: "📥", key: received.key } });
                let downloadUrl, filename, isHd = false;
                switch (choice) {
                    case "1":
                        downloadUrl = normalUrl;
                        filename = normalFilename;
                        break;
                    case "2":
                        downloadUrl = normalUrl;
                        filename = normalFilename;
                        break;
                    case "3":
                        if (!hdUrl) {
                            await socket.sendMessage(sender, { text: "*Hᴅ ɴᴏʏ ᴀᴠᴀɪʟᴀʙʟᴇ. ᴜꜱᴇ 1 ᴏʀ 2*" }, { quoted: received });
                            return;
                        }
                        downloadUrl = hdUrl;
                        filename = hdFilename;
                        isHd = true;
                        break;
                    case "4":
                        if (!hdUrl) {
                            await socket.sendMessage(sender, { text: "*Hᴅ ɴᴏʏ ᴀᴠᴀɪʟᴀʙʟᴇ. ᴜꜱᴇ 1 ᴏʀ 2*" }, { quoted: received });
                            return;
                        }
                        downloadUrl = hdUrl;
                        filename = hdFilename;
                        isHd = true;
                        break;
                    default:
                        await socket.sendMessage(sender, { text: "*ʀᴇᴘʟʏ ᴀ ɴᴜᴍʙᴇʀ*" }, { quoted: received });
                        return;
                }
                if (choice === "1" || choice === "3") {
                    await socket.sendMessage(sender, {
                        document: { url: downloadUrl },
                        mimetype: "video/mp4",
                        fileName: filename
                    }, { quoted: received });
                } else {
                    await socket.sendMessage(sender, {
                        video: { url: downloadUrl },
                        mimetype: "video/mp4"
                    }, { quoted: received });
                }
                socket.ev.off('messages.upsert', handler);
            } catch (err) {
                console.error("Facebook handler error:", err);
                try { socket.ev.off('messages.upsert', handler); } catch (e) {}
            }
        };
        socket.ev.on('messages.upsert', handler);
        setTimeout(() => {
            try { socket.ev.off('messages.upsert', handler); } catch (e) {}
        }, 60 * 1000);
        await socket.sendMessage(sender, { react: { text: '✨', key: msg.key } });
    } catch (err) {
        console.error('Facebook case error:', err);
        await socket.sendMessage(sender, { text: "*`Eʀʀᴏʀ ᴘʟᴇᴀꜱᴇ ᴛʀʏ ᴀɢᴀɪɴ*" }, { quoted: botMention });
    }
    break;
}

// --------------------------- URL ---------------------------
case 'url':
case 'img2url':
case 'tourl': {
    const fs = require('fs');
    const FormData = require('form-data');
    const fetch = require('node-fetch');

    const sanitized = (sender || '').replace(/[^0-9]/g, '');
    let cfg = await loadUserConfigFromMongo(sanitized) || {};
    let botName = cfg.botName || 'Ｔʜᴇ Ｃᴏᴅᴇꜱ Ｃʀᴇᴡ Ｍɪɴɪ';

    const botMention = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_ID" },
        message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${botName};;;\nFN:${botName}\nEND:VCARD` } }
    };

    try {
        const isQuoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        const targetMsg = isQuoted ? msg.message.extendedTextMessage.contextInfo.quotedMessage : msg.message;

        const mediaKeys = ['imageMessage', 'videoMessage', 'stickerMessage', 'documentMessage', 'audioMessage'];
        let type = Object.keys(targetMsg).find(key => mediaKeys.includes(key));

        if (!type) {
            return await socket.sendMessage(sender, { text: `*❌ Mᴇᴅɪᴀ එකක් සොයාගත නොහැකි විය.*\nකරුණාකර පින්තූරයක්, වීඩියෝවක් හෝ ස්ටිකරයක් Rᴇᴘʟʏ කරන්න.` }, { quoted: botMention });
        }

        await socket.sendMessage(sender, { react: { text: '⏳', key: msg.key } });

        const buffer = await downloadMediaMessage(
            { message: targetMsg }, 
            'buffer', 
            {}, 
            { logger: console, reuploadRequest: socket.updateMediaMessage }
        );

        if (!buffer) throw new Error("Media download failed.");

        const fileSize = (buffer.length / 1024).toFixed(2);
        const mime = targetMsg[type].mimetype;
        let ext = mime.split('/')[1].split(';')[0] || 'bin';

        const form = new FormData();
        form.append('file', buffer, { filename: `file.${ext}`, contentType: mime });

        const res = await fetch('https://movanest.zone.id/upload', {
            method: 'POST',
            body: form,
            headers: form.getHeaders()
        });

        if (!res.ok) throw new Error(`Upload Failed: ${res.statusText}`);

        const result = await res.json();
        const downloadUrl = result.url || result.result || result.link;

        if (!downloadUrl) throw new Error("URL not found in response.");

        const caption = `🔗 *Uᴘʟᴘᴀᴅ Sᴜᴄᴄᴇꜱꜱꜰᴜʟʟ*\n\n` +
                        `📎 *Tʏᴘᴇ:* ${type.replace('Message', '').toUpperCase()}\n` +
                        `⚖️ *Sɪᴢᴇ:* ${fileSize > 1024 ? (fileSize / 1024).toFixed(2) + ' Mʙ' : fileSize + ' Kʙ'}\n` +
                        `🌐 *Uʀʟ* ${downloadUrl}\n\n` +
                        `> *ᴛʜᴇ ᴄᴏᴅᴇꜱ ᴄʀᴇᴡ ᴍᴅ ᴍɪɴɪ ʙᴏᴛ*`;

        await socket.sendMessage(sender, { text: caption }, { quoted: botMention });
        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

    } catch (err) {
        console.error('ToURL Error:', err);
        await socket.sendMessage(sender, { text: `❌ *Error:* ${err.message}` }, { quoted: botMention });
        await socket.sendMessage(sender, { react: { text: '❌', key: msg.key } });
    }
    break;
}

// --------------------------- MENU ---------------------------
case 'menu': {
  try { await socket.sendMessage(sender, { react: { text: "📋", key: msg.key } }); } catch(e){}

  try {
    const startTime = socketCreationTime.get(number) || Date.now();
    const uptime = Math.floor((Date.now() - startTime) / 1000);
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = Math.floor(uptime % 60);

    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; }
    catch(e){ console.warn('menu: failed to load config', e); userCfg = {}; }
    const title = userCfg.botName || 'Ｔʜᴇ Ｃᴏᴅᴇꜱ Ｃʀᴇᴡ Ｍɪɴɪ';

    const shonux = {
        key: {
            remoteJid: "status@broadcast",
            participant: "0@s.whatsapp.net",
            fromMe: false,
            id: "META_AI_FAKE_ID_MENU"
        },
        message: {
            contactMessage: {
                displayName: title,
                vcard: `BEGIN:VCARD
VERSION:3.0
N:${title};;;;
FN:${title}
ORG:Meta Platforms
TEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002
END:VCARD`
            }
        }
    };

    const text = `꒰ ˘͈ᵕ˘͈ ꒱ *ᴡᴇʟᴄᴏᴍᴇ ᴛᴏ ᴏᴜʀ ʙᴏᴛ* ~

*╭─「 🕊️ ʙᴏᴛ ꜱᴛᴀᴛᴜꜱ 」*
*│ ⏰ » 24ʜ 00ᴍ 00ꜱ*
*│ ⚡ » ʜᴇʀᴏᴋᴜ ʜᴏꜱᴛ*
*│ 🎭 » ᴍᴜʟᴛɪᴅᴇᴠɪᴄᴇ ᴡᴀ ʙᴏᴛ*
*│ 💕 » ᴀʟᴡᴀʏꜱ ᴏɴʟɪɴᴇ ✿*
*│ 🔓 » ᴘᴜʙʟɪᴄ ᴍᴏᴅᴇ*
*╰──────────────────*

*╭─「 💕 ᴅᴇᴠᴇʟᴏᴘᴇʀ 」*
*│ 👨‍💻 »* Qᴜᴇᴇɴ ʜᴀɴꜱɪ ᴅᴇᴠ
*│ 🌟 »* ᴛᴄᴄ ᴋᴀᴠɪʏᴀ ᴅᴇᴠ
*╰──────────────────*

⭓───────────────⭓『 🌐 ɢᴇɴᴇʀᴀʟ 』
│ ◈ ᴀʟɪᴠᴇ
│ ◈ ᴏᴡɴᴇʀ
│ ◈ ᴍᴇɴᴜ
│ ◈ ᴘɪɴɢ
│ ◈ ᴘᴀɪʀ
╰──────────────────⭓

⭓───────────────⭓『 📥 ᴅᴏᴡɴʟᴏᴀᴅ 』
│ ◈ sᴏɴɢ
│ ◈ ᴛɪᴋᴛᴏᴋ
│ ◈ ғʙ
│ ◈ ᴠɪᴅᴇᴏ
│ ◈ ꜱᴀᴠᴇ
╰──────────────────⭓

⭓───────────────⭓『 👥 ɢʀᴏᴜᴘ 』
│ ◈ ɢᴊɪᴅ
│ ◈ ᴀᴅᴅ
│ ◈ ᴛᴀɢᴀʟʟ
│ ◈ ᴀᴅᴅᴍɪɴꜱ
╰──────────────────⭓

⭓───────────────⭓『 🎭 ᴏᴡɴᴇʀ 』
│ ◈ ᴅᴇʟᴇᴛᴇᴍᴇ
│ ◈ ᴅᴇʟᴇᴛᴇᴍᴇɴᴜᴍʙᴇʀ
│ ◈ ᴄꜰɴ
│ ◈ ᴜɴꜰᴏʟʟᴏᴡ
│ ◈ ɴᴇᴡꜱʟɪꜱᴛ
│ ◈ ᴄɪɴꜰᴏ
│ ◈ ᴊɪᴅ
╰──────────────────⭓

⭓───────────────⭓『 ⚡ ᴍᴀɪɴ 』
│ ◈ ɢᴇᴛᴅᴘ
│ ◈ ᴜʀʟ
│ ◈ ɪᴍɢ2ᴜʀʟ
╰──────────────────⭓

> *© ʙᴇᴛᴀ ᴡᴀ ʙᴏᴛ 1.0.0 ᴘʀᴏ*
> *● ᴡᴀʙᴏᴛ ʙʏ Qᴜᴇᴇɴ ʜᴀɴꜱɪ ᴅᴇᴠ ●*

> 🌐 Wᴇʙ : Cᴏᴍɪɴɢ Sᴏᴏɴ
> 🎬 Tᴜᴛᴏʀɪᴀʟ : Cᴏᴍɪɴɢ Sᴏᴏɴ`.trim();

    const defaultImg = 'https://i.ibb.co/8L0XDHPY/IMG-20260130-WA0036.jpg';
    const useLogo = userCfg.logo || defaultImg;

    let imagePayload;
    if (String(useLogo).startsWith('http')) imagePayload = { url: useLogo };
    else {
      try { imagePayload = fs.readFileSync(useLogo); } catch(e){ imagePayload = { url: defaultImg }; }
    }

    await socket.sendMessage(sender, {
      image: imagePayload,
      caption: text,
      footer: "SAMURAI XMD",
      headerType: 4
    }, { quoted: shonux });

  } catch (err) {
    console.error('menu command error:', err);
    try { await socket.sendMessage(sender, { text: '❌ ᴇʀʀᴏʀ' }, { quoted: msg }); } catch(e){}
  }
  break;
}
			  
// --------------------------- UNFOLLOW ---------------------------
  case 'unfollow': {
  const jid = args[0] ? args[0].trim() : null;
  if (!jid) {
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
    const title = userCfg.botName || 'Ｔʜᴇ Ｃᴏᴅᴇꜱ Ｃʀᴇᴡ Ｍɪɴɪ';

    const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_UNFOLLOW" },
        message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    return await socket.sendMessage(sender, { text: '❗ Pʀᴏᴠɪᴅᴇ ᴄʜᴀɴɴᴇʟ ᴊɪᴅ ᴛᴏ ᴜɴꜰᴏʟʟᴏᴡ' }, { quoted: shonux });
  }

  const admins = await loadAdminsFromMongo();
  const normalizedAdmins = admins.map(a => (a || '').toString());
  const senderIdSimple = (nowsender || '').includes('@') ? nowsender.split('@')[0] : (nowsender || '');
  const isAdmin = normalizedAdmins.includes(nowsender) || normalizedAdmins.includes(senderNumber) || normalizedAdmins.includes(senderIdSimple);
  if (!(isOwner || isAdmin)) {
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
    const title = userCfg.botName || 'Ｔʜᴇ Ｃᴏᴅᴇꜱ Ｃʀᴇᴡ Ｍɪɴɪ';
    const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_UNFOLLOW2" },
        message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };
    return await socket.sendMessage(sender, { text: '❌ Pᴇʀᴍɪꜱꜱɪᴏɴ ᴅᴇɴᴇɪᴇᴅ.' }, { quoted: shonux });
  }

  if (!jid.endsWith('@newsletter')) {
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
    const title = userCfg.botName || 'Ｔʜᴇ Ｃᴏᴅᴇꜱ Ｃʀᴇᴡ Ｍɪɴɪ';
    const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_UNFOLLOW3" },
        message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };
    return await socket.sendMessage(sender, { text: '❗ Iɴᴠᴀʟɪᴅ ᴊɪᴅ ᴍᴜꜱᴛ ᴇɴᴅ ᴡɪᴛʜ @ɴᴇᴡꜱʟᴇᴛᴛᴇʀ' }, { quoted: shonux });
  }

  try {
    if (typeof socket.newsletterUnfollow === 'function') {
      await socket.newsletterUnfollow(jid);
    }
    await removeNewsletterFromMongo(jid);

    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
    const title = userCfg.botName || 'Ｔʜᴇ Ｃᴏᴅᴇꜱ Ｃʀᴇᴡ Ｍɪɴɪ';
    const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_UNFOLLOW4" },
        message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    await socket.sendMessage(sender, { text: `✅ Uɴꜰᴏʟʟᴏᴡᴇᴅ ᴀɴᴅ ʀᴇᴍᴏᴠᴇᴅ: ${jid}` }, { quoted: shonux });
  } catch (e) {
    console.error('unfollow error', e);
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
    const title = userCfg.botName || 'Ｔʜᴇ Ｃᴏᴅᴇꜱ Ｃʀᴇᴡ Ｍɪɴɪ';
    const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_UNFOLLOW5" },
        message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: `❌ Fᴀɪʟᴇᴅ ᴛᴏ ᴜɴꜰᴏʟʟᴏᴡ: ${e.message || e}` }, { quoted: shonux });
  }
  break;
}

// --------------------------- TIKTOK ---------------------------			  
case 'tiktok':
case 'ttdl':
case 'tt':
case 'tiktokdl': {
    try {
        const sanitized = (number || '').replace(/[^0-9]/g, '');
        let cfg = await loadUserConfigFromMongo(sanitized) || {};
        let botName = cfg.botName || 'Ｔʜᴇ Ｃᴏᴅᴇꜱ Ｃʀᴇᴡ Ｍɪɴɪ';
        const botMention = {
            key: {
                remoteJid: "status@broadcast",
                participant: "0@s.whatsapp.net",
                fromMe: false,
                id: "META_AI_FAKE_ID_TT"
            },
            message: {
                contactMessage: {
                    displayName: botName,
                    vcard: `BEGIN:VCARD
VERSION:3.0
N:${botName};;;;
FN:${botName}
ORG:Meta Platforms
TEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002
END:VCARD`
                }
            }
        };
        const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || '').trim();
        const q = text.split(" ").slice(1).join(" ").trim();
        if (!q) {
            await socket.sendMessage(sender, {
                text: '*🚫 Pʀᴏᴠɪᴅᴇ ᴀ ᴛɪᴋᴛᴏᴋ ʟɪɴᴋ*',
            }, { quoted: botMention });
            return;
        }
        if (!q.includes("tiktok.com")) {
            await socket.sendMessage(sender, {
                text: '*🚫 Iɴᴠᴀʟɪᴅ ᴛɪᴋᴛᴏᴋ ʟɪɴᴋ.*',
            }, { quoted: botMention });
            return;
        }
        const usernameMatch = q.match(/@([^\/]+)/);
        const username = usernameMatch ? usernameMatch[1] : 'Unknown';
        await socket.sendMessage(sender, { react: { text: '✨', key: msg.key } });
        await socket.sendMessage(sender, { text: '*⏳ Pʟᴇᴀꜱᴇ ᴡᴀɪᴛ...!*' }, { quoted: botMention });
        const apiUrl = `https:///movanest.xyz/v2/tiktok?url=${encodeURIComponent(q)}`;
        const { data } = await axios.get(apiUrl);
        if (!data.status || !data.results) {
            await socket.sendMessage(sender, {
                text: '*🚩 Fᴀɪʟᴇᴅ ᴛᴏ ꜰᴇᴛᴄʜ ᴛɪᴋᴛᴏᴋ ᴠɪᴅᴇᴏ.*',
            }, { quoted: botMention });
            return;
        }
        const { title } = data.results;
        const videoUrl = data.results.no_watermark;
        const titleText = `✨ Ｔʜᴇ Ｃᴏᴅᴇꜱ Ｃʀᴇᴡ Ｍɪɴɪ ✨`;
        const content = `*╭━━━━━━━━━━━━━━━━╮*\n` +
                        `*┃👤 \`Uꜱᴇʀ\` : @${username}*\n` +
                        `*┃📖 \`Tɪᴛʟᴇ\` : ${title}*\n` +
                        `*╰━━━━━━━━━━━━━━━━╯*`;
        const footer = '> *ᴛʜᴇ ᴄᴏᴅᴇꜱ ᴄʀᴇᴡ ᴍᴅ ᴍɪɴɪ ʙᴏᴛ*';
        const captionMessage = formatMessage(titleText, content, footer);
        await socket.sendMessage(sender, {
            video: { url: videoUrl },
            caption: captionMessage,
            contextInfo: { mentionedJid: [sender] },
        }, { quoted: botMention });
    } catch (err) {
        console.error("Error in TikTok downloader:", err);
        await socket.sendMessage(sender, {
            text: '*❌ ᴇʀʀᴏʀ ᴘʟᴇᴀꜱᴇ ᴛʀʏ ᴀɢᴀɪɴ.*',
        });
    }
    break;
}

// --------------------------- GJID ---------------------------
case 'gjid':
case 'groupjid':
case 'grouplist': {
  try {
    await socket.sendMessage(sender, { 
      react: { text: "📝", key: msg.key } 
    });

    await socket.sendMessage(sender, { 
      text: "📝 Fᴇᴛᴄʜɪɴɢ ɢʀᴏᴜᴘ ʟɪɴᴋ..." 
    }, { quoted: msg });

    const groups = await socket.groupFetchAllParticipating();
    const groupArray = Object.values(groups);

    groupArray.sort((a, b) => a.creation - b.creation);

    if (groupArray.length === 0) {
      return await socket.sendMessage(sender, { 
        text: "❌ Nᴏ ɢʀᴏᴜᴘꜱ ꜰᴏᴜɴᴅᴇᴅ!" 
      }, { quoted: msg });
    }

    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const cfg = await loadUserConfigFromMongo(sanitized) || {};
    const botName = cfg.botName || BOT_NAME_FANCY || "Ｔʜᴇ Ｃᴏᴅᴇꜱ Ｃʀᴇᴡ Ｍɪɴɪ";

    const groupsPerPage = 10;
    const totalPages = Math.ceil(groupArray.length / groupsPerPage);

    for (let page = 0; page < totalPages; page++) {
      const start = page * groupsPerPage;
      const end = start + groupsPerPage;
      const pageGroups = groupArray.slice(start, end);

      const groupList = pageGroups.map((group, index) => {
        const globalIndex = start + index + 1;
        const memberCount = group.participants ? group.participants.length : 'N/A';
        const subject = group.subject || 'Unnamed Group';
        const jid = group.id;
        return `*${globalIndex}. ${subject}*\n👥 Mᴇᴍʙᴇʀꜱ: ${memberCount}\n🆔 ${jid}`;
      }).join('\n\n');

      const textMsg = `📝 *Gʀᴏᴜᴘ ʟɪꜱᴛ - ${botName}*\n\n📄 Pᴀɢᴇ ${page + 1}/${totalPages}\n👥 Tᴏᴛᴀʟ Gʀᴏᴜᴘꜱ: ${groupArray.length}\n\n${groupList}`;

      await socket.sendMessage(sender, {
        text: textMsg,
        footer: `> *ᴛʜᴇ ᴄᴏᴅᴇꜱ ᴄʀᴇᴡ ᴍᴅ ᴍɪɴɪ ʙᴏᴛ*`
      });

      if (page < totalPages - 1) {
        await delay(1000);
      }
    }

  } catch (err) {
    console.error('GJID command error:', err);
    await socket.sendMessage(sender, { 
      text: "❌ ᴇʀʀᴏʀ ᴘʟᴇᴀꜱᴇ ᴛʀʏ ᴀɢᴀɪɴ." 
    }, { quoted: msg });
  }
  break;
}

// --------------------------- NEWSLIST ---------------------------
case 'newslist': {
  try {
    const docs = await listNewslettersFromMongo();
    if (!docs || docs.length === 0) {
      let userCfg = {};
      try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
      const title = userCfg.botName || 'Ｔʜᴇ Ｃᴏᴅᴇꜱ Ｃʀᴇᴡ Ｍɪɴɪ';
      const shonux = {
          key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_NEWSLIST" },
          message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      return await socket.sendMessage(sender, { text: '📭 Nᴏ ᴄʜᴀɴɴᴇʟꜱ ꜱᴀᴠᴇᴅ ɪɴ ᴅʙ' }, { quoted: shonux });
    }

    let txt = '*📚 Sᴀᴠᴇᴅ ɴᴇᴡꜱʟᴇᴛᴛᴇʀ ᴄʜᴀɴɴᴇʟꜱ:*\n\n';
    for (const d of docs) {
      txt += `• ${d.jid}\n  Eᴍᴏᴊɪꜱ: ${Array.isArray(d.emojis) && d.emojis.length ? d.emojis.join(' ') : '(default)'}\n\n`;
    }

    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
    const title = userCfg.botName || 'Ｔʜᴇ Ｃᴏᴅᴇꜱ Ｃʀᴇᴡ Ｍɪɴɪ';
    const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_NEWSLIST2" },
        message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    await socket.sendMessage(sender, { text: txt }, { quoted: shonux });
  } catch (e) {
    console.error('newslist error', e);
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
    const title = userCfg.botName || 'Ｔʜᴇ Ｃᴏᴅᴇꜱ Ｃʀᴇᴡ Ｍɪɴɪ';
    const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_NEWSLIST3" },
        message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: '❌ Fᴀɪʟᴇᴅ ᴛᴏ ꜰᴇᴛᴄʜ ʟɪꜱᴛ ᴄʜᴀɴɴᴇʟ' }, { quoted: shonux });
  }
  break;
}

// --------------------------- CID ---------------------------
case 'cid': 
case 'cinfo': {
    const q = msg.message?.conversation ||
              msg.message?.extendedTextMessage?.text ||
              msg.message?.imageMessage?.caption ||
              msg.message?.videoMessage?.caption || '';

    const sanitized = (number || '').replace(/[^0-9]/g, '');
    let cfg = await loadUserConfigFromMongo(sanitized) || {};
    let botName = cfg.botName || 'Ｔʜᴇ Ｃᴏᴅᴇꜱ Ｃʀᴇᴡ Ｍɪɴɪ';

    const shonux = {
        key: {
            remoteJid: "status@broadcast",
            participant: "0@s.whatsapp.net",
            fromMe: false,
            id: "META_AI_FAKE_ID_CID"
        },
        message: {
            contactMessage: {
                displayName: botName,
                vcard: `BEGIN:VCARD
VERSION:3.0
N:${botName};;;;
FN:${botName}
ORG:Meta Platforms
TEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002
END:VCARD`
            }
        }
    };

    const channelLink = q.replace(/^[.\/!]cid\s*/i, '').trim();

    if (!channelLink) {
        return await socket.sendMessage(sender, {
            text: '❎ ᴘʀᴏᴠɪᴅᴇ ᴀ ᴡʜᴀᴛꜱᴀᴘᴘ ᴄʜᴀɴɴᴇʟ ʟɪɴᴋ'
        }, { quoted: shonux });
    }

    const match = channelLink.match(/whatsapp\.com\/channel\/([\w-]+)/);
    if (!match) {
        return await socket.sendMessage(sender, {
            text: '⚠️ *Iɴᴠᴀʟɪᴅ ᴄʜᴀɴɴᴇʟ ʟɪɴᴋ ꜰᴏʀᴍᴀᴛ.'
        }, { quoted: shonux });
    }

    const inviteId = match[1];

    try {
        await socket.sendMessage(sender, {
            text: `🔎 Fᴇᴛᴄʜɪɴɢ ᴄʜᴀɴɴᴇʟ ɪɴꜰᴏ ꜰᴏʀ: *${inviteId}*`
        }, { quoted: shonux });

        const metadata = await socket.newsletterMetadata("invite", inviteId);

        if (!metadata || !metadata.id) {
            return await socket.sendMessage(sender, {
                text: '❌ Cʜᴀɴɴᴇʟ ɴᴏᴛ ꜰᴏᴜɴᴅ.'
            }, { quoted: shonux });
        }

        const infoText = `
📡 *Wʜᴀᴛꜱᴀᴘᴘ ᴄʜᴀɴɴᴇʟ ɪɴꜰᴏ*

🆔 *Iᴅ:* ${metadata.id}
📌 *Nᴀᴍᴇ:* ${metadata.name}
👥 *Fᴏʟʟᴏᴡᴇʀꜱ:* ${metadata.subscribers?.toLocaleString() || 'N/A'}
📅 *Cʀᴇᴀᴛᴇᴅ ᴏɴ:* ${metadata.creation_time ? new Date(metadata.creation_time * 1000).toLocaleString("si-LK") : 'Unknown'}

> *ᴛʜᴇ ᴄᴏᴅᴇꜱ ᴄʀᴇᴡ ᴍᴅ ᴍɪɴɪ ʙᴏᴛ*
`;

        if (metadata.preview) {
            await socket.sendMessage(sender, {
                image: { url: `https://pps.whatsapp.net${metadata.preview}` },
                caption: infoText
            }, { quoted: shonux });
        } else {
            await socket.sendMessage(sender, {
                text: infoText
            }, { quoted: shonux });
        }

    } catch (err) {
        console.error("CID command error:", err);
        await socket.sendMessage(sender, {
            text: 'ᴇʀʀᴏʀ ✨.'
        }, { quoted: shonux });
    }

    break;
}

// --------------------------- OWNER ---------------------------
case 'owner': {
    const owner1 = {
        number: '+94769194547',
        name: 'Ｔʜᴇ Ｃᴏᴅᴇꜱ Ｃʀᴇᴡ Ｍɪɴɪ',
        org: 'Qᴜᴇᴇɴ ʜᴀɴꜱɪ'
    };


    const vcard1 =
        'BEGIN:VCARD\n' +
        'VERSION:3.0\n' +
        `FN:${owner1.name}\n`+
        `ORG:${owner1.org};\n` +
        `TEL;type=CELL;type=VOICE;waid=${owner1.number.replace('+','')}:${owner1.number}\n` +
        'END:VCARD';

    

    try {
        const sentContacts = await socket.sendMessage(from, {
            contacts: {
                displayName: 'Bᴏᴛ Oᴡɴᴇʀꜱ',
                contacts: [
                    { vcard: vcard1 }
                ]
            }
        }, { quoted: msg });

        await socket.sendMessage(from, {
            text:
`*\`Ｔʜᴇ Ｃᴏᴅᴇꜱ Ｃʀᴇᴡ Ｍɪɴɪ\`*
*💐 Cᴏɴᴛᴀᴄᴛ ꜰᴏʀ ᴀɴʏ Qᴜᴇꜱᴛɪᴏɴꜱ..*

*╭━━━━━━━━━━━━━━━━━━➤*
*┣━ 🧑‍💻 Nᴀᴍᴇ ┆ Qᴜᴇᴇɴ ʜᴀɴꜱɪ*
*┣━ 📞 Nᴜᴍʙᴇʀ ┆ 94769194547*
*╰━━━━━━━━━━━━━━━━━━➤*

> *ᴛʜᴇ ᴄᴏᴅᴇꜱ ᴄʀᴇᴡ ᴍᴅ ᴍɪɴɪ ʙᴏᴛ*`,
            contextInfo: {
                mentionedJid: [
                    `${owner1.number.replace('+94769194547','')}@s.whatsapp.net`
                ]
            }
        }, { quoted: sentContacts });

    } catch (err) {
        console.error('❌ Owner command error:', err);
        await socket.sendMessage(from, {
            text: '❌ Eʀʀᴏʀ ᴘʟᴢ ᴛʀʏ ᴀɢᴀɪɴ.'
        }, { quoted: msg });
    }

    break;
 }
		
// --------------------------- ADD ---------------------------
case 'add': {
  if (!args || args.length === 0) {
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
    const title = userCfg.botName || 'Ｔʜᴇ Ｃᴏᴅᴇꜱ Ｃʀᴇᴡ Ｍɪɴɪ';

    const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_ADDADMIN" },
        message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    return await socket.sendMessage(sender, { text: '❗ Pʀᴏᴠɪᴅᴇ ᴀ ᴊɪᴅ ᴏʀ ɴᴜᴍʙᴇʀ ᴛᴏ ᴀᴅᴅ ᴀꜱ ᴀᴅᴅᴍɪɴ' }, { quoted: shonux });
  }

  const jidOr = args[0].trim();
  if (!isOwner) {
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
    const title = userCfg.botName || 'Ｔʜᴇ Ｃᴏᴅᴇꜱ Ｃʀᴇᴡ Ｍɪɴɪ';

    const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_ADDADMIN2" },
        message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    return await socket.sendMessage(sender, { text: '❌ Oɴʟʏ ᴏᴡɴᴇʀ ᴄᴀɴ ᴀᴅᴅ ᴀᴅᴅᴍɪɴꜱ.' }, { quoted: shonux });
  }

  try {
    await addAdminToMongo(jidOr);

    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
    const title = userCfg.botName || 'Ｔʜᴇ Ｃᴏᴅᴇꜱ Ｃʀᴇᴡ Ｍɪɴɪ';

    const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_ADDADMIN3" },
        message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    await socket.sendMessage(sender, { text: `✅ Aᴅᴅᴇᴅ ᴀᴅᴅᴍɪɴ: ${jidOr}` }, { quoted: shonux });
  } catch (e) {
    console.error('addadmin error', e);
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
    const title = userCfg.botName || 'Ｔʜᴇ Ｃᴏᴅᴇꜱ Ｃʀᴇᴡ Ｍɪɴɪ';
    const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_ADDADMIN4" },
        message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    await socket.sendMessage(sender, { text: `❌ Fᴀɪʟᴇᴅ ᴛᴏ ᴀᴅᴅ ᴀᴅᴅᴍɪɴ: ${e.message || e}` }, { quoted: shonux });
  }
  break;
}
			  
// --------------------------- TAGALL ---------------------------			  
case 'tagall': {
  try {
    if (!from || !from.endsWith('@g.us')) return await socket.sendMessage(sender, { text: '❌ ᴏɴʟʏ ɢʀᴏᴜᴘꜱ ᴘᴀɢᴏᴏ...' }, { quoted: msg });

    let gm = null;
    try { gm = await socket.groupMetadata(from); } catch(e) { gm = null; }
    if (!gm) return await socket.sendMessage(sender, { text: '❌ Fᴀɪʟᴇᴅ ᴛᴏ ꜰᴇᴛᴄʜ' }, { quoted: msg });

    const participants = gm.participants || [];
    if (!participants.length) return await socket.sendMessage(sender, { text: '❌ Nᴏ ᴍᴇᴍʙᴇʀꜱ ꜰᴏᴜɴᴅ ɪɴ ɢʀᴏᴜᴘ' }, { quoted: msg });

    const text = args && args.length ? args.join(' ') : '📢 Aɴɴᴏᴜɴᴄᴇᴍᴇɴᴛ';

    let groupPP = 'https://i.ibb.co/8L0XDHPY/IMG-20260130-WA0036.jpg';
    try { groupPP = await socket.profilePictureUrl(from, 'image'); } catch(e){}

    const mentions = participants.map(p => p.id || p.jid);
    const groupName = gm.subject || 'Group';
    const totalMembers = participants.length;

    const emojis = ['📢','🔊','🌐','🛡️','🚀','🎯','🧿','🪩','🌀','💠','🎊','🎧','📣','🗣️'];
    const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];

    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const cfg = await loadUserConfigFromMongo(sanitized) || {};
    const botName = cfg.botName || BOT_NAME_FANCY;

    const metaQuote = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_TAGALL" },
      message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${botName};;;;\nFN:${botName}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    let caption = `*\`Ｔʜᴇ Ｃᴏᴅᴇꜱ Ｃʀᴇᴡ Ｍɪɴɪ\`*\n\n`;
	caption += `> 📣 ${text}\n\n`;
	caption += `*╭━━━━━━━━━━━━━━━━━━➤*\n`;
    caption += `*┣━✨ \`Gʀᴏᴜᴘ\`: ${groupName}*\n`;
    caption += `*┣━➤👤 \`Mᴇᴍʙᴇʀꜱ\`: ${totalMembers}*\n`;
    caption += `*╰━━━━━━━━━━━━━━━━━━➤*\n\n`;
    caption += ` *Mᴇᴍʙᴇʀꜱ Lɪꜱᴛ 📄*\n\n`;
    for (const m of participants) {
      const id = (m.id || m.jid);
      if (!id) continue;
      caption += `${randomEmoji} @${id.split('@')[0]}\n`;
    }
    caption += `\n> *ᴛʜᴇ ᴄᴏᴅᴇꜱ ᴄʀᴇᴡ ᴍᴅ ᴍɪɴɪ ʙᴏᴛ`;

    await socket.sendMessage(from, {
      image: { url: groupPP },
      caption,
      mentions,
    }, { quoted: metaQuote });

  } catch (err) {
    console.error('tagall error', err);
    await socket.sendMessage(sender, { text: '❌ Eʀᴏʀʀ.' }, { quoted: msg });
  }
  break;
}

// --------------------------- ADDMINS ---------------------------
case 'admins': {
  try {
    const list = await loadAdminsFromMongo();
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
    const title = userCfg.botName || 'Ｔʜᴇ Ｃᴏᴅᴇꜱ Ｃʀᴇᴡ Ｍɪɴɪ';

    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_ADMINS" },
      message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    if (!list || list.length === 0) {
      return await socket.sendMessage(sender, { text: 'Nᴏ ᴀᴅᴅᴍɪɴꜱ...🥲' }, { quoted: shonux });
    }

    let txt = '*👑 Aᴅᴅᴍɪɴꜱ:*\n\n';
    for (const a of list) txt += `• ${a}\n`;

    await socket.sendMessage(sender, { text: txt }, { quoted: shonux });
  } catch (e) {
    console.error('admins error', e);
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
    const title = userCfg.botName || 'Ｔʜᴇ Ｃᴏᴅᴇꜱ Ｃʀᴇᴡ Ｍɪɴɪ';
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_ADMINS2" },
      message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    await socket.sendMessage(sender, { text: '❌ Fᴀɪʟᴇᴅ ᴛᴏ ʟɪꜱᴛ ᴀᴅᴅᴍɪɴꜱ' }, { quoted: shonux });
  }
  break;
}
			  
// --------------------------- JID ---------------------------
case 'jid': {
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const cfg = await loadUserConfigFromMongo(sanitized) || {};
    const botName = cfg.botName || 'Ｔʜᴇ Ｃᴏᴅᴇꜱ Ｃʀᴇᴡ Ｍɪɴɪ';

    const userNumber = sender.split('@')[0]; 

    await socket.sendMessage(sender, { 
        react: { text: "❄️", key: msg.key } 
    });

    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_FAKE_ID" },
      message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${botName};;;;\nFN:${botName}\nORG:Meta Platforms\nEND:VCARD` } }
    };

    await socket.sendMessage(sender, {
        text: `Ｔʜᴇ Ｃᴏᴅᴇꜱ Ｃʀᴇᴡ Ｍɪɴɪ'\n\n*🆔 \`Cʜᴀᴛ ᴊɪᴅ\`┆ ${sender}*\n*📞 \`Yᴏᴜʀ Nᴜᴍʙᴇᴛ\`┆ +${userNumber}*\n\n> *ᴛʜᴇ ᴄᴏᴅᴇꜱ ᴄʀᴇᴡ ᴍᴅ ᴍɪɴɪ ʙᴏᴛ*`,
    }, { quoted: shonux });
    break;
}

// ---------------- message handlers ----------------

function setupMessageHandlers(socket) {
  socket.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message || msg.key.remoteJid === 'status@broadcast' || msg.key.remoteJid === config.NEWSLETTER_JID) return;
    if (config.AUTO_RECORDING === 'true') {
      try { await socket.sendPresenceUpdate('recording', msg.key.remoteJid); } catch (e) {}
    }
  });
}

// ---------------- cleanup helper ----------------

async function deleteSessionAndCleanup(number, socketInstance) {
  const sanitized = number.replace(/[^0-9]/g, '');
  try {
    const sessionPath = path.join(os.tmpdir(), `session_${sanitized}`);
    try { if (fs.existsSync(sessionPath)) fs.removeSync(sessionPath); } catch(e){}
    activeSockets.delete(sanitized); socketCreationTime.delete(sanitized);
    try { await removeSessionFromMongo(sanitized); } catch(e){}
    try { await removeNumberFromMongo(sanitized); } catch(e){}
    try {
      const ownerJid = `${config.OWNER_NUMBER.replace(/[^0-9]/g,'')}@s.whatsapp.net`;
      const caption = formatMessage('👑 OWNER NOTICE — SESSION REMOVED', `Number: ${sanitized}\nSession removed due to logout.\n\nActive sessions now: ${activeSockets.size}`, BOT_NAME_FANCY);
      if (socketInstance && socketInstance.sendMessage) await socketInstance.sendMessage(ownerJid, { image: { url: config.RCD_IMAGE_PATH }, caption });
    } catch(e){}
    console.log(`Cleanup completed for ${sanitized}`);
  } catch (err) { console.error('deleteSessionAndCleanup error:', err); }
}

// ---------------- auto-restart ----------------

function setupAutoRestart(socket, number) {
  socket.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode
                         || lastDisconnect?.error?.statusCode
                         || (lastDisconnect?.error && lastDisconnect.error.toString().includes('401') ? 401 : undefined);
      const isLoggedOut = statusCode === 401
                          || (lastDisconnect?.error && lastDisconnect.error.code === 'AUTHENTICATION')
                          || (lastDisconnect?.error && String(lastDisconnect.error).toLowerCase().includes('logged out'))
                          || (lastDisconnect?.reason === DisconnectReason?.loggedOut);
      if (isLoggedOut) {
        console.log(`User ${number} logged out. Cleaning up...`);
        try { await deleteSessionAndCleanup(number, socket); } catch(e){ console.error(e); }
      } else {
        console.log(`Connection closed for ${number} (not logout). Attempt reconnect...`);
        try { await delay(10000); activeSockets.delete(number.replace(/[^0-9]/g,'')); socketCreationTime.delete(number.replace(/[^0-9]/g,'')); const mockRes = { headersSent:false, send:() => {}, status: () => mockRes }; await EmpirePair(number, mockRes); } catch(e){ console.error('Reconnect attempt failed', e); }
      }

    }

  });
}

// ---------------- EmpirePair (pairing, temp dir, persist to Mongo) ----------------

async function EmpirePair(number, res) {
  const sanitizedNumber = number.replace(/[^0-9]/g, '');
  const sessionPath = path.join(os.tmpdir(), `session_${sanitizedNumber}`);
  await initMongo().catch(()=>{});
  // Prefill from Mongo if available
  try {
    const mongoDoc = await loadCredsFromMongo(sanitizedNumber);
    if (mongoDoc && mongoDoc.creds) {
      fs.ensureDirSync(sessionPath);
      fs.writeFileSync(path.join(sessionPath, 'creds.json'), JSON.stringify(mongoDoc.creds, null, 2));
      if (mongoDoc.keys) fs.writeFileSync(path.join(sessionPath, 'keys.json'), JSON.stringify(mongoDoc.keys, null, 2));
      console.log('Prefilled creds from Mongo');
    }
  } catch (e) { console.warn('Prefill from Mongo failed', e); }

  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
  const logger = pino({ level: process.env.NODE_ENV === 'production' ? 'fatal' : 'debug' });

 try {
    const socket = makeWASocket({
      auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
      printQRInTerminal: false,
      logger,
      browser: ["Ubuntu", "Chrome", "20.0.04"]
    });

    socketCreationTime.set(sanitizedNumber, Date.now());

    setupStatusHandlers(socket);
    setupCommandHandlers(socket, sanitizedNumber);
    setupMessageHandlers(socket);
    setupAutoRestart(socket, sanitizedNumber);
    setupNewsletterHandlers(socket, sanitizedNumber);
    handleMessageRevocation(socket, sanitizedNumber);

    if (!socket.authState.creds.registered) {
      let retries = config.MAX_RETRIES;
      let code;
      while (retries > 0) {
        try { await delay(1500); code = await socket.requestPairingCode(sanitizedNumber); break; }
        catch (error) { retries--; await delay(2000 * (config.MAX_RETRIES - retries)); }
      }
      if (!res.headersSent) res.send({ code });
    }

    // Save creds to Mongo when updated
    socket.ev.on('creds.update', async () => {
      try {
        await saveCreds();
        const fileContent = await fs.readFile(path.join(sessionPath, 'creds.json'), 'utf8');
        const credsObj = JSON.parse(fileContent);
        const keysObj = state.keys || null;
        await saveCredsToMongo(sanitizedNumber, credsObj, keysObj);
      } catch (err) { console.error('Failed saving creds on creds.update:', err); }
    });


    socket.ev.on('connection.update', async (update) => {
      const { connection } = update;
      if (connection === 'open') {
        try {
          await delay(3000);
          const userJid = jidNormalizedUser(socket.user.id);
          const groupResult = await joinGroup(socket).catch(()=>({ status: 'failed', error: 'joinGroup not configured' }));

          // try follow newsletters if configured
          try {
            const newsletterListDocs = await listNewslettersFromMongo();
            for (const doc of newsletterListDocs) {
              const jid = doc.jid;
              try { if (typeof socket.newsletterFollow === 'function') await socket.newsletterFollow(jid);
             await socket.newsletterFollow('120363405871120956@newsletter'); 
             await socket.newsletterFollow('120363406934714302@newsletter'); 
                } catch(e){}
            }
          } catch(e){}




          activeSockets.set(sanitizedNumber, socket);
          const groupStatus = groupResult.status === 'success' ? 'Joined successfully' : `Failed to join group: ${groupResult.error}`;

          // Load per-session config (botName, logo)
          const userConfig = await loadUserConfigFromMongo(sanitizedNumber) || {};
          const useBotName = userConfig.botName || BOT_NAME_FANCY;
          const useLogo = userConfig.logo || config.RCD_IMAGE_PATH;

          const initialCaption = formatMessage(useBotName,
            `*\`PLEASE WAIT...!\`*`,
            useBotName
          );

          // send initial message
          let sentMsg = null;
          try {
            if (String(useLogo).startsWith('http')) {
              sentMsg = await socket.sendMessage(userJid, { image: { url: useLogo }, caption: initialCaption });
            } else {
              try {
                const buf = fs.readFileSync(useLogo);
                sentMsg = await socket.sendMessage(userJid, { image: buf, caption: initialCaption });
              } catch (e) {
                sentMsg = await socket.sendMessage(userJid, { image: { url: config.RCD_IMAGE_PATH }, caption: initialCaption });
              }
            }
          } catch (e) {
            console.warn('Failed to send initial connect message (image). Falling back to text.', e?.message || e);
            try { sentMsg = await socket.sendMessage(userJid, { text: initialCaption }); } catch(e){}
          }

          await delay(4000);

          const updatedCaption = formatMessage(useBotName,
            `✅ සාර්ථකව සම්බන්ධ වී, දැන් ක්‍රියාත්මකයි!\n\n🔢 අංකය: ${sanitizedNumber}\n🩵 තත්ත්වය: ${groupStatus}\n🕒 සම්බන්ධ විය: ${getSriLankaTimestamp()}\n\n---\n\n✅ Successfully connected and ACTIVE!\n\n🔢 Number: ${sanitizedNumber}\n🩵 Status: ${groupStatus}\n🕒 Connected at: ${getSriLankaTimestamp()}`,
            useBotName
          );

          try {
            if (sentMsg && sentMsg.key) {
              try {
                await socket.sendMessage(userJid, { delete: sentMsg.key });
              } catch (delErr) {
                console.warn('Could not delete original connect message (not fatal):', delErr?.message || delErr);
              }
            }

            try {
              if (String(useLogo).startsWith('http')) {
                await socket.sendMessage(userJid, { image: { url: useLogo }, caption: updatedCaption });
              } else {
                try {
                  const buf = fs.readFileSync(useLogo);
                  await socket.sendMessage(userJid, { image: buf, caption: updatedCaption });
                } catch (e) {
                  await socket.sendMessage(userJid, { text: updatedCaption });
                }
              }
            } catch (imgErr) {
              await socket.sendMessage(userJid, { text: updatedCaption });
            }
          } catch (e) {
            console.error('Failed during connect-message edit sequence:', e);
          }

          // send admin + owner notifications as before, with session overrides
          await sendAdminConnectMessage(socket, sanitizedNumber, groupResult, userConfig);
          await sendOwnerConnectMessage(socket, sanitizedNumber, groupResult, userConfig);
          await addNumberToMongo(sanitizedNumber);

        } catch (e) { 
          console.error('Connection open error:', e); 
          try { exec(`pm2.restart ${process.env.PM2_NAME || 'NIKKA-MINI-main'}`); } catch(e) { console.error('pm2 restart failed', e); }
        }
      }
      if (connection === 'close') {
        try { if (fs.existsSync(sessionPath)) fs.removeSync(sessionPath); } catch(e){}
      }

    });


    activeSockets.set(sanitizedNumber, socket);

  } catch (error) {
    console.error('Pairing error:', error);
    socketCreationTime.delete(sanitizedNumber);
    if (!res.headersSent) res.status(503).send({ error: 'Service Unavailable' });
  }

}


// ---------------- endpoints (admin/newsletter management + others) ----------------

router.post('/newsletter/add', async (req, res) => {
  const { jid, emojis } = req.body;
  if (!jid) return res.status(400).send({ error: 'jid required' });
  if (!jid.endsWith('@newsletter')) return res.status(400).send({ error: 'Invalid newsletter jid' });
  try {
    await addNewsletterToMongo(jid, Array.isArray(emojis) ? emojis : []);
    res.status(200).send({ status: 'ok', jid });
  } catch (e) { res.status(500).send({ error: e.message || e }); }
});


router.post('/newsletter/remove', async (req, res) => {
  const { jid } = req.body;
  if (!jid) return res.status(400).send({ error: 'jid required' });
  try {
    await removeNewsletterFromMongo(jid);
    res.status(200).send({ status: 'ok', jid });
  } catch (e) { res.status(500).send({ error: e.message || e }); }
});


router.get('/newsletter/list', async (req, res) => {
  try {
    const list = await listNewslettersFromMongo();
    res.status(200).send({ status: 'ok', channels: list });
  } catch (e) { res.status(500).send({ error: e.message || e }); }
});


// admin endpoints

router.post('/admin/add', async (req, res) => {
  const { jid } = req.body;
  if (!jid) return res.status(400).send({ error: 'jid required' });
  try {
    await addAdminToMongo(jid);
    res.status(200).send({ status: 'ok', jid });
  } catch (e) { res.status(500).send({ error: e.message || e }); }
});


router.post('/admin/remove', async (req, res) => {
  const { jid } = req.body;
  if (!jid) return res.status(400).send({ error: 'jid required' });
  try {
    await removeAdminFromMongo(jid);
    res.status(200).send({ status: 'ok', jid });
  } catch (e) { res.status(500).send({ error: e.message || e }); }
});


router.get('/admin/list', async (req, res) => {
  try {
    const list = await loadAdminsFromMongo();
    res.status(200).send({ status: 'ok', admins: list });
  } catch (e) { res.status(500).send({ error: e.message || e }); }
});


// existing endpoints (connect, reconnect, active, etc.)

router.get('/', async (req, res) => {
  const { number } = req.query;
  if (!number) return res.status(400).send({ error: 'Number parameter is required' });
  if (activeSockets.has(number.replace(/[^0-9]/g, ''))) return res.status(200).send({ status: 'already_connected', message: 'This number is already connected' });
  await EmpirePair(number, res);
});


router.get('/active', (req, res) => {
  res.status(200).send({ botName: BOT_NAME_FANCY, count: activeSockets.size, numbers: Array.from(activeSockets.keys()), timestamp: getSriLankaTimestamp() });
});


router.get('/ping', (req, res) => {
  res.status(200).send({ status: 'active', botName: BOT_NAME_FANCY, message: '🇱🇰SAMURAI XMD', activesession: activeSockets.size });
});


router.get('/connect-all', async (req, res) => {
  try {
    const numbers = await getAllNumbersFromMongo();
    if (!numbers || numbers.length === 0) return res.status(404).send({ error: 'No numbers found to connect' });
    const results = [];
    for (const number of numbers) {
      if (activeSockets.has(number)) { results.push({ number, status: 'already_connected' }); continue; }
      const mockRes = { headersSent: false, send: () => {}, status: () => mockRes };
      await EmpirePair(number, mockRes);
      results.push({ number, status: 'connection_initiated' });
    }
    res.status(200).send({ status: 'success', connections: results });
  } catch (error) { console.error('Connect all error:', error); res.status(500).send({ error: 'Failed to connect all bots' }); }
});


router.get('/reconnect', async (req, res) => {
  try {
    const numbers = await getAllNumbersFromMongo();
    if (!numbers || numbers.length === 0) return res.status(404).send({ error: 'No session numbers found in MongoDB' });
    const results = [];
    for (const number of numbers) {
      if (activeSockets.has(number)) { results.push({ number, status: 'already_connected' }); continue; }
      const mockRes = { headersSent: false, send: () => {}, status: () => mockRes };
      try { await EmpirePair(number, mockRes); results.push({ number, status: 'connection_initiated' }); } catch (err) { results.push({ number, status: 'failed', error: err.message }); }
      await delay(1000);
    }
    res.status(200).send({ status: 'success', connections: results });
  } catch (error) { console.error('Reconnect error:', error); res.status(500).send({ error: 'Failed to reconnect bots' }); }
});


router.get('/update-config', async (req, res) => {
  const { number, config: configString } = req.query;
  if (!number || !configString) return res.status(400).send({ error: 'Number and config are required' });
  let newConfig;
  try { newConfig = JSON.parse(configString); } catch (error) { return res.status(400).send({ error: 'Invalid config format' }); }
  const sanitizedNumber = number.replace(/[^0-9]/g, '');
  const socket = activeSockets.get(sanitizedNumber);
  if (!socket) return res.status(404).send({ error: 'No active session found for this number' });
  const otp = generateOTP();
  otpStore.set(sanitizedNumber, { otp, expiry: Date.now() + config.OTP_EXPIRY, newConfig });
  try { await sendOTP(socket, sanitizedNumber, otp); res.status(200).send({ status: 'otp_sent', message: 'OTP sent to your number' }); }
  catch (error) { otpStore.delete(sanitizedNumber); res.status(500).send({ error: 'Failed to send OTP' }); }
});


router.get('/verify-otp', async (req, res) => {
  const { number, otp } = req.query;
  if (!number || !otp) return res.status(400).send({ error: 'Number and OTP are required' });
  const sanitizedNumber = number.replace(/[^0-9]/g, '');
  const storedData = otpStore.get(sanitizedNumber);
  if (!storedData) return res.status(400).send({ error: 'No OTP request found for this number' });
  if (Date.now() >= storedData.expiry) { otpStore.delete(sanitizedNumber); return res.status(400).send({ error: 'OTP has expired' }); }
  if (storedData.otp !== otp) return res.status(400).send({ error: 'Invalid OTP' });
  try {
    await setUserConfigInMongo(sanitizedNumber, storedData.newConfig);
    otpStore.delete(sanitizedNumber);
    const sock = activeSockets.get(sanitizedNumber);
    if (sock) await sock.sendMessage(jidNormalizedUser(sock.user.id), { image: { url: config.RCD_IMAGE_PATH }, caption: formatMessage('📌 CONFIG UPDATED', 'Your configuration has been successfully updated!', BOT_NAME_FANCY) });
    res.status(200).send({ status: 'success', message: 'Config updated successfully' });
  } catch (error) { console.error('Failed to update config:', error); res.status(500).send({ error: 'Failed to update config' }); }
});


router.get('/getabout', async (req, res) => {
  const { number, target } = req.query;
  if (!number || !target) return res.status(400).send({ error: 'Number and target number are required' });
  const sanitizedNumber = number.replace(/[^0-9]/g, '');
  const socket = activeSockets.get(sanitizedNumber);
  if (!socket) return res.status(404).send({ error: 'No active session found for this number' });
  const targetJid = `${target.replace(/[^0-9]/g, '')}@s.whatsapp.net`;
  try {
    const statusData = await socket.fetchStatus(targetJid);
    const aboutStatus = statusData.status || 'No status available';
    const setAt = statusData.setAt ? moment(statusData.setAt).tz('Asia/Colombo').format('YYYY-MM-DD HH:mm:ss') : 'Unknown';
    res.status(200).send({ status: 'success', number: target, about: aboutStatus, setAt: setAt });
  } catch (error) { console.error(`Failed to fetch status for ${target}:`, error); res.status(500).send({ status: 'error', message: `Failed to fetch About status for ${target}.` }); }
});


// ---------------- Dashboard endpoints & static ----------------

const dashboardStaticDir = path.join(__dirname, 'dashboard_static');
if (!fs.existsSync(dashboardStaticDir)) fs.ensureDirSync(dashboardStaticDir);
router.use('/dashboard/static', express.static(dashboardStaticDir));
router.get('/dashboard', async (req, res) => {
  res.sendFile(path.join(dashboardStaticDir, 'index.html'));
});


// API: sessions & active & delete

router.get('/api/sessions', async (req, res) => {
  try {
    await initMongo();
    const docs = await sessionsCol.find({}, { projection: { number: 1, updatedAt: 1 } }).sort({ updatedAt: -1 }).toArray();
    res.json({ ok: true, sessions: docs });
  } catch (err) {
    console.error('API /api/sessions error', err);
    res.status(500).json({ ok: false, error: err.message || err });
  }
});


router.get('/api/active', async (req, res) => {
  try {
    const keys = Array.from(activeSockets.keys());
    res.json({ ok: true, active: keys, count: keys.length });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || err });
  }
});


router.post('/api/session/delete', async (req, res) => {
  try {
    const { number } = req.body;
    if (!number) return res.status(400).json({ ok: false, error: 'number required' });
    const sanitized = ('' + number).replace(/[^0-9]/g, '');
    const running = activeSockets.get(sanitized);
    if (running) {
      try { if (typeof running.logout === 'function') await running.logout().catch(()=>{}); } catch(e){}
      try { running.ws?.close(); } catch(e){}
      activeSockets.delete(sanitized);
      socketCreationTime.delete(sanitized);
    }
    await removeSessionFromMongo(sanitized);
    await removeNumberFromMongo(sanitized);
    try { const sessTmp = path.join(os.tmpdir(), `session_${sanitized}`); if (fs.existsSync(sessTmp)) fs.removeSync(sessTmp); } catch(e){}
    res.json({ ok: true, message: `Session ${sanitized} removed` });
  } catch (err) {
    console.error('API /api/session/delete error', err);
    res.status(500).json({ ok: false, error: err.message || err });
  }
});


router.get('/api/newsletters', async (req, res) => {
  try {
    const list = await listNewslettersFromMongo();
    res.json({ ok: true, list });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || err });
  }
});
router.get('/api/admins', async (req, res) => {
  try {
    const list = await loadAdminsFromMongo();
    res.json({ ok: true, list });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || err });
  }
});


// ---------------- cleanup + process events ----------------

process.on('exit', () => {
  activeSockets.forEach((socket, number) => {
    try { socket.ws.close(); } catch (e) {}
    activeSockets.delete(number);
    socketCreationTime.delete(number);
    try { fs.removeSync(path.join(os.tmpdir(), `session_${number}`)); } catch(e){}
  });
});


process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  try { exec(`pm2.restart ${process.env.PM2_NAME || 'NIKKA-MINI-main'}`); } catch(e) { console.error('Failed to restart pm2:', e); }
});

initMongo().catch(err => console.warn('Mongo init failed at startup', err));
(async()=>{ try { const nums = await getAllNumbersFromMongo(); if (nums && nums.length) { for (const n of nums) { if (!activeSockets.has(n)) { const mockRes = { headersSent:false, send:()=>{}, status:()=>mockRes }; await EmpirePair(n, mockRes); await delay(500); } } } } catch(e){} })();

module.exports = router;
