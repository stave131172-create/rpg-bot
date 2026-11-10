const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, AttachmentBuilder } = require('discord.js');
const { createCanvas, loadImage } = require('canvas');
const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');
require('dotenv').config();
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('RPG Bot is alive and running 24/7!');
});

app.listen(PORT, () => {
    console.log(`Server is listening on port ${PORT}`);
});

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// ================= KẾT NỐI MONGODB =================
const mongoUri = process.env.MONGO_URI || "mongodb://localhost:27017";
const mongoClient = new MongoClient(mongoUri);
let dbCollection;

async function connectDB() {
    try {
        await mongoClient.connect();
        const database = mongoClient.db("rpg_bot_db");
        dbCollection = database.collection("players");
        console.log("📦 Đã kết nối thành công tới MongoDB cơ sở dữ liệu!");
    } catch (error) {
        console.error("❌ Lỗi kết nối MongoDB:", error);
    }
}
connectDB();

async function getPlayerData(userId) {
    if (!dbCollection) return null;
    return await dbCollection.findOne({ userId: userId });
}

async function savePlayerData(userId, playerData) {
    if (!dbCollection) return;
    await dbCollection.updateOne(
        { userId: userId },
        { $set: playerData },
        { upsert: true }
    );
}

async function resetAllData() {
    if (!dbCollection) return;
    await dbCollection.deleteMany({});
}

const activeDungeons = new Map();

// ================= DANH SÁCH QUÁI & TRANG BỊ RƠI (LOOT TABLE) =================
const FOREST_MOBS = [
    {
        name: "Slime Tai Thỏ",
        hp: 80,
        maxHp: 80,
        level: 3,
        atk: 12,
        def: 4,
        rate: 50,
        image: path.join(__dirname, 'assets', 'slime_mob.png')
    },
    {
        name: "Goblin Trinh Sát",
        hp: 95,
        maxHp: 95,
        level: 4,
        atk: 15,
        def: 5,
        rate: 30,
        image: path.join(__dirname, 'assets', 'goblin_mob.png')
    },
    {
        name: "Cây Ăn Thịt Hoang Dã",
        hp: 110,
        maxHp: 110,
        level: 5,
        atk: 18,
        def: 8,
        rate: 20,
        image: path.join(__dirname, 'assets', 'plant_mob.png')
    }
];

const FOREST_EQUIPMENT_DROPS = [
    { name: "Kiếm gỉ sét", type: "weapon", atk: 5, def: 0, durability: 10, maxDurability: 10, rarity: "Common", dropRate: 5 },
    { name: "Giáp mỏng", type: "armor", atk: 0, def: 20, durability: 10, maxDurability: 10, rarity: "Common", dropRate: 5 },
    { name: "Đao Sắt", type: "weapon", atk: 10, def: 0, durability: 45, maxDurability: 45, rarity: "Uncommon", dropRate: 5 },
    { name: "Kiếm ngắn", type: "weapon", atk: 12, def: 0, durability: 30, maxDurability: 30, rarity: "Uncommon", dropRate: 10 },
    { name: "Khiên gỗ", type: "armor", atk: 0, def: 15, durability: 50, maxDurability: 50, rarity: "Uncommon", dropRate: 5 }
];

function rollEquipmentDrops() {
    let droppedItems = [];
    for (const item of FOREST_EQUIPMENT_DROPS) {
        const roll = Math.random() * 100;
        if (roll <= item.dropRate) {
            droppedItems.push({ ...item });
        }
    }
    return droppedItems;
}

function spawnRandomMob() {
    const roll = Math.random() * 100;
    let accumulated = 0;
    for (const mob of FOREST_MOBS) {
        accumulated += mob.rate;
        if (roll <= accumulated) return mob;
    }
    return FOREST_MOBS[0];
}

function getMapPath() {
    const pngPath = path.join(__dirname, 'map.png');
    const jpgPath = path.join(__dirname, 'map.jpg');
    if (fs.existsSync(pngPath)) return pngPath;
    if (fs.existsSync(jpgPath)) return jpgPath;
    return null;
}

const PLAYER_IMAGE_PATH = path.join(__dirname, 'player.png');
const START_BOX_IMAGE_PATH = path.join(__dirname, 'start_box.png');
const HUD_IMAGE_PATH = path.join(__dirname, 'hud.png');
const ENEMY_HUD_IMAGE_PATH = path.join(__dirname, 'enemy_hud.png'); 
const CRIT_EFFECT_PATH = path.join(__dirname, 'assets', 'crit_effect.png');
const MISS_EFFECT_PATH = path.join(__dirname, 'assets', 'miss_effect.png');
const BLOCK_EFFECT_PATH = path.join(__dirname, 'assets', 'block_effect.png');
const HELL_BURN_EFFECT_PATH = path.join(__dirname, 'assets', 'hell_burn_effect.png');
const BURN_ICON_PATH = path.join(__dirname, 'assets', 'burn_icon.png');

