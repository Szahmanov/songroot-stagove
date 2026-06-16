require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const Groq = require('groq-sdk');

const app = express();
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// ─── Regional knowledge base ───────────────────────────────────────────────
const REGIONS = {
  "Родопи": {
    sub: ["Смолян", "Кърджали", "Момчилград", "Девин", "Мадан", "Рудозем"],
    character: "двугласно пеене, бавни мелодии, минорни гами, дълбоки традиции на хоро и седенка",
    instruments: "гайда, кавал, тъпан",
    keywords: "родопски, двугласни, хоро"
  },
  "Тракия": {
    sub: ["Пловдив", "Стара Загора", "Хасково", "Димитровград", "Чирпан"],
    character: "бързи ритми, жизнени мелодии, богато орнаментирани, тракийско хоро",
    instruments: "гайда, цигулка, кларинет",
    keywords: "тракийски, тракийска"
  },
  "Добруджа": {
    sub: ["Добрич", "Силистра", "Тервел", "Балчик"],
    character: "бавни, величествени мелодии, широки полета, лирични песни",
    instruments: "гайда, тъпан, флейта",
    keywords: "добруджански, добруджанска"
  },
  "Шоплук": {
    sub: ["София", "Перник", "Радомир", "Брезник", "Трън", "Ихтиман"],
    character: "нечетни ритми 5/8 и 7/8, рязки, кратки фрази, остри тонове",
    instruments: "гайда, кавал, гъдулка",
    keywords: "шопски, шопска"
  },
  "Северна България": {
    sub: ["Плевен", "Ловеч", "Враца", "Видин", "Монтана", "Велико Търново", "Габрово", "Русе"],
    character: "смесени ритми, балади, хайдушки песни, лирика",
    instruments: "гайда, цигулка, тамбура",
    keywords: "северняшки, северняшка, балкански"
  },
  "Македония (Пиринска)": {
    sub: ["Благоевград", "Сандански", "Петрич", "Гоце Делчев", "Разлог"],
    character: "македонски ритми 7/8 и 9/8, многогласие, силни традиции",
    instruments: "гайда, кавал, тъпан",
    keywords: "пирински, македонски"
  },
  "Странджа": {
    sub: ["Бургас", "Малко Търново", "Царево", "Средец"],
    character: "архаични мелодии, нестандартни ритми, мистични интонации, огнени танци",
    instruments: "гайда, кавал",
    keywords: "странджански, тракийски черноморски"
  },
  "Черноморие": {
    sub: ["Варна", "Несебър", "Созопол", "Поморие", "Каварна"],
    character: "морски мотиви, рибарски песни, смесени тракийски и добруджански влияния",
    instruments: "гайда, хармоника, тъпан",
    keywords: "черноморски, морски"
  }
};

const OCCASIONS = {
  "Рожден ден": "честитба, дълъг живот, здраве, пожелания",
  "Събиране на семейство": "семейна радост, единство, спомени, домашно веселие",
  "Сватба": "любов, венчавка, младоженци, веселба",
  "Просто слушане": "наслада, отдих, носталгия, душевен мир",
  "Празник": "национален празник, веселба, танци, хоро",
  "Именен ден": "поздрав, здраве, пожелания"
};

// ─── System prompt for the autonomous agent ────────────────────────────────
function buildSystemPrompt(region, subRegion, occasion, age) {
  const regionData = REGIONS[region];
  const occasionDesc = OCCASIONS[occasion] || "общо слушане";

  return `Ти си SongRoot — автономен агент за българска народна музика, създаден от StaGove.

ТВОЯТА МИСИЯ: Да генерираш персонализиран плейлист от РЕАЛНИ, СЪЩЕСТВУВАЩИ български народни песни за конкретен човек.

ПРОФИЛ НА СЛУШАТЕЛЯ:
- Регион: ${region} (${subRegion || 'общо'})
- Характер на музиката от региона: ${regionData?.character || 'традиционна българска'}
- Инструменти: ${regionData?.instruments || 'народни инструменти'}
- Повод: ${occasion} — ${occasionDesc}
- Възраст на слушателя: ${age} години

ЗАДАЧА: Генерирай точно 8 песни за плейлиста.

КРИТИЧНО ВАЖНО — ПРАВИЛА:
1. Всяка песен ТРЯБВА да е реална, добре позната народна песен от посочения регион
2. Включи само песни, за които си СИГУРЕН, че съществуват
3. Съобрази с повода — за рожден ден весели, за просто слушане разнообразни
4. Съобрази с възрастта — за 60+ класически изпълнения, за 30-50 по-модерни аранжименти
5. Приоритет на изпълнители: Валя Балканска, Надка Карадженова, Гюргя, ансамбъл Пирин, Филип Кутев, Мистерията на българските гласове, и локални изпълнители от региона

ФОРМАТ НА ОТГОВОРА — само JSON, без нищо друго:
{
  "playlist_title": "Заглавие на плейлиста",
  "region_description": "2-3 изречения за музикалната традиция на региона",
  "occasion_note": "Кратка бележка защо тези песни са подходящи за повода",
  "songs": [
    {
      "title": "Точното заглавие на песента",
      "artist": "Изпълнител или ансамбъл",
      "description": "1 изречение — какво е особеното в тази песен за този регион/повод",
      "youtube_search": "точен текст за търсене в YouTube на български и латиница"
    }
  ]
}

Не добавяй нищо извън JSON. Само JSON.`;
}

// ─── Agent endpoint ─────────────────────────────────────────────────────────
app.post('/api/generate-playlist', async (req, res) => {
  const { region, subRegion, occasion, age } = req.body;

  if (!region || !occasion || !age) {
    return res.status(400).json({ error: 'Липсват задължителни полета' });
  }

  try {
    const systemPrompt = buildSystemPrompt(region, subRegion, occasion, age);

    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Генерирай плейлист за ${region}${subRegion ? ` (${subRegion})` : ''}, повод: ${occasion}, възраст: ${age} години.` }
      ],
      temperature: 0.7,
      max_tokens: 2000
    });

    const raw = completion.choices[0].message.content.trim();

    // Parse JSON
    let playlist;
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      playlist = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
    } catch {
      return res.status(500).json({ error: 'Грешка при генериране на плейлиста. Опитайте отново.' });
    }

    // Enrich with YouTube search URLs
    playlist.songs = playlist.songs.map(song => ({
      ...song,
      youtube_url: `https://www.youtube.com/results?search_query=${encodeURIComponent(song.youtube_search || `${song.title} ${song.artist} народна песен`)}`
    }));

    res.json({ success: true, playlist, region, subRegion, occasion, age });

  } catch (err) {
    console.error('Groq error:', err.message);
    res.status(500).json({ error: 'Грешка при свързване с AI агента.' });
  }
});

// ─── Regions endpoint ────────────────────────────────────────────────────────
app.get('/api/regions', (req, res) => {
  const result = Object.entries(REGIONS).map(([name, data]) => ({
    name,
    sub: data.sub
  }));
  res.json(result);
});

// ─── Occasions endpoint ──────────────────────────────────────────────────────
app.get('/api/occasions', (req, res) => {
  res.json(Object.keys(OCCASIONS));
});

// ─── Health check ─────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'SongRoot by StaGove' });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`SongRoot running on port ${PORT}`));
