const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const fs = require('fs');

// ==========================================
// 1. KONFIGURASI SISTEM & API
// ==========================================
const CONFIG = {
    HAOMI_API: {
        BASE_URL: "https://restapidhan.vercel.app",
        KEY: "dravndesamuel"
    },
    RAMASHOP: {
        BASE_URL: "https://ramashop.my.id/api/public",
        API_KEY: "rg_ea029ad8b5262570682db8bbc92a43"
    },
    BOT: {
        TOKEN: "8598004392:AAHx8lF9kcDoHDk4rhhmfRjG04OPPjio9fU",
        SECRET_KEY: "HAOMI_XML",
        WHATSAPP_OWNER: "https://Wa.me/+6282231669053"
    },
    DB_FILE: './database.json'
};

const bot = new TelegramBot(CONFIG.BOT.TOKEN, { polling: true });

// ==========================================
// 2. DATABASE SYSTEM (JSON)
// ==========================================
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
        if (fs.existsSync(CONFIG.DB_FILE)) {
            const data = fs.readFileSync(CONFIG.DB_FILE, 'utf8');
            const parsed = JSON.parse(data);
            db = { ...db, ...parsed };
            console.log("📂 [DB] Database (Bot Setres😹) berhasil dimuat!");
        } else {
            saveDatabase();
            console.log("📂 [DB] File database.json baru berhasil dibuat!");
        }
    } catch (e) {
        console.error("❌ [DB ERROR] Gagal memuat database:", e);
    }
}

function saveDatabase() {
    try {
        fs.writeFileSync(CONFIG.DB_FILE, JSON.stringify(db, null, 4), 'utf8');
    } catch (e) {
        console.error("❌ [DB ERROR] Gagal menyimpan database:", e);
    }
}

loadDatabase();

// ==========================================
// 3. STATE & CACHE MANAGEMENT
// ==========================================
const userState = {};
const lastWrongTokens = new Map();
const floodControl = new Map();

// ==========================================
// 4. KUMPULAN BACOTAN TOXIC (BRUTAL MODE)
// ==========================================
const toxicMessages = [
    "Heh gembel! 🤬 Lu ngetik token pake jempol kaki ya babi? Hancur berantakan! Kalo ga punya duit mending lu mulung sana, gausah so-soan nyoba bot premium! 🖕",
    "Tololnya kebangetan anj*ng! 🤡 Token salah masih lu paksa tekan! Minta dislepet usus lu ya bangsat?! Ketik yang bener napa as*! 💩",
    "Muka lu doang yang burik, otak lu juga ikutan error ya anj*ng! 🖕 Kalo belum beli token minggir sana, menuh-menuhin server (Bot Setres😹) aja lu sampah masyarakat! 🗑️",
    "Otak lu isinya ampas tahu ya b*rengsat? 🧠 Ampun deh dapet user SDM rendah gini. Benerin ketikan lu tolol, jangan bikin bot emosi! 🤬",
    "Miskin, gobl*k, batu lagi! 🫵 Dibilangin salah malah nyolot lu anj*ng. Kalo ga punya uang gausah mimpi pake fitur VVIP bangsat! 🤡"
];

const spamToxicMessages = [
    "EH BABI! 🐷 LU NGETIK TOKEN YANG SAMA MULU DARI TADI! SETRES LU YA ANJ*NG? Kalo salah ya salah bangsat, jangan ngarep keajaiban lu yatim! 🤬🖕",
    "Fix SDM Rendah lu anj*ng! 🧠 Udah dikasih tau salah, masih aja dipencet lagi token tai yang sama. Emak lu ngidam apa sih dulu pas hamil lu, kok begonya permanen?! 🤡",
    "Anj*ng batu banget lu dibilangin! 🤬 Jelas-jelas tokennya KADALUWARSA/SALAH bangsat, masih lu masukin mulu! Otak lu ditaro di selangkangan ya?! 🫵💩"
];

const ownerRoastMessages = [
    "<blockquote>💥 <b>SERVER KONT*L DOWN!</b> 💥\nWoi babi, ini murni servernya yang ampas! Heh (Owner Setres😹) 🫵, ngurus server kok kayak ngurus panti asuhan, gembel banget anj*ng! Benerin gih bangsat, malu-maluin aja jualan server kentang! 🤬🖕</blockquote>\n<i>Buat lu bro, sabar yak botnya lagi ayan.</i>",
    "<blockquote>🔥 <b>API JEBOL ANJ*NG!</b> 🔥\nIni bukan lu yang salah bro, murni (Owner Setres😹) yang tolol! Woi Owner, duit masuk doang tapi maintenance kaga pernah lu ya b*rengsat! Bangun woi benerin codingan lu yang sekelas tai ayam itu! 💩🔨</blockquote>\n<i>Tungguin bentar yak, biar disapu dulu servernya.</i>",
    "<blockquote>💀 <b>SISTEM MATI SURI BANGSAT!</b> 💀\n(Owner Setres😹) lagi open BO apa gimna nih?! Server error malah dibiarin anj*ng! Woi (Owner Setres😹), perbaiki cepet gausah males-malesan lu babi! 🤬</blockquote>\n<i>Maap bro, ownernya lagi tolol hari ini.</i>"
];