const RACES = [
    {
        name: "Slime", rarity: "Thường (Common)", rate: 35,
        hp: 120, atk: 8, def: 5, spd: 10,
        buff: "Bất tử dẻo dai: Kháng 10% sát thương nhận vào, né tránh tốt.",
        weakness: "Sát thương kém & Giáp mỏng.",
        color: 0x85E3FF,
        image: "https://media.discordapp.net/attachments/1565325975242154044/1565366575845089342/deee733b-9e71-401f-85fc-baab0c3631e2.png?ex=6ae4a4ba&is=6ae3533a&hm=a55ce0fda855346ecf46f9f86473210b9c84f840ad4dd0ea7ac70cc4d7ed8d97&=&format=webp&quality=lossless&width=768&height=577"
    },
    {
        name: "Goblin", rarity: "Thường (Common)", rate: 30,
        hp: 85, atk: 11, def: 6, spd: 18,
        buff: "Máu liều & Lượm lặt: Nhận thêm +20% Vàng sau trận đấu.",
        weakness: "Máu giấy & Dễ sốc sát thương.",
        color: 0x93E9BE,
        image: "https://media.discordapp.net/attachments/1565325975242154044/1565366576784605394/fb23c648-83d6-4623-aef4-c36b43935149.png?ex=6ae4a4bb&is=6ae3533b&hm=5ac80e0ce721fbcadf5b6740ea98337ab6da6f251a0a046abf6bef9c52a02c73&=&format=webp&quality=lossless&width=768&height=577"
    },
    {
        name: "Human", rarity: "Hiếm (Rare)", rate: 18,
        hp: 100, atk: 10, def: 10, spd: 15,
        buff: "Kẻ thích nghi: Nhận thêm +15% điểm EXP khi làm nhiệm vụ.",
        weakness: "Không có điểm yếu nổi trội (Cân bằng).",
        color: 0xFFD3B6,
        image: "https://media.discordapp.net/attachments/1565325975242154044/1565366574561624194/1f4b5982-351f-4bae-a683-4631cc24cf56.png?ex=6ae4a4ba&is=6ae3533a&hm=3e2ab497c9b99a5a1612f4f9ea69f62c0ed87abed684d06c0d22882f99a93370&=&format=webp&quality=lossless&width=768&height=577"
    },
    {
        name: "Elf", rarity: "Hiếm (Rare)", rate: 10,
        hp: 80, atk: 13, def: 7, spd: 22,
        buff: "Sát thương chí mạng: Tăng +10% Tỷ lệ bạo kích.",
        weakness: "Huyết bạc (Máu cực thấp).",
        color: 0xFFAAA5,
        image: "https://media.discordapp.net/attachments/1565325975242154044/1565366574993641624/3029e168-85b4-45da-b481-4cf6855cf31b.png?ex=6ae4a4ba&is=6ae3533a&hm=9adc2aba71b8b1e5027586147faab7d735e45e42835842c3b0f0652eb398197f&=&format=webp&quality=lossless&width=768&height=577"
    },
    {
        name: "Evil", rarity: "Sử Thi (Epic)", rate: 4,
        hp: 130, atk: 16, def: 12, spd: 12,
        buff: "Huyết sát & Hút máu toàn năng.",
        weakness: "Tốc độ chậm chạp.",
        color: 0xFF8B94,
        image: "https://media.discordapp.net/attachments/1565325975242154044/1565366576301998240/f41347b3-e3bc-4c24-b52d-fcf7c42e02d2.png?ex=6ae4a4ba&is=6ae3533a&hm=19dada47ae0ad05c63aa0b255e51bb5a3e899072fbe6a295fd4f2a547354db3f&=&format=webp&quality=lossless&width=768&height=577"
    },
    {
        name: "Angel", rarity: "Huyền Thoại (Legendary)", rate: 2,
        hp: 110, atk: 13, def: 15, spd: 17,
        buff: "Ân huệ thần linh: Hồi 3% HP mỗi lượt. Đỡ 1 đòn chí tử.",
        weakness: "Sức mạnh bộc phát thấp.",
        color: 0xFFFFB5,
        image: "https://media.discordapp.net/attachments/1565325975242154044/1565366575345700985/cde77ec3-b00c-4835-ae57-6496e176031c.png?ex=6ae4a4ba&is=6ae3533a&hm=f58743c047ca1ca83413b2c3a5763ec1a268db6e8a0fed1083ae0c28f2a0c804&=&format=webp&quality=lossless&width=768&height=577"
    },
    {
        name: "Dragon", rarity: "Thần Thoại (Mythic)", rate: 1,
        hp: 160, atk: 20, def: 18, spd: 19,
        buff: "Hơi thở nguyên thủy & Huyết Long.",
        weakness: "Tốn kém duy trì & Khó tiến hóa.",
        color: 0xD8B4FE,
        image: "https://media.discordapp.net/attachments/1565325975242154044/1565366577212297357/75abf1d8-36fd-4cf9-a7c5-0a0d80a31f44.png?ex=6ae4a4bb&is=6ae3533b&hm=38d010dcd239aa1692a1943e3c9971f0df33e43aa36b3cbf3e54db9990e8c4e8&=&format=webp&quality=lossless&width=768&height=577"
    }
];

function rollRace() {
    const roll = Math.random() * 100;
    let accumulated = 0;
    for (const race of RACES) {
        accumulated += race.rate;
        if (roll <= accumulated) return race;
    }
    return RACES[0];
}

function drawOutlinedText(ctx, text, x, y, font, fillColor = '#ffffff', strokeColor = '#000000', lineWidth = 3) {
    ctx.font = font;
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = lineWidth;
    ctx.lineJoin = 'miter';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = fillColor;
    ctx.fillText(text, x, y);
}

