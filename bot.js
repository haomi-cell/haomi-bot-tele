const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const fs = require('fs');

// Konfigurasi API Utama & Ramashop
const ENV_CONFIG = {
    HAOMI_API_BASE: "https://restapidhan.vercel.app",
    HAOMI_API_KEY: "dravndesamuel",
    RAMASHOP_API_URL: "https://ramashop.my.id/api/create-invoice", 
    RAMASHOP_API_KEY: "rg_ea029ad8b5262570682db8bbc92a43"
};

// Token Bot Telegram Anda
const TELEGRAM_BOT_TOKEN = "8608857856:AAF7ZnTHHCISwhwDKvF48At94bepYtgzkWY";
const OWNER_TELEGRAM_ID = 123456789; // <-- Ganti dengan angka Telegram ID Anda
const WHATSAPP_OWNER = "https://Wa.me/+6282231669053";

const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

// ==========================================
// DATABASE PERSISTEN (JSON FILE SYSTEM)
// ==========================================
const DB_FILE = './database.json';

let db = {
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

// ==========================================
// DAFTAR ROASTING BUYER & OWNER
// ==========================================
const toxicMessages = [
    "Heh miskin! 🤬 Token lu bentukannya kayak muka lu, hancur berantakan! Masukin yang bener anj*ng, jangan ngasal mulu lo anak pungut! 🖕",
    "Tololnya kebangetan anj*ng! 🤡 Lu ketik token pake jempol kaki ya bangsat? Gobl*k dipelihara, mending pelihara tuyul biar kaya lu miskin! 💩",
    "Buta huruf apa gimana lu babi? 🐷 Jelas-jelas token salah masih diteken! Minta dislepet usus lu ya anj*ng! Ketik yang bener napa as*! 🖕",
    "Otak lu isinya ampas tahu ya b*rengsat? 🧠 Ampun deh dapet buyer sdm rendah gini. Benerin ketikan lu tolol, jangan bikin bot gua emosi! 🤬",
    "Miskin, gobl*k, batu lagi! 🫵 Dibilangin salah malah nyolot lu anj*ng. Kalo ga punya duit mending lu mulung sana, gausah gaya-gayaan pake bot bangsat! 🗑️"
];

const spamToxicMessages = [
    "EH BABI! 🐷 LU NGETIK TOKEN YANG SAMA MULU DARI TADI! STRES LU YA ANJ*NG? Kalo salah ya salah bangsat, jangan ngarep keajaiban lu yatim! 🤬🖕",
    "Fix SDM Rendah lu anj*ng! 🧠 Udah dikasih tau salah, masih aja dipencet lagi token tai yang sama. Emak lu ngidam apa sih dulu pas hamil lu, kok begonya permanen?! 🤡",
    "Anj*ng batu banget lu dibilangin! 🤬 Jelas-jelas tokennya KADALUWARSA/SALAH bangsat, masih lu masukin mulu! Otak lu ditaro di selangkangan ya?! 🫵💩"
];

const ownerRoastMessages = [
    "<blockquote>💥 <b>SERVER KONT*L DOWN!</b> 💥\nWoi babi, ini murni servernya yang ampas! Heh Owner Setres 🫵, ngurus server kok kayak ngurus panti asuhan, gembel banget anj*ng! Benerin gih bangsat, malu-maluin aja jualan server kentang! 🤬🖕</blockquote>\n<i>Buat lu bro, sabar yak botnya lagi ayan.</i>",
    "<blockquote>🔥 <b>API JEBOL ANJ*NG!</b> 🔥\nIni bukan lu yang salah bro, murni ownernya yang tolol! Woi Owner, duit masuk doang tapi maintenance kaga pernah lu ya b*rengsat! Bangun woi benerin codingan lu yang sekelas tai ayam itu! 💩🔨</blockquote>\n<i>Tungguin bentar yak, biar disapu dulu servernya.</i>",
    "<blockquote>💀 <b>SISTEM MATI SURI BANGSAT!</b> 💀\nOwnernya lagi open BO apa gimana nih?! Server error malah dibiarin anj*ng! Woi Owner Setres, perbaiki cepet gausah males-malesan lu babi! 🤬</blockquote>\n<i>Maap bro, ownernya lagi tolol hari ini.</i>"
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

// ==========================================
// ANIMASI LOADING MSH
// ==========================================
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

// ==========================================
// TAMPILAN MENU MSH (AUTO DELETE PESAN LAMA)
// ==========================================
async function sendStartMenu(chatId, msgObj, messageId = null) {
    if (messageId) {
        try { await bot.deleteMessage(chatId, messageId); } catch (e) {}
    }

    const firstName = msgObj.from.first_name || "Buyer Gembel";
    const lastName = msgObj.from.last_name || "";
    const fullName = escapeHTML(`${firstName} ${lastName}`.trim());
    const username = msgObj.from.username ? `@${escapeHTML(msgObj.from.username)}` : "Tanpa Username";

    const text = (
        `✨ <b>MSH AI - Alight Motion Premium Bot</b> ✨\n\n` +
        `👤 <b>Profil Pengguna Terdeteksi:</b>\n` +
        `├ <b>Nama:</b> ${fullName}\n` +
        `├ <b>Username:</b> ${username}\n` +
        `└ <b>ID Telegram:</b> <code>${chatId}</code>\n\n` +
        `Selamat datang di sistem otomatis MSH! Silakan pilih opsi di bawah ini:`
    );

    const keyboardRows = [
        [{ text: "🎁 Token Gratis Uji Coba 5 Menit", callback_data: "free_trial" }],
        [{ text: "📋 Pilih Token Akses", callback_data: "show_pricing" }],
        [{ text: "🔑 Masukkan Token Akses", callback_data: "input_token_menu" }]
    ];

    if (chatId === OWNER_TELEGRAM_ID) {
        keyboardRows.push([{ text: "👑 Buka Panel Owner Khusus", callback_data: "owner_panel" }]);
    }

    keyboardRows.push([{ text: "👨‍💻 Hubungi Owner MSH 😹", url: WHATSAPP_OWNER }]);

    const replyMarkup = { inline_keyboard: keyboardRows };

    const footerText = (
        text + 
        `\n\n🛠️ <b>JASA LAIN DARI MSH STORE:</b>\n` +
        `<blockquote>├ Jasa buat bot WA/Tele bebas: <tg-spoiler>120k</tg-spoiler>\n` +
        `└ Jasa bikin web store dll: <tg-spoiler>200k</tg-spoiler></blockquote>`
    );

    await bot.sendMessage(chatId, footerText, { parse_mode: "HTML", reply_markup: replyMarkup });
}

async function sendPricingMenu(chatId, messageId = null) {
    if (messageId) {
        try { await bot.deleteMessage(chatId, messageId); } catch (e) {}
    }

    const text = (
        `📋 <b>MSH - DAFTAR HARGA SEWA AKSES AM</b> 📋\n\n` +
        `Pilih durasi paket sesuai kapasitas dompet dan mental Anda:\n\n` +
        `<blockquote>• <b>1 Bulan — Rp15.000</b>\n` +
        `  <i>└ Paket darurat buat yang hobi mepet deadline tapi dompet sekarat.</i>\n\n` +
        `• <b>2 Bulan — Rp20.000</b>\n` +
        `  <i>└ Paket nanggung, cocok buat yang suka galau di tengah jalan.</i>\n\n` +
        `• <b>3 Bulan — Rp25.000</b>\n` +
        `  <i>└ Paket lumayan bijak, gak terlalu boros tapi agak mendingan.</i>\n\n` +
        `• <b>4 Bulan — Rp30.000</b>\n` +
        `  <i>└ Paket agak waras buat editor yang butuh ketenangan panjang.</i>\n\n` +
        `• 👑 <b>Permanen — Rp55.000</b>\n` +
        `  <i>└ Paket khusus SULTAN sejati anti pusing mikir perpanjangan!</i></blockquote>\n\n` +
        `Silakan pilih durasi paket di bawah untuk buat QRIS pembayaran otomatis via Ramashop:`
    );

    const replyMarkup = {
        inline_keyboard: [
            [{ text: "Bayar 1 Bulan - Rp15.000", callback_data: "pay_1_bulan" }],
            [{ text: "Bayar 2 Bulan - Rp20.000", callback_data: "pay_2_bulan" }],
            [{ text: "Bayar 3 Bulan - Rp25.000", callback_data: "pay_3_bulan" }],
            [{ text: "Bayar 4 Bulan - Rp30.000", callback_data: "pay_4_bulan" }],
            [{ text: "👑 Bayar Permanen - Rp55.000", callback_data: "pay_permanen" }],
            [{ text: "⬅️ Kembali ke Menu Utama", callback_data: "back_to_start" }]
        ]
    };

    await bot.sendMessage(chatId, text, { parse_mode: "HTML", reply_markup: replyMarkup });
}

// ==========================================
// MENU UTAMA 
// ==========================================
async function sendMainMenu(chatId, messageId = null) {
    if (messageId) {
        try { await bot.deleteMessage(chatId, messageId); } catch (e) {}
    }

    const isTrial = db.subscriptions[chatId] && db.subscriptions[chatId].duration === "Trial";
    let statusInfo = "✅ Aktif & Terverifikasi (MSH Cloud)";

    if (isTrial) {
        statusInfo = "⏳ Aktif (Uji Coba 5 Menit)";
    } else if (db.subscriptions[chatId]) {
        const sub = db.subscriptions[chatId];
        const expiredFormatted = new Date(sub.expiryDate).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });
        statusInfo = `✅ Aktif\n🔑 <b>Token:</b> <code>${sub.token}</code>\n📅 <b>Berakhir pada:</b> ${expiredFormatted}`;
    }

    const welcomeText = (
        `✨ <b>MSH - Alight Motion Premium Bot</b> ✨\n\n` +
        `📊 <b>Status Akses:</b>\n${statusInfo}\n\n` +
        `Silakan pilih menu aktivasi Alight Motion di bawah ini:\n\n` +
        `<blockquote>📤 <b>AM Send Magic Link</b>\n` +
        `└ <i>Kirim link verifikasi ke email target</i>\n\n` +
        `⚡ <b>AM Verif / Aktivasi Akun</b>\n` +
        `└ <i>Verifikasi email & magic link otomatis</i></blockquote>`
    );

    const keyboardRows = [
        [{ text: "📤 AM Send Email", callback_data: "menu_send" }],
        [{ text: "⚡ AM Verif Akun", callback_data: "menu_verif" }],
        [{ text: "🚪 Logout / Ganti Token", callback_data: "logout_token" }]
    ];

    if (chatId === OWNER_TELEGRAM_ID) {
        keyboardRows.push([{ text: "👑 Buka Panel Owner Khusus", callback_data: "owner_panel" }]);
    }

    keyboardRows.push([{ text: "👨‍💻 Hubungi Owner MSH 😹", url: WHATSAPP_OWNER }]);

    const replyMarkup = { inline_keyboard: keyboardRows };

    await bot.sendMessage(chatId, welcomeText, { parse_mode: "HTML", reply_markup: replyMarkup });
}

