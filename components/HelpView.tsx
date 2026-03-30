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
              <i className="fas fa-book"></i>
            </div>
            <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">Nasıl Kullanılır?</h3>
          </div>
          
          <div className="space-y-4">
            {/* Uçuş Planı Oluştur */}
            <div className="soft-card p-4 space-y-3 border-l-4 border-l-indigo-500">
              <h4 className="font-black text-slate-900 text-base uppercase flex items-center gap-2">
                <span className="w-6 h-6 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center text-xs">1</span>
                Uçuş Planı Oluştur
              </h4>
              <p className="text-slate-700 text-sm leading-relaxed font-medium text-justify">
                İnsansız Hava Araçları için profesyonel uçuş planları hazırlamak için <b>"Uçuş Planı Oluştur"</b> modülünü kullanın.
                <br/><br/>
                • <b>Uçuş Tipleri:</b> "Normal Uçuş" (alan bazlı) veya "Şeritvari Uçuş" (koridor bazlı) seçeneklerinden projenize uygun olanı seçin.
                <br/>
                • <b>Tahdit Dosyası:</b> Uçuş alanınızı belirleyen KML veya KMZ dosyasını yükleyin. Eğer dosyanız yoksa <b>KML Plus</b> yardımcısını kullanabilirsiniz.
                <br/>
                • <b>Genişletme ve Ayarlar:</b> Uçuş hattı genişliği, emniyet mesafesi ve uçuş yönü gibi parametreleri arazinin durumuna göre özelleştirin.
                <br/>
                • <b>Dışarı Aktarma:</b> Hazırlanan planı KML formatında indirin. Şeritvari uçuşlarda, uçuşun parçalara ayrılması durumunda hem tam plan hem de her bir parça ayrı dosyalar olarak (örn: Proje1, Proje2...) otomatik olarak indirilir.
              </p>
            </div>

            {/* YKN Planı Oluştur */}
            <div className="soft-card p-4 space-y-3 border-l-4 border-l-indigo-500">
              <h4 className="font-black text-slate-900 text-base uppercase flex items-center gap-2">
                <span className="w-6 h-6 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center text-xs">2</span>
                YKN Planı Oluştur
              </h4>
              <p className="text-slate-700 text-sm leading-relaxed font-medium text-justify">
                Fotogrametrik projeleriniz için Yer Kontrol Noktası (YKN) dağılımını optimize edin.
                <br/><br/>
                • <b>GSD Hesaplama:</b> Kamera sensörü ve uçuş yüksekliğine bağlı olarak Yer Örnekleme Aralığı (GSD) otomatik hesaplanır.
                <br/>
                • <b>Grid Planlama:</b> Belirlediğiniz aralıklarla (metre) çalışma alanınıza homojen YKN noktaları yerleştirin.
                <br/>
                • <b>Manuel Düzenleme:</b> Harita üzerindeki noktaları sürükleyerek arazi şartlarına en uygun konuma yerleştirin.
              </p>
            </div>

            {/* KML Plus Entegrasyonu */}
            <div className="soft-card p-4 space-y-3 border-l-4 border-l-indigo-500">
              <h4 className="font-black text-slate-900 text-base uppercase flex items-center gap-2">
                <span className="w-6 h-6 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center text-xs">3</span>
                KML Plus Desteği
              </h4>
              <p className="text-slate-700 text-sm leading-relaxed font-medium text-justify">
                Uçuş planı için gerekli olan tahdit dosyasını (KML/KMZ) hazırlamak için <b>ACB Software</b> tarafından geliştirilen <b>KML Plus</b> uygulamasını kullanabilirsiniz.
                <br/><br/>
                • Uçuş tipi seçimi ekranındaki butona tıklayarak yardımcı uygulamaya hızlıca erişebilirsiniz.
              </p>
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
              Mobil cihazınızdan uygulamayı sildiğinizde veya tarayıcı önbelliğini temizlediğinizde cihazınızdaki veriler de silinecektir. Planlama sonrası verilerinizi yedeklemeyi unutmayın.
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
              <span className="text-xs font-bold text-slate-900">info@ihaplus.app</span>
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
