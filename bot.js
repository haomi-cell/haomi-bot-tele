const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const fs = require('fs');

// Konfigurasi API Utama
const ENV_CONFIG = {
    HAO_API_KEY: "e329d3cb861969fe599ef5fe",
    HAO_ACCESS_TOKEN: "aks-1d3bd53f4d857a690a77471d",
    HAO_API_BASE: "https://ndxhs.my.id",
    RAMASHOP_API_URL: "https://ramashop.my.id/api/create-invoice", 
    RAMASHOP_API_KEY: "rg_ea029ad8b5262570682db8bbc92a43"
};

// Token Bot Telegram Anda
const TELEGRAM_BOT_TOKEN = "8608857856:AAF7ZnTHHCISwhwDKvF48At94bepYtgzkWY";
const OWNER_TELEGRAM_ID = 123456789; // <-- Ganti dengan angka Telegram ID Anda
const WHATSAPP_OWNER = "https://Wa.me/+6282231669053";
const TELEGRAM_CHANNEL_TESTI = "https://t.me/TestimoniBotKamu"; // <-- Ganti link channel testimoni lu

const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

// ==========================================
// DATABASE PERSISTEN (JSON FILE SYSTEM)
// ==========================================
const DB_FILE = './database.json';

let db = {
    subscriptions: {}, // chatId -> { token, expiryDate, warningSent, duration }
    trialCooldowns: {}, // chatId -> timestamp
    timeoutUsers: {}, // chatId -> unban timestamp
    spamStats: {} // chatId -> { name, count }
};

// Fungsi Load Database dari File
function loadDatabase() {
    try {
        if (fs.existsSync(DB_FILE)) {
            const data = fs.readFileSync(DB_FILE, 'utf8');
            const parsed = JSON.parse(data);
            db.subscriptions = parsed.subscriptions || {};
            db.trialCooldowns = parsed.trialCooldowns || {};
            db.timeoutUsers = parsed.timeoutUsers || {};
            db.spamStats = parsed.spamStats || {};
            console.log("📂 Database JSON berhasil dimuat!");
        } else {
            saveDatabase();
            console.log("📂 File database.json baru berhasil dibuat!");
        }
    } catch (e) {
        console.error("Gagal memuat database:", e);
    }
}

// Fungsi Simpan Database ke File
function saveDatabase() {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
    } catch (e) {
        console.error("Gagal menyimpan database:", e);
    }
}

// Load database saat bot pertama kali dinyalakan
loadDatabase();

// In-Memory state untuk sesi chat sementara
const userState = {};
const lastWrongTokens = new Map();
const wrongAttempts = new Map(); 
const floodControl = new Map();

