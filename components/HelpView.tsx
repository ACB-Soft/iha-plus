import React from 'react';
import GlobalFooter from './GlobalFooter';
import Header from './Header';

interface Props {
  onBack: () => void;
}

const HelpView: React.FC<Props> = ({ onBack }) => {
  return (
    <div className="flex-1 flex flex-col animate-in h-full overflow-hidden bg-slate-200">
      <Header title="Yardım & Hakkında" onBack={onBack} />

      <div className="flex-1 px-8 overflow-y-auto no-scrollbar py-4">
        <div className="max-w-sm mx-auto w-full space-y-10">
          {/* Kullanım Kılavuzu */}
          <section className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-200">
                <i className="fas fa-book-open"></i>
              </div>
              <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">Kullanım Kılavuzu</h3>
            </div>
            
            <div className="space-y-4">
              {/* 1. Uçuş Planı Oluşturma */}
              <div className="soft-card p-5 space-y-3">
                <h4 className="font-black text-slate-900 text-base uppercase flex items-center gap-2">
                  <span className="w-6 h-6 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center text-xs font-bold">1</span>
                  Uçuş Planı Oluşturma
                </h4>
                <div className="text-slate-700 text-sm leading-relaxed font-medium text-justify space-y-2.5">
                  <p>
                    Profesyonel otonom fotogrametri uçuşları için dinamik rotalar hazırlayabilirsiniz:
                  </p>
                  <ul className="space-y-2">
                    <li className="flex items-start gap-2">
                      <i className="fas fa-layer-group text-indigo-600 text-xs mt-1 shrink-0"></i>
                      <span><b>Uçuş Modu Seçimi:</b> Geniş saha haritalamaları için <b>"Normal Uçuş"</b> (Alan/Grid), koridor ve hat projeleri için <b>"Şeritvari Uçuş"</b> modunu seçin.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <i className="fas fa-file-upload text-indigo-600 text-xs mt-1 shrink-0"></i>
                      <span><b>Tahdit Yükleme:</b> Çalışma sahanıza ait KML veya KMZ dosyasını yükleyin. Dosyanız yoksa <b>KML Plus</b> yardımcısını kullanarak doğrudan sahanızı çizebilirsiniz.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <i className="fas fa-camera text-indigo-600 text-xs mt-1 shrink-0"></i>
                      <span><b>Kamera & GSD Hesabı:</b> Hazır drone/kamera modellerinden seçim yapın veya özel fokal uzunluk ve sensör değerlerinizi girin. Hedef uçuş yüksekliğine göre Yer Örnekleme Aralığı (GSD) anlık hesaplanır.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <i className="fas fa-expand-arrows-alt text-indigo-600 text-xs mt-1 shrink-0"></i>
                      <span><b>Tampon Genişletme & Sınır Ayarları:</b> Uçuş emniyeti ve kenar kapsamasını artırmak için sınır tamponu (buffer) belirleyin veya sahayı ızgaraya/dikdörtgene genişletme seçeneklerini kullanın.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <i className="fas fa-file-export text-indigo-600 text-xs mt-1 shrink-0"></i>
                      <span><b>Parçalı Uçuş & Dışa Aktarma:</b> Uzun şerit uçuşlarında batarya ve menzil sınırlarına göre rota otomatik olarak parçalara (Part 1, Part 2...) bölünür. Tüm planı KML formatında indirebilirsiniz.</span>
                    </li>
                  </ul>
                </div>
              </div>

              {/* 2. Yer Kontrol Noktası (YKN) Planlama */}
              <div className="soft-card p-5 space-y-3">
                <h4 className="font-black text-slate-900 text-base uppercase flex items-center gap-2">
                  <span className="w-6 h-6 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center text-xs font-bold">2</span>
                  Yer Kontrol Noktası (YKN) Planlama
                </h4>
                <div className="text-slate-700 text-sm leading-relaxed font-medium text-justify space-y-2.5">
                  <p>
                    Fotogrametrik blok dengelemesi ve hassas konum doğrulaması için optimum YKN ağı tasarlayın:
                  </p>
                  <ul className="space-y-2">
                    <li className="flex items-start gap-2">
                      <i className="fas fa-th text-indigo-600 text-xs mt-1 shrink-0"></i>
                      <span><b>Otomatik Grid & Koridor Yerleşimi:</b> Çalışma sınırınız dahilinde belirlediğiniz aralıklarla (metre) homojen YKN noktaları oluşturun.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <i className="fas fa-plus-circle text-indigo-600 text-xs mt-1 shrink-0"></i>
                      <span><b>İnteraktif Araya Nokta Ekleme:</b> İki YKN noktası arasındaki mesafe etiketinde bulunan <b>"+"</b> butonuna tıklayarak doğrudan o hatta yeni bir YKN noktası ekleyebilirsiniz.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <i className="fas fa-hand-pointer text-indigo-600 text-xs mt-1 shrink-0"></i>
                      <span><b>Manuel Sürükleme & Düzenleme:</b> Harita üzerindeki YKN işaretçilerini tutup arazi şartlarına uygun güvenli noktalara taşıyabilir veya üzerine tıklayarak silebilirsiniz.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <i className="fas fa-file-csv text-indigo-600 text-xs mt-1 shrink-0"></i>
                      <span><b>Koordinat Aktarımı:</b> Oluşturulan YKN listesini KML, CSV veya Metin formatında koordinat değerleriyle birlikte dışa aktarın.</span>
                    </li>
                  </ul>
                </div>
              </div>

              {/* 3. Kontrol Uçuşu Planlama */}
              <div className="soft-card p-5 space-y-3">
                <h4 className="font-black text-slate-900 text-base uppercase flex items-center gap-2">
                  <span className="w-6 h-6 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center text-xs font-bold">3</span>
                  Kontrol Uçuşu Planlama
                </h4>
                <div className="text-slate-700 text-sm leading-relaxed font-medium text-justify space-y-2.5">
                  <p>
                    Harita üretim denetimi ve kalite güvence süreçleri için örneklem bazlı kontrol uçuşları kurgulayın:
                  </p>
                  <ul className="space-y-2">
                    <li className="flex items-start gap-2">
                      <i className="fas fa-percentage text-indigo-600 text-xs mt-1 shrink-0"></i>
                      <span><b>Örneklem Yüzdesi Belirleme:</b> Ana sahanın %1 ile %100 arasında hedeflenen kontrol oranını seçin; algoritma gerekli şerit veya spot adedini otomatik hesaplasın.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <i className="fas fa-shapes text-indigo-600 text-xs mt-1 shrink-0"></i>
                      <span><b>3 Farklı Kontrol Rotası Modeli:</b> Sahanın yapısına göre <b>"Grid Alan"</b> (homojen spot gridler), <b>"Şeritvari Z"</b> (paralel ve çapraz hatlar) veya <b>"Şeritvari L"</b> (90° dik açılı 2 kollu koridor) modellerinden birini seçin.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <i className="fas fa-sync-alt text-indigo-600 text-xs mt-1 shrink-0"></i>
                      <span><b>Canlı Döndürme & Taşıma:</b> Harita üzerindeki alet çubuğuyla şeritlerin açısını tekil veya toplu olarak anlık döndürebilir, şerit merkezlerini haritada serbestçe sürükleyebilirsiniz.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <i className="fas fa-file-pdf text-indigo-600 text-xs mt-1 shrink-0"></i>
                      <span><b>Raporlama & KML Aktarımı:</b> Planlanan kontrol uçuşunu tüm detaylarıyla KML formatında indirebilir veya resmi teknik özet içeren <b>PDF Raporu</b> alabilirsiniz.</span>
                    </li>
                  </ul>
                </div>
              </div>

              {/* 4. Hazır YKN Şablonları */}
              <div className="soft-card p-5 space-y-3">
                <h4 className="font-black text-slate-900 text-base uppercase flex items-center gap-2">
                  <span className="w-6 h-6 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center text-xs font-bold">4</span>
                  Hazır YKN Şablonları
                </h4>
                <div className="text-slate-700 text-sm leading-relaxed font-medium text-justify space-y-2.5">
                  <p>
                    Arazide fotogrametrik nirengi noktalarının hassas tespiti için yer hedef levhası şablonları oluşturun:
                  </p>
                  <ul className="space-y-2">
                    <li className="flex items-start gap-2">
                      <i className="fas fa-shapes text-indigo-600 text-xs mt-1 shrink-0"></i>
                      <span><b>Hedef Tipleri:</b> Standart <b>Artı (+)</b>, kontrastlı <b>Dama (Checkerboard)</b> ve <b>Kelebek (Bowtie)</b> YKN hedef desenleri arasından seçim yapın.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <i className="fas fa-print text-indigo-600 text-xs mt-1 shrink-0"></i>
                      <span><b>Baskıya Hazır PDF & SVG:</b> A4 veya A3 kağıt boyutlarında, milimetrik hassasiyette vektörel çıktılar alın veya doğrudan cihazınıza indirin.</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </section>

          {/* Nasıl Çalışır? */}
          <section className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-orange-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-orange-200">
                <i className="fas fa-microchip"></i>
              </div>
              <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">Nasıl Çalışır?</h3>
            </div>
            <div className="soft-card p-6 space-y-8">
              {/* 1. Normal Tahdit Planlama */}
              <div className="space-y-2">
                <h4 className="font-black text-slate-900 text-sm uppercase tracking-wider flex items-center gap-2">
                  <span className="w-5 h-5 bg-orange-100 text-orange-600 rounded flex items-center justify-center text-[10px] font-bold">1</span>
                  Grid (Alan) Fotogrametri Algoritması
                </h4>
                <p className="text-slate-700 text-sm leading-relaxed font-medium text-justify">
                  Geniş alanların haritalanması için fotogrametrik kurallarla hesaplama yapılır. Seçilen uçuş yüksekliği (H), fokal uzunluk (f) ve sensör boyutuna bağlı olarak Yer Örnekleme Aralığı (GSD) anlık tespit edilir. Sahanın tam kapsanması için sınır tamponu (buffer) veya ızgaraya/dikdörtgene genişletme algoritmaları uygulanarak uçuş sahası ve nirengi dağılım sınırları oluşturulur.
                </p>
              </div>

              {/* 2. Şeritvari Tahdit Planlama */}
              <div className="space-y-2">
                <h4 className="font-black text-slate-900 text-sm uppercase tracking-wider flex items-center gap-2">
                  <span className="w-5 h-5 bg-orange-100 text-orange-600 rounded flex items-center justify-center text-[10px] font-bold">2</span>
                  Koridor & Şerit Uçuş Bölümleme Algoritması
                </h4>
                <p className="text-slate-700 text-sm leading-relaxed font-medium text-justify">
                  Yol, nehir, demiryolu ve boru hatları gibi çizim hatları etrafına seçilen genişlikte tampon (buffer) alan oluşturulur. İHA'ların pil ve menzil kapasitesine göre maksimum parça uzunluğu sınırı uygulanarak rota kesintisiz parçalara (Part 1, Part 2...) bölünür. Her parçanın başlangıç ve bitiş noktalarına emniyetli kavis dönüşleri ve bindirmeli geçiş payları eklenir.
                </p>
              </div>

              {/* 3. Normal Alan Tipi YKN Planlama */}
              <div className="space-y-2">
                <h4 className="font-black text-slate-900 text-sm uppercase tracking-wider flex items-center gap-2">
                  <span className="w-5 h-5 bg-orange-100 text-orange-600 rounded flex items-center justify-center text-[10px] font-bold">3</span>
                  Grid YKN Dağıtım Mimarisi
                </h4>
                <p className="text-slate-700 text-sm leading-relaxed font-medium text-justify">
                  Poligon şeklindeki sahalar içerisinde fotogrametrik Nirengi (Blok Dengelemesi) doğruluğunu maksimize etmek için eşit aralıklı grid matrisi oluşturulur. Kullanıcının belirlediği adım mesafesine göre noktalar konumlandırılır. İki YKN arasındaki mesafe etiketindeki <b>"+"</b> butonu ile dinamik olarak araya nokta eklendiğinde tüm noktaların sıralı numaralandırması otomatik güncellenir.
                </p>
              </div>

              {/* 4. Şeritvari Alan Tipi YKN Planlama */}
              <div className="space-y-2">
                <h4 className="font-black text-slate-900 text-sm uppercase tracking-wider flex items-center gap-2">
                  <span className="w-5 h-5 bg-orange-100 text-orange-600 rounded flex items-center justify-center text-[10px] font-bold">4</span>
                  Şeritvari YKN - Voronoi Spine & Zikzak Algoritması
                </h4>
                <div className="text-slate-700 text-sm leading-relaxed font-medium text-justify space-y-3">
                  <p>Kıvrımlı koridor ve hat projelerinde yüksek geometrik hassasiyet sağlamak için 3 aşamalı analiz çalışır:</p>
                  <ul className="list-disc ml-4 space-y-2">
                    <li><b>Voronoi Omurga Analizi (Medial Axis):</b> Şeridin matematiksel orta hattı Voronoi diyagramları ve piksel/geometrik dönüşümlerle belirlenir.</li>
                    <li><b>Dinamik Zikzak Dağıtımı:</b> Belirlenen adım mesafelerine göre noktalar orta hattın sağ ve sol kenarlarına çapraz sırayla yerleştirilir.</li>
                    <li><b>Köşe & Bükülme Optimizasyonu:</b> Koridordaki keskin dönüş virajlarında oluşabilecek model bükülmelerini engellemek için dış kavis kenarına peş peşe 3 stratejik YKN yerleştirilir.</li>
                  </ul>
                </div>
              </div>

              {/* 5. Kontrol Uçuşu Algoritması & Modelleri */}
              <div className="space-y-2">
                <h4 className="font-black text-slate-900 text-sm uppercase tracking-wider flex items-center gap-2">
                  <span className="w-5 h-5 bg-orange-100 text-orange-600 rounded flex items-center justify-center text-[10px] font-bold">5</span>
                  Kontrol Uçuşu ve Homojen Örneklem Algoritması
                </h4>
                <div className="text-slate-700 text-sm leading-relaxed font-medium text-justify space-y-3">
                  <p>Fotogrametri üretimlerinin doğruluk kontrolü için 3 temel rota modeli ile dinamik örneklem dağıtımı gerçekleştirilir:</p>
                  <ul className="list-disc ml-4 space-y-2">
                    <li><b>Hedef Örneklem Hesabı:</b> Seçilen örneklem yüzdesi (%1-%100) ve şerit/grid parametrelerine göre sahadaki toplam kontrol alanı matematiksel olarak hesaplanır ve gerekli spot adedi üretilir.</li>
                    <li><b>Model Çeşitliliği (Grid, Z ve L):</b> Homojen kare grid alanları, paralel ve çapraz çift yönlü 'Z' hatları veya 90° dik açılı ortogonal 'L' koridorları oluşturulur.</li>
                    <li><b>Kuzey Öncelikli Coğrafi Sıralama:</b> Oluşturulan tüm kontrol alanları sahada en kuzeydeki noktadan başlayarak güneye ve batıdan doğuya doğru düzenli bir okuma sırasıyla (1, 2, 3...) numaralandırılır.</li>
                    <li><b>Dinamik Geometrik Transformasyon:</b> Kontrol şeritleri ve yer kontrol noktaları harita üzerinde serbestçe döndürülebilir ve taşınabilir.</li>
                  </ul>
                </div>
              </div>
            </div>
          </section>

          {/* Veri Güvenliği */}
          <section className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-emerald-200">
                <i className="fas fa-shield-alt"></i>
              </div>
              <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">Veri Güvenliği</h3>
            </div>
            <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-6">
              <p className="text-emerald-900 text-sm leading-relaxed font-medium text-justify">
                Mobil cihazınızdan uygulamayı sildiğinizde veya tarayıcı önbelleğini temizlediğinizde cihazınızdaki veriler de silinecektir. Planlama sonrası verilerinizi yedeklemeyi unutmayın.
              </p>
            </div>
          </section>

          {/* Hakkında */}
          <section className="space-y-4 pb-10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-slate-800 rounded-xl flex items-center justify-center text-white shadow-lg shadow-slate-400">
                <i className="fas fa-info-circle"></i>
              </div>
              <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">Hakkında</h3>
            </div>
            <div className="soft-card p-6 space-y-4">
              <p className="text-sm text-slate-700 font-medium leading-relaxed text-justify">
                Bu uygulama, İHA saha çalışmalarında hızlı ve pratik uçuş planlama ve YKN yönetimi sağlamak amacıyla geliştirilmiştir. Uygulama ile ilgili herhangi bir sorun yaşıyorsanız veya bir özellik isteğiniz varsa e-posta yoluyla iletişime geçebilirsiniz.
              </p>
              <div className="flex flex-col">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">İletişim</span>
                <span className="text-xs font-bold text-slate-900">acbmaps@gmail.com</span>
              </div>
            </div>
          </section>
        </div>
      </div>
      
      <GlobalFooter />
    </div>
  );
};

export default HelpView;

