/**
 * 6-Step Mood Questionnaire — cinematic deep psychological framework.
 * Each answer carries pre-mapped target mood tags for vector averaging.
 */

const QUESTIONS = [
  {
    id: "step_1_ambiance",
    text: "1. Şu an etrafındaki dünyanın ışık seviyesi ve aurası nasıl olmalı?",
    answers: [
      { text: "Sadece loş bir mum ışığı veya tek bir lambanın huzuru.", targets: ["battaniye", "sessiz"] },
      { text: "Şehrin neon ışıkları, ıslak sokaklar ve loş bir tekinsizlik.", targets: ["adrenalin", "geceyarisi-itirafi"] },
      { text: "Eski bir sinema salonunun nostaljik, grenli ve sepya tonları.", targets: ["retro", "nostalji"] },
      { text: "Göz alıcı renk paletleri, kusursuz kadrajlar ve estetik bir şölen.", targets: ["kadraj-estetigi", "melankoli"] },
    ],
  },
  {
    id: "step_2_pacing",
    text: "2. İçindeki zamanın akış hızı şu an hangi tempoya ayak uyduruyor?",
    answers: [
      { text: "Yavaş aksın; karakterlerin derin felsefi fısıltılarını sindireyim.", targets: ["geceyarisi-itirafi", "felsefe"] },
      { text: "Nabzım hızlansın, koltuğun kenarını sıktıracak bir kaos olsun.", targets: ["adrenalin", "gerilim"] },
      { text: "Şiirsel bir duruluk; kelimeler azalsın, görüntüler konuşsun.", targets: ["sessiz", "kadraj-estetigi"] },
      { text: "Zaman algım tamamen bükülsün, beynimin kıvrımları yansın.", targets: ["zihin", "bilimkurgu"] },
    ],
  },
  {
    id: "step_3_emotional_depth",
    text: "3. Ruhun şu an hangi duygusal arınmaya (katarsis) ihtiyaç duyuyor?",
    answers: [
      { text: "İçimdeki o düğümü çözecek, beni hüngür hüngür ağlatacak bir deşarj.", targets: ["gozyasi", "dram"] },
      { text: "Yalnız olmadığımı hissettiren, kalbimi eritecek sıcacık bir sarılma.", targets: ["battaniye", "romantik"] },
      { text: "Gerçek dünyanın dertlerini unutturacak absürt veya zeki bir kaçış.", targets: ["kara-mizah", "eğlence"] },
      { text: "Karanlık tarafla yüzleşme; insanoğlunun çiğ doğasını izleme zevki.", targets: ["gerilim", "suç"] },
    ],
  },
  {
    id: "step_4_intellectual_state",
    text: "4. Üstad zihnini ne kadar yorsun, ne kadarlık bir labirent istersin?",
    answers: [
      { text: "Hiç yormasın; arkama yaslanıp sadece hikayenin akışına bırakayım.", targets: ["populer", "battaniye"] },
      { text: "Beni ipuçlarının peşinden koşturacak zekice bir bulmaca versin.", targets: ["zihin", "gizem"] },
      { text: "Bittiğinde saatlerce duvara bakıp hayatı sorgulatacak felsefi bir yük.", targets: ["zihin", "felsefe"] },
      { text: "Sanat filmi kafası; yoruma açık, metaforlarla dolu bağımsız bir ruh.", targets: ["kadraj-estetigi", "sessiz"] },
    ],
  },
  {
    id: "step_5_spatial_setting",
    text: "5. Hikayenin geçeceği coğrafya veya mekân seni nereye götürsün?",
    answers: [
      { text: "Kuzey Avrupa'nın soğuk, puslu ve mesafeli yalnızlığına.", targets: ["sessiz", "melankoli"] },
      { text: "Uzak geleceğe, uzay boşluğuna veya distopik bir evrene.", targets: ["zihin", "bilimkurgu"] },
      { text: "70'lerin, 80'lerin o samimi, analog ve retro sokaklarına.", targets: ["retro", "nostalji"] },
      { text: "Tek bir odada veya klostrofobik bir kapalı alanda geçen düelloya.", targets: ["geceyarisi-itirafi", "gerilim"] },
    ],
  },
  {
    id: "step_6_cinematic_archetype",
    text: "6. Ve son dokunuş... Perde açıldığında ilk görmek istediğin silüet?",
    answers: [
      { text: "Yağmur altında sigarasını yakıp geçmişi düşünen yalnız bir karakter.", targets: ["geceyarisi-itirafi", "gozyasi"] },
      { text: "Büyük bir komplo teorisinin ortasında kalmış dahi bir zihin.", targets: ["zihin", "adrenalin"] },
      { text: "Uçsuz bucaksız bir doğa manzarasında tek başına yürüyen bir gezgin.", targets: ["kadraj-estetigi", "sessiz"] },
      { text: "Gözünü kırpmadan tehlikenin üzerine yürüyen kararlı bir yabancı.", targets: ["adrenalin", "aksiyon"] },
    ],
  },
];