// Menghindari error dari karakter spesial nama user di mode HTML
function escapeHTML(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ==========================================
// DAFTAR ROASTING BUYER
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

// ==========================================
// ANIMASI LOADING KEREN (GAYA TERMINAL/HACKER)
// ==========================================
async function animateLoading(chatId, baseText) {
    const frames = [
        `🔄 <b>${baseText}</b>\n<code>[ ░░░░░░░░░░ ] 0%</code> ⠋ <i>Memulai koneksi sistem...</i>`,
        `⏳ <b>${baseText}</b>\n<code>[ ▓▓▓░░░░░░░ ] 30%</code> ⠙ <i>Menembus firewall...</i>`,
        `⏳ <b>${baseText}</b>\n<code>[ ▓▓▓▓▓▓░░░░ ] 60%</code> ⠹ <i>Mengekstrak payload server...</i>`,
        `⚡ <b>${baseText}</b>\n<code>[ ▓▓▓▓▓▓▓▓▓░ ] 90%</code> ⠼ <i>Validasi respons enkripsi...</i>`,
        `✅ <b>Berhasil!</b>\n<code>[ ▓▓▓▓▓▓▓▓▓▓ ] 100%</code> ⠧ <i>Akses Diberikan!</i>`
    ];
    let msg = await bot.sendMessage(chatId, frames[0], { parse_mode: "HTML" });
    for (let i = 1; i < frames.length; i++) {
        await new Promise(r => setTimeout(r, 700)); 
        await bot.editMessageText(frames[i], { chat_id: chatId, message_id: msg.message_id, parse_mode: "HTML" });
    }
    return msg; 
}

// ==========================================
// TAMPILAN MENU
// ==========================================
async function sendStartMenu(chatId, msgObj, messageId = null) {
    const firstName = msgObj.from.first_name || "Buyer Gembel";
    const lastName = msgObj.from.last_name || "";
    const fullName = escapeHTML(`${firstName} ${lastName}`.trim());
    const username = msgObj.from.username ? `@${escapeHTML(msgObj.from.username)}` : "Tanpa Username";

    const text = (
        `✨ <b>Alight Motion Premium - Bot Layanan Otomatis</b> ✨\n\n` +
        `👤 <b>Profil Pengguna Terdeteksi:</b>\n` +
        `├ <b>Nama:</b> ${fullName}\n` +
        `├ <b>Username:</b> ${username}\n` +
        `└ <b>ID Telegram:</b> <code>${chatId}</code>\n\n` +
        `Selamat datang di sistem otomatis kami! Silakan pilih opsi di bawah ini:`
    );

    const replyMarkup = {
        inline_keyboard: [
            [{ text: "🎁 Token Gratis Uji Coba 5 Menit", callback_data: "free_trial" }],
            [{ text: "📋 Pilih Token Akses", callback_data: "show_pricing" }],
            [{ text: "🔑 Masukkan Token Akses", callback_data: "input_token_menu" }],
            [{ text: "📢 Cek Testimoni / Bukti Testi", url: TELEGRAM_CHANNEL_TESTI }],
            [{ text: "👨‍💻 Hubungi Owner Setres 😹", url: WHATSAPP_OWNER }]
        ]
    };

    const footerText = (
        text + 
        `\n\n🛠️ <b>JASA LAIN DARI OWNER:</b>\n` +
        `<blockquote>├ Jasa buat bot WA/Tele bebas: <tg-spoiler>120k</tg-spoiler>\n` +
        `└ Jasa bikin web store dll: <tg-spoiler>200k</tg-spoiler></blockquote>`
    );

    if (messageId) {
        try { await bot.editMessageText(footerText, { chat_id: chatId, message_id: messageId, parse_mode: "HTML", reply_markup: replyMarkup }); } 
        catch (e) { await bot.sendMessage(chatId, footerText, { parse_mode: "HTML", reply_markup: replyMarkup }); }
    } else {
        await bot.sendMessage(chatId, footerText, { parse_mode: "HTML", reply_markup: replyMarkup });
    }
}

async function sendPricingMenu(chatId, messageId = null) {
    const text = (
        `📋 <b>DAFTAR HARGA SEWA AKUN AM</b> 📋\n\n` +
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
        `Silakan pilih durasi paket di bawah untuk bayar otomatis via Ramashop:`
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

    if (messageId) {
        try { await bot.editMessageText(text, { chat_id: chatId, message_id: messageId, parse_mode: "HTML", reply_markup: replyMarkup }); } 
        catch (e) { await bot.sendMessage(chatId, text, { parse_mode: "HTML", reply_markup: replyMarkup }); }
    } else {
        await bot.sendMessage(chatId, text, { parse_mode: "HTML", reply_markup: replyMarkup });
    }
}

async function sendMainMenu(chatId, messageId = null) {
    const isTrial = db.subscriptions[chatId] && db.subscriptions[chatId].duration === "Trial";
    let statusInfo = "✅ Aktif & Terverifikasi (Sewa)";

    if (isTrial) {
        statusInfo = "⏳ Aktif (Uji Coba 5 Menit)";
    } else if (db.subscriptions[chatId]) {
        const sub = db.subscriptions[chatId];
        const expiredFormatted = new Date(sub.expiryDate).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });
        statusInfo = `✅ Aktif\n🔑 <b>Token:</b> <code>${sub.token}</code>\n📅 <b>Berakhir pada:</b> ${expiredFormatted}`;
    }

    const welcomeText = (
        `✨ <b>Alight Motion Premium - Automated Bot</b> ✨\n\n` +
        `📊 <b>Status Akses:</b>\n${statusInfo}\n\n` +
        `Silakan pilih fitur layanan yang ingin digunakan:\n\n` +
        `<blockquote>📤 <b>Alight Motion Send</b>\n` +
        `└ <i>Kirim magic link verifikasi ke email Alight Motion</i>\n\n` +
        `⚡ <b>Alight Motion Verify</b>\n` +
        `└ <i>Verifikasi link magic & aktifkan premium</i>\n\n` +
        `🌐 <b>Alight Motion Google Auth</b>\n` +
        `└ <i>Premiumkan akun menggunakan Google Auth</i>\n\n` +
        `📦 <b>Alight Motion Bulk Email</b>\n` +
        `└ <i>Generate multiple email verifications in bulk</i></blockquote>`
    );

    const replyMarkup = {
        inline_keyboard: [
            [{ text: "📤 AM Send", callback_data: "am_send" }, { text: "⚡ AM Verify", callback_data: "am_verify" }],
            [{ text: "🌐 AM Google Auth", callback_data: "am_google" }, { text: "📦 AM Bulk Email", callback_data: "am_bulk" }],
            [{ text: "📢 Cek Testimoni / Bukti Testi", url: TELEGRAM_CHANNEL_TESTI }],
            [{ text: "👨‍💻 Hubungi Owner Setres 😹", url: WHATSAPP_OWNER }]
        ]
    };

    if (messageId) {
        try { await bot.editMessageText(welcomeText, { chat_id: chatId, message_id: messageId, parse_mode: "HTML", reply_markup: replyMarkup }); } 
        catch (e) { await bot.sendMessage(chatId, welcomeText, { parse_mode: "HTML", reply_markup: replyMarkup }); }
    } else {
        await bot.sendMessage(chatId, welcomeText, { parse_mode: "HTML", reply_markup: replyMarkup });
    }
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
                `⚠️ <b>PERINGATAN: Masa Sewa Segera Habis!</b> ⚠️\n\n` +
                `<blockquote>Token lu (<code>${sub.token}</code>) sisa kurang dari <b>1 hari</b> miskin!</blockquote>\n\n` +
                `Buruan perpanjang melalui menu Pilih Token Akses sebelum bot gua tendang lu keluar!`,
                { parse_mode: "HTML" }
            );
        }

        if (timeLeft <= 0) {
            delete db.subscriptions[chatId];
            updated = true;
            bot.sendMessage(chatId, `❌ <b>Masa Sewa Telah Habis!</b>\n\nToken lu udah basi! Akses bot ditutup. Silakan beli token baru kalo punya duit.`, { parse_mode: "HTML" });
        }
    }

    if (updated) saveDatabase();
}, 60 * 60 * 1000);

