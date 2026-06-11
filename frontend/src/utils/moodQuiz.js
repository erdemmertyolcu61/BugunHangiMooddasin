/**
 * 6-Step Mood Questionnaire — cinematic deep psychological framework.
 * Each answer carries pre-mapped target mood tags for vector averaging.
 */

const QUESTIONS = [
  {
    id: "step_1_ambiance",
    text: "1. Şu an etrafındaki dünyanın ışığı ve havası nasıl olmalı?",
    answers: [
      { text: "Loş bir lamba, bir fincan çay ve dış dünyadan yalıtılmış derin bir sessizlik.", targets: ["battaniye", "sessiz"] },
      { text: "Şehrin enerjisi, hareketli caddeler, dışarıda bir şeyler oluyor hissi.", targets: ["adrenalin", "yolculuk"] },
      { text: "Eski bir filmin grenli projeksiyon ışığı ve yıllar öncesine ait o nostaljik huzur.", targets: ["zamanyolcusu", "kalp"] },
      { text: "Göz alıcı renkler, beklenmedik açılar, sıradan olanın sanatsal yeniden doğuşu.", targets: ["kadraj-estetigi", "karmakar"] },
    ],
  },
  {
    id: "step_2_pacing",
    text: "2. İçindeki zamanın akış hızı şu an hangi tempoyla çarpıyor?",
    answers: [
      { text: "Yavaşlasın; bir karakterin içini döktüğü, acı veren sözleri sonuna kadar sindireyim.", targets: ["geceyarisi-itirafi", "gozyasi"] },
      { text: "Nabzım yükselsin; tehlike anının dondurucu, tüyleri diken eden o gerilimi.", targets: ["adrenalin", "deep-chills"] },
      { text: "Şiirsel bir yoğunlaşma; az söz, çok anlam, keskin ve kompakt sinematik vuruşlar.", targets: ["sipsak", "sessiz"] },
      { text: "Zaman algım tamamen bükülsün; beyin kıvrımlarımın yanmasını istiyorum.", targets: ["zihin", "karmakar"] },
    ],
  },
  {
    id: "step_3_emotional_depth",
    text: "3. Ruhun bu gece hangi duygusal arınmayı hak ediyor?",
    answers: [
      { text: "Sessizce sızlatan, bir düğümü çözen, özgün ve kırılgan bir dokunuş.", targets: ["gozyasi", "kalp"] },
      { text: "Kalbimi ısıtan, yalnız olmadığımı hissettiren sıcak ve şefkatli bir sarılma.", targets: ["battaniye", "askbahcesi"] },
      { text: "Beynimin tamamen boşalması; içten gelen ve yüzümü şişirecek bir kahkaha.", targets: ["kahkaha", "sipsak"] },
      { text: "Karanlıkla yüzleşmek; o rahatsız edici, tanıdık ürpertiyi yeniden hissetmek.", targets: ["deep-chills", "gece"] },
    ],
  },
  {
    id: "step_4_intellectual_state",
    text: "4. Bu gece üstadın seni ne kadar düşündürmesini istiyorsun?",
    answers: [
      { text: "Merakım zirvede; ipuçlar, alt metinler ve hayatı sorgulatacak felsefi bir yük istiyorum.", targets: ["zihin", "geceyarisi-itirafi"] },
      { text: "Sadece iyi bir macera; gergin, aksiyon dolu, beni taşıyıp götürecek bir rüzgar.", targets: ["yolculuk", "adrenalin"] },
      { text: "Yoruma açık, alışılmadık, beni rahatsız edecek ama büyüleyecek bir estetik deneyim.", targets: ["karmakar", "kadraj-estetigi"] },
      { text: "Hiç yormasın; iyi yazılmış, yerleşik ve beni rahatlatacak bir klasik his.", targets: ["battaniye", "zamanyolcusu"] },
    ],
  },
  {
    id: "step_5_spatial_setting",
    text: "5. Hikayenin seni nereye götürmesini istiyorsun?",
    answers: [
      { text: "Hiçbir yere. Bir manzara karesinde, görüntünün içinde kaybolmak istiyorum.", targets: ["sessiz", "kadraj-estetigi"] },
      { text: "Sıradan, cıvıl cıvıl bir yere; neşenin ve kalp atışlarının olduğu dünyaya.", targets: ["kahkaha", "askbahcesi"] },
      { text: "Karanlık ve izole bir yere; paranın geçmediği, saat sürekli gece olan bir atmosfere.", targets: ["gece", "deep-chills"] },
      { text: "Uzaklara ve uzak zamanlara; bir atlasa, bir haritaya veya derinden tarihe.", targets: ["yolculuk", "zamanyolcusu"] },
    ],
  },
  {
    id: "step_6_cinematic_archetype",
    text: "6. Ve son dokunuş... Perde açıldığında ilk görmek istediğin insan?",
    answers: [
      { text: "Sevdiklerine sarılan, gülümseyen ve hayatı olduğu gibi kucaklayan biri.", targets: ["kahkaha", "askbahcesi"] },
      { text: "Loş ışıkta yalnız, gece yarısı sigara içen ve içini döken biri.", targets: ["gece", "geceyarisi-itirafi"] },
      { text: "Acısını sunarken bile güzel kalan, özgün ve kırılgan bir yürek.", targets: ["gozyasi", "kalp"] },
      { text: "Sana doğrudan bakan, meydan okuyan, kısa ama keskin bir enerjiyle dolu biri.", targets: ["zihin", "sipsak"] },
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
  sipsak: "Şipşak",
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
    sipsak: "Zamanın az, sinema aşkının sonsuz. Kısa ve vurucu başyapıtlar seni bekliyor. Perde hemen açılıyor.",
    "deep-chills": "Karanlık çöktü, perdeler kapandı. Derin bir ürperti için hazır mısın?",
    "kadraj-estetigi": "Güzel bir kare bin kelimeye bedeldir. Bu gece sinematografinin başyapıtlarını keşfet.",
    "geceyarisi-itirafi": "Gece yarısı sohbetleri ve derin diyaloglar sana iyi gelecek. Konuşmaların büyüsüne kapıl.",
  };
  return messages[primary] || "Bu geceki ruh haline göre harika bir seçki hazırladık.";
}

export { QUESTIONS, MOOD_NAMES };
