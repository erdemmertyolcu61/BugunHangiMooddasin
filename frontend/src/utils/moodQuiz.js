/**
 * Ruh Hali Testi — sorular, cevaplar ve mood skorlama mantığı.
 * Her cevap bir veya daha fazla mood'a puan ekler.
 * 6 soru, her biri atmosferik ve kişisel.
 */

const QUESTIONS = [
  {
    id: 1,
    text: "Gözlerini kapatıp bu geceyi hayal etsen, nasıl bir sahne canlanır?",
    answers: [
      {
        text: "Yağmurun altında, nefes nefese bir kovalamaca",
        effects: { adrenalin: 3, gece: 2 },
      },
      {
        text: "Şöminenin başında, sıcacık bir battaniyenin altında",
        effects: { battaniye: 3, sessiz: 1 },
      },
      {
        text: "Yıldızların altında, bilinmedik bir yolda yürürken",
        effects: { yolculuk: 3, karmakar: 1 },
      },
      {
        text: "Trende, camdan dışarı bakıp eski günleri anarken",
        effects: { gozyasi: 3, kalp: 2 },
      },
      {
        text: "Loş bir odada, duvardaki ipuçlarını birleştirirken",
        effects: { zihin: 3, gece: 1 },
      },
    ],
  },
  {
    id: 2,
    text: "Şu anki ruh halini en iyi hangi müzik anlatır?",
    answers: [
      {
        text: "Hızlı tempolu, enerjik bir parça",
        effects: { adrenalin: 3, Retro: 2 },
      },
      {
        text: "Yavaş bir piyano, hafif hüzünlü bir melodi",
        effects: { gozyasi: 2, sessiz: 2, kalp: 1 },
      },
      {
        text: "Neşeli, ritmik, insanı dans ettiren bir şarkı",
        effects: { kahkaha: 3, battaniye: 1 },
      },
      {
        text: "Görkemli, orkestral, sinematik bir tema",
        effects: { zamanyolcusu: 2, yolculuk: 2, adrenalin: 1 },
      },
      {
        text: "Elektronik, deneysel, alışılmadık bir ses",
        effects: { karmakar: 3, "deep-chills": 1 },
      },
    ],
  },
  {
    id: 3,
    text: "Bir film karakteri olsaydın bu gece ne yapardın?",
    answers: [
      {
        text: "Gece yarısı, karanlık sokaklarda birinin izini sürerdim",
        effects: { gece: 3, "deep-chills": 2 },
      },
      {
        text: "Evde kalıp eski fotoğraf albümlerini karıştırırdım",
        effects: { battaniye: 2, zamanyolcusu: 2, gozyasi: 1 },
      },
      {
        text: "Sahneye çıkıp insanları güldürürdüm",
        effects: { kahkaha: 3, battaniye: 1 },
      },
      {
        text: "Sevdiğimin kapısını çalıp içimi dökerdim",
        effects: { askbahcesi: 3, gozyasi: 1 },
      },
      {
        text: "Haritadan rastgele bir yer seçip yola çıkardım",
        effects: { yolculuk: 3, kalp: 1 },
      },
    ],
  },
  {
    id: 4,
    text: "Bir filmde hangi an seni en çok etkiler?",
    answers: [
      {
        text: "Her şeyi değiştiren beklenmedik bir final",
        effects: { zihin: 3, karmakar: 2 },
      },
      {
        text: "Tek kelime edilmeden yaşanan, içe işleyen bir veda",
        effects: { gozyasi: 3, sessiz: 2 },
      },
      {
        text: "Müziğin doruğa çıktığı görkemli bir aksiyon sahnesi",
        effects: { adrenalin: 3, yolculuk: 1 },
      },
      {
        text: "İki insanın ilk kez göz göze geldiği o an",
        effects: { askbahcesi: 3, kalp: 1 },
      },
      {
        text: "Rüya mı gerçek mi belli olmayan tuhaf bir sahne",
        effects: { karmakar: 2, "deep-chills": 2, zihin: 1 },
      },
      {
        text: "Büyüleyici bir sinematografi, her karesinde kaybolduğum bir manzara",
        effects: { "kadraj-estetigi": 3, sessiz: 1, yolculuk: 1 },
      },
    ],
  },
  {
    id: 5,
    text: "Bu gece filmi nerede izlemek isterdin?",
    answers: [
      {
        text: "Kadife koltuklu, eski bir sinema salonunda",
        effects: { zamanyolcusu: 3, Retro: 1 },
      },
      {
        text: "Yağmurlu bir gecede, pencerenin kenarında",
        effects: { battaniye: 2, sessiz: 2, kalp: 1 },
      },
      {
        text: "Dağ başında, yıldızların altında dev bir perdede",
        effects: { yolculuk: 3, adrenalin: 1 },
      },
      {
        text: "Mum ışığıyla aydınlanan loş bir odada",
        effects: { "deep-chills": 2, gece: 2, askbahcesi: 1 },
      },
      {
        text: "Kalabalık, kahkahalarla dolu bir salonda",
        effects: { kahkaha: 3, adrenalin: 1 },
      },
    ],
  },
  {
    id: 6,
    text: "Film bittiğinde kendini nasıl hissetmek istersin?",
    answers: [
      {
        text: "Huzurlu ve mutlu, içi ısınmış biri gibi",
        effects: { battaniye: 3, askbahcesi: 1 },
      },
      {
        text: "Zihni hâlâ filmle meşgul, şaşkın ama keyifli",
        effects: { zihin: 3, karmakar: 2 },
      },
      {
        text: "Ağlamış ama içi rahatlamış biri gibi",
        effects: { gozyasi: 3, kalp: 1 },
      },
      {
        text: "Doyasıya gülmüş, keyfi yerinde biri gibi",
        effects: { kahkaha: 3 },
      },
      {
        text: "Gerilimden hâlâ tüyleri diken diken",
        effects: { "deep-chills": 3, gece: 2 },
      },
      {
        text: "Heyecandan yerinde duramayan biri gibi",
        effects: { adrenalin: 3, yolculuk: 1 },
      },
      {
        text: "Sabaha kadar sürecek derin bir sohbetin içinde, düşüncelere dalmış",
        effects: { "geceyarisi-itirafi": 3, kalp: 1, zihin: 1 },
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
    Retro: 0,
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
    "kadraj-estetigi": "Güzel bir kare bin kelimeye bedeldir. Bu gece sinematografinin başyapıtlarını keşfet.",
    "geceyarisi-itirafi": "Gece yarısı sohbetleri ve derin diyaloglar sana iyi gelecek. Konuşmaların büyüsüne kapıl.",
  };
  return messages[primary] || "Bu geceki ruh haline göre harika bir seçki hazırladık.";
}

export { QUESTIONS, MOOD_NAMES };
