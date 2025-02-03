require('dotenv').config();
const { Telegraf } = require('telegraf');
const axios = require('axios');

const BOT_TOKEN = process.env.BOT_TOKEN;
const KEITARO_API_KEY = process.env.KEITARO_API_KEY;
const KEITARO_API_URL = process.env.KEITARO_API_URL;
const GROUP_ID = process.env.GROUP_ID;
const TRAFFIC_SOURCE_ID = process.env.TRAFFIC_SOURCE_ID;
const TELEGRAM_CHAT_ID = "-4702632205";
const ACCESS_PASSWORD = process.env.ACCESS_PASSWORD || "default_password"; // Пароль для входу

const bot = new Telegraf(BOT_TOKEN);
const userSessions = new Map(); // Store user session data
const authorizedUsers = new Set(); // Store authorized users

bot.start((ctx) => {
    const userId = ctx.from.id;
    
    if (!authorizedUsers.has(userId)) {
        return ctx.reply("🔑 Please enter the access password:");
    }

    ctx.reply('🔹 Select a campaign type:', {
        reply_markup: {
            inline_keyboard: [
                [{ text: 'NDA', callback_data: 'nda' }],
                [{ text: 'FirstCPA', callback_data: 'firstcpa' }]
            ]
        }
    });
});

bot.on('text', async (ctx) => {
    const userId = ctx.from.id;
    const text = ctx.message.text.trim();

    // 🔑 Перевірка пароля перед будь-якими командами
    if (!authorizedUsers.has(userId)) {
        if (text === ACCESS_PASSWORD) {
            authorizedUsers.add(userId);
            ctx.reply("✅ Access granted! You can now create campaigns.");
            return ctx.reply('🔹 Select a campaign type:', {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: 'NDA', callback_data: 'nda' }],
                        [{ text: 'FirstCPA', callback_data: 'firstcpa' }]
                    ]
                }
            });
        } else {
            return ctx.reply("❌ Incorrect password. Please try again.");
        }
    }

    // Перевірка вибору кампанії перед введенням ID оффера
    const session = userSessions.get(userId);
    if (!session || !session.campaignType) {
        return ctx.reply('❌ Please select a campaign type first.');
    }

    const offerId = text;
    if (isNaN(offerId)) {
        return ctx.reply('❌ Invalid Offer ID. Please enter a numeric value.');
    }

    const campaignType = session.campaignType;
    const campaignName = `${campaignType.toUpperCase()}-${offerId}`;
    const domainId = campaignType === 'nda' ? 23 : 21;
    const alias = `test_link_${offerId}`;

    try {
        // 1️⃣ Get Offer Information
        const offerResponse = await axios.get(`${KEITARO_API_URL}/offers/${offerId}`, {
            headers: { 'Api-Key': KEITARO_API_KEY }
        });
        const offerName = offerResponse.data.name || "Unknown Offer";

        // 2️⃣ Construct Postback URL
        const postbackUrl = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage?chat_id=${TELEGRAM_CHAT_ID}&text=📌 New Postback!%0AStatus: {status}%0ACampaign: {campaign_id} - {campaign_name}%0AOffer: {offer_id} - {offer_name}`;

        // 3️⃣ Create Campaign
        const campaignResponse = await axios.post(`${KEITARO_API_URL}/campaigns`, {
            alias: alias,
            type: "position",
            name: campaignName,
            cookies_ttl: 24,
            state: "active",
            cost_type: "CPC",
            cost_value: 0,
            cost_currency: "USD",
            cost_auto: false,
            group_id: GROUP_ID,
            bind_visitors: "none",
            traffic_source_id: TRAFFIC_SOURCE_ID,
            parameters: {
                sub_id_2: { name: "sub2", placeholder: "web", alias: "sub_id_2" },
                sub_id_30: { name: "sub30", placeholder: "web", alias: "sub_id_30" }
            },
            domain_id: domainId,
            postbacks: [
                {
                    method: "GET",
                    statuses: ["lead"],
                    url: postbackUrl
                },
                {
                    method: "GET",
                    statuses: ["sale"],
                    url: postbackUrl
                }
            ],
            notes: `Campaign created via Telegram bot`
        }, {
            headers: { 'Api-Key': KEITARO_API_KEY }
        });

        const campaignId = campaignResponse.data.id;
        const campaignDomain = campaignResponse.data.domain;
        const testLink = `${campaignDomain}${alias}`;

        // 4️⃣ Create Stream
        await axios.post(`${KEITARO_API_URL}/streams`, {
            campaign_id: campaignId,
            type: "regular",
            name: `Stream-${offerId}`,
            position: 0,
            weight: 0,
            state: "active",
            action_type: "http",
            schema: "landings",
            collect_clicks: true,
            filter_or: false,
            filters: [],
            triggers: [],
            landings: [],
            offers: [
                {
                    offer_id: parseInt(offerId),
                    share: 100,
                    state: "active"
                }
            ]
        }, {
            headers: { 'Api-Key': KEITARO_API_KEY }
        });

        // 🔗 Send responses as separate messages
        await ctx.reply(`✅ Campaign and stream created!`);
        await ctx.reply(`📌 <b>Campaign:</b> <a href="https://k-tracker.online/admin/#!/campaigns/${campaignId}">${campaignName}</a>\n📌 <b>Offer:</b> <code>${offerName}</code>`, {
            parse_mode: 'HTML'
        });
        
        await ctx.reply(`🔗 <b>Link for test</b>: ${testLink}`, {
            parse_mode: 'HTML'
        });

        // 📩 Notify about test results
        await ctx.reply(`⏳📩 "Waiting for test results in the group: <code>NDA_FirstCPA_helper_reults</code>`, {
            parse_mode: 'HTML'
        });


        userSessions.delete(userId);
    } catch (error) {
        ctx.reply('❌ Error creating campaign or stream.');
    }
});

// 🔒 Блокування кнопок до авторизації
bot.action(['nda', 'firstcpa'], (ctx) => {
    const userId = ctx.from.id;

    if (!authorizedUsers.has(userId)) {
        return ctx.reply("❌ Please enter the access password first.");
    }

    const campaignType = ctx.match[0];
    userSessions.set(userId, { campaignType });
    ctx.reply('✍ Enter the Offer ID:');
});

bot.launch();
console.log('🚀 Bot deployed and running!');
