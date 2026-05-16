/**
 * Ruh Hali Testi — sorular, cevaplar ve mood skorlama mantığı.
 * Her cevap bir veya daha fazla mood'a puan ekler.
 * 6 soru, her biri atmosferik ve kişisel.
 */

const QUESTIONS = [
  {
    id: 1,
    text: "Gözlerini kapat ve düşün: Bu gece nasıl bir sahne hayal ediyorsun?",
    answers: [
      {
        text: "Yağmurun altında nefes nefese bir kovalamaca",
        effects: { adrenalin: 3, gece: 2 },
      },
      {
        text: "Şöminenin önünde sıcak bir battaniye",
        effects: { battaniye: 3, sessiz: 1 },
      },
      {
        text: "Yıldızların altında bilinmeyen bir yolda yürümek",
        effects: { yolculuk: 3, karmakar: 1 },
      },
      {
        text: "Trende pencereden dışarı bakıp eski anıları düşünmek",
        effects: { gozyasi: 3, kalp: 2 },
      },
      {
        text: "Karanlık bir odada tahtaya bağlı ipuçlarını çözmek",
        effects: { zihin: 3, gece: 1 },
      },
    ],
  },
  {
    id: 2,
    text: "Şu an ruh haline en yakın şarkı hangisi olurdu?",
    answers: [
      {
        text: "Hızlı, bas gitar ağırlıklı, enerji dolu",
        effects: { adrenalin: 3, Retro: 2 },
      },
      {
        text: "Yavaş piyano, hafif melankolik",
        effects: { gozyasi: 2, sessiz: 2, kalp: 1 },
      },
      {
        text: "Neşeli, ritmik, dans ettiren",
        effects: { kahkaha: 3, battaniye: 1 },
      },
      {
        text: "Epik, orkestral, sinematik",
        effects: { zamanyolcusu: 2, yolculuk: 2, adrenalin: 1 },
      },
      {
        text: "Elektronik, deneysel, sıradışı",
        effects: { karmakar: 3, "deep-chills": 1 },
      },
    ],
  },
  {
    id: 3,
    text: "Bir film karakteri olsan, bu gece ne yapardın?",
    answers: [
      {
        text: "Gece yarısı karanlık sokaklarda birini takip ederdim",
        effects: { gece: 3, "deep-chills": 2 },
      },
      {
        text: "Evde kalıp eski fotoğraf albümlerine bakardım",
        effects: { battaniye: 2, zamanyolcusu: 2, gozyasi: 1 },
      },
      {
        text: "Sahneye çıkıp insanları güldürürdüm",
        effects: { kahkaha: 3, battaniye: 1 },
      },
      {
        text: "Birinin kapısının önüne gidip kalbimi açardım",
        effects: { askbahcesi: 3, gozyasi: 1 },
      },
      {
        text: "Haritada rastgele bir nokta seçip oraya giderdim",
        effects: { yolculuk: 3, kalp: 1 },
      },
    ],
  },
  {
    id: 4,
    text: "Hangisi seni daha çok etkiler?",
    answers: [
      {
        text: "Beklenmedik bir son — her şeyi alt üst eden bir twist",
        effects: { zihin: 3, karmakar: 2 },
      },
      {
        text: "Sessiz bir veda sahnesi — kelimesiz ama yürek burkan",
        effects: { gozyasi: 3, sessiz: 2 },
      },
      {
        text: "Epik bir savaş sahnesi — müzik tavan, adrenalin dorukta",
        effects: { adrenalin: 3, yolculuk: 1 },
      },
      {
        text: "İki kişinin ilk bakışması — zaman durur gibi",
        effects: { askbahcesi: 3, kalp: 1 },
      },
      {
        text: "Açıklanamayan tuhaf bir sahne — rüya mı gerçek mi belli değil",
        effects: { karmakar: 2, "deep-chills": 2, zihin: 1 },
      },
    ],
  },
  {
    id: 5,
    text: "Bu gece filmi hangi ortamda izlemek isterdin?",
    answers: [
      {
        text: "Eski, kadife koltukllu bir sinema salonunda",
        effects: { zamanyolcusu: 3, Retro: 1 },
      },
      {
        text: "Yağmurlu bir gecede, pencere kenarında",
        effects: { battaniye: 2, sessiz: 2, kalp: 1 },
      },
      {
        text: "Dağ başında, yıldızların altında dev bir perdeyle",
        effects: { yolculuk: 3, adrenalin: 1 },
      },
      {
        text: "Mumların aydınlattığı loş bir odada",
        effects: { "deep-chills": 2, gece: 2, askbahcesi: 1 },
      },
      {
        text: "Arkadaşlarla dolu, gürültülü bir salonda",
        effects: { kahkaha: 3, adrenalin: 1 },
      },
    ],
  },
  {
    id: 6,
    text: "Film bitince nasıl hissetmek istersin?",
    answers: [
      {
        text: "Huzurlu ve mutlu — içim ısınsın",
        effects: { battaniye: 3, askbahcesi: 1 },
      },
      {
        text: "Şaşkın — beynimden duman çıksın",
        effects: { zihin: 3, karmakar: 2 },
      },
      {
        text: "Ağlamış — ama rahatlamış olayım",
        effects: { gozyasi: 3, kalp: 1 },
      },
      {
        text: "Gülmüş — yanaklarım ağrısın",
        effects: { kahkaha: 3 },
      },
      {
        text: "Gergin — yatağa girince arkama bakayım",
        effects: { "deep-chills": 3, gece: 2 },
      },
      {
        text: "Ateş almış — koltuğumdan kalkmaya üşenmişim",
        effects: { adrenalin: 3, yolculuk: 1 },
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
  Retro: "Retro Bakış",
  "deep-chills": "Derin Ürperti",
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
    Retro: 0,
    "deep-chills": 0,
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
    battaniye: "Bu gece sana sıcak, huzurlu ve sarıp sarmalayan hikayeler iyi gelecek.",
    yolculuk: "Ruhun yeni ufuklara açılmak istiyor. Uzaklara bir yolculuğa çıkma vakti.",
    gece: "Karanlık çökerken gizemli ve derin bir gece seansı tam sana göre.",
    kahkaha: "Kafanı dağıtıp gülmenin tam zamanı. Eğlence seni bekliyor.",
    gozyasi: "Duygularını özgür bırakma vakti. İçindekileri dışarıya salacak filmler var.",
    adrenalin: "Kalbin hızlı atsın, koltuğunun kenarında bir gece seni bekliyor.",
    askbahcesi: "Kalbinde kelebekler uçuşuyor. Romantik bir yolculuğa çıkmaya ne dersin?",
    zamanyolcusu: "Geçmişin büyülü atmosferinde kaybolmak istiyorsun. Eski bir film şahane gider.",
    sessiz: "Sessizliğin ve görüntülerin konuştuğu, kelimelerin yetmediği yerlere yolculuk.",
    zihin: "Zihnini çalıştıracak, düşündürecek ve şaşırtacak bir film tam aradığın.",
    kalp: "Büyük hikayeler değil, küçük dokunuşlar arıyorsun. Bağımsız sinemanın samimi dünyası.",
    karmakar: "Gerçekliğin sınırlarını zorlayan, sıradışı bir deneyim istiyorsun.",
    Retro: "Neon ışıklar ve synth melodiler eşliğinde geçmişe bir yolculuk yapma vakti.",
    "deep-chills": "Karanlık çöktü, perdeler kapandı. Derin bir ürperti için hazır mısın?",
  };
  return messages[primary] || "Bu geceki ruh haline göre harika bir seçki hazırladık.";
}

export { QUESTIONS, MOOD_NAMES };