// ================= HÀM VẼ CANVAS DUNGEON =================
async function generateDungeonImage(player, dungeon) {
    const width = 900;
    const height = 500;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    const mapPath = getMapPath();
    if (mapPath) {
        try {
            const bgImage = await loadImage(mapPath);
            ctx.drawImage(bgImage, 0, 0, width, height);
        } catch (e) {
            ctx.fillStyle = "#2c3e50";
            ctx.fillRect(0, 0, width, height);
        }
    } else {
        ctx.fillStyle = "#2c3e50";
        ctx.fillRect(0, 0, width, height);
    }

    const currentMob = dungeon?.mob || FOREST_MOBS[0];

    // 🌟 Phóng to gấp đôi plant_mob (190x190) và đẩy toạ độ Y lên cao hơn (ví dụ y = 55) để cố định vị trí chân không bị tràn xuống dưới
    let enemySize = 100;
    let enemyX = 540;
    let enemyY = 145;

    if (currentMob.name === "Cây Ăn Thịt Hoang Dã") {
        enemySize = 190; 
        enemyX = 495;    
        enemyY = 55;     // Đẩy lên cao hơn để phần phình to hướng lên trên và sang trái
    }

    if (!dungeon?.isHellBurnAnim && currentMob && fs.existsSync(currentMob.image)) {
        try {
            const enemyImg = await loadImage(currentMob.image);
            ctx.drawImage(enemyImg, enemyX, enemyY, enemySize, enemySize);
        } catch (e) {}
    }

    const playerX = 90;
    const playerY = 100;
    const playerSize = 340;
    if (fs.existsSync(PLAYER_IMAGE_PATH)) {
        try {
            const playerImg = await loadImage(PLAYER_IMAGE_PATH);
            ctx.drawImage(playerImg, playerX, playerY, playerSize, playerSize);
        } catch (e) {}
    }

    if (dungeon?.isHellBurnAnim && fs.existsSync(HELL_BURN_EFFECT_PATH)) {
        try {
            const burnAnimImg = await loadImage(HELL_BURN_EFFECT_PATH);
            ctx.drawImage(burnAnimImg, enemyX - 45, enemyY - 50, enemySize * 1.6, enemySize * 1.6);
        } catch (e) {}
    } else {
        const effectX = enemyX + (enemySize / 2) - 45;
        const effectY = enemyY - 35;
        if (dungeon?.isCrit && fs.existsSync(CRIT_EFFECT_PATH)) {
            try {
                const critImg = await loadImage(CRIT_EFFECT_PATH);
                ctx.drawImage(critImg, effectX, effectY, 90, 40);
            } catch (e) {}
        } else if (dungeon?.isMiss && fs.existsSync(MISS_EFFECT_PATH)) {
            try {
                const missImg = await loadImage(MISS_EFFECT_PATH);
                ctx.drawImage(missImg, effectX, effectY, 90, 40);
            } catch (e) {}
        } else if (dungeon?.isBlock && fs.existsSync(BLOCK_EFFECT_PATH)) {
            try {
                const blockImg = await loadImage(BLOCK_EFFECT_PATH);
                ctx.drawImage(blockImg, effectX, effectY, 90, 40);
            } catch (e) {}
        }
    }

    const eHudX = 30;
    const eHudY = 25;
    const eHudW = 410;
    const eHudH = 90;

    const maxEnemyHp = currentMob.maxHp || 80;
    const enemyHp = dungeon?.enemyHp !== undefined ? dungeon.enemyHp : maxEnemyHp;
    const eHpRatio = Math.max(0, enemyHp / maxEnemyHp);
    let eColor = '#2ecc71';
    if (eHpRatio <= 0.1) eColor = '#e74c3c';
    else if (eHpRatio <= 0.5) eColor = '#f39c12';

    const enemyHpBarStartX = eHudX + 80;
    const enemyHpBarStartY = eHudY + 40;
    const enemyHpBarMaxW = 300;
    const enemyHpBarH = 15;

    if (eHpRatio > 0) {
        ctx.fillStyle = eColor;
        ctx.fillRect(enemyHpBarStartX, enemyHpBarStartY, enemyHpBarMaxW * eHpRatio, enemyHpBarH);
    }

    if (fs.existsSync(ENEMY_HUD_IMAGE_PATH)) {
        try {
            const enemyHudImg = await loadImage(ENEMY_HUD_IMAGE_PATH);
            ctx.drawImage(enemyHudImg, eHudX, eHudY, eHudW, eHudH);
        } catch (e) {}
    }

    drawOutlinedText(ctx, `${currentMob.name}`, eHudX + 80, eHudY + 30, "bold 16px sans-serif", "#ffffff");
    drawOutlinedText(ctx, `Lv.`, eHudX + 225, eHudY + 30, "bold 16px sans-serif", "#ffffff");
    drawOutlinedText(ctx, `${currentMob.level}`, eHudX + 252, eHudY + 30, "bold 16px sans-serif", "#f1c40f");
    drawOutlinedText(ctx, `${enemyHp}/${maxEnemyHp}`, eHudX + 300, eHudY + 48, "bold 12px sans-serif", "#ffffff");

    const pHudX = 450;
    const pHudY = 310;
    const pHudW = 410;
    const pHudH = 160;

    const maxPlayerHp = dungeon?.maxPlayerHp || player?.stats?.hp || 100;
    const currentPlayerHp = dungeon?.playerHp !== undefined ? dungeon.playerHp : maxPlayerHp;
    const pHpRatio = Math.max(0, currentPlayerHp / maxPlayerHp);
    let pColor = '#2ecc71';
    if (pHpRatio <= 0.1) pColor = '#e74c3c';
    else if (pHpRatio <= 0.5) pColor = '#f39c12';

    const hpBarStartX = pHudX + 98;
    const hpBarStartY = pHudY + 57;
    const hpBarMaxW = 275;
    const hpBarH = 22;

    if (pHpRatio > 0) {
        ctx.fillStyle = pColor;
        ctx.fillRect(hpBarStartX, hpBarStartY, hpBarMaxW * pHpRatio, hpBarH);
    }

    const mpBarStartX = pHudX + 80;
    const mpBarStartY = pHudY + 100;
    const mpBarMaxW = 150;
    const mpBarH = 16;
    const maxMp = player?.maxMp || 60;
    const currentMp = dungeon?.playerMp !== undefined ? dungeon.playerMp : maxMp;
    const mpRatio = Math.max(0, currentMp / maxMp);

    if (mpRatio > 0) {
        ctx.fillStyle = "#0055ff";
        ctx.fillRect(mpBarStartX, mpBarStartY, mpBarMaxW * mpRatio, mpBarH);
    }

    const xpBarStartX = pHudX + 300;
    const xpBarStartY = pHudY + 100;
    const xpBarMaxW = 82;
    const xpBarH = 16;
    const currentExp = player?.exp || 0;
    const maxExp = player?.maxExp || 100;
    const xpRatio = Math.min(1, currentExp / maxExp);

    if (xpRatio > 0) {
        ctx.fillStyle = "#00bcd4";
        ctx.fillRect(xpBarStartX, xpBarStartY, xpBarMaxW * xpRatio, xpBarH);
    }

    if (fs.existsSync(HUD_IMAGE_PATH)) {
        try {
            const hudImg = await loadImage(HUD_IMAGE_PATH);
            ctx.drawImage(hudImg, pHudX, pHudY, pHudW, pHudH);
        } catch (e) {}
    }

    drawOutlinedText(ctx, `${player?.name || 'Player'}`, pHudX + 80, pHudY + 45, "bold 15px sans-serif", "#ffffff");
    drawOutlinedText(ctx, `Lv.`, pHudX + 205, pHudY + 45, "bold 15px sans-serif", "#ffffff");
    drawOutlinedText(ctx, `${player?.level || 1}`, pHudX + 233, pHudY + 45, "bold 15px sans-serif", "#f1c40f");
    drawOutlinedText(ctx, `${currentPlayerHp} / ${maxPlayerHp}`, pHudX + 280, pHudY + 75, "bold 13px sans-serif", "#ffffff");
    drawOutlinedText(ctx, `${currentMp} / ${maxMp}`, pHudX + 130, pHudY + 110, "bold 12px sans-serif", "#ffffff");

    return canvas.toBuffer('image/png');
}