function getRandomToxicMsg() { return toxicMessages[Math.floor(Math.random() * toxicMessages.length)]; }
function getSpamToxicMsg() { return spamToxicMessages[Math.floor(Math.random() * spamToxicMessages.length)]; }
function getOwnerRoastMsg() { return ownerRoastMessages[Math.floor(Math.random() * ownerRoastMessages.length)]; }

// ==========================================
// 5. HELPER FUNCTIONS
// ==========================================
function escapeHTML(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function generateComplexToken() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const getBlock = (len) => Array.from({length: len}, () => chars.charAt(Math.floor(Math.random() * chars.length))).join('');
    return `STRES-${getBlock(4)}-${getBlock(4)}-${getBlock(4)}`;
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
    if (db.users[chatId] && db.users[chatId].is_owner) return false; 
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
        data.creator = "(Bot Setres😹)";
    }
    return data;
}

function getUserSubscription(userId) {
    const user = db.users[userId];
    const sub = db.subscriptions[userId];

    if (user && user.is_owner) {
        return { token: "ADMIN-OWNER", statusInfo: "Akses Dewa (Owner Setres😹)" };
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

    return { token: null, statusInfo: "Belum Aktif (Miskin)" };
}

async function animateLoading(chatId, baseText) {
    const frames = [
        `🔄 <b>(Bot Setres😹): ${baseText}</b>\n<code>[ ░░░░░░░░░░ ] 0%</code> ⠋ <i>Mulai manasin server...</i>`,
        `⏳ <b>(Bot Setres😹): ${baseText}</b>\n<code>[ ▓▓▓░░░░░░░ ] 30%</code> ⠙ <i>Nyari jalan tikus...</i>`,
        `⏳ <b>(Bot Setres😹): ${baseText}</b>\n<code>[ ▓▓▓▓▓▓░░░░ ] 60%</code> ⠹ <i>Nyolong data server...</i>`,
        `⚡ <b>(Bot Setres😹): ${baseText}</b>\n<code>[ ▓▓▓▓▓▓▓▓▓░ ] 90%</code> ⠼ <i>Bentar babi, sabar...</i>`,
        `✅ <b>Connected bangsat!</b>\n<code>[ ▓▓▓▓▓▓▓▓▓▓ ] 100%</code> ⠧ <i>Berhasil anj*ng!</i>`
    ];
    let msg = await bot.sendMessage(chatId, frames[0], { parse_mode: "HTML" });
    for (let i = 1; i < frames.length; i++) {
        await new Promise(r => setTimeout(r, 700)); 
        await bot.editMessageText(frames[i], { chat_id: chatId, message_id: msg.message_id, parse_mode: "HTML" });
    }
    return msg; 
}

// ==========================================
// 6. TAMPILAN MENU (TANPA GAMBAR, MEWAH TAPI BRUTAL)
// ==========================================
async function sendStartMenu(chatId, msgObj, messageId = null) {
    if (messageId) {
        try { await bot.deleteMessage(chatId, messageId); } catch (e) {}
    }

    const userId = msgObj.from.id;
    const firstName = msgObj.from.first_name || "Gembel";
    const lastName = msgObj.from.last_name || "";
    const fullName = escapeHTML(`${firstName} ${lastName}`.trim());
    const username = msgObj.from.username ? `@${escapeHTML(msgObj.from.username)}` : "Tanpa Username";

    if (!db.users[userId]) {
        db.users[userId] = {
            username: username,
            first_name: firstName,
            active_token: null,
            expired_at: null,
            is_owner: false,
            last_trial_at: null,
            joined_at: new Date().toISOString()
        };
        saveDatabase();
    }

    const { token, statusInfo } = getUserSubscription(userId);
    const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const isOwner = db.users[userId].is_owner;

    // MENU USER AKTIF ATAU OWNER
    if (token && statusInfo !== "Belum Aktif (Miskin)" && statusInfo !== "Masa Aktif Habis") {
        const activeMenuText = 
            `┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓\n` +
            `   💎 <b>(Bot Setres😹) VVIP LOUNGE</b> 💎\n` +
            `┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛\n\n` +
            `Welcome back Boss <b>${fullName}</b>! 🫡\n` +
            `🕒 Server Time: <code>${nowStr}</code>\n\n` +
            `╭─[ 🛡️ <b>STATUS VIP LO</b> ]\n` +
            `│ 🔑 Token: <code>${token}</code>\n` +
            `│ ⏳ Sisa: <b>${statusInfo}</b>\n` +
            `╰──────────────────────────────\n\n` +
            `<blockquote>📋 <b>CARA AKTIVASI (OTOMATIS API):</b>\n` +
            `1️⃣ Kirim email <b>Gmail</b> lo ke chat ini.\n` +
            `2️⃣ Tunggu (Bot Setres😹) ngirim magic link.\n` +
            `3️⃣ Kirim balik <b>Magic Link (URL)</b> ke mari!</blockquote>\n\n` +
            `👇 <i>Kirim email lo sekarang boss:</i>`;

        let keyboardRows = [
            [{ text: "📤 AM Send Email", callback_data: "menu_send" }],
            [{ text: "⚡ AM Verif Akun", callback_data: "menu_verif" }],
            [{ text: "💎 Beli Token Lagi (QRIS)", callback_data: "show_pricing" }],
            [{ text: "ℹ️ Cek Profil & Token Lo", callback_data: "check_profile" }],
            [{ text: "🚪 Logout / Ganti Token", callback_data: "logout_token" }]
        ];

        if (isOwner) {
            keyboardRows.push([{ text: "👑 Buka Panel Dewa (Owner Setres😹)", callback_data: "owner_panel" }]);
        }

        keyboardRows.push([{ text: "👨‍💻 Hubungi (Owner Setres😹) 😹", url: CONFIG.BOT.WHATSAPP_OWNER }]);

        return bot.sendMessage(chatId, activeMenuText, { parse_mode: "HTML", reply_markup: { inline_keyboard: keyboardRows } });
    }

    // MENU GEMBEL / BELUM PUNYA TOKEN
    const captionText = 
        `┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓\n` +
        `   ☠️ <b>(Bot Setres😹) VVIP LOUNGE</b> ☠️\n` +
        `┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛\n\n` +
        `Woi <b>${fullName}</b>, gembel nyasar darimana lu babi?! 🖕\n` +
        `🕒 Waktu Server: <code>${nowStr}</code>\n\n` +
        `╭─[ 🪦 <b>STATUS KEMISKINAN LO</b> ]\n` +
        `│ 💀 Kasta: <b>SAMPAH MASYARAKAT</b>\n` +
        `│ 💳 Token: <i>Kagak Punya Anj*ng!</i>\n` +
        `╰──────────────────────────────\n\n` +
        `<blockquote>⚠️ <b>DENGERIN KUPING LU PAKE BABI!</b>\n` +
        `Ini server VVIP mewah, bukan tempat panti asuhan! Kalo lu miskin, mending minggir sebelum gw injek-injek harga diri lu! QRIS udah disiapin, bayar sekarang atau enyah dari muka bumi! 🤬🖕</blockquote>\n\n` +
        `Pilih menu di bawah kalo lu ngerasa punya duit:`;

    let keyboardRows = [
        [{ text: "⏱️ Uji Coba 5 Menit (Menu Fakir Miskin)", callback_data: "free_trial" }],
        [{ text: "💎 Beli Token (FULL QRIS OTOMATIS)", callback_data: "show_pricing" }],
        [{ text: "🔑 Masukin Token / Secret Key Owner", callback_data: "input_token_menu" }]
    ];

    keyboardRows.push([{ text: "👨‍💻 Chat (Owner Setres😹)", url: CONFIG.BOT.WHATSAPP_OWNER }]);

    await bot.sendMessage(chatId, captionText, { parse_mode: "HTML", reply_markup: { inline_keyboard: keyboardRows } });
}

async function sendPricingMenu(chatId, messageId = null) {
    if (messageId) {
        try { await bot.deleteMessage(chatId, messageId); } catch (e) {}
    }

    const text = (
        `┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓\n` +
        `   💸 <b>DAFTAR HARGA VIP AM (Bot Setres😹)</b> 💸\n` +
        `┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛\n\n` +
        `Pilih durasi paket sesuai kapasitas dompet lu babi! Semua transaksi <b>FULL OTOMATIS</b> pake QRIS. Gausah chat owner kalo cuma nanya doang!\n\n` +
        `╭─[ 🛒 <b>PAKET TERSEDIA</b> ]\n` +
        `│ • <b>7 Hari</b>   — Rp 10.000\n` +
        `│ • <b>1 Bulan</b>  — Rp 15.000\n` +
        `│ • <b>2 Bulan</b>  — Rp 20.000\n` +
        `│ • <b>3 Bulan</b>  — Rp 25.000\n` +
        `│ • <b>4 Bulan</b>  — Rp 30.000\n` +
        `│ • 👑 <b>Permanen</b> — Rp 55.000\n` +
        `╰──────────────────────────────\n\n` +
        `<blockquote>Jangan banyak mikir! Silakan pilih durasi biling lo di bawah babi:</blockquote>`
    );

    const replyMarkup = {
        inline_keyboard: [
            [{ text: "💳 Bayar 7 Hari - Rp 10.000 (QRIS)", callback_data: "pay_7_hari" }],
            [{ text: "💳 Bayar 1 Bulan - Rp 15.000 (QRIS)", callback_data: "pay_1_bulan" }],
            [{ text: "💳 Bayar 2 Bulan - Rp 20.000 (QRIS)", callback_data: "pay_2_bulan" }],
            [{ text: "💳 Bayar 3 Bulan - Rp 25.000 (QRIS)", callback_data: "pay_3_bulan" }],
            [{ text: "💳 Bayar 4 Bulan - Rp 30.000 (QRIS)", callback_data: "pay_4_bulan" }],
            [{ text: "👑 Bayar Permanen - Rp 55.000 (QRIS)", callback_data: "pay_permanen" }],
            [{ text: "⬅️ Balik ke Menu Utama Babi", callback_data: "back_to_start" }]
        ]
    };

    await bot.sendMessage(chatId, text, { parse_mode: "HTML", reply_markup: replyMarkup });
}

// ==========================================
// 7. CALLBACK QUERY HANDLER
// ==========================================
bot.on('callback_query', async (callbackQuery) => {
    const msg = callbackQuery.message;
    const data = callbackQuery.data;
    const chatId = msg.chat.id;
    const messageId = msg.message_id;
    const userId = callbackQuery.from.id;
    const userFirstName = callbackQuery.from.first_name || "Gembel";
    const userUsername = callbackQuery.from.username ? `@${callbackQuery.from.username}` : "Tanpa Username";

    if (isFlooding(chatId)) return bot.answerCallbackQuery(callbackQuery.id, { text: "⚠️ Kebanyakan klik lu babi! Diem anj*ng!", show_alert: true });

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
        let expiredDetail = "BOKEK (Nggak Ada Miskin)";
        
        if (sub && sub.expiryDate) {
            expiredDetail = new Date(sub.expiryDate).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });
        } else if (user && user.expired_at) {
            expiredDetail = user.expired_at === "PERMANENT" ? "Permanen Boss!" : user.expired_at.replace('T', ' ');
        }

        const profileText = 
            `┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓\n` +
            `   👤 <b>PROFIL AKUN GEMBEL LO</b>\n` +
            `┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛\n\n` +
            `╭─[ 📝 <b>DATA DIRI LO</b> ]\n` +
            `│ • <b>Nama:</b> ${escapeHTML(userFirstName)}\n` +
            `│ • <b>ID Telegram:</b> <code>${userId}</code>\n` +
            `╰──────────────────────────────\n\n` +
            `╭─[ 🔑 <b>STATUS DOMPET / TOKEN</b> ]\n` +
            `│ • <b>Token Aktif:</b> <code>${token || 'Kosong Melompong Tai'}</code>\n` +
            `│ • <b>Status:</b> ${statusInfo}\n` +
            `│ • <b>Expired:</b> <code>${expiredDetail}</code>\n` +
            `╰──────────────────────────────`;

        try { await bot.deleteMessage(chatId, messageId); } catch (e) {}
        return bot.sendMessage(chatId, profileText, { parse_mode: "HTML", reply_markup: { inline_keyboard: [[{ text: "🔙 Balik ke Menu", callback_data: "main_menu" }]] } });
    }

    if (data === "logout_token") {
        if (db.subscriptions[userId]) delete db.subscriptions[userId];
        if (db.users[userId]) {
            db.users[userId].active_token = null;
            db.users[userId].expired_at = null;
            db.users[userId].is_owner = false; 
        }
        saveDatabase();
        userState[chatId] = {};
        await bot.answerCallbackQuery(callbackQuery.id, { text: "🚪 Berhasil logout! Jadi gembel lagi lo sekarang babi.", show_alert: true });
        try { await bot.deleteMessage(chatId, messageId); } catch (e) {}
        return sendStartMenu(chatId, msg, messageId);
    }

    // PANEL OWNER
    if (data === "owner_panel" || data === "admin_panel") {
        if (!db.users[userId] || !db.users[userId].is_owner) {
            return bot.answerCallbackQuery(callbackQuery.id, { text: "❌ SIAPA LU BABI?! Ngaku-ngaku owner! Masukin secret key dulu gembel anj*ng!", show_alert: true });
        }
        try { await bot.deleteMessage(chatId, messageId); } catch (e) {}

        let totalUserCount = Object.keys(db.users).length;
        let totalSubCount = Object.keys(db.subscriptions).length;
        let estimasiKasir = totalSubCount * 15000;

        const panelText = (
            `┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓\n` +
            `   👑 <b>(Owner Setres😹) CONTROL PANEL</b> 👑\n` +
            `┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛\n\n` +
            `Selamat datang di singgasana dewa bosku!\n\n` +
            `╭─[ 📊 <b>STATISTIK SERVER SAAT INI</b> ]\n` +
            `│ ├ Total Cecenguk: <b>${totalUserCount} Orang</b>\n` +
            `│ ├ Total Sub Aktif: <b>${totalSubCount} Orang</b>\n` +
            `│ └ Estimasi Kasar Masuk: <b>Rp ${estimasiKasir.toLocaleString('id-ID')}</b>\n` +
            `╰──────────────────────────────\n\n` +
            `<blockquote>Silakan pilih aksi lu babi:</blockquote>`
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
        if (!db.users[userId].is_owner) return bot.answerCallbackQuery(callbackQuery.id, { text: "Minggir lu miskin!", show_alert: true });
        userState[chatId] = { step: "waiting_for_owner_gen_days" };
        try { await bot.deleteMessage(chatId, messageId); } catch (e) {}
        return bot.sendMessage(chatId, `┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓\n   🔑 <b>GENERATOR TOKEN VIP</b>\n┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛\n\n<blockquote>Ketik jumlah hari masa aktif ke chat:</blockquote>`, { parse_mode: "HTML", reply_markup: { inline_keyboard: [[{ text: "❌ Batal", callback_data: "owner_panel" }]] } });
    }

    if (data === "owner_bcast_menu") {
        if (!db.users[userId].is_owner) return bot.answerCallbackQuery(callbackQuery.id, { text: "Minggir lu miskin!", show_alert: true });
        userState[chatId] = { step: "waiting_for_owner_bcast_msg" };
        try { await bot.deleteMessage(chatId, messageId); } catch (e) {}
        return bot.sendMessage(chatId, `┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓\n   📢 <b>BROADCAST PESAN MASSAL</b>\n┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛\n\n<blockquote>Ketik pesan broadcast ke chat lu babi:</blockquote>`, { parse_mode: "HTML", reply_markup: { inline_keyboard: [[{ text: "❌ Batal", callback_data: "owner_panel" }]] } });
    }

    if (data === "menu_send") {
        const { token, statusInfo } = getUserSubscription(userId);
        if (!token || statusInfo.includes("Miskin") || statusInfo === "Masa Aktif Habis") {
            return bot.answerCallbackQuery(callbackQuery.id, { text: "⚠️ Masukin token (Bot Setres😹) dulu anj*ng miskin!", show_alert: true });
        }
        userState[chatId] = { step: "waiting_for_am_send_email" };
        try { await bot.deleteMessage(chatId, messageId); } catch (e) {}
        return bot.sendMessage(chatId, `┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓\n   📤 <b>AM SEND MAGIC LINK</b>\n┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛\n\n<blockquote>Masukkan email target (Gmail):</blockquote>`, { parse_mode: "HTML", reply_markup: { inline_keyboard: [[{ text: "❌ Batal", callback_data: "back_to_menu" }]] } });
    }

    if (data === "menu_verif") {
        const { token, statusInfo } = getUserSubscription(userId);
        if (!token || statusInfo.includes("Miskin") || statusInfo === "Masa Aktif Habis") {
            return bot.answerCallbackQuery(callbackQuery.id, { text: "⚠️ Masukin token (Bot Setres😹) dulu anj*ng miskin!", show_alert: true });
        }
        userState[chatId] = { step: "waiting_for_am_verif_email" };
        try { await bot.deleteMessage(chatId, messageId); } catch (e) {}
        return bot.sendMessage(chatId, `┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓\n   ⚡ <b>AM VERIFIKASI AKUN</b>\n┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛\n\n<blockquote>Masukkan email target (Gmail):</blockquote>`, { parse_mode: "HTML", reply_markup: { inline_keyboard: [[{ text: "❌ Batal", callback_data: "back_to_menu" }]] } });
    }

    // --- RAMASHOP QRIS DEPOSIT ---
    if (["pay_7_hari", "pay_1_bulan", "pay_2_bulan", "pay_3_bulan", "pay_4_bulan", "pay_permanen"].includes(data)) {
        const packageDetails = {
            "pay_7_hari": { name: "7 Hari", days: 7, price: 10000 },
            "pay_1_bulan": { name: "1 Bulan", days: 30, price: 15000 },
            "pay_2_bulan": { name: "2 Bulan", days: 60, price: 20000 },
            "pay_3_bulan": { name: "3 Bulan", days: 90, price: 25000 },
            "pay_4_bulan": { name: "4 Bulan", days: 120, price: 30000 },
            "pay_permanen": { name: "Permanen", days: 3650, price: 55000 }
        }[data];

        try { await bot.deleteMessage(chatId, messageId); } catch (e) {}
        const loadMsg = await animateLoading(chatId, `Minta palak QRIS (${packageDetails.name})...`);

        try {
            const generatedToken = generateComplexToken();
            const response = await axios.post(`${CONFIG.RAMASHOP.BASE_URL}/deposit/create`, {
                amount: packageDetails.price,
                method: "qris"
            }, {
                headers: { "X-API-Key": CONFIG.RAMASHOP.API_KEY, "Content-Type": "application/json" },
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

                let caption = 
                    `┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓\n` +
                    `   💳 <b>INVOICE QRIS (Bot Setres😹)</b>\n` +
                    `┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛\n\n` +
                    `╭─[ 🧾 <b>DETAIL TAGIHAN BABI</b> ]\n` +
                    `│ 📦 <b>Paket Babi:</b> ${packageDetails.name}\n` +
                    `│ 💵 <b>Nominal Unik:</b> <b>Rp ${Number(depositData.totalAmount || packageDetails.price).toLocaleString('id-ID')}</b>\n` +
                    `│ 🔑 <b>Token Jatah Lo:</b> <code>${generatedToken}</code>\n` +
                    `╰──────────────────────────────\n\n` +
                    `<blockquote>📝 <i>(${resData.message || 'Bayar sesuai nominal anj*ng, jangan kurang sepeserpun'})</i></blockquote>\n\n` +
                    `⚠️ <b>Kirim foto QRIS di bawah ke HP lain atau pakai fitur scan layar! Buruan bayar miskin!</b>`;

                const keyboardMarkup = {
                    inline_keyboard: [
                        [{ text: "✅ Cek Status Pembayaran", callback_data: "check_payment_status" }],
                        [{ text: "❌ Batal Beli (Dasar Miskin)", callback_data: "back_to_start" }]
                    ]
                };

                // Kirim QRIS via sendPhoto khusus untuk Invoice QR, sisanya full text
                if (depositData.qrImage) {
                    await bot.sendPhoto(chatId, depositData.qrImage, { caption: caption, parse_mode: "HTML", reply_markup: keyboardMarkup });
                } else {
                    await bot.sendMessage(chatId, caption, { parse_mode: "HTML", reply_markup: keyboardMarkup });
                }
            } else {
                let errorMsg = (resData && resData.error) || (resData && resData.message) || "Gagal memproses deposit dari server.";
                return bot.sendMessage(chatId, `⚠️ <b>Payment Error Babi:</b>\n\n<blockquote>${escapeHTML(errorMsg)}</blockquote>`, { parse_mode: "HTML", reply_markup: { inline_keyboard: [[{ text: "⬅️ Kembali", callback_data: "show_pricing" }]] } });
            }

        } catch (error) {
            try { await bot.deleteMessage(chatId, loadMsg.message_id); } catch (e) {}
            let errDetail = error.response?.data?.error || error.response?.data?.message || error.message;
            await bot.sendMessage(chatId, `⚠️ <b>Gagal Menghubungi Server Payment:</b>\n<code>${escapeHTML(errDetail)}</code>\n\n` + getOwnerRoastMsg(), { parse_mode: "HTML", reply_markup: { inline_keyboard: [[{ text: "⬅️ Kembali", callback_data: "show_pricing" }]] } });
        }
        return;
    }

    if (data === "check_payment_status") {
        const pending = db.pendingInvoices[userId];
        if (!pending) {
            return bot.answerCallbackQuery(callbackQuery.id, { text: "⚠️ Ga ada tagihan aktif babi! Bikin orderan dulu sana miskin!", show_alert: true });
        }

        const loadMsg = await animateLoading(chatId, "Mengecek Duit Masuk...");

        try {
            const response = await axios.get(`${CONFIG.RAMASHOP.BASE_URL}/deposit/status/${pending.depositId}`, {
                headers: { "X-API-Key": CONFIG.RAMASHOP.API_KEY, "Content-Type": "application/json" },
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

                await bot.sendMessage(chatId, 
                    `┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓\n` +
                    `   ✅ <b>PEMBAYARAN LUNAS BABI!</b>\n` +
                    `┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛\n\n` +
                    `👑🔥 <b>SELAMAT NIKMATI AKSES VIP (Bot Setres😹)!</b> 🔥👑\n\n` +
                    `🔑 <b>Token Akses Anda:</b> <code>${pending.tokenToActivate}</code>\n\n<i>Membuka menu utama bot...</i>`, 
                    { parse_mode: "HTML" }
                );

                setTimeout(() => sendStartMenu(chatId, msg), 2500);
            } else if (statusResult === "already") {
                await bot.answerCallbackQuery(callbackQuery.id, { text: "⚠️ Tolol lu, deposit ini udah diproses sebelumnya!", show_alert: true });
            } else {
                await bot.answerCallbackQuery(callbackQuery.id, { text: "⏳ Belum masuk bangsat! Segera selesaikan transfer QRIS, jangan ngarep gratisan!", show_alert: true });
            }

        } catch (error) {
            try { await bot.deleteMessage(chatId, loadMsg.message_id); } catch (e) {}
            await bot.answerCallbackQuery(callbackQuery.id, { text: "❌ Gagal ngecek status pembayaran ke server ampas.", show_alert: true });
        }
        return;
    }

    if (data === "free_trial") {
        const now = Date.now();
        const oneWeekMs = 7 * 24 * 60 * 60 * 1000; 
        const lastTrialTime = db.trialCooldowns[userId] || 0;

        if (now - lastTrialTime < oneWeekMs) {
            const remainingDays = Math.ceil((oneWeekMs - (now - lastTrialTime)) / (1000 * 60 * 60 * 24));
            return bot.answerCallbackQuery(callbackQuery.id, { text: `⛔ DIH NGEMIS TERUS MISKIN! Tunggu ${remainingDays} hari lagi kalo tetep maksa anj*ng!`, show_alert: true });
        }

        db.trialCooldowns[userId] = now; 
        const trialToken = `STRES-TRL-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
        db.subscriptions[userId] = { 
            token: trialToken, 
            expiryDate: now + (5 * 60 * 1000), 
            warningSent: false, 
            duration: "Trial Miskin",
            username: userUsername,
            name: userFirstName
        };
        saveDatabase();

        await bot.answerCallbackQuery(callbackQuery.id, { text: "🎉 Nih gw kasih sisa tulang, 5 menit trial!", show_alert: true });
        try { await bot.deleteMessage(chatId, messageId); } catch (e) {}

        await bot.sendMessage(chatId, `┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓\n   ⏱️ <b>UJI COBA 5 MENIT DIAKTIFKAN!</b>\n┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛\n\n<blockquote>🔑 Token Sementara: <code>${trialToken}</code>\n⏳ Masa aktif: <b>5 Menit</b>. \nBuruan pake gembel sebelum gw tutup!</blockquote>`, { parse_mode: "HTML" });

        setTimeout(() => {
            if (db.subscriptions[userId] && db.subscriptions[userId].duration === "Trial Miskin") {
                delete db.subscriptions[userId];
                saveDatabase();
                bot.sendMessage(chatId, "⏰ <b>Waktu Ngemis Lu Habis!</b> Akses ditutup babi. Silakan beli paket resmi kalo punya duit.", { parse_mode: "HTML" });
            }
        }, 5 * 60 * 1000);

        setTimeout(() => sendStartMenu(chatId, msg), 1500);
        return;
    }

    if (data === "input_token_menu") {
        userState[chatId] = { step: "waiting_for_rental_token" };
        try { await bot.deleteMessage(chatId, messageId); } catch (e) {}
        return bot.sendMessage(chatId, `┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓\n   🔑 <b>INPUT TOKEN AKSES VIP</b>\n┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛\n\n<blockquote>Masukkan Token Akses atau Secret Key (Owner Setres😹) lo disini.\n\nFormat: <code>STRES-XXXX-XXXX-XXXX</code>\n\nBuruan ketik gausah lelet anj*ng!</blockquote>`, { parse_mode: "HTML", reply_markup: { inline_keyboard: [[{ text: "⬅️ Kembali", callback_data: "back_to_start" }]] } });
    }

    await bot.answerCallbackQuery(callbackQuery.id);
});

// ==========================================
// 8. TEXT COMMAND & ENDPOINT HANDLERS
// ==========================================
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = msg.text;
    const userName = msg.from.first_name || "Gembel Tanpa Nama";
    const userUsername = msg.from.username ? `@${msg.from.username}` : "Tanpa Username";

    if (!text || text.startsWith('/')) return;
    
    if (isFlooding(chatId)) return bot.sendMessage(chatId, `⛔ <b>(Bot Setres😹) ANTI-FLOOD: BACOT LU TERLALU CEPAT BABI! BLOK!</b>`, { parse_mode: "HTML" });

    const banMin = checkBanStatus(chatId);
    if (banMin > 0) return bot.sendMessage(chatId, `⛔ <b>(Bot Setres😹) BANNED: Mampus, sisa ${banMin} menit lagi lo diem!</b>`, { parse_mode: "HTML" });

    const currentState = userState[chatId] || {};
    const isOwner = db.users[userId]?.is_owner;

    // 1. Owner Gen Token Days
    if (currentState.step === "waiting_for_owner_gen_days" && isOwner) {
        delete userState[chatId];
        const days = text.trim();
        if (isNaN(days)) return bot.sendMessage(chatId, `❌ Masukin angka hari yang bener babi! Jangan bikin malu (Owner Setres😹).`);
        const complexToken = generateComplexToken();
        db.tokens[complexToken] = { duration_days: Number(days), created_at: new Date().toISOString() };
        saveDatabase();
        return bot.sendMessage(chatId, `┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓\n   ✅ <b>TOKEN BERHASIL DIBUAT!</b>\n┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛\n\n<blockquote>⏱️ Durasi: <b>${days} Hari</b>\n🔑 Token: <code>${complexToken}</code></blockquote>`, { parse_mode: "HTML", reply_markup: { inline_keyboard: [[{ text: "👑 Panel (Owner Setres😹)", callback_data: "owner_panel" }]] } });
    }

    // 2. Owner Broadcast
    if (currentState.step === "waiting_for_owner_bcast_msg" && isOwner) {
        delete userState[chatId];
        const bcastMsg = text.trim();
        let count = 0;
        for (const id in db.users) {
            bot.sendMessage(id, `📢 <b>PENGUMUMAN DARI SULTAN (Owner Setres😹):</b>\n\n<blockquote>${escapeHTML(bcastMsg)}</blockquote>`, { parse_mode: "HTML" }).catch(()=>{});
            count++;
        }
        return bot.sendMessage(chatId, `✅ Broadcast sukses disebar ke <b>${count}</b> cecenguk terdaftar!`, { parse_mode: "HTML", reply_markup: { inline_keyboard: [[{ text: "👑 Panel (Owner Setres😹)", callback_data: "owner_panel" }]] } });
    }

    // 3. Verifikasi Token Manual / Secret Key Owner
    if (currentState.step === "waiting_for_rental_token" || text.startsWith("STRES-") || text === CONFIG.BOT.SECRET_KEY) {
        if (currentState.step === "waiting_for_rental_token") delete userState[chatId];
        const inputToken = text.trim();

        if (inputToken === CONFIG.BOT.SECRET_KEY) {
            if (!db.users[userId]) db.users[userId] = {};
            db.users[userId].is_owner = true; 
            saveDatabase();
            return bot.sendMessage(chatId, "🎉 *Hormat Gerak! Verifikasi Admin Sukses!*\nSelamat Datang kembali, Paduka (Owner Setres😹). Bot siap melayani Anda sepenuhnya.", { parse_mode: "Markdown", reply_markup: { inline_keyboard: [[{ text: "👑 [MASUK PANEL (Owner Setres😹)]", callback_data: "owner_panel" }]] } });
        }

        const tokenRegex = /^STRES-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/i;
        const isTrialToken = inputToken.startsWith("STRES-TRL-");

        if (!tokenRegex.test(inputToken) && !isTrialToken) {
            const previousWrong = lastWrongTokens.get(userId);
            let selectedToxicMsg = (previousWrong === inputToken) ? getSpamToxicMsg() : getRandomToxicMsg();
            lastWrongTokens.set(userId, inputToken);
            return bot.sendMessage(chatId, `❌ <b>Token (Bot Setres😹) Ditolak!</b>\n<blockquote>${selectedToxicMsg}</blockquote>`, { parse_mode: "HTML" });
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

        bot.sendMessage(chatId, `🎉 *ANJAY KELAS!* Token \`${inputToken}\` lu valid babi!\n\nSelamat menikmati fitur VIP tanpa batas. Ketik /start buat masuk VVIP Lounge!`, { parse_mode: "Markdown" });
        return;
    }

    // --- FITUR ALIGHT MOTION ENDPOINT (SEND & VERIF) ---
    const { token, statusInfo } = getUserSubscription(userId);
    if (!token || statusInfo.includes("Miskin") || statusInfo === "Masa Aktif Habis") {
        return bot.sendMessage(chatId, "⛔ *WEY KERE!* Akses ditolak. Lo belum punya tiket VIP. \nLu siapa sok-sokan chat (Bot Setres😹)? Ketik /start terus masukin key atau beli token sana miskin!");
    }

    // Endpoint 1: Kirim Gmail (action=send)
    if (text.includes('@') && text.includes('.')) {
        global.userEmailSession = global.userEmailSession || {};
        global.userEmailSession[userId] = text.trim();

        const loadMsg = await animateLoading(chatId, "Mengirim Magic Link (Bot Setres😹)...");
        try {
            const response = await axios.get(`${CONFIG.HAOMI_API.BASE_URL}/api/am?action=send&apikey=${CONFIG.HAOMI_API.KEY}&email=${encodeURIComponent(text.trim())}`, { timeout: 20000 });
            const cleanData = sanitizeResponse(response.data);

            try { await bot.deleteMessage(chatId, loadMsg.message_id); } catch (e) {}

            if (cleanData.status === true || cleanData.success === true || (typeof cleanData === 'string' && cleanData.includes('true'))) {
                await bot.sendMessage(chatId, `✅ <b>Magic Link Terkirim!</b>\n\n<blockquote>Cek Gmail lo gembel, lalu kirim balik <b>Magic Link (URL)</b> ke chat ini untuk aktivasi. Gausah pake lama.</blockquote>`, { parse_mode: "HTML" });
            } else {
                await bot.sendMessage(chatId, `❌ <b>Gagal Kirim Email Tolol:</b>\n\n<blockquote><code>${escapeHTML(JSON.stringify(cleanData, null, 2))}</code></blockquote>`, { parse_mode: "HTML" });
            }
        } catch (error) {
            try { await bot.deleteMessage(chatId, loadMsg.message_id); } catch (e) {}
            await bot.sendMessage(chatId, getOwnerRoastMsg(), { parse_mode: "HTML" });
        }
        return;
    }

    // Endpoint 2: Verifikasi Magic Link (action=verif)
    if (text.startsWith('http://') || text.startsWith('https://')) {
        global.userEmailSession = global.userEmailSession || {};
        const email = global.userEmailSession[userId];

        if (!email) {
            return bot.sendMessage(chatId, "⚠️ Heh Gobl*k! Kirim Gmail lo dulu sebelum ngirim Magic Link. Otak dipake napa.");
        }

        const loadMsg = await animateLoading(chatId, "Memproses Aktivasi Alight Motion...");
        try {
            const response = await axios.get(`${CONFIG.HAOMI_API.BASE_URL}/api/am?action=verif&apikey=${CONFIG.HAOMI_API.KEY}&email=${encodeURIComponent(email)}&url=${encodeURIComponent(text.trim())}`, { timeout: 20000 });
            const cleanData = sanitizeResponse(response.data);

            try { await bot.deleteMessage(chatId, loadMsg.message_id); } catch (e) {}

            if (cleanData.status === true || cleanData.success === true) {
                await bot.sendMessage(chatId, `🎉 <b>SAH! AKUN LO UDAH PREMIUM BABI!</b>\n\n<blockquote><code>${escapeHTML(JSON.stringify(cleanData, null, 2))}</code></blockquote>\n\nSantai aja boss, sekarang lu bebas pake Alight Motion sepuasnya.`, { parse_mode: "HTML" });
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

    bot.sendMessage(chatId, "💡 *Gagal Paham?*\nKalo lo udah di dalem VVIP Lounge, lo cukup kirim **Email Gmail Alight Motion** buat mulai aktivasi. JANGAN NGETIK SEMBARANGAN BABI!");
});

// ==========================================
// 9. CORE COMMANDS
// ==========================================
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    if (isFlooding(chatId)) return bot.sendMessage(chatId, `⛔ <b>(Bot Setres😹) ANTI-FLOOD: KEBANYAKAN BACOT LU SAMPAH!</b>`, { parse_mode: "HTML" });

    const banMin = checkBanStatus(chatId);
    if (banMin > 0) return bot.sendMessage(chatId, `⛔ <b>(Bot Setres😹) BANNED: Diem di pojokan babi, sisa ${banMin} menit!</b>`, { parse_mode: "HTML" });
    
    delete userState[chatId];
    sendStartMenu(chatId, msg);
});

bot.onText(/\/cek/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const { token, statusInfo } = getUserSubscription(userId);
    const isOwner = db.users[userId]?.is_owner;

    if (isOwner) {
        return bot.sendMessage(chatId, `┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓\n   👑 <b>INFO AKUN (Owner Setres😹)</b>\n┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛\n\n<blockquote>Akses Anda sebagai Dewa bersifat Permanen! ☕ Silakan nikmati fasilitas Paduka.</blockquote>`, { parse_mode: "HTML" });
    }
    if (token && statusInfo !== "Belum Aktif (Miskin)" && statusInfo !== "Masa Aktif Habis") {
        bot.sendMessage(chatId, `┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓\n   ⏱️ <b>(Bot Setres😹) TOKEN INFO</b>\n┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛\n\n<blockquote>🔑 Token: <code>${token}</code>\n⏳ Sisa Waktu: <b>${statusInfo}</b> lagi. \n\nBuruan dipake gausah banyak nanya anj*ng!</blockquote>`, { parse_mode: "HTML" });
    } else {
        bot.sendMessage(chatId, `🤡 Belum sewa token! Beli dulu sono miskin pake QRIS, gausah so cek-cek status babi.`, { parse_mode: "HTML" });
    }
});

console.log("🚀 [SYSTEM] (Bot Setres😹) VVIP Store (FULL TOXIC & NO IMAGE & MEWAH UI) Berjalan Lancar...");
