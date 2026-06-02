import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ShieldCheck } from 'lucide-react';
import useDocumentMeta from '../utils/useDocumentMeta';
import { hasAnalyticsConsent, grantAnalyticsConsent, revokeAnalyticsConsent } from '../utils/analytics';

/**
 * Gizlilik & KVKK Aydınlatma Metni.
 * Hangi veriler, neden işleniyor, kullanıcı hakları + iletişim.
 */
export default function Gizlilik() {
  const navigate = useNavigate();
  const [analyticsOn, setAnalyticsOn] = useState(() => hasAnalyticsConsent());
  const toggleAnalytics = () => {
    if (analyticsOn) { revokeAnalyticsConsent(); setAnalyticsOn(false); }
    else { grantAnalyticsConsent(); setAnalyticsOn(true); }
  };
  useDocumentMeta({
    title: 'Gizlilik & KVKK — Sinemood',
    description: "Sinemood'da hangi verilerin neden işlendiği, çerez/analitik kullanımı ve KVKK kapsamındaki haklarınız.",
  });

  const updated = '29 Mayıs 2026';

  return (
    <div className="min-h-screen text-ivory font-sans">
      <header className="sticky top-0 z-40 backdrop-blur-md bg-[#120d0b]/70 border-b border-white/5 pt-safe">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <button onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-ivory/55 hover:text-ivory transition-colors group">
            <ChevronLeft size={18} className="group-hover:-translate-x-0.5 transition-transform" />
            <span className="text-[11px] font-bold uppercase tracking-widest">Geri</span>
          </button>
          <div className="flex items-center gap-2 text-amber">
            <ShieldCheck size={16} />
            <span className="text-[11px] font-bold uppercase tracking-[0.3em]">Gizlilik</span>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-14 pb-nav">
        <h1 className="text-3xl sm:text-4xl font-serif font-bold tracking-tight mb-3">
          Gizlilik & KVKK Aydınlatma Metni
        </h1>
        <p className="text-fg-subtle text-sm mb-10">Son güncelleme: {updated}</p>

        <div className="space-y-8 text-[15px] leading-relaxed text-fg-muted">
          <section className="space-y-2">
            <h2 className="text-lg font-bold text-fg">1. Veri Sorumlusu</h2>
            <p>
              Sinemood ("Platform"), ruh haline göre film keşfi sunan bir hizmettir. Bu metin,
              6698 sayılı Kişisel Verilerin Korunması Kanunu (KVKK) kapsamında hangi verileri,
              hangi amaçla işlediğimizi açıklar.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-bold text-fg">2. İşlenen Veriler</h2>
            <ul className="list-disc pl-5 space-y-1.5">
              <li><span className="text-fg">Hesap bilgileri:</span> Google ile giriş yaptığınızda ad, e-posta ve profil görseliniz (yalnızca kimlik doğrulama ve profilinizi oluşturmak için).</li>
              <li><span className="text-fg">Uygulama içi veriler:</span> izleme listeniz, notlarınız, zevk haritanız, arkadaş/öneri etkileşimleriniz — hizmeti size sunmak için.</li>
              <li><span className="text-fg">Anonim analitik:</span> sayfa görüntüleme ve özellik kullanımı (çerezsiz, IP saklanmaz, kişisel kimlik içermez). İstediğiniz zaman aşağıdan kapatabilirsiniz.</li>
              <li><span className="text-fg">Teknik veriler:</span> hata/performans amaçlı sınırlı günlükler.</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-bold text-fg">3. İşleme Amaçları</h2>
            <p>
              Verileriniz; film önerisi sunmak, profil ve listelerinizi saklamak, sosyal özellikleri
              (arkadaş, öneri, davet) çalıştırmak ve hizmeti iyileştirmek için işlenir. Verileriniz
              üçüncü taraflara <span className="text-fg">satılmaz</span>.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-bold text-fg">4. Çerezler & Analitik</h2>
            <p>
              Pazarlama/izleme çerezleri kullanmıyoruz. Analitik araçlarımız (Umami) <span className="text-fg">çerezsiz
              ve anonimdir</span> — çerez yerleştirmez, IP adresinizi saklamaz, kişisel kimlik toplamaz. Bu nedenle
              çerezsiz anonim ölçüm varsayılan olarak açıktır; dilediğiniz zaman aşağıdaki düğmeyle kapatabilirsiniz.
            </p>
            <div className="mt-3 flex items-center justify-between gap-4 rounded-2xl border border-default bg-fg/[0.03] px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-fg">Anonim analitik</p>
                <p className="text-[12px] text-fg-subtle">{analyticsOn ? 'Şu an açık' : 'Şu an kapalı'}</p>
              </div>
              <button
                onClick={toggleAnalytics}
                aria-pressed={analyticsOn}
                className={`px-5 py-2.5 rounded-full text-[11px] font-bold uppercase tracking-[0.15em] transition-all ${
                  analyticsOn
                    ? 'border border-default text-fg-subtle hover:text-fg hover:bg-fg/[0.04]'
                    : 'bg-amber text-bg hover:scale-[1.02] active:scale-[0.99]'
                }`}
              >
                {analyticsOn ? 'Analitiği Kapat' : 'Analitiği Aç'}
              </button>
            </div>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-bold text-fg">5. Üçüncü Taraf Servisler</h2>
            <p>
              Film verileri için TMDB ve OMDb, kimlik doğrulama için Google, öneri/analiz için yapay
              zeka servisleri kullanılır. Bu servislerin kendi gizlilik politikaları geçerlidir.
              Film verileri TMDB tarafından sağlanır; Sinemood TMDB tarafından onaylanmamıştır.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-bold text-fg">6. Saklama & Güvenlik</h2>
            <p>
              Verileriniz hizmet sürdüğü sürece saklanır; hesabınızı sildiğinizde ilişkili verileriniz
              makul süre içinde silinir. Verilere yetkisiz erişime karşı teknik tedbirler uygulanır.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-bold text-fg">7. KVKK Haklarınız</h2>
            <p>
              KVKK md. 11 kapsamında; verilerinize erişme, düzeltme, silme ve işlemeye itiraz etme
              haklarına sahipsiniz. Talepleriniz için aşağıdaki adresten bize ulaşabilirsiniz.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-bold text-fg">8. İletişim</h2>
            <p>
              Gizlilikle ilgili sorular için:{' '}
              <a href="mailto:privacy@sinemood.app" className="text-amber underline underline-offset-2 hover:text-amber/80">
                privacy@sinemood.app
              </a>
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