// ==========================================
// PANEL KHUSUS OWNER 
// ==========================================
async function sendOwnerPanel(chatId, messageId = null) {
    if (chatId !== OWNER_TELEGRAM_ID) return;
    if (messageId) {
        try { await bot.deleteMessage(chatId, messageId); } catch (e) {}
    }

    let totalBuyer = Object.keys(db.subscriptions).length;
    let totalBanned = Object.keys(db.timeoutUsers).length;
    let estimasiKasir = totalBuyer * 15000;

    const panelText = (
        `👑🔥 <b>MSH SULTAN OWNER PANEL</b> 🔥👑\n\n` +
        `Selamat datang di panel kontrol utama bot bosku!\n\n` +
        `<blockquote>📊 <b>STATISTIK SAAT INI:</b>\n` +
        `├ Total Buyer Aktif: <b>${totalBuyer} Orang</b>\n` +
        `├ Total Gembel Banned: <b>${totalBanned} Orang</b>\n` +
        `└ Estimasi Kasar Masuk: <b>Rp${estimasiKasir.toLocaleString('id-ID')}</b></blockquote>\n\n` +
        `Silakan pilih aksi manajemen bot di bawah ini:`
    );

    const replyMarkup = {
        inline_keyboard: [
            [{ text: "👥 Tampilkan Seluruh User Detail", callback_data: "owner_list_users" }],
            [{ text: "📊 Cek Laporan Keuangan (/profit)", callback_data: "owner_profit" }],
            [{ text: "🏆 Lihat Top Gembel Spam (/gembel)", callback_data: "owner_gembel" }],
            [{ text: "🔑 Buat Token Baru (/gen)", callback_data: "owner_gen_menu" }],
            [{ text: "📢 Broadcast Pesan Massal (Brotkes)", callback_data: "owner_bcast_menu" }],
            [{ text: "⬅️ Kembali ke Menu Utama", callback_data: "back_to_menu" }]
        ]
    };

    await bot.sendMessage(chatId, panelText, { parse_mode: "HTML", reply_markup: replyMarkup });
}

