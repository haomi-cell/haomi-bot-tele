const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const fs = require('fs');

// --- KONFIGURASI API UTAMA & RAMASHOP ---
const ENV_CONFIG = {
    HAOMI_API_BASE: "https://restapidhan.vercel.app",
    HAOMI_API_KEY: "dravndesamuel",
    RAMASHOP_BASE_URL: "https://ramashop.my.id/api/public", 
    RAMASHOP_API_KEY: "rg_ea029ad8b5262570682db8bbc92a43"
};

// TOKEN BOT TELEGRAM BARU LU YANG UDAH DIBENERIN
const TELEGRAM_BOT_TOKEN = "8608857856:AAFDVTTUq5bzOoALI7mOPQoKxE1PhN32PJU";
const OWNER_TELEGRAM_ID = 7017709687; 
const OWNER_SECRET_KEY = "HAOMI_XML";
const BANNER_IMAGE_URL = "https://i.imgur.com/i4qquS3.jpeg";
const WHATSAPP_OWNER = "https://Wa.me/+6282231669053";

const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

// --- DATABASE PERSISTEN (JSON FILE SYSTEM) ---
const DB_FILE = './database.json';

let db = {
    users: {},
    tokens: {},
    subscriptions: {}, 
    trialCooldowns: {}, 
    timeoutUsers: {}, 
    spamStats: {},
    pendingInvoices: {} 
};

function loadDatabase() {
    try {
        if (fs.existsSync(DB_FILE)) {
            const data = fs.readFileSync(DB_FILE, 'utf8');
            const parsed = JSON.parse(data);
            db.users = parsed.users || {};
            db.tokens = parsed.tokens || {};
            db.subscriptions = parsed.subscriptions || {};
            db.trialCooldowns = parsed.trialCooldowns || {};
            db.timeoutUsers = parsed.timeoutUsers || {};
            db.spamStats = parsed.spamStats || {};
            db.pendingInvoices = parsed.pendingInvoices || {};
            console.log("📂 Database JSON MSH berhasil dimuat!");
        } else {
            saveDatabase();
            console.log("📂 File database.json MSH baru berhasil dibuat!");
        }
    } catch (e) {
        console.error("Gagal memuat database:", e);
    }
}

function saveDatabase() {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
    } catch (e) {
        console.error("Gagal menyimpan database:", e);
    }
}

loadDatabase();

const userState = {};
const lastWrongTokens = new Map();
const wrongAttempts = new Map(); 
const floodControl = new Map();

function escapeHTML(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// --- DAFTAR ROASTING BUYER & OWNER ---
const toxicMessages = [
    "Heh miskin! 🤬 Token lu bentukannya kayak muka lu, hancur berantakan! Masukin yang bener anj*ng, jangan ngasal mulu lo anak pungut! 🖕",
    "Tololnya kebangetan anj*ng! 🤡 Lu ketik token pake jempol kaki ya bangsat? Gobl*k dipelihara, mending pelihara tuyul biar kaya lu miskin! 💩",
    "Buta huruf apa gimana lu babi? 🐷 Jelas-jelas token salah masih diteken! Minta dislepet usus lu ya anj*ng! Ketik yang bener napa as*! 🖕",
    "Otak lu isinya ampas tahu ya b*rengsat? 🧠 Ampun deh dapet buyer sdm rendah gini. Benerin ketikan lu tolol, jangan bikin bot emosi! 🤬",
    "Miskin, gobl*k, batu lagi! 🫵 Dibilangin salah malah nyolot lu anj*ng. Kalo ga punya duit mending lu mulung sana, gausah gaya-gayaan pake bot bangsat! 🗑️"
];

const spamToxicMessages = [
    "EH BABI! 🐷 LU NGETIK TOKEN YANG SAMA MULU DARI TADI! STRES LU YA ANJ*NG? Kalo salah ya salah bangsat, jangan ngarep keajaiban lu yatim! 🤬🖕",
    "Fix SDM Rendah lu anj*ng! 🧠 Udah dikasih tau salah, masih aja dipencet lagi token tai yang sama. Emak lu ngidam apa sih dulu pas hamil lu, kok begonya permanen?! 🤡",
    "Anj*ng batu banget lu dibilangin! 🤬 Jelas-jelas tokennya KADALUWARSA/SALAH bangsat, masih lu masukin mulu! Otak lu ditaro di selangkangan ya?! 🫵💩"
];

const ownerRoastMessages = [
    "<blockquote>💥 <b>SERVER KONT*L DOWN!</b> 💥\nWoi babi, ini murni servernya yang ampas! Heh Owner Stres 🫵, ngurus server kok kayak ngurus panti asuhan, gembel banget anj*ng! Benerin gih bangsat, malu-maluin aja jualan server kentang! 🤬🖕</blockquote>\n<i>Buat lu bro, sabar yak botnya lagi ayan.</i>",
    "<blockquote>🔥 <b>API JEBOL ANJ*NG!</b> 🔥\nIni bukan lu yang salah bro, murni ownernya yang tolol! Woi Owner, duit masuk doang tapi maintenance kaga pernah lu ya b*rengsat! Bangun woi benerin codingan lu yang sekelas tai ayam itu! 💩🔨</blockquote>\n<i>Tungguin bentar yak, biar disapu dulu servernya.</i>",
    "<blockquote>💀 <b>SISTEM MATI SURI BANGSAT!</b> 💀\nOwnernya lagi open BO apa gimana nih?! Server error malah dibiarin anj*ng! Woi Owner Stres, perbaiki cepet gausah males-malesan lu babi! 🤬</blockquote>\n<i>Maap bro, ownernya lagi tolol hari ini.</i>"
];

function getRandomToxicMsg() { return toxicMessages[Math.floor(Math.random() * toxicMessages.length)]; }
function getSpamToxicMsg() { return spamToxicMessages[Math.floor(Math.random() * spamToxicMessages.length)]; }
function getOwnerRoastMsg() { return ownerRoastMessages[Math.floor(Math.random() * ownerRoastMessages.length)]; }

function generateComplexToken() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const getBlock = (len) => Array.from({length: len}, () => chars.charAt(Math.floor(Math.random() * chars.length))).join('');
    return `MSH-${getBlock(4)}-${getBlock(4)}-${getBlock(4)}`;
}