client.once('ready', () => {
    console.log(`Bot đã đăng nhập thành công: ${client.user.tag}`);
});

client.on('messageCreate', async message => {
    if (message.author.bot) return;

    const userId = message.author.id;

    if (message.content === '!reset 2004') {
        await resetAllData();
        activeDungeons.clear();
        return message.reply("🧹 **Đã reset toàn bộ dữ liệu nhân vật trên MongoDB thành công!**");
    }

    if (message.content.startsWith('!start 2004')) {
        const args = message.content.split(' ');
        const targetRaceName = args[2] ? args[2].toLowerCase() : null;

        const existingPlayer = await getPlayerData(userId);
        if (existingPlayer) {
            return message.reply("⚠️ Bạn đã có nhân vật rồi! Dùng lệnh `!reset 2004` trước nếu muốn tạo lại.");
        }

        let selectedRace = null;
        if (targetRaceName) {
            selectedRace = RACES.find(r => r.name.toLowerCase() === targetRaceName);
        }
        if (!selectedRace) {
            selectedRace = rollRace();
        }

        const newPlayer = {
            userId: userId,
            name: message.author.username,
            level: 1,
            exp: 0,
            maxExp: 100,
            stamina: 100,
            maxStamina: 100,
            mp: 60,
            maxMp: 60,
            race: selectedRace.name,
            stats: { hp: selectedRace.hp, atk: selectedRace.atk, def: selectedRace.def, spd: selectedRace.spd },
            inventory: [],
            equipped: { weapon: null, armor: null }
        };
        await savePlayerData(userId, newPlayer);

        const resultEmbed = new EmbedBuilder()
            .setTitle(`🔓 [CHEAT 2004] KHỞI THỨC ĐẶC QUYỀN: ${selectedRace.name.toUpperCase()}!`)
            .setColor(selectedRace.color)
            .setDescription(`Huyết mạch tối cao được kích hoạt qua lệnh mật mã! Chào mừng anh hùng **${newPlayer.name}**.`)
            .addFields(
                { name: "📜 Độ hiếm", value: selectedRace.rarity, inline: true },
                { name: "❤️ HP (Máu)", value: `${selectedRace.hp}`, inline: true },
                { name: "⚔️ ATK (Sức đánh)", value: `${selectedRace.atk}`, inline: true },
                { name: "🛡️ DEF (Giáp)", value: `${selectedRace.def}`, inline: true },
                { name: "⚡ SPD (Tốc độ)", value: `${selectedRace.spd}`, inline: true },
                { name: "✨ Thiên Phú / Buff", value: selectedRace.buff, inline: false },
                { name: "⚠️ Điểm Yếu", value: selectedRace.weakness, inline: false }
            )
            .setImage(selectedRace.image)
            .setFooter({ text: `Gõ !menu để mở giao diện quản lý nhân vật!` });

        return message.reply({ embeds: [resultEmbed] });
    }

    if (message.content === '!start') {
        const existingPlayer = await getPlayerData(userId);
        if (existingPlayer) {
            const warningMsg = await message.reply("⚠️ Bạn đã có nhân vật rồi! Dùng lệnh `!menu`.");
            setTimeout(async () => {
                try { await warningMsg.delete(); await message.delete(); } catch (err) {}
            }, 5000);
            return;
        }

        const embed = new EmbedBuilder()
            .setTitle("✨ KHỞI TẠO TÀI KHOẢN RPG ✨")
            .setDescription("Chào mừng bạn đến với thế giới RPG!\nNhấn nút bên dưới để đặt tên nhân vật.")
            .setColor(0xFFA500);

        let filesArr = [];
        if (fs.existsSync(START_BOX_IMAGE_PATH)) {
            const attachment = new AttachmentBuilder(START_BOX_IMAGE_PATH, { name: 'start_box.png' });
            embed.setImage('attachment://start_box.png');
            filesArr.push(attachment);
        }

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`open_setname_modal_${userId}`).setLabel('📝 Đặt Tên Nhân Vật').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`roll_race_locked_${userId}`).setLabel('🎲 Khởi Thức Chủng Tộc (Khóa)').setStyle(ButtonStyle.Secondary).setDisabled(true)
        );

        return message.reply({ embeds: [embed], files: filesArr, components: [row] });
    }

    if (message.content === '!menu') {
        const player = await getPlayerData(userId);
        if (!player) {
            return message.reply({ content: "⚠️ Bạn chưa tạo nhân vật! Hãy gõ `!start`.", ephemeral: true });
        }

        const raceInfo = player.race ? player.race : "Chưa thức tỉnh";
        const staminaBar = '🟩'.repeat(Math.round((player.stamina / player.maxStamina) * 10)) + '⬜'.repeat(10 - Math.round((player.stamina / player.maxStamina) * 10));

        const menuEmbed = new EmbedBuilder()
            .setTitle(`🛡️ HỒ SƠ NHÂN VẬT: ${player.name}`)
            .setColor(0x5865F2)
            .addFields(
                { name: "👤 Chủng Tộc", value: `\`${raceInfo}\``, inline: true },
                { name: "⭐ Cấp Độ", value: `\`Level ${player.level}\``, inline: true },
                { name: "📊 EXP", value: `\`${player.exp} / ${player.maxExp}\``, inline: true },
                { name: "⚡ Thể Lực", value: `${staminaBar} \`[${player.stamina}/${player.maxStamina}]\``, inline: false }
            )
            .setThumbnail(message.author.displayAvatarURL());

        const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('btn_hosso').setLabel('👤 Hồ Sơ').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('btn_huongdan').setLabel('📖 Hướng Dẫn').setStyle(ButtonStyle.Primary)
        );
        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('btn_dungeon').setLabel('⚔️ Khám Phá Dungeon (Khu Rừng)').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('btn_nhiemvu').setLabel('📜 Nhiệm Vụ').setStyle(ButtonStyle.Secondary).setDisabled(true)
        );
        const row3 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('btn_hanhtrang').setLabel('🎒 Hành Trang & Trang Bị').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('btn_cuahang').setLabel('🛒 Cửa Hàng').setStyle(ButtonStyle.Secondary)
        );

        return message.reply({ embeds: [menuEmbed], components: [row1, row2, row3] });
    }

    if (message.content.startsWith('!mac ')) {
        const player = await getPlayerData(userId);
        if (!player) return message.reply("⚠️ Bạn chưa có nhân vật!");

        const args = message.content.split(' ');
        const index = parseInt(args[1]) - 1;

        if (!player.inventory || !player.inventory[index]) {
            return message.reply("⚠️ Số thứ tự trang bị trong hành trang không hợp lệ!");
        }

        const item = player.inventory[index];
        if (!player.equipped) player.equipped = { weapon: null, armor: null };

        if (item.type === 'weapon') {
            if (player.equipped.weapon) player.inventory.push(player.equipped.weapon);
            player.equipped.weapon = item;
        } else if (item.type === 'armor') {
            if (player.equipped.armor) player.inventory.push(player.equipped.armor);
            player.equipped.armor = item;
        }

        player.inventory.splice(index, 1);
        await savePlayerData(userId, player);

        return message.reply(`✅ Bạn đã trang bị thành công **${item.name}** [+${item.atk || item.def} ${item.type === 'weapon' ? 'ATK' : 'DEF'}]!`);
    }
});

