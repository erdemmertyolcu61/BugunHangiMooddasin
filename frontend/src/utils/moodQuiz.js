/**
 * Ruh Hali Testi — immersive, cinematic questionnaire.
 * Each answer targets a specific mood for a focused experience.
 */

const QUESTIONS = [
  {
    id: "step_1_energy",
    text: "Şu an zihnin tam olarak nerede geziniyor?",
    answers: [
      {
        text: "Hayatın gürültüsünden kaçıp sığınacak güvenli bir liman arıyorum.",
        effects: { battaniye: 3 },
        targetMood: "battaniye",
      },
      {
        text: "Gerçekliği sorgulatacak, beynimin kıvrımlarını yakacak bir hikaye gerek.",
        effects: { zihin: 3 },
        targetMood: "zihin",
      },
      {
        text: "Geçmişin o sıcak, eski sinema salonu kokan hissini özledim.",
        effects: { retro: 3 },
        targetMood: "retro",
      },
      {
        text: "Hikaye ikinci plan; gözlerim görsel bir şölen ve kusursuz kadrajlar istiyor.",
        effects: { "kadraj-estetigi": 3 },
        targetMood: "kadraj-estetigi",
      },
    ],
  },
  {
    id: "step_2_pacing",
    text: "İçindeki zamanın akış hızı şu an nasıl?",
    answers: [
      {
        text: "Yavaş aksın. Karakterlerin derin felsefi sohbetlerinde kaybolayım.",
        effects: { "geceyarisi-itirafi": 3 },
        targetMood: "geceyarisi-itirafi",
      },
      {
        text: "Hızlı ve acımasız. Koltuğun kenarını sıktıracak bir tempo olsun.",
        effects: { adrenalin: 3 },
        targetMood: "adrenalin",
      },
      {
        text: "Kelimeler sussun, sadece sessizliğin ve görüntülerin şiirselliği konuşsun.",
        effects: { sessiz: 3 },
        targetMood: "sessiz",
      },
      {
        text: "İçimdeki o düğümü çözecek, beni hüngür hüngür arındıracak bir duygu seli.",
        effects: { gozyasi: 3 },
        targetMood: "gozyasi",
      },
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

/** Test sonucunu hesaplar: cevap index'lerini alır, yüzdeli mood listesi döndürür. */
export function calculateQuizResult(answerIndexes) {
  const scores = {
    battaniye: 0,
    yolculuk: 0,
    gece: 0,
    kahkaha: 0,
    gozyasi: 0,
    adrenalin: 0,
    askbahcesi: 0,
    zamanyolcusu: 0,
    sessiz: 0,
    zihin: 0,
    kalp: 0,
    karmakar: 0,
    retro: 0,
    "deep-chills": 0,
    "kadraj-estetigi": 0,
    "geceyarisi-itirafi": 0,
  };

  answerIndexes.forEach((ansIdx, qIdx) => {
    if (ansIdx === undefined || ansIdx === null) return;
    const question = QUESTIONS[qIdx];
    if (!question) return;
    const answer = question.answers[ansIdx];
    if (!answer) return;
    for (const [moodId, points] of Object.entries(answer.effects)) {
      if (scores[moodId] !== undefined) {
        scores[moodId] += points;
      }
    }
  });

  const total = Object.values(scores).reduce((s, v) => s + v, 0);

  if (total === 0) {
    return [
      { moodId: "battaniye", percentage: 40 },
      { moodId: "yolculuk", percentage: 35 },
      { moodId: "kalp", percentage: 25 },
    ];
  }

  const sorted = Object.entries(scores)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  const topTotal = sorted.reduce((s, [, v]) => s + v, 0);

  return sorted.map(([moodId, score]) => ({
    moodId,
    percentage: Math.round((score / topTotal) * 100),
  }));
}

/** Test bitince gösterilecek yorum metni (en yüksek mood'a göre). */
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