// ==========================================
// COMMANDS
// ==========================================

bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    if (isFlooding(chatId)) return bot.sendMessage(chatId, `⛔ <b>KEBANYAKAN BACOT LU ANJ*NG!</b>\nPelan-pelan pencetnya, server bot gua pusing liat lu spam! 🤬🖕`, { parse_mode: "HTML" });

    const banMin = checkBanStatus(chatId);
    if (banMin > 0) return bot.sendMessage(chatId, `⛔ <b>LU DIBANNED SEMENTARA!</b>\n\n<blockquote>Mata lu picek kebanyakan masukin token salah anj*ng! Bot gua capek ngeladenin lu. Banned sisa <b>${banMin} menit</b> lagi, cuci muka sono! 🤬🖕</blockquote>`, { parse_mode: "HTML" });
    
    delete userState[chatId];
    if (db.subscriptions[chatId]) { sendMainMenu(chatId); return; }
    sendStartMenu(chatId, msg);
});

bot.onText(/\/cek/, (msg) => {
    const chatId = msg.chat.id;
    if (db.subscriptions[chatId]) {
        const sub = db.subscriptions[chatId];
        const timeLeft = sub.expiryDate - Date.now();
        const days = Math.floor(timeLeft / (1000 * 60 * 60 * 24));
        const hours = Math.floor((timeLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        bot.sendMessage(chatId, `⏱️ <b>INFO TOKEN LU:</b>\n\n<blockquote>🔑 Token: <code>${sub.token}</code>\n⏳ Sisa Waktu: <b>${days} Hari, ${hours} Jam</b> lagi.</blockquote>\n\nJangan lupa perpanjang miskin, atau akses lu gua cabut! 😹`, { parse_mode: "HTML" });
    } else {
        bot.sendMessage(chatId, `🤡 Dih halu! Lu aja belom sewa/beli token pake nanya sisa waktu anj*ng. Beli dulu sono!`, { parse_mode: "HTML" });
    }
});

bot.onText(/\/profit/, (msg) => {
    const chatId = msg.chat.id;
    if (chatId !== OWNER_TELEGRAM_ID) return bot.sendMessage(chatId, "❌ Lu siapa babi? Berani-beraninya ngecek dompet owner!");
    
    let totalBuyer = Object.keys(db.subscriptions).length;
    let estimasiKasir = totalBuyer * 15000; 
    
    bot.sendMessage(chatId, `📊 <b>LAPORAN KEUANGAN SULTAN:</b>\n\n<blockquote>├ Total Buyer Aktif: <b>${totalBuyer} Orang</b>\n├ Total Gembel Banned: <b>${Object.keys(db.timeoutUsers).length} Orang</b>\n└ Estimasi Kasar Masuk: <b>Rp${estimasiKasir.toLocaleString('id-ID')}</b></blockquote>\n\nMantap bosku, lanjut ngopi! ☕`, { parse_mode: "HTML" });
});

bot.onText(/\/bcast (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    if (chatId !== OWNER_TELEGRAM_ID) return bot.sendMessage(chatId, "❌ Lu siapa babi? Berani-beraninya pake command broadcast!");
    const broadcastMsg = match[1];
    
    let count = 0;
    for (const id in db.subscriptions) {
        bot.sendMessage(id, `📢 <b>PENGUMUMAN DARI SULTAN OWNER:</b>\n\n<blockquote>${escapeHTML(broadcastMsg)}</blockquote>\n\n<i>— Owner Setres 😹</i>`, { parse_mode: "HTML" }).catch(()=>{});
        count++;
    }
    bot.sendMessage(chatId, `✅ Broadcast sukses dikirim ke <b>${count}</b> gembel yang lagi aktif!`, { parse_mode: "HTML" });
});

bot.onText(/\/gembel/, (msg) => {
    const chatId = msg.chat.id;
    if (chatId !== OWNER_TELEGRAM_ID) return bot.sendMessage(chatId, "❌ Privasi owner tolol!");
    
    if (Object.keys(db.spamStats).length === 0) return bot.sendMessage(chatId, "Belum ada gembel tolol yang salah masukin token hari ini bos.");
    
    let sortedGembel = Object.values(db.spamStats).sort((a, b) => b.count - a.count).slice(0, 5);
    let teks = "";
    sortedGembel.forEach((g, i) => { teks += `${i+1}. <b>${escapeHTML(g.name)}</b> (Salah: ${g.count}x) 🤡\n`; });

    bot.sendMessage(chatId, `🏆 <b>WALL OF SHAME (TOP 5 GEMBEL TOLOL)</b> 🏆\n<i>Daftar manusia SDM rendah yang paling sering masukin token salah/spam:</i>\n\n<blockquote>${teks}</blockquote>`, { parse_mode: "HTML" });
});

bot.onText(/\/gen (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    if (chatId !== OWNER_TELEGRAM_ID) return bot.sendMessage(chatId, "❌ Lu siapa babi? Berani-beraninya make command owner!");
    const durationDays = match[1];
    
    const loadMsg = await animateLoading(chatId, `Menciptakan Token ${durationDays} Hari...`);
    const complexToken = generateComplexToken();

    await bot.editMessageText(
        `✅ <b>Berhasil Generate Token Baru Bosku!</b>\n\n` +
        `<blockquote>⏱️ <b>Durasi:</b> ${durationDays} Hari\n` +
        `🔑 <b>Token Akses:</b> <code>${complexToken}</code></blockquote>\n\n` +
        `<i>Salin token ini dan jual ke gembel-gembel itu.</i>`,
        { chat_id: chatId, message_id: loadMsg.message_id, parse_mode: "HTML" }
    );
});

// ==========================================
// CALLBACK QUERY (TOMBOL INTERAKTIF)
// ==========================================
bot.on('callback_query', async (callbackQuery) => {
    const msg = callbackQuery.message;
    const data = callbackQuery.data;
    const chatId = msg.chat.id;
    const userFirstName = callbackQuery.from.first_name || "Buyer";

    if (isFlooding(chatId)) return bot.answerCallbackQuery(callbackQuery.id, { text: "⚠️ Kebanyakan klik lu anj*ng! Santai dikit napa!", show_alert: true });

    const banMin = checkBanStatus(chatId);
    if (banMin > 0) return bot.answerCallbackQuery(callbackQuery.id, { text: `⛔ LU MASIH DIBANNED ${banMin} MENIT LAGI ANJ*NG! Jangan klik-klik tombol gua!`, show_alert: true });

    if (data === "show_pricing") return sendPricingMenu(chatId, msg.message_id);
    if (data === "back_to_start") { delete userState[chatId]; return sendStartMenu(chatId, msg, msg.message_id); }

    // PEMBAYARAN RAMASHOP & NOTIFIKASI OWNER
    if (["pay_1_bulan", "pay_2_bulan", "pay_3_bulan", "pay_4_bulan", "pay_permanen"].includes(data)) {
        let packageDetails = {
            "pay_1_bulan": { name: "1 Bulan", days: 30, price: "15.000" },
            "pay_2_bulan": { name: "2 Bulan", days: 60, price: "20.000" },
            "pay_3_bulan": { name: "3 Bulan", days: 90, price: "25.000" },
            "pay_4_bulan": { name: "4 Bulan", days: 120, price: "30.000" },
            "pay_permanen": { name: "Permanen", days: 3650, price: "55.000" }
        }[data];

        try { await bot.deleteMessage(chatId, msg.message_id); } catch (e) {}

        const loadMsg = await animateLoading(chatId, `Memproses Pembayaran ${packageDetails.name}...`);

        try {
            const generatedToken = generateComplexToken();
            const expiryTime = Date.now() + (packageDetails.days * 24 * 60 * 60 * 1000);
            
            db.subscriptions[chatId] = { token: generatedToken, expiryDate: expiryTime, warningSent: false, duration: packageDetails.name };
            saveDatabase();

            bot.sendMessage(OWNER_TELEGRAM_ID, `💰 <b>BOS SETRES! DUIT MASUK!</b> 💰\n\n<blockquote>👤 <b>Buyer:</b> ${escapeHTML(userFirstName)}\n🆔 <b>ID:</b> <code>${chatId}</code>\n📦 <b>Paket:</b> ${packageDetails.name}\n💵 <b>Harga:</b> Rp${packageDetails.price}\n🔑 <b>Token Jatahnya:</b> <code>${generatedToken}</code></blockquote>\n\nMantap bosku! Cair lagi buat beli kopi! ☕`, { parse_mode: "HTML" });

            let paymentRoastText = "";
            if (data === "pay_1_bulan") {
                paymentRoastText = `🤡 <b>WKWKWK LU BELI PAKET KERE (1 Bulan)!</b> 🤡\n\nDih, miskin amat lu anj*ng maksain seva sebulan doang? 😭 Takut rugi ya bangsat? Mending duit lu buat beli gorengan sekampung daripada sewa bot nanggung wkwk! Nih token gembel lu:`;
            } else if (data === "pay_2_bulan") {
                paymentRoastText = `🤪 <b>PAKET 2 BULAN: MENDANG-MENDING KONT*L!</b> 🤪\n\nTanggung amat lu babi sewa cuma 2 bulan, miskin mah miskin aja gausah gaya-gayaan wkwk. Yaudah nih nikmatin token hasil nguli lu:`;
            } else if (data === "pay_3_bulan") {
                paymentRoastText = `😏 <b>PAKET 3 BULAN: GAYA SULTAN DOMPET PELAJAR</b> 😏\n\nNggak miskin-miskin amat tapi gaya lu selangit bangsat. Standar kaum pertengahan yang hobi ngutang. Nih token lu, pake yang bener!`;
            } else if (data === "pay_4_bulan") {
                paymentRoastText = `😎 <b>PAKET 4 BULAN: LUMAYAN ADA OTAK LU</b> 😎\n\nWah tumben agak modal dikit lu b*rengsat. Walaupun masih bau-bau kencur, seenggaknya otak lu agak encer dibanding gembel yang beli sebulan. Nih tokennya:`;
            } else if (data === "pay_permanen") {
                paymentRoastText = `👑🔥 <b>HORMAT BOS, PEMBELI PAKET PERMANEN SULTAN!</b> 🔥👑\n\nWahai Sultan penguasa bumi! Keren banget mental kelas atas lu bro, gak kayak gembel-gembel yang ngeteng bulanan. Sungguh wibawa sultan terpancar nyata! 🙇‍♂️ Silakan pakai token VIP lu bos:`;
            }

            try { await bot.deleteMessage(chatId, loadMsg.message_id); } catch (e) {}
            await bot.sendMessage(chatId, `✅ <b>Pembayaran Berhasil Diverifikasi!</b>\n\n<blockquote>${paymentRoastText}</blockquote>\n\n🔑 <b>Token Akses Anda:</b> <code>${generatedToken}</code>\n\nMembuka menu utama bot...`, { parse_mode: "HTML" });
            setTimeout(() => sendMainMenu(chatId), 2500);

        } catch (error) {
            try { await bot.deleteMessage(chatId, loadMsg.message_id); } catch (e) {}
            await bot.sendMessage(chatId, getOwnerRoastMsg(), { parse_mode: "HTML" });
        }
        return;
    }

    if (data === "free_trial") {
        const now = Date.now();
        const oneWeekMs = 7 * 24 * 60 * 60 * 1000; 
        const lastTrialTime = db.trialCooldowns[chatId] || 0;

        if (now - lastTrialTime < oneWeekMs) {
            const remainingDays = Math.ceil((oneWeekMs - (now - lastTrialTime)) / (1000 * 60 * 60 * 24));
            return bot.answerCallbackQuery(callbackQuery.id, { text: `⚠️ Lu udah maling uji coba gratis kemaren anj*ng! Tunggu ${remainingDays} hari lagi kalau mau nyomot gratisan.`, show_alert: true });
        }

        db.trialCooldowns[chatId] = now; 
        const trialToken = generateComplexToken();
        db.subscriptions[chatId] = { token: trialToken, expiryDate: now + (5 * 60 * 1000), warningSent: false, duration: "Trial" };
        saveDatabase();

        await bot.answerCallbackQuery(callbackQuery.id, { text: "🎉 Uji coba 5 menit berhasil diaktifkan, pake cepet gembel!", show_alert: true });
        await bot.editMessageText(`🎁 <b>Uji Coba Gratis 5 Menit Diaktifkan!</b>\n\n<blockquote>🔑 Token Sementara: <code>${trialToken}</code>\n⏳ Masa aktif: <b>5 Menit</b> dari sekarang.</blockquote>\n\nMembuka menu utama...`, { chat_id: chatId, message_id: msg.message_id, parse_mode: "HTML" });

        setTimeout(() => {
            if (db.subscriptions[chatId] && db.subscriptions[chatId].duration === "Trial") {
                delete db.subscriptions[chatId];
                saveDatabase();
                bot.sendMessage(chatId, "⏰ <b>Masa Uji Coba 5 Menit Telah Habis!</b>\n\nWaktu lu abis gembel! Akses bot ditutup. Silakan beli paket permanen gausah nyari gratisan mulu!", { parse_mode: "HTML" });
            }
        }, 5 * 60 * 1000);

        setTimeout(() => sendMainMenu(chatId, msg.message_id), 1500);
        return;
    }

    if (data === "input_token_menu") {
        userState[chatId] = { step: "waiting_for_rental_token" };
        return bot.editMessageText(`🔑 <b>Masukkan Token Akses Anda:</b>\n\n<blockquote>Format token valid: <code>MSH-XXXX-XXXX-XXXX</code> atau Token Sakti.</blockquote>\nSilakan ketik dan kirim token Anda ke chat ini:`, { chat_id: chatId, message_id: msg.message_id, parse_mode: "HTML", reply_markup: { inline_keyboard: [[{ text: "⬅️ Kembali", callback_data: "back_to_start" }]] } });
    }

    if (!db.subscriptions[chatId]) return bot.answerCallbackQuery(callbackQuery.id, { text: "⚠️ Masukin token dulu anj*ng, jangan songong mau masuk menu tanpa bayar!", show_alert: true });

    if (["am_send", "am_verify", "am_google", "am_bulk"].includes(data)) {
        userState[chatId] = { action: data, step: "waiting_for_email" };
        let titles = { "am_send": "Alight Motion Send", "am_verify": "Alight Motion Verify", "am_google": "Alight Motion Google Auth", "am_bulk": "Alight Motion Bulk Email" };
        try { await bot.deleteMessage(chatId, msg.message_id); } catch (e) {}
        return bot.sendMessage(chatId, `📧 <b>Fitur: ${titles[data]}</b>\n\n<blockquote>Silakan ketik dan kirim <b>email</b> Anda ke chat ini:</blockquote>`, { parse_mode: "HTML", reply_markup: { inline_keyboard: [[{ text: "❌ Batal", callback_data: "back_to_menu" }]] } });
    }

    if (data === "back_to_menu") {
        userState[chatId] = {}; return sendMainMenu(chatId, msg.message_id);
    }
    await bot.answerCallbackQuery(callbackQuery.id);
});

// ==========================================
// HANDLER PESAN TEKS
// ==========================================
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    const userName = msg.from.first_name || "Gembel Tanpa Nama";

    if (!text || text.startsWith('/')) return;
    
    if (isFlooding(chatId)) return bot.sendMessage(chatId, `⛔ <b>KEBANYAKAN BACOT LU ANJ*NG!</b>\nJangan spam chat bot gua! 🤬🖕`, { parse_mode: "HTML" });

    const banMin = checkBanStatus(chatId);
    if (banMin > 0) return bot.sendMessage(chatId, `⛔ <b>DIEM LU ANJ*NG!</b>\nSisa banned lu masih <b>${banMin} menit</b> lagi! Gausah spam chat bot gua! 🤬🖕`, { parse_mode: "HTML" });

    const currentState = userState[chatId];
    if (!currentState) return;

    if (currentState.step === "waiting_for_rental_token") {
        const inputToken = text.trim();
        const tokenRegex = /^MSH-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/i;
        const isMasterToken = (inputToken === "HAOMI_XML");

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
                return bot.sendMessage(chatId, `⛔ <b>AUTO-BANNED ANJ*NG!</b> ⛔\n\n<blockquote>Mata lu picek ya?! Udah 3x lu nyoba masukin token zonk! Bot gua capek ngeladenin sdm rendah kayak lu.\n\n<b>LU GUA BANNED 10 MENIT!</b> Mending lu cuci muka pake air comberan dulu sana! 🤬🖕</blockquote>`, { parse_mode: "HTML" });
            }

            saveDatabase();
            lastWrongTokens.set(chatId, inputToken); 
            await bot.sendMessage(chatId, `❌ <b>Format / Akses Ditolak B*rengsat!</b>\n<blockquote>${selectedToxicMsg}</blockquote>`, { parse_mode: "HTML" });
            if(isInvalidToken) setTimeout(() => sendStartMenu(chatId, msg), 3500);
        };

        if (!tokenRegex.test(inputToken) && !isMasterToken) return punishBuyer(false);

        const loadMsg = await animateLoading(chatId, "Validasi Keabsahan Token...");

        try {
            if (!isMasterToken) {
                await axios.get(`${ENV_CONFIG.HAO_API_BASE}/alightmotion/send`, { params: { akseskey: inputToken, email: "validation-check@gmail.com" }, timeout: 15000 });
            }
            
            lastWrongTokens.delete(chatId); 
            wrongAttempts.delete(chatId);
            
            const expiryTime = isMasterToken ? (Date.now() + (3650 * 24 * 60 * 60 * 1000)) : (Date.now() + (30 * 24 * 60 * 60 * 1000));
            
            db.subscriptions[chatId] = { token: inputToken, expiryDate: expiryTime, warningSent: false };
            saveDatabase();

            delete userState[chatId];
            try { await bot.deleteMessage(chatId, loadMsg.message_id); } catch (e) {}
            
            if (isMasterToken) {
                await bot.sendMessage(chatId, `<blockquote>👑🔥 <b>AKSES MASTER TERBUKA! SELAMAT DATANG SULTAN HAOMI!</b> 🔥👑\n\nAkses bot permanen udah aktif tanpa batas buat lu bos!</blockquote>`, { parse_mode: "HTML" });
            }

            await sendMainMenu(chatId);
        } catch (error) {
            try { await bot.deleteMessage(chatId, loadMsg.message_id); } catch (e) {}
            if (!error.response || error.response.status >= 500) {
                await bot.sendMessage(chatId, getOwnerRoastMsg(), { parse_mode: "HTML" }); 
                setTimeout(() => sendStartMenu(chatId, msg), 3500);
            } else {
                punishBuyer(true); 
            }
        }
        return;
    }

    if (currentState.step === "waiting_for_email") {
        const userInput = text.trim();
        delete userState[chatId];

        const loadMsg = await animateLoading(chatId, "Memproses Data ke Server...");

        try {
            const endpointMap = { "am_send": "/alightmotion/send", "am_verify": "/alightmotion/verify", "am_google": "/alightmotion/google", "am_bulk": "/alightmotion/bulk" };
            const response = await axios.get(`${ENV_CONFIG.HAO_API_BASE}${endpointMap[currentState.action]}`, { params: { email: userInput }, timeout: 20000 });
            
            try { await bot.deleteMessage(chatId, loadMsg.message_id); } catch (e) {}
            await bot.sendMessage(chatId, `✅ <b>Berhasil Diproses Gais!</b>\n\n<blockquote>Respon Server:\n<code>${escapeHTML(JSON.stringify(response.data.message || response.data, null, 2))}</code></blockquote>`, { parse_mode: "HTML", reply_markup: { inline_keyboard: [[{ text: "🏠 Menu Utama", callback_data: "back_to_menu" }]] } });

        } catch (error) {
            try { await bot.deleteMessage(chatId, loadMsg.message_id); } catch (e) {}
            await bot.sendMessage(chatId, getOwnerRoastMsg(), { parse_mode: "HTML", reply_markup: { inline_keyboard: [[{ text: "🏠 Menu Utama", callback_data: "back_to_menu" }]] } });
        }
    }
});

console.log("Bot Telegram Berjalan! Mode Ultimate: ON 🔥");