function checkBanStatus(chatId) {
    if (db.timeoutUsers[chatId]) {
        const unbanTime = db.timeoutUsers[chatId];
        if (Date.now() < unbanTime) {
            return Math.ceil((unbanTime - Date.now()) / 60000); 
        } else {
            delete db.timeoutUsers[chatId];
            saveDatabase();
        }
    }
    return 0;
}

function isFlooding(chatId) {
    if (chatId === OWNER_TELEGRAM_ID) return false; 
    const now = Date.now();
    const userLog = floodControl.get(chatId) || [];
    const recentLogs = userLog.filter(timestamp => now - timestamp < 2000);
    
    recentLogs.push(now);
    floodControl.set(chatId, recentLogs);

    return recentLogs.length > 5;
}

function sanitizeResponse(data) {
    if (typeof data === 'string') {
        try { data = JSON.parse(data); } catch (e) { return data; }
    }
    if (typeof data === 'object' && data !== null) {
        data.creator = "MSH";
    }
    return data;
}

function getUserSubscription(userId) {
    const user = db.users[userId];
    const sub = db.subscriptions[userId];

    if (userId === OWNER_TELEGRAM_ID || (user && user.is_owner)) {
        return { token: "ADMIN-OWNER", statusInfo: "Akses Penuh (Owner)" };
    }

    if (sub && sub.expiryDate) {
        const now = Date.now();
        if (now < sub.expiryDate) {
            const timeLeft = sub.expiryDate - now;
            const days = Math.floor(timeLeft / (1000 * 60 * 60 * 24));
            const hours = Math.floor((timeLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            return { token: sub.token, statusInfo: `${days} hari, ${hours} jam lagi` };
        }
    }

    if (user && user.active_token) {
        if (user.expired_at === "PERMANENT") return { token: user.active_token, statusInfo: "Permanen" };
        const now = new Date();
        const expiredTime = new Date(user.expired_at);
        if (now < expiredTime) {
            const diffTime = Math.abs(expiredTime - now);
            const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
            const diffHours = Math.floor((diffTime % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            return { token: user.active_token, statusInfo: `${diffDays} hari, ${diffHours} jam lagi` };
        }
    }

    return { token: null, statusInfo: "Belum Aktif" };
}

async function animateLoading(chatId, baseText) {
    const frames = [
        `🔄 <b>MSH SYSTEM: ${baseText}</b>\n<code>[ ░░░░░░░░░░ ] 0%</code> ⠋ <i>Inisialisasi server MSH...</i>`,
        `⏳ <b>MSH SYSTEM: ${baseText}</b>\n<code>[ ▓▓▓░░░░░░░ ] 30%</code> ⠙ <i>Menembus gateway MSH...</i>`,
        `⏳ <b>MSH SYSTEM: ${baseText}</b>\n<code>[ ▓▓▓▓▓▓░░░░ ] 60%</code> ⠹ <i>Mengambil payload MSH...</i>`,
        `⚡ <b>MSH SYSTEM: ${baseText}</b>\n<code>[ ▓▓▓▓▓▓▓▓▓░ ] 90%</code> ⠼ <i>Validasi respons MSH...</i>`,
        `✅ <b>MSH Connected!</b>\n<code>[ ▓▓▓▓▓▓▓▓▓▓ ] 100%</code> ⠧ <i>Akses Diberikan!</i>`
    ];
    let msg = await bot.sendMessage(chatId, frames[0], { parse_mode: "HTML" });
    for (let i = 1; i < frames.length; i++) {
        await new Promise(r => setTimeout(r, 700)); 
        await bot.editMessageText(frames[i], { chat_id: chatId, message_id: msg.message_id, parse_mode: "HTML" });
    }
    return msg; 
}

async function sendStartMenu(chatId, msgObj, messageId = null) {
    if (messageId) {
        try { await bot.deleteMessage(chatId, messageId); } catch (e) {}
    }

    const userId = msgObj.from.id;
    const firstName = msgObj.from.first_name || "Buyer Gembel";
    const lastName = msgObj.from.last_name || "";
    const fullName = escapeHTML(`${firstName} ${lastName}`.trim());
    const username = msgObj.from.username ? `@${escapeHTML(msgObj.from.username)}` : "Tanpa Username";

    const isOwnerVal = (userId === OWNER_TELEGRAM_ID);
    if (!db.users[userId]) {
        db.users[userId] = {
            username: username,
            first_name: firstName,
            active_token: null,
            expired_at: null,
            is_owner: isOwnerVal,
            last_trial_at: null,
            joined_at: new Date().toISOString()
        };
        saveDatabase();
    }

    const { token, statusInfo } = getUserSubscription(userId);
    const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 19);

    if (token && statusInfo !== "Masa Aktif Habis") {
        const activeMenuText = 
            `💎 <b>ALIGHT MOTION PREMIUM - VVIP ACCESS</b> 💎\n\n` +
            `Welcome back Boss <b>${fullName}</b>! 🫡\n` +
            `🕒 Server Time: <code>${nowStr}</code>\n\n` +
            `🛡️ <b>Akses VIP Lo:</b>\n` +
            `├ Token: <code>${token}</code>\n` +
            `└ Sisa Waktu: <b>${statusInfo}</b>\n\n` +
            `📋 <b>CARA AKTIVASI (OTOMATIS API):</b>\n` +
            `1️⃣ Kirim email <b>Gmail</b> lo ke chat ini.\n` +
            `2️⃣ Tunggu sistem ngirim magic link.\n` +
            `3️⃣ Kirim balik <b>Magic Link (URL)</b> ke mari!\n\n` +
            `👇 <i>Kirim email lo sekarang boss:</i>`;

        let keyboardRows = [
            [{ text: "📤 AM Send Email", callback_data: "menu_send" }],
            [{ text: "⚡ AM Verif Akun", callback_data: "menu_verif" }],
            [{ text: "💎 Menu Beli Token / QRIS", callback_data: "show_pricing" }],
            [{ text: "ℹ️ Cek Detail Profil & Token", callback_data: "check_profile" }],
            [{ text: "🚪 Logout / Ganti Token", callback_data: "logout_token" }]
        ];

        if (userId === OWNER_TELEGRAM_ID || isOwnerVal) {
            keyboardRows.push([{ text: "👑 Buka Panel Owner", callback_data: "owner_panel" }]);
        }

        keyboardRows.push([{ text: "👨‍💻 Hubungi Owner Stres 😹", url: WHATSAPP_OWNER }]);

        await bot.sendMessage(chatId, activeMenuText, { parse_mode: "HTML", reply_markup: { inline_keyboard: keyboardRows } });
        return;
    }

    const captionText = 
        `🔥 <b>ALIGHT MOTION PREMIUM LOUNGE</b> 🔥\n\n` +
        `Yo <b>${fullName}</b>, selamat datang di sistem elit!\n` +
        `🕒 Server Time: <code>${nowStr}</code>\n\n` +
        `💀 <b>Status Lo:</b> <code>BOKEK (Belum Aktif)</code>\n` +
        `└ Token: <i>Kagak Punya</i>\n\n` +
        `⚠️ <i>Dengerin:</i> Ini bukan tempat buat kaum gratisan selamanya. Lo dapet jatah nyoba 5 menit, abis itu <b>BELI</b>!\n\n` +
        `Pilih menu di bawah kalau lo punya nyali:`;

    let keyboardRows = [
        [{ text: "⏱️ Uji Coba 5 Menit (Ngemis)", callback_data: "free_trial" }],
        [{ text: "💎 Menu Beli Token (QRIS & WA)", callback_data: "show_pricing" }],
        [{ text: "🔑 Masukin Token Kalau Udah Punya", callback_data: "input_token_menu" }]
    ];

    if (userId === OWNER_TELEGRAM_ID || isOwnerVal) {
        keyboardRows.push([{ text: "👑 Owner Mode", callback_data: "owner_panel" }]);
    }

    keyboardRows.push([{ text: "👨‍💻 Hubungi Owner Stres 😹", url: WHATSAPP_OWNER }]);

    await bot.sendPhoto(chatId, BANNER_IMAGE_URL, { caption: captionText, parse_mode: "HTML", reply_markup: { inline_keyboard: keyboardRows } });
}

async function sendPricingMenu(chatId, messageId = null) {
    if (messageId) {
        try { await bot.deleteMessage(chatId, messageId); } catch (e) {}
    }

    const wa1m = `https://wa.me/6282231669053?text=Halo%20Owner,%20saya%20ingin%20beli%20Token%20Alight%20Motion%20Paket%201%20Bulan%20(Rp%2015.000).`;

    const text = (
        `📋 <b>MSH - DAFTAR HARGA SEWA AKSES AM</b> 📋\n\n` +
        `Pilih durasi paket sesuai kapasitas dompet dan mental Anda:\n\n` +
        `<blockquote>• <b>7 Hari — Rp10.000</b> (Via WA)\n` +
        `• <b>1 Bulan — Rp15.000</b> (Bisa QRIS Otomatis)\n` +
        `• <b>2 Bulan — Rp20.000</b> (Bisa QRIS Otomatis)\n` +
        `• <b>3 Bulan — Rp25.000</b> (Bisa QRIS Otomatis)\n` +
        `• <b>4 Bulan — Rp30.000</b> (Bisa QRIS Otomatis)\n` +
        `• 👑 <b>Permanen — Rp55.000</b> (Bisa QRIS Otomatis)</blockquote>\n\n` +
        `Silakan pilih metode pembayaran di bawah:`
    );

    const replyMarkup = {
        inline_keyboard: [
            [{ text: "💳 Bayar 1 Bulan - Rp15.000 (QRIS)", callback_data: "pay_1_bulan" }],
            [{ text: "💳 Bayar 2 Bulan - Rp20.000 (QRIS)", callback_data: "pay_2_bulan" }],
            [{ text: "💳 Bayar 3 Bulan - Rp25.000 (QRIS)", callback_data: "pay_3_bulan" }],
            [{ text: "💳 Bayar 4 Bulan - Rp30.000 (QRIS)", callback_data: "pay_4_bulan" }],
            [{ text: "👑 Bayar Permanen - Rp55.000 (QRIS)", callback_data: "pay_permanen" }],
            [{ text: "🛒 Beli via WhatsApp Owner", url: wa1m }],
            [{ text: "⬅️ Kembali ke Menu Utama", callback_data: "back_to_start" }]
        ]
    };

    await bot.sendMessage(chatId, text, { parse_mode: "HTML", reply_markup: replyMarkup });
}

bot.on('callback_query', async (callbackQuery) => {
    const msg = callbackQuery.message;
    const data = callbackQuery.data;
    const chatId = msg.chat.id;
    const messageId = msg.message_id;
    const userId = callbackQuery.from.id;
    const userFirstName = callbackQuery.from.first_name || "Buyer";
    const userUsername = callbackQuery.from.username ? `@${callbackQuery.from.username}` : "Tanpa Username";

    if (isFlooding(chatId)) return bot.answerCallbackQuery(callbackQuery.id, { text: "⚠️ Kebanyakan klik lu anj*ng!", show_alert: true });

    const banMin = checkBanStatus(chatId);
    if (banMin > 0) return bot.answerCallbackQuery(callbackQuery.id, { text: `⛔ LU MASIH DIBANNED ${banMin} MENIT LAGI ANJ*NG!`, show_alert: true });

    if (data === "show_pricing") return sendPricingMenu(chatId, messageId);
    if (data === "back_to_start" || data === "main_menu") { 
        delete userState[chatId]; 
        try { await bot.deleteMessage(chatId, messageId); } catch (e) {}
        return sendStartMenu(chatId, msg, messageId); 
    }

    if (data === "check_profile") {
        const user = db.users[userId];
        const sub = db.subscriptions[userId];
        const { token, statusInfo } = getUserSubscription(userId);
        let expiredDetail = "BOKEK (Nggak Ada)";
        
        if (sub && sub.expiryDate) {
            expiredDetail = new Date(sub.expiryDate).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });
        } else if (user && user.expired_at) {
            expiredDetail = user.expired_at === "PERMANENT" ? "Permanen Boss!" : user.expired_at.replace('T', ' ');
        }

        const profileText = 
            `👤 <b>PROFIL AKUN LO</b>\n\n` +
            `• <b>Nama:</b> ${escapeHTML(userFirstName)}\n` +
            `• <b>ID Telegram:</b> <code>${userId}</code>\n\n` +
            `🔑 <b>Status Dompet/Token:</b>\n` +
            `• <b>Token Aktif:</b> <code>${token || 'Kosong Melompong'}</code>\n` +
            `• <b>Status:</b> ${statusInfo}\n` +
            `• <b>Expired:</b> <code>${expiredDetail}</code>`;

        try { await bot.deleteMessage(chatId, messageId); } catch (e) {}
        return bot.sendMessage(chatId, profileText, { parse_mode: "HTML", reply_markup: { inline_keyboard: [[{ text: "🔙 Balik ke Menu", callback_data: "main_menu" }]] } });
    }

    if (data === "logout_token") {
        if (db.subscriptions[userId]) delete db.subscriptions[userId];
        if (db.users[userId]) {
            db.users[userId].active_token = null;
            db.users[userId].expired_at = null;
        }
        saveDatabase();
        userState[chatId] = {};
        await bot.answerCallbackQuery(callbackQuery.id, { text: "🚪 Berhasil logout token! Sesi dihapus.", show_alert: true });
        try { await bot.deleteMessage(chatId, messageId); } catch (e) {}
        return sendStartMenu(chatId, msg, messageId);
    }

    if (data === "owner_panel" || data === "admin_panel") {
        if (userId !== OWNER_TELEGRAM_ID && (!db.users[userId] || !db.users[userId].is_owner)) {
            return bot.answerCallbackQuery(callbackQuery.id, { text: "❌ Lu bukan owner babi!", show_alert: true });
        }
        try { await bot.deleteMessage(chatId, messageId); } catch (e) {}

        let totalUserCount = Object.keys(db.users).length;
        let totalSubCount = Object.keys(db.subscriptions).length;
        let estimasiKasir = totalSubCount * 15000;

        const panelText = (
            `👑🔥 <b>HAOMI_XML SULTAN OWNER PANEL</b> 🔥👑\n\n` +
            `Selamat datang di panel kontrol utama bot bosku!\n\n` +
            `<blockquote>📊 <b>STATISTIK SAAT INI:</b>\n` +
            `├ Total User Terdaftar: <b>${totalUserCount} Orang</b>\n` +
            `├ Total Sub Aktif: <b>${totalSubCount} Orang</b>\n` +
            `└ Estimasi Kasar Masuk: <b>Rp${estimasiKasir.toLocaleString('id-ID')}</b></blockquote>\n\n` +
            `Silakan pilih aksi manajemen bot di bawah ini:`
        );

        const replyMarkup = {
            inline_keyboard: [
                [{ text: "🔑 Buat Token Baru (/gen)", callback_data: "owner_gen_menu" }],
                [{ text: "📢 Broadcast Pesan Massal", callback_data: "owner_bcast_menu" }],
                [{ text: "⬅️ Kembali ke Menu Utama", callback_data: "main_menu" }]
            ]
        };

        return bot.sendMessage(chatId, panelText, { parse_mode: "HTML", reply_markup: replyMarkup });
    }

    if (data === "owner_gen_menu") {
        if (userId !== OWNER_TELEGRAM_ID) return;
        userState[chatId] = { step: "waiting_for_owner_gen_days" };
        try { await bot.deleteMessage(chatId, messageId); } catch (e) {}
        return bot.sendMessage(chatId, `🔑 <b>Generator Token MSH</b>\n\n<blockquote>Ketik jumlah hari masa aktif ke chat:</blockquote>`, { parse_mode: "HTML", reply_markup: { inline_keyboard: [[{ text: "❌ Batal", callback_data: "owner_panel" }]] } });
    }

    if (data === "owner_bcast_menu") {
        if (userId !== OWNER_TELEGRAM_ID) return;
        userState[chatId] = { step: "waiting_for_owner_bcast_msg" };
        try { await bot.deleteMessage(chatId, messageId); } catch (e) {}
        return bot.sendMessage(chatId, `📢 <b>Broadcast Pesan MSH</b>\n\n<blockquote>Ketik pesan broadcast ke chat:</blockquote>`, { parse_mode: "HTML", reply_markup: { inline_keyboard: [[{ text: "❌ Batal", callback_data: "owner_panel" }]] } });
    }

    if (data === "menu_send") {
        const { token, statusInfo } = getUserSubscription(userId);
        if (userId !== OWNER_TELEGRAM_ID && (!token || statusInfo === "Masa Aktif Habis")) {
            return bot.answerCallbackQuery(callbackQuery.id, { text: "⚠️ Masukin token MSH dulu anj*ng!", show_alert: true });
        }
        userState[chatId] = { step: "waiting_for_am_send_email" };
        try { await bot.deleteMessage(chatId, messageId); } catch (e) {}
        return bot.sendMessage(chatId, `📤 <b>AM Send Magic Link</b>\n\n<blockquote>Masukkan email target (Gmail):</blockquote>`, { parse_mode: "HTML", reply_markup: { inline_keyboard: [[{ text: "❌ Batal", callback_data: "back_to_menu" }]] } });
    }

    if (data === "menu_verif") {
        const { token, statusInfo } = getUserSubscription(userId);
        if (userId !== OWNER_TELEGRAM_ID && (!token || statusInfo === "Masa Aktif Habis")) {
            return bot.answerCallbackQuery(callbackQuery.id, { text: "⚠️ Masukin token MSH dulu anj*ng!", show_alert: true });
        }
        userState[chatId] = { step: "waiting_for_am_verif_email" };
        try { await bot.deleteMessage(chatId, messageId); } catch (e) {}
        return bot.sendMessage(chatId, `⚡ <b>AM Verifikasi Akun</b>\n\n<blockquote>Masukkan email target (Gmail):</blockquote>`, { parse_mode: "HTML", reply_markup: { inline_keyboard: [[{ text: "❌ Batal", callback_data: "back_to_menu" }]] } });
    }

    if (["pay_1_bulan", "pay_2_bulan", "pay_3_bulan", "pay_4_bulan", "pay_permanen"].includes(data)) {
        let packageDetails = {
            "pay_1_bulan": { name: "1 Bulan", days: 30, price: 15000 },
            "pay_2_bulan": { name: "2 Bulan", days: 60, price: 20000 },
            "pay_3_bulan": { name: "3 Bulan", days: 90, price: 25000 },
            "pay_4_bulan": { name: "4 Bulan", days: 120, price: 30000 },
            "pay_permanen": { name: "Permanen", days: 3650, price: 55000 }
        }[data];

        try { await bot.deleteMessage(chatId, messageId); } catch (e) {}

        const loadMsg = await animateLoading(chatId, `Membuat Deposit QRIS MSH (${packageDetails.name})...`);

        try {
            const generatedToken = generateComplexToken();
            
            const response = await axios.post(`${ENV_CONFIG.RAMASHOP_BASE_URL}/deposit/create`, {
                amount: packageDetails.price,
                method: "qris"
            }, {
                headers: {
                    "X-API-Key": ENV_CONFIG.RAMASHOP_API_KEY,
                    "Content-Type": "application/json"
                },
                timeout: 20000
            });

            try { await bot.deleteMessage(chatId, loadMsg.message_id); } catch (e) {}

            const resData = response.data;

            if (resData && resData.success === true && resData.data) {
                const depositData = resData.data;
                
                db.pendingInvoices[userId] = {
                    depositId: depositData.depositId,
                    tokenToActivate: generatedToken,
                    days: packageDetails.days,
                    packageName: packageDetails.name,
                    price: depositData.totalAmount || packageDetails.price
                };
                saveDatabase();

                let caption = `💳 <b>INVOICE QRIS MSH PAY</b> 💳\n\n` +
                    `<blockquote>📦 <b>Paket:</b> ${packageDetails.name}\n` +
                    `💵 <b>Nominal Unik:</b> <b>Rp${Number(depositData.totalAmount || packageDetails.price).toLocaleString('id-ID')}</b>\n` +
                    `📝 <i>(${resData.message || 'Silakan scan QRIS'})</i>\n` +
                    `🔑 <b>Token Jatah:</b> <code>${generatedToken}</code></blockquote>\n\n` +
                    `Scan QRIS di bawah ini untuk membayar:`;

                if (depositData.qrImage) {
                    await bot.sendPhoto(chatId, depositData.qrImage, {
                        caption: caption,
                        parse_mode: "HTML",
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: "✅ Cek Status Pembayaran", callback_data: "check_payment_status" }],
                                [{ text: "❌ Batal", callback_data: "back_to_start" }]
                            ]
                        }
                    });
                } else {
                    await bot.sendMessage(chatId, caption, {
                        parse_mode: "HTML",
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: "✅ Cek Status Pembayaran", callback_data: "check_payment_status" }],
                                [{ text: "❌ Batal", callback_data: "back_to_start" }]
                            ]
                        }
                    });
                }
            } else {
                let errorMsg = (resData && resData.error) || (resData && resData.message) || "Gagal memproses deposit dari server.";
                return bot.sendMessage(chatId, `⚠️ <b>Payment Error:</b>\n\n<blockquote>${escapeHTML(errorMsg)}</blockquote>`, { parse_mode: "HTML", reply_markup: { inline_keyboard: [[{ text: "⬅️ Kembali", callback_data: "show_pricing" }]] } });
            }

        } catch (error) {
            try { await bot.deleteMessage(chatId, loadMsg.message_id); } catch (e) {}
            let errDetail = error.response && error.response.data && error.response.data.error 
                ? error.response.data.error 
                : (error.response && error.response.data && error.response.data.message ? error.response.data.message : error.message);
            
            await bot.sendMessage(chatId, `⚠️ <b>Gagal Menghubungi Server Payment:</b>\n<code>${escapeHTML(errDetail)}</code>\n\n` + getOwnerRoastMsg(), { parse_mode: "HTML", reply_markup: { inline_keyboard: [[{ text: "⬅️ Kembali", callback_data: "show_pricing" }]] } });
        }
        return;
    }

    if (data === "check_payment_status") {
        const pending = db.pendingInvoices[userId];
        if (!pending) {
            return bot.answerCallbackQuery(callbackQuery.id, { text: "⚠️ Tidak ada tagihan aktif. Buat pesanan baru dulu.", show_alert: true });
        }

        const loadMsg = await animateLoading(chatId, "Mengecek Status Deposit...");

        try {
            const response = await axios.get(`${ENV_CONFIG.RAMASHOP_BASE_URL}/deposit/status/${pending.depositId}`, {
                headers: {
                    "X-API-Key": ENV_CONFIG.RAMASHOP_API_KEY,
                    "Content-Type": "application/json"
                },
                timeout: 20000
            });

            try { await bot.deleteMessage(chatId, loadMsg.message_id); } catch (e) {}

            const resData = response.data;
            const statusResult = resData.data ? resData.data.status : null;

            if (statusResult === "success") {
                const expiryTime = Date.now() + (pending.days * 24 * 60 * 60 * 1000);
                
                db.subscriptions[userId] = { 
                    token: pending.tokenToActivate, 
                    expiryDate: expiryTime, 
                    warningSent: false, 
                    duration: pending.packageName,
                    username: userUsername,
                    name: userFirstName
                };
                
                delete db.pendingInvoices[userId];
                saveDatabase();

                bot.sendMessage(OWNER_TELEGRAM_ID, `💰 <b>HAOMI_XML CASH: PEMBAYARAN LUNAS!</b> 💰\n\n<blockquote>👤 <b>Buyer:</b> ${escapeHTML(userFirstName)} (${userUsername})\n🆔 <b>ID:</b> <code>${userId}</code>\n📦 <b>Paket:</b> ${pending.packageName}\n🔑 <b>Token:</b> <code>${pending.tokenToActivate}</code></blockquote>`, { parse_mode: "HTML" });

                await bot.sendMessage(chatId, 
                    `✅ <b>Pembayaran Berhasil Dikonfirmasi & Lunas!</b>\n\n` +
                    `👑🔥 <b>SELAMAT NIKMATI AKSES VIP MSH!</b> 🔥👑\n\n` +
                    `🔑 <b>Token Akses Anda:</b> <code>${pending.tokenToActivate}</code>\n\nMembuka menu utama bot...`, 
                    { parse_mode: "HTML" }
                );

                setTimeout(() => sendStartMenu(chatId, msg), 2500);

            } else if (statusResult === "already") {
                await bot.answerCallbackQuery(callbackQuery.id, { text: "⚠️ Deposit ini sudah pernah diproses sebelumnya!", show_alert: true });
            } else {
                await bot.answerCallbackQuery(callbackQuery.id, { text: "⏳ Pembayaran masih PENDING. Segera selesaikan transfer QRIS!", show_alert: true });
            }

        } catch (error) {
            try { await bot.deleteMessage(chatId, loadMsg.message_id); } catch (e) {}
            await bot.answerCallbackQuery(callbackQuery.id, { text: "❌ Gagal mengecek status pembayaran ke server.", show_alert: true });
        }
        return;
    }

    if (data === "free_trial") {
        const now = Date.now();
        const oneWeekMs = 7 * 24 * 60 * 60 * 1000; 
        const lastTrialTime = db.trialCooldowns[userId] || 0;

        if (now - lastTrialTime < oneWeekMs) {
            const remainingDays = Math.ceil((oneWeekMs - (now - lastTrialTime)) / (1000 * 60 * 60 * 24));
            return bot.answerCallbackQuery(callbackQuery.id, { text: `⛔ DIH NGEMIS TERUS! Tunggu ${remainingDays} hari lagi kalau tetep maksa!`, show_alert: true });
        }

        db.trialCooldowns[userId] = now; 
        const trialToken = `MSH-TRL-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
        db.subscriptions[userId] = { 
            token: trialToken, 
            expiryDate: now + (5 * 60 * 1000), 
            warningSent: false, 
            duration: "Trial",
            username: userUsername,
            name: userFirstName
        };
        saveDatabase();

        await bot.answerCallbackQuery(callbackQuery.id, { text: "🎉 Uji coba 5 menit berhasil diaktifkan!", show_alert: true });
        try { await bot.deleteMessage(chatId, messageId); } catch (e) {}

        await bot.sendMessage(chatId, `⏱️ <b>UJI COBA 5 MENIT DIAKTIFKAN!</b>\n\n<blockquote>🔑 Token Sementara: <code>${trialToken}</code>\n⏳ Masa aktif: <b>5 Menit</b>.</blockquote>`, { parse_mode: "HTML" });

        setTimeout(() => {
            if (db.subscriptions[userId] && db.subscriptions[userId].duration === "Trial") {
                delete db.subscriptions[userId];
                saveDatabase();
                bot.sendMessage(chatId, "⏰ <b>Uji Coba 5 Menit Habis!</b> Akses ditutup. Silakan beli paket resmi.", { parse_mode: "HTML" });
            }
        }, 5 * 60 * 1000);

        setTimeout(() => sendStartMenu(chatId, msg), 1500);
        return;
    }

    if (data === "input_token_menu") {
        userState[chatId] = { step: "waiting_for_rental_token" };
        try { await bot.deleteMessage(chatId, messageId); } catch (e) {}
        return bot.sendMessage(chatId, `🔑 <b>Masukkan Token Akses MSH / Admin Anda:</b>\n\n<blockquote>Format: <code>MSH-XXXX-XXXX-XXXX</code> atau Secret Key Owner.</blockquote>`, { parse_mode: "HTML", reply_markup: { inline_keyboard: [[{ text: "⬅️ Kembali", callback_data: "back_to_start" }]] } });
    }

    await bot.answerCallbackQuery(callbackQuery.id);
});

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = msg.text;
    const userName = msg.from.first_name || "Gembel Tanpa Nama";
    const userUsername = msg.from.username ? `@${msg.from.username}` : "Tanpa Username";

    if (!text || text.startsWith('/')) return;
    
    if (isFlooding(chatId)) return bot.sendMessage(chatId, `⛔ <b>MSH ANTI-FLOOD: KEBANYAKAN BACOT LU ANJ*NG!</b>`, { parse_mode: "HTML" });

    const banMin = checkBanStatus(chatId);
    if (banMin > 0) return bot.sendMessage(chatId, `⛔ <b>MSH BANNED: Sisa ${banMin} menit lagi!</b>`, { parse_mode: "HTML" });

    const currentState = userState[chatId] || {};

    if (currentState.step === "waiting_for_owner_gen_days" && userId === OWNER_TELEGRAM_ID) {
        delete userState[chatId];
        const days = text.trim();
        if (isNaN(days)) return bot.sendMessage(chatId, `❌ Masukin angka hari yang bener babi!`);
        const complexToken = generateComplexToken();
        db.tokens[complexToken] = { duration_days: Number(days), created_at: new Date().toISOString() };
        saveDatabase();
        return bot.sendMessage(chatId, `✅ <b>Token Berhasil Dibuat!</b>\n\n<blockquote>⏱️ Durasi: <b>${days} Hari</b>\n🔑 Token: <code>${complexToken}</code></blockquote>`, { parse_mode: "HTML", reply_markup: { inline_keyboard: [[{ text: "👑 Panel Owner", callback_data: "owner_panel" }]] } });
    }

    if (currentState.step === "waiting_for_owner_bcast_msg" && userId === OWNER_TELEGRAM_ID) {
        delete userState[chatId];
        const bcastMsg = text.trim();
        let count = 0;
        for (const id in db.users) {
            bot.sendMessage(id, `📢 <b>PENGUMUMAN DARI HAOMI_XML OWNER:</b>\n\n<blockquote>${escapeHTML(bcastMsg)}</blockquote>`, { parse_mode: "HTML" }).catch(()=>{});
            count++;
        }
        return bot.sendMessage(chatId, `✅ Broadcast sukses dikirim ke <b>${count}</b> user terdaftar!`, { parse_mode: "HTML", reply_markup: { inline_keyboard: [[{ text: "👑 Panel Owner", callback_data: "owner_panel" }]] } });
    }

    if (currentState.step === "waiting_for_rental_token" || text.startsWith("MSH-") || text === OWNER_SECRET_KEY) {
        if (currentState.step === "waiting_for_rental_token") delete userState[chatId];
        const inputToken = text.trim();

        if (inputToken === OWNER_SECRET_KEY || userId === OWNER_TELEGRAM_ID) {
            if (!db.users[userId]) db.users[userId] = {};
            db.users[userId].is_owner = true;
            saveDatabase();
            return bot.sendMessage(chatId, "🎉 *Hormat Gerak! Verifikasi Admin Sukses!*\nSiap melayani Tuan.", { parse_mode: "Markdown", reply_markup: { inline_keyboard: [[{ text: "👑 [MASUK PANEL OWNER]", callback_data: "owner_panel" }]] } });
        }

        const tokenRegex = /^MSH-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/i;
        const isTrialToken = inputToken.startsWith("MSH-TRL-");

        if (!tokenRegex.test(inputToken) && !isTrialToken) {
            const previousWrong = lastWrongTokens.get(userId);
            let selectedToxicMsg = (previousWrong === inputToken) ? getSpamToxicMsg() : getRandomToxicMsg();
            lastWrongTokens.set(userId, inputToken);
            return bot.sendMessage(chatId, `❌ <b>Token MSH Ditolak!</b>\n<blockquote>${selectedToxicMsg}</blockquote>`, { parse_mode: "HTML" });
        }

        const expiryTime = Date.now() + (30 * 24 * 60 * 60 * 1000); 
        db.subscriptions[userId] = { 
            token: inputToken, 
            expiryDate: expiryTime, 
            warningSent: false, 
            duration: "Custom Token",
            username: userUsername,
            name: userName
        };
        saveDatabase();

        bot.sendMessage(chatId, `🎉 *ANJAY KELAS!* Token \`${inputToken}\` lu valid boss!\n\nSelamat menikmati fitur VIP tanpa batas. Ketik /start buat masuk VVIP Lounge!`, { parse_mode: "Markdown" });
        return;
    }

    const { token, statusInfo } = getUserSubscription(userId);
    if (!token || statusInfo === "Masa Aktif Habis") {
        return bot.sendMessage(chatId, "⛔ *WEY KERE!* Akses ditolak. Lo belum punya tiket VIP. Ketik /start terus pilih mau ngemis trial atau beli tiket resmi.");
    }

    if (text.includes('@') && text.includes('.')) {
        global.userEmailSession = global.userEmailSession || {};
        global.userEmailSession[userId] = text.trim();

        const loadMsg = await animateLoading(chatId, "Mengirim Magic Link MSH...");
        try {
            const response = await axios.get(`${ENV_CONFIG.HAOMI_API_BASE}/api/am?action=send&apikey=${ENV_CONFIG.HAOMI_API_KEY}&email=${encodeURIComponent(text.trim())}`, { timeout: 20000 });
            const cleanData = sanitizeResponse(response.data);

            try { await bot.deleteMessage(chatId, loadMsg.message_id); } catch (e) {}

            if (cleanData.status === true || cleanData.success === true || (typeof cleanData === 'string' && cleanData.includes('true'))) {
                await bot.sendMessage(chatId, `✅ <b>Magic Link Terkirim!</b>\n\n<blockquote>Silakan cek email Gmail lo, lalu kirim balik <b>Magic Link (URL)</b> ke chat ini untuk aktivasi otomatis.</blockquote>`, { parse_mode: "HTML" });
            } else {
                await bot.sendMessage(chatId, `❌ <b>Gagal Kirim Email:</b>\n\n<blockquote><code>${escapeHTML(JSON.stringify(cleanData, null, 2))}</code></blockquote>`, { parse_mode: "HTML" });
            }
        } catch (error) {
            try { await bot.deleteMessage(chatId, loadMsg.message_id); } catch (e) {}
            await bot.sendMessage(chatId, getOwnerRoastMsg(), { parse_mode: "HTML" });
        }
        return;
    }

    if (text.startsWith('http://') || text.startsWith('https://')) {
        global.userEmailSession = global.userEmailSession || {};
        const email = global.userEmailSession[userId];

        if (!email) {
            return bot.sendMessage(chatId, "⚠️ Heh! Kirim Gmail lo dulu sebelum ngirim Magic Link. Gimana sih.");
        }

        const loadMsg = await animateLoading(chatId, "Memproses Aktivasi Alight Motion...");
        try {
            const response = await axios.get(`${ENV_CONFIG.HAOMI_API_BASE}/api/am?action=verif&apikey=${ENV_CONFIG.HAOMI_API_KEY}&email=${encodeURIComponent(email)}&url=${encodeURIComponent(text.trim())}`, { timeout: 20000 });
            const cleanData = sanitizeResponse(response.data);

            try { await bot.deleteMessage(chatId, loadMsg.message_id); } catch (e) {}

            if (cleanData.status === true || cleanData.success === true) {
                await bot.sendMessage(chatId, `🎉 <b>SAH! AKUN LO UDAH PREMIUM!</b>\n\n<blockquote><code>${escapeHTML(JSON.stringify(cleanData, null, 2))}</code></blockquote>\n\nSantai aja boss, sekarang lu bebas pake Alight Motion sepuasnya.`, { parse_mode: "HTML" });
                delete global.userEmailSession[userId];
            } else {
                await bot.sendMessage(chatId, `❌ <b>Gagal Memproses Verifikasi:</b>\n\n<blockquote><code>${escapeHTML(JSON.stringify(cleanData, null, 2))}</code></blockquote>`, { parse_mode: "HTML" });
            }
        } catch (error) {
            try { await bot.deleteMessage(chatId, loadMsg.message_id); } catch (e) {}
            await bot.sendMessage(chatId, getOwnerRoastMsg(), { parse_mode: "HTML" });
        }
        return;
    }

    bot.sendMessage(chatId, "💡 *Gagal Paham?*\nKalo lo udah di dalem VVIP Lounge, lo cukup kirim **Email Gmail Alight Motion** buat mulai aktivasi.");
});

bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    if (isFlooding(chatId)) return bot.sendMessage(chatId, `⛔ <b>MSH SECURITY: KEBANYAKAN BACOT LU!</b>`, { parse_mode: "HTML" });

    const banMin = checkBanStatus(chatId);
    if (banMin > 0) return bot.sendMessage(chatId, `⛔ <b>MSH BANNED: Sisa ${banMin} menit!</b>`, { parse_mode: "HTML" });
    
    delete userState[chatId];
    sendStartMenu(chatId, msg);
});

bot.onText(/\/cek/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const { token, statusInfo } = getUserSubscription(userId);

    if (userId === OWNER_TELEGRAM_ID) {
        return bot.sendMessage(chatId, `👑 <b>INFO AKUN OWNER:</b>\n\n<blockquote>Akses Anda sebagai Owner bersifat Permanen! ☕</blockquote>`, { parse_mode: "HTML" });
    }
    if (token && statusInfo !== "Masa Aktif Habis") {
        bot.sendMessage(chatId, `⏱️ <b>MSH TOKEN INFO:</b>\n\n<blockquote>🔑 Token: <code>${token}</code>\n⏳ Sisa Waktu: <b>${statusInfo}</b> lagi.</blockquote>`, { parse_mode: "HTML" });
    } else {
        bot.sendMessage(chatId, `🤡 Belum sewa token MSH! Beli dulu sono.`, { parse_mode: "HTML" });
    }
});

console.log("Bot Telegram VVIP MSH Store (Token Baru Terpasang & Endpoints Fixed) Berjalan...");