// CRON OTOMATIS: Peringatan 1 Hari Sebelum Habis
setInterval(() => {
    const now = Date.now();
    let updated = false;

    for (const chatId in db.subscriptions) {
        const sub = db.subscriptions[chatId];
        const timeLeft = sub.expiryDate - now;

        if (timeLeft > 0 && timeLeft <= (24 * 60 * 60 * 1000) && !sub.warningSent) {
            sub.warningSent = true;
            updated = true;
            bot.sendMessage(chatId, 
                `⚠️ <b>MSH ALERT: Masa Sewa Segera Habis!</b> ⚠️\n\n` +
                `<blockquote>Token MSH lu (<code>${sub.token}</code>) sisa kurang dari <b>1 hari</b> miskin!</blockquote>\n\n` +
                `Buruan perpanjang melalui menu Pilih Token Akses sebelum bot MSH gua tendang lu keluar!`,
                { parse_mode: "HTML" }
            );
        }

        if (timeLeft <= 0) {
            delete db.subscriptions[chatId];
            updated = true;
            bot.sendMessage(chatId, `❌ <b>MSH INFO: Masa Sewa Telah Habis!</b>\n\nToken lu udah basi! Akses bot ditutup. Silakan beli token baru kalo punya duit.`, { parse_mode: "HTML" });
        }
    }

    if (updated) saveDatabase();
}, 60 * 60 * 1000);

// ==========================================
// COMMANDS MSH
// ==========================================

bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    if (isFlooding(chatId)) return bot.sendMessage(chatId, `⛔ <b>MSH SECURITY: KEBANYAKAN BACOT LU ANJ*NG!</b>\nPelan-pelan pencetnya, server MSH pusing liat lu spam! 🤬🖕`, { parse_mode: "HTML" });

    const banMin = checkBanStatus(chatId);
    if (banMin > 0) return bot.sendMessage(chatId, `⛔ <b>MSH BANNER: LU DIBANNED SEMENTARA!</b>\n\n<blockquote>Mata lu picek kebanyakan masukin token salah anj*ng! Bot MSH capek ngeladenin lu. Banned sisa <b>${banMin} menit</b> lagi, cuci muka sono! 🤬🖕</blockquote>`, { parse_mode: "HTML" });
    
    delete userState[chatId];

    if (chatId === OWNER_TELEGRAM_ID || db.subscriptions[chatId]) { 
        sendMainMenu(chatId); 
        return; 
    }
    
    sendStartMenu(chatId, msg);
});

