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

const REGIONS = {
  "Родопи": { sub:["Смолян","Кърджали","Момчилград","Девин","Мадан","Рудозем"], character:"двугласно пеене, бавни мелодии, минорни гами, дълбоки традиции на хоро и седенка", instruments:"гайда, кавал, тъпан" },
  "Тракия": { sub:["Пловдив","Стара Загора","Хасково","Димитровград","Чирпан"], character:"бързи ритми, жизнени мелодии, богато орнаментирани, тракийско хоро", instruments:"гайда, цигулка, кларинет" },
  "Добруджа": { sub:["Добрич","Силистра","Тервел","Балчик"], character:"бавни, величествени мелодии, широки полета, лирични песни", instruments:"гайда, тъпан, флейта" },
  "Шоплук": { sub:["София","Перник","Радомир","Брезник","Трън","Ихтиман"], character:"нечетни ритми 5/8 и 7/8, рязки, кратки фрази, остри тонове", instruments:"гайда, кавал, гъдулка" },
  "Северна България": { sub:["Плевен","Ловеч","Враца","Видин","Монтана","Велико Търново","Габрово","Русе"], character:"смесени ритми, балади, хайдушки песни, лирика", instruments:"гайда, цигулка, тамбура" },
  "Македония (Пиринска)": { sub:["Благоевград","Сандански","Петрич","Гоце Делчев","Разлог"], character:"македонски ритми 7/8 и 9/8, многогласие, силни традиции", instruments:"гайда, кавал, тъпан" },
  "Странджа": { sub:["Бургас","Малко Търново","Царево","Средец"], character:"архаични мелодии, нестандартни ритми, мистични интонации", instruments:"гайда, кавал" },
  "Черноморие": { sub:["Варна","Несебър","Созопол","Поморие","Каварна"], character:"морски мотиви, рибарски песни, смесени тракийски и добруджански влияния", instruments:"гайда, хармоника, тъпан" }
};

const OCCASIONS = {
  "Рожден ден":"честитба, дълъг живот, здраве, пожелания",
  "Събиране на семейство":"семейна радост, единство, спомени, домашно веселие",
  "Сватба":"любов, венчавка, младоженци, веселба",
  "Просто слушане":"наслада, отдих, носталгия, душевен мир",
  "Празник":"национален празник, веселба, танци, хоро",
  "Именен ден":"поздрав, здраве, пожелания"
};

function buildSystemPrompt(region, subRegion, occasion, age, genre, decade, artists) {
  const regionData = REGIONS[region];
  const occasionDesc = OCCASIONS[occasion] || 'общо слушане';
  const extraGenre = genre ? `\n- Жанр предпочитание: ${genre}` : '';
  const extraDecade = decade ? `\n- Предпочитано десетилетие: ${decade}` : '';
  const extraArtists = artists ? `\n- Любими изпълнители (включи ги приоритетно ако имат подходящи песни): ${artists}` : '';

  return `Ти си SongRoot — автономен агент за българска народна музика, създаден от StaGove.

ТВОЯТА МИСИЯ: Генерирай персонализиран плейлист от РЕАЛНИ, СЪЩЕСТВУВАЩИ песни за конкретен човек.

ПРОФИЛ НА СЛУШАТЕЛЯ:
- Регион: ${region}${subRegion ? ` (${subRegion})` : ''}
- Музикален характер: ${regionData?.character || 'традиционна българска'}
- Инструменти: ${regionData?.instruments || 'народни инструменти'}
- Повод: ${occasion} — ${occasionDesc}
- Възраст: ${age} години${extraGenre}${extraDecade}${extraArtists}

ЗАДАЧА: Генерирай точно 20 песни.

ПРАВИЛА:
1. Само РЕАЛНИ, добре познати песни — не измисляй
2. Съобрази с повода и възрастта
3. За 60+ — класически изпълнения; за 30-50 — по-модерни аранжименти
4. Ако са посочени любими изпълнители — включи техни песни
5. Ако е посочено десетилетие — приоритизирай песни от него

ФОРМАТ — само JSON без нищо друго:
{
  "playlist_title": "Заглавие",
  "region_description": "2-3 изречения за музикалната традиция",
  "occasion_note": "Защо тези песни са подходящи за повода",
  "songs": [
    {
      "title": "Заглавие на песента",
      "artist": "Изпълнител",
      "description": "1 изречение — особеното в тази песен",
      "youtube_search": "точен текст за YouTube търсене"
    }
  ]
}`;
}

app.post('/api/generate-playlist', async (req, res) => {
  const { region, subRegion, occasion, age, genre, decade, artists } = req.body;
  if (!region || !occasion || !age) return res.status(400).json({ error:'Липсват задължителни полета' });

  try {
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role:'system', content: buildSystemPrompt(region, subRegion, occasion, age, genre, decade, artists) },
        { role:'user', content: `Генерирай плейлист: ${region}${subRegion?` (${subRegion})`:''}, повод: ${occasion}, възраст: ${age}${genre?`, жанр: ${genre}`:''}${decade?`, десетилетие: ${decade}`:''}${artists?`, изпълнители: ${artists}`:''}` }
      ],
      temperature: 0.7,
      max_tokens: 4000
    });

    const raw = completion.choices[0].message.content.trim();
    let playlist;
    try {
      const match = raw.match(/\{[\s\S]*\}/);
      playlist = JSON.parse(match ? match[0] : raw);
    } catch {
      return res.status(500).json({ error:'Грешка при генериране. Опитайте отново.' });
    }

    playlist.songs = playlist.songs.map(song => ({
      ...song,
      youtube_url: `https://www.youtube.com/results?search_query=${encodeURIComponent(song.youtube_search || `${song.title} ${song.artist}`)}`
    }));

    res.json({ success:true, playlist, region, subRegion, occasion, age });
  } catch(err) {
    console.error('Groq error:', err.message);
    res.status(500).json({ error:'Грешка при свързване с AI агента.' });
  }
});

app.get('/api/regions', (req, res) => {
  res.json(Object.entries(REGIONS).map(([name, data]) => ({ name, sub: data.sub })));
});

app.get('/api/occasions', (req, res) => {
  res.json(Object.keys(OCCASIONS));
});

app.get('/api/health', (req, res) => {
  res.json({ status:'ok', service:'SongRoot by StaGove' });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`SongRoot running on port ${PORT}`));