client.on('interactionCreate', async interaction => {
    const userId = interaction.user.id;

    if (interaction.isButton() && interaction.customId.startsWith('open_setname_modal_')) {
        const targetUserId = interaction.customId.split('_')[3];
        if (userId !== targetUserId) return interaction.reply({ content: "⚠️ Không phải bảng của bạn!", ephemeral: true });

        const modal = new ModalBuilder().setCustomId(`setname_modal_${userId}`).setTitle('📝 Đặt Tên Nhân Vật RPG');
        const nameInput = new TextInputBuilder().setCustomId('character_name_input').setLabel("Tên nhân vật:").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(20);
        modal.addComponents(new ActionRowBuilder().addComponents(nameInput));
        await interaction.showModal(modal);
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith('setname_modal_')) {
        const name = interaction.fields.getTextInputValue('character_name_input').trim();
        
        const existingPlayer = await getPlayerData(userId);
        if (existingPlayer) {
            return interaction.reply({ content: `⚠️ Bạn đã có nhân vật rồi!`, ephemeral: true });
        }

        const newPlayer = {
            userId: userId,
            name: name,
            level: 1,
            exp: 0,
            maxExp: 100,
            stamina: 100,
            maxStamina: 100,
            mp: 60,
            maxMp: 60,
            race: null,
            stats: null,
            inventory: [],
            equipped: { weapon: null, armor: null }
        };
        await savePlayerData(userId, newPlayer);

        const embed = new EmbedBuilder()
            .setTitle(`✨ CHÀO MỪNG ANH HÙNG: ${name} ✨`)
            .setDescription("Tên đã được ghi khắc vào vạn vật! Sẵn sàng khởi thức huyết mạch chủng tộc của bạn.")
            .setColor(0xFFA500);

        let filesArr = [];
        if (fs.existsSync(START_BOX_IMAGE_PATH)) {
            const attachment = new AttachmentBuilder(START_BOX_IMAGE_PATH, { name: 'start_box.png' });
            embed.setImage('attachment://start_box.png');
            filesArr.push(attachment);
        }

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`roll_race_${userId}`).setLabel('🎲 Khởi Thức Chủng Tộc').setStyle(ButtonStyle.Primary)
        );

        return interaction.update({ embeds: [embed], files: filesArr, components: [row] });
    }

    if (!interaction.isButton()) return;

    if (interaction.customId.startsWith('roll_race_')) {
        const targetUserId = interaction.customId.split('_')[2];
        if (userId !== targetUserId) return interaction.reply({ content: "⚠️ Không phải thẻ của bạn!", ephemeral: true });
        
        let player = await getPlayerData(userId);
        if (!player) return interaction.reply({ content: "⚠️ Không tìm thấy dữ liệu nhân vật!", ephemeral: true });
        if (player.race) return interaction.reply({ content: "⚠️ Bạn đã thức tỉnh rồi!", ephemeral: true });

        const selectedRace = rollRace();
        player.race = selectedRace.name;
        player.stats = { hp: selectedRace.hp, atk: selectedRace.atk, def: selectedRace.def, spd: selectedRace.spd };
        await savePlayerData(userId, player);

        const resultEmbed = new EmbedBuilder()
            .setTitle(`🎉 HƯỚNG VỀ ÁNH SÁNG, ${player.name.toUpperCase()}! THỨC TỈNH THÀNH CÔNG: ${selectedRace.name.toUpperCase()}!`)
            .setColor(selectedRace.color)
            .setDescription(`Huyết mạch cổ xưa cộng hưởng, dòng năng lượng nguyên thủy đã tuôn chảy trong cơ thể bạn!`)
            .addFields(
                { name: "📜 Độ hiếm", value: selectedRace.rarity, inline: true },
                { name: "❤️ HP (Máu)", value: `${selectedRace.hp}`, inline: true },
                { name: "⚔️ ATK (Sức đánh)", value: `${selectedRace.atk}`, inline: true },
                { name: "🛡️ DEF (Giáp)", value: `${selectedRace.def}`, inline: true },
                { name: "⚡ SPD (Tốc độ)", value: `${selectedRace.spd}`, inline: true },
                { name: "✨ Thiên Phú / Buff", value: selectedRace.buff, inline: false },
                { name: "⚠️ Điểm Yếu", value: selectedRace.weakness, inline: false }
            )
            .setImage(selectedRace.image)
            .setFooter({ text: `Gõ !menu để bước vào hành trình phiêu lưu chinh phục thế giới!` });

        return interaction.update({ embeds: [resultEmbed], files: [], components: [] });
    }

    if (interaction.customId === 'btn_hanhtrang' || interaction.customId === 'dg_bag') {
        await interaction.deferReply({ ephemeral: true });
        const player = await getPlayerData(userId);
        if (!player) return interaction.editReply({ content: "⚠️ Không tìm thấy dữ liệu nhân vật!" });

        const inventory = player.inventory || [];
        const equipped = player.equipped || { weapon: null, armor: null };

        let weaponText = equipped.weapon ? `🗡️ Vũ khí: **${equipped.weapon.name}** (+${equipped.weapon.atk} ATK) [Độ bền: ${equipped.weapon.durability}/${equipped.weapon.maxDurability}]` : "🗡️ Vũ khí: *Trống*";
        let armorText = equipped.armor ? `🛡️ Giáp/Khiên: **${equipped.armor.name}** (+${equipped.armor.def} DEF) [Độ bền: ${equipped.armor.durability}/${equipped.armor.maxDurability}]` : "🛡️ Giáp/Khiên: *Trống*";

        let invList = inventory.length > 0 
            ? inventory.map((item, index) => `**${index + 1}. ${item.name}** [${item.rarity}] - ATK: +${item.atk}, DEF: +${item.def} | Độ bền: ${item.durability}/${item.maxDurability}`).join('\n')
            : "*Balo trống*";

        const bagEmbed = new EmbedBuilder()
            .setTitle(`🎒 HÀNH TRANG & TRANG BỊ CỦA ${player.name}`)
            .setColor(0x3498DB)
            .addFields(
                { name: "⚙️ Đang Trang Bị", value: `${weaponText}\n${armorText}`, inline: false },
                { name: "📦 Vật Phẩm Trong Balo", value: `${invList}\n\n💡 *Cách mặc đồ: Gõ lệnh \`!mac <số_thứ_tự>\` trong chat!*`, inline: false }
            );

        return interaction.editReply({ embeds: [bagEmbed] });
    }

    if (interaction.customId === 'btn_dungeon') {
        const player = await getPlayerData(userId);
        if (!player || !player.race) {
            return interaction.reply({ content: "⚠️ Bạn cần tạo nhân vật và thức tỉnh chủng tộc trước!", ephemeral: true });
        }

        await interaction.deferUpdate();
        const spawnedMob = spawnRandomMob();

        const maxMpValue = player.maxMp || 60;
        player.mp = maxMpValue;
        await savePlayerData(userId, player);

        let totalAtk = player.stats.atk + (player.equipped?.weapon?.atk || 0);
        let totalDef = player.stats.def + (player.equipped?.armor?.def || 0);

        activeDungeons.set(userId, {
            wave: 1,
            mob: spawnedMob,
            playerHp: player.stats.hp,
            maxPlayerHp: player.stats.hp,
            playerAtk: totalAtk,
            playerDef: totalDef,
            playerMp: maxMpValue,
            maxPlayerMp: maxMpValue,
            enemyHp: spawnedMob.hp,
            roarBuff: false,
            isCrit: false,
            isMiss: false,
            isBlock: false,
            isHellBurnAnim: false,
            burnTurns: 0
        });

        const dungeon = activeDungeons.get(userId);
        const imageBuffer = await generateDungeonImage(player, dungeon);
        const attachment = new AttachmentBuilder(imageBuffer, { name: 'dungeon.png' });

        const dungeonEmbed = new EmbedBuilder()
            .setTitle(`🌲 DUNGEON: KHU RỪNG SƯƠNG MÙ`)
            .setDescription(`**${player.name}** chạm trán **${spawnedMob.name}**!\n⚡ MP đã hồi phục! ATK: ${totalAtk} | DEF: ${totalDef}\nChọn chiêu thức bên dưới!`)
            .setColor(0x2ECC71)
            .setImage('attachment://dungeon.png');

        const skillComponents = [
            new ButtonBuilder().setCustomId('dg_punch').setLabel('👊 Punch (Đấm)').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('dg_roar').setLabel('🦁 Roar (Gầm - 15MP)').setStyle(ButtonStyle.Primary)
        ];

        if (player.race === 'Dragon') {
            skillComponents.push(
                new ButtonBuilder().setCustomId('dg_hell_burn').setLabel('🔥 Hell Burn (25MP)').setStyle(ButtonStyle.Danger)
            );
        }

        const rowSkills = new ActionRowBuilder().addComponents(skillComponents);
        const rowActions = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('dg_bag').setLabel('🎒 Balo').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('dg_flee').setLabel('🏃 Rút lui').setStyle(ButtonStyle.Danger)
        );

        return interaction.editReply({ embeds: [dungeonEmbed], files: [attachment], components: [rowSkills, rowActions] });
    }

    if (['dg_punch', 'dg_roar', 'dg_hell_burn', 'dg_flee'].includes(interaction.customId)) {
        const dungeon = activeDungeons.get(userId);
        if (!dungeon) {
            return interaction.reply({ content: "⚠️ Phiên thám hiểm đã kết thúc hoặc đã hết hạn!", ephemeral: true });
        }

        await interaction.deferUpdate();
        const player = await getPlayerData(userId);
        if (!player) {
            return interaction.followUp({ content: "⚠️ Không tìm thấy dữ liệu người chơi!", ephemeral: true });
        }

        const currentMob = dungeon.mob;

        if (interaction.customId === 'dg_flee') {
            activeDungeons.delete(userId);
            const fleeEmbed = new EmbedBuilder().setTitle("🏃 ĐÃ RÚT LUI").setDescription("Thoát khỏi Dungeon an toàn.").setColor(0x95A5A6);
            return interaction.editReply({ embeds: [fleeEmbed], files: [], components: [] });
        }

        let combatLog = "";
        dungeon.isCrit = false;
        dungeon.isMiss = false;
        dungeon.isBlock = false;
        dungeon.isHellBurnAnim = false;

        const maxMpLimit = player.maxMp || 60;
        if (dungeon.playerMp < maxMpLimit) {
            dungeon.playerMp = Math.min(maxMpLimit, dungeon.playerMp + 10);
            combatLog += `✨ Hô hấp điều hòa, **${player.name}** hồi phục **+10 MP** (Hiện tại: ${dungeon.playerMp}/${maxMpLimit})\n`;
        }

        if (dungeon.burnTurns > 0) {
            const burnDamage = 8;
            dungeon.enemyHp -= burnDamage;
            dungeon.burnTurns -= 1;
            combatLog += `🔥 ${currentMob.name} bị thiêu đốt bởi **Hell Burn**, mất **${burnDamage}** HP! (Còn ${dungeon.burnTurns} lượt)\n`;
        }

        let currentAtk = dungeon.playerAtk || (player.stats.atk + (player.equipped?.weapon?.atk || 0));

        if (interaction.customId === 'dg_roar') {
            if (dungeon.playerMp < 15) {
                combatLog += `⚠️ Không đủ MP để dùng **Roar** (Cần 15 MP)!\n`;
            } else {
                dungeon.playerMp -= 15;
                dungeon.roarBuff = true;
                combatLog += `🦁 **${player.name}** dùng **Roar** (-15 MP)! Tăng **+20% sát thương** lượt sau!\n`;
            }
        } else if (interaction.customId === 'dg_hell_burn') {
            if (dungeon.playerMp < 25) {
                combatLog += `⚠️ Không đủ MP để dùng **Hell Burn** (Cần 25 MP)!\n`;
            } else {
                dungeon.playerMp -= 25;
                dungeon.isHellBurnAnim = true;
                dungeon.burnTurns = 2;
                let burnSkillDamage = Math.round(currentAtk * 1.8);
                dungeon.enemyHp -= burnSkillDamage;
                combatLog += `🌋 **${player.name}** phóng thích **Hell Burn** (-25 MP), gây **${burnSkillDamage}** sát thương!\n`;
            }
        } else if (interaction.customId === 'dg_punch') {
            let baseDamage = currentAtk;

            if (dungeon.roarBuff) {
                baseDamage = Math.round(baseDamage * 1.2);
                dungeon.roarBuff = false;
            }

            const MISS_CHANCE = 0.05;
            const CRIT_CHANCE = 0.05;
            const roll = Math.random();

            if (roll < MISS_CHANCE) {
                dungeon.isMiss = true;
                baseDamage = 0;
                combatLog += `💨 **MISS!** Đòn đánh của bạn đã bị ${currentMob.name} né được!\n`;
            } else if (roll < MISS_CHANCE + CRIT_CHANCE) {
                dungeon.isCrit = true;
                baseDamage = Math.round(baseDamage * 1.5);
                combatLog += `🔥 **CRITICAL!** Đấm chí mạng gây **${baseDamage}** sát thương!\n`;
            } else {
                combatLog += `👊 Đấm thường gây **${baseDamage}** sát thương!\n`;
            }

            dungeon.enemyHp -= baseDamage;
        }

        if (dungeon.enemyHp < 0) dungeon.enemyHp = 0;

        if (dungeon.enemyHp <= 0) {
            activeDungeons.delete(userId);
            
            const gainedExp = Math.floor(Math.random() * (89 - 60 + 1)) + 60;
            player.exp = (player.exp || 0) + gainedExp;
            
            const droppedItems = rollEquipmentDrops();
            if (!player.inventory) player.inventory = [];
            
            let dropText = "";
            if (droppedItems.length > 0) {
                for (const item of droppedItems) {
                    player.inventory.push(item);
                    dropText += `\n✨ **Nhận vật phẩm rơi:** \`${item.name}\` (${item.rarity}) [ATK: +${item.atk}, DEF: +${item.def}]!`;
                }
            }

            let levelUpText = `Nhận được **+${gainedExp} EXP**!${dropText}`;
            
            while (player.exp >= player.maxExp) {
                player.exp -= player.maxExp;
                player.level += 1;
                player.maxExp = Math.round(100 * Math.pow(1.5, player.level - 1));
                levelUpText += `\n⭐ **CHÚC MỪNG!** Bạn đã thăng lên **Level ${player.level}**!`;
            }

            player.mp = dungeon.playerMp;
            await savePlayerData(userId, player);

            const imageBuffer = await generateDungeonImage(player, dungeon);
            const attachment = new AttachmentBuilder(imageBuffer, { name: 'dungeon.png' });

            const winEmbed = new EmbedBuilder()
                .setTitle("🏆 CHIẾN THẮNG TRẬN ĐẤU!")
                .setDescription(`Bạn đã tiêu diệt **${currentMob.name}** thành công!\n${levelUpText}`)
                .setColor(0x2ECC71)
                .setImage('attachment://dungeon.png');

            return interaction.editReply({ embeds: [winEmbed], files: [attachment], components: [] });
        }

        let currentDef = dungeon.playerDef || (player.stats.def + (player.equipped?.armor?.def || 0));
        const monsterDmg = Math.max(1, currentMob.atk - Math.floor(currentDef / 2));
        dungeon.playerHp -= monsterDmg;
        if (dungeon.playerHp < 0) dungeon.playerHp = 0;
        combatLog += `🐾 **${currentMob.name}** phản công, gây **${monsterDmg}** sát thương lên bạn!\n`;

        if (dungeon.playerHp <= 0) {
            activeDungeons.delete(userId);
            const imageBuffer = await generateDungeonImage(player, dungeon);
            const attachment = new AttachmentBuilder(imageBuffer, { name: 'dungeon.png' });

            const loseEmbed = new EmbedBuilder()
                .setTitle("💀 BẠN ĐÃ GỤC NGÃ TRONG DUNGEON!")
                .setDescription(`Bạn đã bị **${currentMob.name}** đánh bại. Hãy luyện tập thêm rồi quay lại nhé!`)
                .setColor(0xE74C3C)
                .setImage('attachment://dungeon.png');

            return interaction.editReply({ embeds: [loseEmbed], files: [attachment], components: [] });
        }

        const imageBufferAnim = await generateDungeonImage(player, dungeon);
        const attachmentAnim = new AttachmentBuilder(imageBufferAnim, { name: 'dungeon.png' });

        const updateDungeonEmbed = new EmbedBuilder()
            .setTitle(`🌲 DUNGEON: KHU RỪNG SƯƠNG MÙ`)
            .setDescription(`${combatLog}\n**${player.name}** [HP: ${dungeon.playerHp}/${dungeon.maxPlayerHp}] VS **${currentMob.name}** [HP: ${dungeon.enemyHp}/${currentMob.maxHp}]`)
            .setColor(0x2ECC71)
            .setImage('attachment://dungeon.png');

        const skillComponents = [
            new ButtonBuilder().setCustomId('dg_punch').setLabel('👊 Punch (Đấm)').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('dg_roar').setLabel('🦁 Roar (Gầm - 15MP)').setStyle(ButtonStyle.Primary)
        ];
        if (player.race === 'Dragon') {
            skillComponents.push(
                new ButtonBuilder().setCustomId('dg_hell_burn').setLabel('🔥 Hell Burn (25MP)').setStyle(ButtonStyle.Danger)
            );
        }

        const rowSkills = new ActionRowBuilder().addComponents(skillComponents);
        const rowActions = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('dg_bag').setLabel('🎒 Balo').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('dg_flee').setLabel('🏃 Rút lui').setStyle(ButtonStyle.Danger)
        );

        await interaction.editReply({ embeds: [updateDungeonEmbed], files: [attachmentAnim], components: [rowSkills, rowActions] });

        if (dungeon.isHellBurnAnim) {
            setTimeout(async () => {
                try {
                    dungeon.isHellBurnAnim = false;
                    const normalBuffer = await generateDungeonImage(player, dungeon);
                    const normalAttachment = new AttachmentBuilder(normalBuffer, { name: 'dungeon.png' });
                    updateDungeonEmbed.setImage('attachment://dungeon.png');
                    await interaction.editReply({ embeds: [updateDungeonEmbed], files: [normalAttachment], components: [rowSkills, rowActions] });
                } catch (e) {}
            }, 5000);
        }
    }
});

client.login(process.env.DISCORD_TOKEN);