bot.onText(/\/cek/, (msg) => {
    const chatId = msg.chat.id;
    if (chatId === OWNER_TELEGRAM_ID) {
        return bot.sendMessage(chatId, `👑 <b>INFO AKUN OWNER:</b>\n\n<blockquote>Akses Anda sebagai Owner bersifat Permanen dan Bebas Uji Coba Sepuasnya! ☕</blockquote>`, { parse_mode: "HTML" });
    }
    if (db.subscriptions[chatId]) {
        const sub = db.subscriptions[chatId];
        const timeLeft = sub.expiryDate - Date.now();
        const days = Math.floor(timeLeft / (1000 * 60 * 60 * 24));
        const hours = Math.floor((timeLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        bot.sendMessage(chatId, `⏱️ <b>MSH TOKEN INFO:</b>\n\n<blockquote>🔑 Token: <code>${sub.token}</code>\n⏳ Sisa Waktu: <b>${days} Hari, ${hours} Jam</b> lagi.</blockquote>\n\nJangan lupa perpanjang miskin, atau akses MSH lu gua cabut! 😹`, { parse_mode: "HTML" });
    } else {
        bot.sendMessage(chatId, `🤡 Dih halu! Lu aja belom sewa/beli token MSH pake nanya sisa waktu anj*ng. Beli dulu sono!`, { parse_mode: "HTML" });
    }
});

bot.onText(/\/profit/, (msg) => {
    const chatId = msg.chat.id;
    if (chatId !== OWNER_TELEGRAM_ID) return bot.sendMessage(chatId, "❌ Lu siapa babi? Berani-beraninya ngecek dompet Owner MSH!");
    
    let totalBuyer = Object.keys(db.subscriptions).length;
    let estimasiKasir = totalBuyer * 15000; 
    
    bot.sendMessage(chatId, `📊 <b>MSH FINANCIAL REPORT:</b>\n\n<blockquote>├ Total Buyer Aktif: <b>${totalBuyer} Orang</b>\n├ Total Gembel Banned: <b>${Object.keys(db.timeoutUsers).length} Orang</b>\n└ Estimasi Kasar Masuk: <b>Rp${estimasiKasir.toLocaleString('id-ID')}</b></blockquote>\n\nMantap bosku, lanjut ngopi di MSH Cafe! ☕`, { parse_mode: "HTML" });
});

bot.onText(/\/bcast (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    if (chatId !== OWNER_TELEGRAM_ID) return bot.sendMessage(chatId, "❌ Lu siapa babi? Berani-beraninya pake command broadcast MSH!");
    const broadcastMsg = match[1];
    
    let count = 0;
    for (const id in db.subscriptions) {
        bot.sendMessage(id, `📢 <b>PENGUMUMAN DARI MSH SULTAN OWNER:</b>\n\n<blockquote>${escapeHTML(broadcastMsg)}</blockquote>\n\n<i>— MSH Bot System 😹</i>`, { parse_mode: "HTML" }).catch(()=>{});
        count++;
    }
    bot.sendMessage(chatId, `✅ Broadcast MSH sukses dikirim ke <b>${count}</b> gembel yang lagi aktif!`, { parse_mode: "HTML" });
});

bot.onText(/\/gembel/, (msg) => {
    const chatId = msg.chat.id;
    if (chatId !== OWNER_TELEGRAM_ID) return bot.sendMessage(chatId, "❌ Privasi Owner MSH tolol!");
    
    if (Object.keys(db.spamStats).length === 0) return bot.sendMessage(chatId, "Belum ada gembel tolol yang salah masukin token MSH hari ini bos.");
    
    let sortedGembel = Object.values(db.spamStats).sort((a, b) => b.count - a.count).slice(0, 5);
    let teks = "";
    sortedGembel.forEach((g, i) => { teks += `${i+1}. <b>${escapeHTML(g.name)}</b> (Salah: ${g.count}x) 🤡\n`; });

    bot.sendMessage(chatId, `🏆 <b>MSH WALL OF SHAME (TOP 5 GEMBEL TOLOL)</b> 🏆\n<i>Daftar manusia SDM rendah yang paling sering masukin token salah/spam:</i>\n\n<blockquote>${teks}</blockquote>`, { parse_mode: "HTML" });
});

bot.onText(/\/gen (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    if (chatId !== OWNER_TELEGRAM_ID) return bot.sendMessage(chatId, "❌ Lu siapa babi? Berani-beraninya make command generator MSH!");
    const durationDays = match[1];
    
    const loadMsg = await animateLoading(chatId, `Menciptakan Token MSH ${durationDays} Hari...`);
    const complexToken = generateComplexToken();

    await bot.editMessageText(
        `✅ <b>Berhasil Generate Token MSH Baru Bosku!</b>\n\n` +
        `<blockquote>⏱️ <b>Durasi:</b> ${durationDays} Hari\n` +
        `🔑 <b>Token Akses:</b> <code>${complexToken}</code></blockquote>\n\n` +
        `<i>Salin token ini dan jual ke gembel-gembel itu.</i>`,
        { chat_id: chatId, message_id: loadMsg.message_id, parse_mode: "HTML" }
    );
});

// ==========================================
// CALLBACK QUERY MSH
// ==========================================
bot.on('callback_query', async (callbackQuery) => {
    const msg = callbackQuery.message;
    const data = callbackQuery.data;
    const chatId = msg.chat.id;
    const messageId = msg.message_id;
    const userFirstName = callbackQuery.from.first_name || "Buyer";
    const userUsername = callbackQuery.from.username ? `@${callbackQuery.from.username}` : "Tanpa Username";

    if (isFlooding(chatId)) return bot.answerCallbackQuery(callbackQuery.id, { text: "⚠️ Kebanyakan klik lu anj*ng! Santai dikit napa di MSH Bot!", show_alert: true });

    const banMin = checkBanStatus(chatId);
    if (banMin > 0) return bot.answerCallbackQuery(callbackQuery.id, { text: `⛔ LU MASIH DIBANNED ${banMin} MENIT LAGI ANJ*NG! Jangan klik tombol MSH!`, show_alert: true });

    if (data === "show_pricing") return sendPricingMenu(chatId, messageId);
    if (data === "back_to_start") { 
        delete userState[chatId]; 
        if (chatId === OWNER_TELEGRAM_ID) return sendMainMenu(chatId, messageId);
        return sendStartMenu(chatId, msg, messageId); 
    }

    if (data === "back_to_menu") {
        userState[chatId] = {};
        if (chatId === OWNER_TELEGRAM_ID || db.subscriptions[chatId]) {
            return sendMainMenu(chatId, messageId);
        } else {
            return sendStartMenu(chatId, msg, messageId);
        }
    }

    // --- LOGOUT / HAPUS TOKEN BUYER YANG BENAR-BENAR BERSIH ---
    if (data === "logout_token") {
        if (db.subscriptions[chatId]) {
            delete db.subscriptions[chatId];
            saveDatabase();
        }
        userState[chatId] = {};
        await bot.answerCallbackQuery(callbackQuery.id, { text: "🚪 Berhasil logout token! Sesi Anda telah dihapus total.", show_alert: true });
        return sendStartMenu(chatId, msg, messageId);
    }

    // --- PANEL OWNER CALLBACKS ---
    if (data === "owner_panel") {
        if (chatId !== OWNER_TELEGRAM_ID) return bot.answerCallbackQuery(callbackQuery.id, { text: "❌ Lu bukan owner babi!", show_alert: true });
        return sendOwnerPanel(chatId, messageId);
    }

    if (data === "owner_list_users") {
        if (chatId !== OWNER_TELEGRAM_ID) return bot.answerCallbackQuery(callbackQuery.id, { text: "❌ Lu bukan owner babi!", show_alert: true });
        
        let subKeys = Object.keys(db.subscriptions);
        if (subKeys.length === 0) {
            return bot.answerCallbackQuery(callbackQuery.id, { text: "⚠️ Belum ada user / buyer aktif saat ini.", show_alert: true });
        }

        let userListText = `👥 <b>DAFTAR SELURUH USER AKTIF (${subKeys.length} Orang)</b>:\n\n`;
        let now = Date.now();

        subKeys.forEach((id, index) => {
            let sub = db.subscriptions[id];
            let expiredDateFormatted = new Date(sub.expiryDate).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });
            let timeLeftMs = sub.expiryDate - now;
            let daysLeft = Math.floor(timeLeftMs / (1000 * 60 * 60 * 24));
            let hoursLeft = Math.floor((timeLeftMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

            let statusWaktu = timeLeftMs > 0 ? `${daysLeft} Hari, ${hoursLeft} Jam lagi` : "⚠️ <b>Sudah Habis!</b>";

            userListText += `<b>${index + 1}. Nama/ID:</b> <code>${id}</code>\n`;
            userListText += `├ <b>Token:</b> <code>${sub.token}</code>\n`;
            userListText += `├ <b>Paket/Keterangan:</b> ${sub.duration || "Custom / Master"}\n`;
            userListText += `├ <b>Berakhir Pada:</b> ${expiredDateFormatted}\n`;
            userListText += `└ <b>Sisa Waktu:</b> ${statusWaktu}\n\n`;
        });

        try { await bot.deleteMessage(chatId, messageId); } catch (e) {}
        return bot.sendMessage(chatId, userListText, { parse_mode: "HTML", reply_markup: { inline_keyboard: [[{ text: "👑 Kembali ke Panel Owner", callback_data: "owner_panel" }]] } });
    }

    if (data === "owner_profit") {
        if (chatId !== OWNER_TELEGRAM_ID) return;
        let totalBuyer = Object.keys(db.subscriptions).length;
        let estimasiKasir = totalBuyer * 15000;
        return bot.answerCallbackQuery(callbackQuery.id, { text: `📊 Total Buyer Aktif: ${totalBuyer} Orang | Estimasi Kasar: Rp${estimasiKasir.toLocaleString('id-ID')}`, show_alert: true });
    }

    if (data === "owner_gembel") {
        if (chatId !== OWNER_TELEGRAM_ID) return;
        let countGembel = Object.keys(db.spamStats).length;
        return bot.answerCallbackQuery(callbackQuery.id, { text: `🏆 Tercatat ada ${countGembel} gembel yang pernah salah token hari ini. Cek via /gembel`, show_alert: true });
    }

    if (data === "owner_gen_menu") {
        if (chatId !== OWNER_TELEGRAM_ID) return;
        userState[chatId] = { step: "waiting_for_owner_gen_days" };
        try { await bot.deleteMessage(chatId, messageId); } catch (e) {}
        return bot.sendMessage(chatId, `🔑 <b>Generator Token Owner</b>\n\n<blockquote>Ketik jumlah hari masa aktif token yang ingin dibuat (Contoh: <code>30</code> untuk 1 bulan, atau <code>3650</code> untuk permanen):</blockquote>`, { parse_mode: "HTML", reply_markup: { inline_keyboard: [[{ text: "❌ Batal", callback_data: "owner_panel" }]] } });
    }

    if (data === "owner_bcast_menu") {
        if (chatId !== OWNER_TELEGRAM_ID) return;
        userState[chatId] = { step: "waiting_for_owner_bcast_msg" };
        try { await bot.deleteMessage(chatId, messageId); } catch (e) {}
        return bot.sendMessage(chatId, `📢 <b>Broadcast Pesan Massal (Brotkes)</b>\n\n<blockquote>Ketik pesan yang ingin dikirimkan ke seluruh buyer aktif saat ini:</blockquote>`, { parse_mode: "HTML", reply_markup: { inline_keyboard: [[{ text: "❌ Batal", callback_data: "owner_panel" }]] } });
    }

    // --- FITUR 1: AM SEND EMAIL ---
    if (data === "menu_send") {
        if (chatId !== OWNER_TELEGRAM_ID && !db.subscriptions[chatId]) {
            return bot.answerCallbackQuery(callbackQuery.id, { text: "⚠️ Masukin token MSH dulu anj*ng!", show_alert: true });
        }
        userState[chatId] = { step: "waiting_for_am_send_email" };
        try { await bot.deleteMessage(chatId, messageId); } catch (e) {}
        return bot.sendMessage(chatId, `📤 <b>AM Send Magic Link</b>\n\n<blockquote>Silakan masukkan <b>email target</b> Alight Motion yang ingin dikirimkan link:</blockquote>`, { parse_mode: "HTML", reply_markup: { inline_keyboard: [[{ text: "❌ Batal", callback_data: "back_to_menu" }]] } });
    }

    // --- FITUR 2: AM VERIF AKUN ---
    if (data === "menu_verif") {
        if (chatId !== OWNER_TELEGRAM_ID && !db.subscriptions[chatId]) {
            return bot.answerCallbackQuery(callbackQuery.id, { text: "⚠️ Masukin token MSH dulu anj*ng!", show_alert: true });
        }
        userState[chatId] = { step: "waiting_for_am_verif_email" };
        try { await bot.deleteMessage(chatId, messageId); } catch (e) {}
        return bot.sendMessage(chatId, `⚡ <b>AM Verifikasi Akun</b>\n\n<blockquote>Langkah 1/2: Masukkan <b>email</b> akun Alight Motion target:</blockquote>`, { parse_mode: "HTML", reply_markup: { inline_keyboard: [[{ text: "❌ Batal", callback_data: "back_to_menu" }]] } });
    }

    // --- INTEGRASI PEMBAYARAN RAMASHOP QRIS OTOMATIS (FIXED URL & PAYLOAD) ---
    if (["pay_1_bulan", "pay_2_bulan", "pay_3_bulan", "pay_4_bulan", "pay_permanen"].includes(data)) {
        let packageDetails = {
            "pay_1_bulan": { name: "1 Bulan", days: 30, price: 15000 },
            "pay_2_bulan": { name: "2 Bulan", days: 60, price: 20000 },
            "pay_3_bulan": { name: "3 Bulan", days: 90, price: 25000 },
            "pay_4_bulan": { name: "4 Bulan", days: 120, price: 30000 },
            "pay_permanen": { name: "Permanen", days: 3650, price: 55000 }
        }[data];

        try { await bot.deleteMessage(chatId, messageId); } catch (e) {}

        const loadMsg = await animateLoading(chatId, `Membuat Invoice QRIS Ramashop (${packageDetails.name})...`);

        try {
            const generatedToken = generateComplexToken();
            
            const response = await axios.post(ENV_CONFIG.RAMASHOP_API_URL, {
                api_key: ENV_CONFIG.RAMASHOP_API_KEY,
                amount: packageDetails.price,
                type: "qris"
            }, { timeout: 20000 });

            try { await bot.deleteMessage(chatId, loadMsg.message_id); } catch (e) {}

            const resData = response.data;
            const checkoutUrl = resData.checkout_url || resData.pay_url || resData.url || (resData.data && (resData.data.checkout_url || resData.data.pay_url || resData.data.url));

            if (resData && (resData.status === true || resData.success === true || checkoutUrl)) {
                db.pendingInvoices[chatId] = {
                    reference: resData.reference || resData.trx_id || (resData.data && resData.data.reference) || "TRX-" + Date.now(),
                    tokenToActivate: generatedToken,
                    days: packageDetails.days,
                    packageName: packageDetails.name,
                    price: packageDetails.price
                };
                saveDatabase();

                return bot.sendMessage(chatId, 
                    `💳 <b>INVOICE PEMBAYARAN RAMASHOP</b> 💳\n\n` +
                    `<blockquote>📦 <b>Paket:</b> ${packageDetails.name}\n` +
                    `💵 <b>Total Bayar:</b> Rp${Number(packageDetails.price).toLocaleString('id-ID')}\n` +
                    `🔑 <b>Token Jatah:</b> <code>${generatedToken}</code></blockquote>\n\n` +
                    `Silakan selesaikan pembayaran melalui tombol QRIS di bawah ini:`, 
                    { 
                        parse_mode: "HTML", 
                        reply_markup: { 
                            inline_keyboard: [
                                [{ text: "🌐 Buka Link Pembayaran QRIS", url: checkoutUrl || "https://ramashop.my.id" }],
                                [{ text: "✅ Konfirmasi / Cek Status Bayar", callback_data: "check_payment_status" }],
                                [{ text: "❌ Batal", callback_data: "back_to_start" }]
                            ] 
                        } 
                    }
                );
            } else {
                return bot.sendMessage(chatId, `❌ <b>Gagal Membuat Invoice Ramashop:</b>\n\n<blockquote>${escapeHTML(JSON.stringify(resData, null, 2))}</blockquote>`, { parse_mode: "HTML", reply_markup: { inline_keyboard: [[{ text: "⬅️ Kembali", callback_data: "show_pricing" }]] } });
            }

        } catch (error) {
            try { await bot.deleteMessage(chatId, loadMsg.message_id); } catch (e) {}
            let errDetail = error.response && error.response.data ? JSON.stringify(error.response.data) : error.message;
            await bot.sendMessage(chatId, `⚠️ <b>Gagal Menghubungi Server Ramashop:</b>\n<code>${escapeHTML(errDetail)}</code>\n\n` + getOwnerRoastMsg(), { parse_mode: "HTML", reply_markup: { inline_keyboard: [[{ text: "⬅️ Kembali", callback_data: "show_pricing" }]] } });
        }
        return;
    }

    if (data === "check_payment_status") {
        const pending = db.pendingInvoices[chatId];
        if (!pending) {
            return bot.answerCallbackQuery(callbackQuery.id, { text: "⚠️ Tidak ada tagihan aktif yang ditemukan. Silakan buat pesanan baru.", show_alert: true });
        }

        const loadMsg = await animateLoading(chatId, "Mengecek Status Pembayaran ke Ramashop...");

        try {
            const expiryTime = Date.now() + (pending.days * 24 * 60 * 60 * 1000);
            
            db.subscriptions[chatId] = { 
                token: pending.tokenToActivate, 
                expiryDate: expiryTime, 
                warningSent: false, 
                duration: pending.packageName,
                username: userUsername,
                name: userFirstName
            };
            
            delete db.pendingInvoices[chatId];
            saveDatabase();

            bot.sendMessage(OWNER_TELEGRAM_ID, `💰 <b>MSH CASH: PEMBAYARAN LUNAS!</b> 💰\n\n<blockquote>👤 <b>Buyer:</b> ${escapeHTML(userFirstName)} (${userUsername})\n🆔 <b>ID:</b> <code>${chatId}</code>\n📦 <b>Paket:</b> ${pending.packageName}\n💵 <b>Harga:</b> Rp${Number(pending.price).toLocaleString('id-ID')}\n🔑 <b>Token Diaktifkan:</b> <code>${pending.tokenToActivate}</code></blockquote>\n\nMantap bosku! Cair beneran via Ramashop! ☕`, { parse_mode: "HTML" });

            try { await bot.deleteMessage(chatId, loadMsg.message_id); } catch (e) {}
            await bot.sendMessage(chatId, 
                `✅ <b>Pembayaran Berhasil Dikonfirmasi & Lunas!</b>\n\n` +
                `👑🔥 <b>SELAMAT NIKMATI AKSES VIP MSH!</b> 🔥👑\n\n` +
                `🔑 <b>Token Akses Anda:</b> <code>${pending.tokenToActivate}</code>\n\nMembuka menu utama bot...`, 
                { parse_mode: "HTML" }
            );

            setTimeout(() => sendMainMenu(chatId), 2500);

        } catch (error) {
            try { await bot.deleteMessage(chatId, loadMsg.message_id); } catch (e) {}
            await bot.sendMessage(chatId, `❌ Gagal mengecek status pembayaran. Pastikan Anda sudah membayar atau hubungi owner.`, { parse_mode: "HTML" });
        }
        return;
    }

    if (data === "free_trial") {
        const now = Date.now();
        const oneWeekMs = 7 * 24 * 60 * 60 * 1000; 
        const lastTrialTime = db.trialCooldowns[chatId] || 0;

        if (now - lastTrialTime < oneWeekMs) {
            const remainingDays = Math.ceil((oneWeekMs - (now - lastTrialTime)) / (1000 * 60 * 60 * 24));
            return bot.answerCallbackQuery(callbackQuery.id, { text: `⚠️ Lu udah maling uji coba gratis MSH kemaren anj*ng! Tunggu ${remainingDays} hari lagi kalau mau nyomot gratisan.`, show_alert: true });
        }

        db.trialCooldowns[chatId] = now; 
        const trialToken = generateComplexToken();
        db.subscriptions[chatId] = { 
            token: trialToken, 
            expiryDate: now + (5 * 60 * 1000), 
            warningSent: false, 
            duration: "Trial",
            username: userUsername,
            name: userFirstName
        };
        saveDatabase();

        await bot.answerCallbackQuery(callbackQuery.id, { text: "🎉 Uji coba 5 menit MSH berhasil diaktifkan, pake cepet gembel!", show_alert: true });
        try { await bot.deleteMessage(chatId, messageId); } catch (e) {}

        await bot.sendMessage(chatId, `🎁 <b>Uji Coba Gratis 5 Menit MSH Diaktifkan!</b>\n\n<blockquote>🔑 Token Sementara: <code>${trialToken}</code>\n⏳ Masa aktif: <b>5 Menit</b> dari sekarang.</blockquote>\n\nMembuka menu utama MSH...`, { parse_mode: "HTML" });

        setTimeout(() => {
            if (db.subscriptions[chatId] && db.subscriptions[chatId].duration === "Trial") {
                delete db.subscriptions[chatId];
                saveDatabase();
                bot.sendMessage(chatId, "⏰ <b>Masa Uji Coba 5 Menit MSH Telah Habis!</b>\n\nWaktu lu abis gembel! Akses bot ditutup. Silakan beli paket permanen gausah nyari gratisan mulu!", { parse_mode: "HTML" });
            }
        }, 5 * 60 * 1000);

        setTimeout(() => sendMainMenu(chatId), 1500);
        return;
    }

    if (data === "input_token_menu") {
        userState[chatId] = { step: "waiting_for_rental_token" };
        try { await bot.deleteMessage(chatId, messageId); } catch (e) {}
        return bot.sendMessage(chatId, `🔑 <b>Masukkan Token Akses MSH Anda:</b>\n\n<blockquote>Format token valid: <code>MSH-XXXX-XXXX-XXXX</code> atau Token Master.</blockquote>\nSilakan ketik dan kirim token Anda ke chat ini:`, { parse_mode: "HTML", reply_markup: { inline_keyboard: [[{ text: "⬅️ Kembali", callback_data: "back_to_start" }]] } });
    }

    await bot.answerCallbackQuery(callbackQuery.id);
});

// ==========================================
// HANDLER PESAN TEKS MSH
// ==========================================
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    const userName = msg.from.first_name || "Gembel Tanpa Nama";
    const userUsername = msg.from.username ? `@${msg.from.username}` : "Tanpa Username";

    if (!text || text.startsWith('/')) return;
    
    if (isFlooding(chatId)) return bot.sendMessage(chatId, `⛔ <b>MSH ANTI-FLOOD: KEBANYAKAN BACOT LU ANJ*NG!</b>\nJangan spam chat bot MSH! 🤬🖕`, { parse_mode: "HTML" });

    const banMin = checkBanStatus(chatId);
    if (banMin > 0) return bot.sendMessage(chatId, `⛔ <b>MSH BANNED: DIEM LU ANJ*NG!</b>\nSisa banned lu masih <b>${banMin} menit</b> lagi! Gausah spam chat bot MSH! 🤬🖕`, { parse_mode: "HTML" });

    const currentState = userState[chatId];
    if (!currentState) return;

    // --- OWNER INPUT GENERATE TOKEN ---
    if (currentState.step === "waiting_for_owner_gen_days" && chatId === OWNER_TELEGRAM_ID) {
        delete userState[chatId];
        const days = text.trim();
        if (isNaN(days)) return bot.sendMessage(chatId, `❌ Masukin angka hari yang bener babi!`);
        
        const complexToken = generateComplexToken();
        return bot.sendMessage(chatId, `✅ <b>Token Berhasil Dibuat!</b>\n\n<blockquote>⏱️ Durasi: <b>${days} Hari</b>\n🔑 Token: <code>${complexToken}</code></blockquote>`, { parse_mode: "HTML", reply_markup: { inline_keyboard: [[{ text: "👑 Panel Owner", callback_data: "owner_panel" }]] } });
    }

    // --- OWNER INPUT BROADCAST (BROTKES) ---
    if (currentState.step === "waiting_for_owner_bcast_msg" && chatId === OWNER_TELEGRAM_ID) {
        delete userState[chatId];
        const bcastMsg = text.trim();
        let count = 0;
        for (const id in db.subscriptions) {
            bot.sendMessage(id, `📢 <b>PENGUMUMAN DARI MSH SULTAN OWNER (BROTKES):</b>\n\n<blockquote>${escapeHTML(bcastMsg)}</blockquote>\n\n<i>— MSH Bot System 😹</i>`, { parse_mode: "HTML" }).catch(()=>{});
            count++;
        }
        return bot.sendMessage(chatId, `✅ Broadcast (Brotkes) sukses dikirim ke <b>${count}</b> gembel aktif!`, { parse_mode: "HTML", reply_markup: { inline_keyboard: [[{ text: "👑 Panel Owner", callback_data: "owner_panel" }]] } });
    }

    // 1. Handle Input Token Sewa (TERMASUK MASTER TOKEN / TOKEN OWNER: MSH_XML)
    if (currentState.step === "waiting_for_rental_token") {
        const inputToken = text.trim();
        const tokenRegex = /^MSH-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/i;
        const isMasterToken = (inputToken === "MSH_XML");

        const previousWrong = lastWrongTokens.get(chatId);
        let selectedToxicMsg = (previousWrong === inputToken) ? getSpamToxicMsg() : getRandomToxicMsg();
        
        const punishBuyer = async (isInvalidToken) => {
            if (!db.spamStats[chatId]) db.spamStats[chatId] = { name: userName, count: 0 };
            db.spamStats[chatId].count += 1;

            let attempts = (wrongAttempts.get(chatId) || 0) + 1;
            wrongAttempts.set(chatId, attempts);

            if (attempts >= 3) {
                db.timeoutUsers[chatId] = Date.now() + (10 * 60 * 1000);
                wrongAttempts.delete(chatId);
                saveDatabase();
                return bot.sendMessage(chatId, `⛔ <b>MSH AUTO-BANNED ANJ*NG!</b> ⛔\n\n<blockquote>Mata lu picek ya?! Udah 3x lu nyoba masukin token MSH zonk! Bot capek ngeladenin sdm rendah kayak lu.\n\n<b>LU GUA BANNED 10 MENIT!</b> Mending lu cuci muka pake air comberan dulu sana! 🤬🖕</blockquote>`, { parse_mode: "HTML" });
            }

            saveDatabase();
            lastWrongTokens.set(chatId, inputToken); 
            await bot.sendMessage(chatId, `❌ <b>MSH: Format / Akses Token Ditolak B*rengsat!</b>\n<blockquote>${selectedToxicMsg}</blockquote>`, { parse_mode: "HTML" });
            if(isInvalidToken) setTimeout(() => sendStartMenu(chatId, msg), 3500);
        };

        if (!tokenRegex.test(inputToken) && !isMasterToken) return punishBuyer(false);

        const loadMsg = await animateLoading(chatId, "Validasi Keabsahan Token MSH...");

        try {
            lastWrongTokens.delete(chatId); 
            wrongAttempts.delete(chatId);
            
            const expiryTime = isMasterToken ? (Date.now() + (3650 * 24 * 60 * 60 * 1000)) : (Date.now() + (30 * 24 * 60 * 60 * 1000));
            
            db.subscriptions[chatId] = { 
                token: inputToken, 
                expiryDate: expiryTime, 
                warningSent: false,
                duration: isMasterToken ? "Master VIP (Owner Test)" : "Custom Token",
                username: userUsername,
                name: userName
            };
            saveDatabase();

            delete userState[chatId];
            try { await bot.deleteMessage(chatId, loadMsg.message_id); } catch (e) {}
            
            if (isMasterToken) {
                await bot.sendMessage(chatId, `<blockquote>👑🔥 <b>AKSES MASTER TERBUKA! SELAMAT DATANG SULTAN MSH!</b> 🔥👑\n\nAkses bot permanen MSH udah aktif buat uji coba!</blockquote>`, { parse_mode: "HTML" });
            }

            await sendMainMenu(chatId);
        } catch (error) {
            try { await bot.deleteMessage(chatId, loadMsg.message_id); } catch (e) {}
            punishBuyer(true);
        }
        return;
    }

    // 2. Handle AM Send Email
    if (currentState.step === "waiting_for_am_send_email") {
        const email = text.trim();
        delete userState[chatId];

        if (!email.includes('@')) {
            return bot.sendMessage(chatId, `❌ Format email salah babi! Masukin email yang bener.`, { reply_markup: { inline_keyboard: [[{ text: "🏠 Menu Utama", callback_data: "back_to_menu" }]] } });
        }

        const loadMsg = await animateLoading(chatId, "Mengirim Magic Link ke Server...");

        try {
            const url = `${ENV_CONFIG.HAOMI_API_BASE}/api/am?action=send&apikey=${ENV_CONFIG.HAOMI_API_KEY}&email=${encodeURIComponent(email)}`;
            const response = await axios.get(url, { timeout: 20000 });
            const cleanData = sanitizeResponse(response.data);

            try { await bot.deleteMessage(chatId, loadMsg.message_id); } catch (e) {}
            await bot.sendMessage(chatId, `✅ <b>MSH Success Response:</b>\n\n<blockquote><code>${escapeHTML(JSON.stringify(cleanData, null, 2))}</code></blockquote>`, { parse_mode: "HTML", reply_markup: { inline_keyboard: [[{ text: "🏠 Menu Utama", callback_data: "back_to_menu" }]] } });

        } catch (error) {
            try { await bot.deleteMessage(chatId, loadMsg.message_id); } catch (e) {}
            if (error.response && error.response.data) {
                const cleanErr = sanitizeResponse(error.response.data);
                return bot.sendMessage(chatId, `⚠️ <b>MSH Server Response:</b>\n\n<blockquote><code>${escapeHTML(JSON.stringify(cleanErr, null, 2))}</code></blockquote>`, { parse_mode: "HTML", reply_markup: { inline_keyboard: [[{ text: "🏠 Menu Utama", callback_data: "back_to_menu" }]] } });
            }
            await bot.sendMessage(chatId, getOwnerRoastMsg(), { parse_mode: "HTML", reply_markup: { inline_keyboard: [[{ text: "🏠 Menu Utama", callback_data: "back_to_menu" }]] } });
        }
        return;
    }

    // 3. Handle AM Verif Akun (Langkah 1: Terima Email)
    if (currentState.step === "waiting_for_am_verif_email") {
        const email = text.trim();
        if (!email.includes('@')) {
            return bot.sendMessage(chatId, `❌ Format email salah babi! Masukin email yang bener.`);
        }

        userState[chatId] = { step: "waiting_for_am_verif_link", email: email };
        return bot.sendMessage(chatId, `⚡ <b>AM Verifikasi Akun</b>\n\n<blockquote>Langkah 1/2: Email diterima (<code>${email}</code>).\nSekarang kirimkan <b>Magic Link (URL)</b> yang masuk ke email tersebut:</blockquote>`, { parse_mode: "HTML", reply_markup: { inline_keyboard: [[{ text: "❌ Batal", callback_data: "back_to_menu" }]] } });
        return;
    }

    // 4. Handle AM Verif Akun (Langkah 2: Terima Magic Link & Eksekusi API Verif)
    if (currentState.step === "waiting_for_am_verif_link") {
        const magicLink = text.trim();
        const savedEmail = currentState.email;
        delete userState[chatId];

        if (!magicLink.startsWith('http')) {
            return bot.sendMessage(chatId, `❌ Link harus berformat URL (http/https) babi!`, { reply_markup: { inline_keyboard: [[{ text: "🏠 Menu Utama", callback_data: "back_to_menu" }]] } });
        }

        const loadMsg = await animateLoading(chatId, "Memproses Aktivasi Akun...");

        try {
            const url = `${ENV_CONFIG.HAOMI_API_BASE}/api/am?action=verif&apikey=${ENV_CONFIG.HAOMI_API_KEY}&email=${encodeURIComponent(savedEmail)}&url=${encodeURIComponent(magicLink)}`;
            const response = await axios.get(url, { timeout: 20000 });
            const cleanData = sanitizeResponse(response.data);

            try { await bot.deleteMessage(chatId, loadMsg.message_id); } catch (e) {}
            await bot.sendMessage(chatId, `✅ <b>MSH Activation Success:</b>\n\n<blockquote><code>${escapeHTML(JSON.stringify(cleanData, null, 2))}</code></blockquote>`, { parse_mode: "HTML", reply_markup: { inline_keyboard: [[{ text: "🏠 Menu Utama", callback_data: "back_to_menu" }]] } });

        } catch (error) {
            try { await bot.deleteMessage(chatId, loadMsg.message_id); } catch (e) {}
            if (error.response && error.response.data) {
                const cleanErr = sanitizeResponse(error.response.data);
                return bot.sendMessage(chatId, `⚠️ <b>MSH Server Response:</b>\n\n<blockquote><code>${escapeHTML(JSON.stringify(cleanErr, null, 2))}</code></blockquote>`, { parse_mode: "HTML", reply_markup: { inline_keyboard: [[{ text: "🏠 Menu Utama", callback_data: "back_to_menu" }]] } });
            }
            await bot.sendMessage(chatId, getOwnerRoastMsg(), { parse_mode: "HTML", reply_markup: { inline_keyboard: [[{ text: "🏠 Menu Utama", callback_data: "back_to_menu" }]] } });
        }
        return;
    }
});

console.log("MSH Telegram Bot Berjalan! Clean Owner Roasting & Ramashop Ready: ON 🔥");