const MOOD_NAMES = {
  battaniye: "Battaniye Modu",
  yolculuk: "Yolculuk Ruhu",
  gece: "Gece Kuşu",
  kahkaha: "Kahkaha Molası",
  gozyasi: "Gözyaşı Gecesi",
  adrenalin: "Adrenalin Patlaması",
  askbahcesi: "Aşk Bahçesi",
  zamanyolcusu: "Zaman Yolcusu",
  sessiz: "Sessiz Yolculuk",
  zihin: "Zihin Savaşı",
  kalp: "Kalbimin Sesi",
  karmakar: "Karmaşakar",
  retro: "Retro Bakış",
  "deep-chills": "Derin Ürperti",
  "kadraj-estetigi": "Kadraj Estetiği",
  "geceyarisi-itirafi": "Geceyarısı İtirafı",
};

/** Flatten all target tags from selected answers into a single array. */
export function calculateQuizResult(answerIndexes) {
  const allTargets = [];
  answerIndexes.forEach((ansIdx, qIdx) => {
    if (ansIdx === undefined || ansIdx === null) return;
    const question = QUESTIONS[qIdx];
    if (!question) return;
    const answer = question.answers[ansIdx];
    if (!answer || !answer.targets) return;
    allTargets.push(...answer.targets);
  });

  // Count target frequency → top mood for display
  const counts = {};
  let maxCount = 0;
  let topTarget = "battaniye";
  for (const t of allTargets) {
    counts[t] = (counts[t] || 0) + 1;
    if (counts[t] > maxCount) {
      maxCount = counts[t];
      topTarget = t;
    }
  }

  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const topTotal = sorted.reduce((s, [, v]) => s + v, 0) || 1;
  const topMoods = sorted.slice(0, 3).map(([moodId, count]) => ({
    moodId,
    percentage: Math.round((count / topTotal) * 100),
  }));

  return { targets: allTargets, topMoods };
}

/** Return a contextual message based on the most-selected mood. */
export function getResultMessage(topMoods) {
  if (!topMoods || topMoods.length === 0) return "Bugün her türden film iyi gidebilir.";
  const primary = topMoods[0].moodId;
  const messages = {
    battaniye: "Sıcak bir battaniye ve bir fincan çay eşliğinde, dünyanın gürültüsünden uzaklaşmanın tam zamanı.",
    yolculuk: "Ruhun yeni ufuklara açılmak istiyor. Uzaklara bir yolculuğa çıkma vakti.",
    gece: "Karanlık çökerken gizemli ve derin bir gece seansı tam sana göre.",
    kahkaha: "Kafanı dağıtıp gülmenin tam zamanı. Eğlence seni bekliyor.",
    gozyasi: "Üstad'ın dediği gibi: Bazen iyi bir ağlama, ruhun en derin temizliğidir.",
    adrenalin: "Nabzın yükselsin, koltuğunun kenarında nefes nefese bir gece seni bekliyor.",
    askbahcesi: "Kalbinde kelebekler uçuşuyor. Romantik bir yolculuğa çıkmaya ne dersin?",
    zamanyolcusu: "Geçmişin büyülü atmosferinde kaybolmak istiyorsun. Eski bir film şahane gider.",
    sessiz: "Sessizliğin ve görüntülerin konuştuğu, kelimelerin yetmediği yerlere yolculuk.",
    zihin: "Üstad'ın seçkisiyle zihninin sınırlarını zorlayacak, şaşırtıcı bir film seni bekliyor.",
    kalp: "Büyük hikayeler değil, küçük dokunuşlar arıyorsun. Bağımsız sinemanın samimi dünyası.",
    karmakar: "Gerçekliğin sınırlarını zorlayan, sıradışı bir deneyim istiyorsun.",
    retro: "Neon ışıklar ve synth melodiler eşliğinde geçmişe bir yolculuk yapma vakti.",
    "deep-chills": "Karanlık çöktü, perdeler kapandı. Derin bir ürperti için hazır mısın?",
    "kadraj-estetigi": "Güzel bir kare bin kelimeye bedeldir. Bu gece sinematografinin başyapıtlarını keşfet.",
    "geceyarisi-itirafi": "Gece yarısı sohbetleri ve derin diyaloglar sana iyi gelecek. Konuşmaların büyüsüne kapıl.",
  };
  return messages[primary] || "Bu geceki ruh haline göre harika bir seçki hazırladık.";
}

export { QUESTIONS, MOOD_NAMES };
