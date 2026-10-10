(function () {
  var E = function (id, name, e) { return { id: id, name: name, e: e }; };
  var M = function (id, name, m) { return { id: id, name: name, m: m }; };
  var list = function (pack, arr) { return arr.map(function (x) { return E(pack + '/' + x[0], x[1], x[2]); }); };
  var packs = [
    { id: 'mood', name: 'Mood', items: list('mood', [
      ['bahagia', 'Bahagia', '😄'], ['senang', 'Senang', '🙂'], ['biasa', 'Biasa aja', '😐'], ['kurang', 'Kurang oke', '😕'], ['berat', 'Berat', '😞'],
      ['sayang', 'Sayang', '🥰'], ['ngantuk', 'Ngantuk', '😴'], ['wow', 'Wow', '🤩'], ['kesal', 'Kesal', '😤'], ['haru', 'Haru', '🥲'],
      ['hati', 'Hati', '❤️'], ['semangat', 'Semangat', '🔥'], ['ketawa', 'Ketawa', '😂'], ['malu', 'Malu', '😊'], ['keren', 'Keren', '😎'],
      ['mikir', 'Mikir', '🤔'], ['lega', 'Lega', '😌'], ['nangis', 'Nangis', '😭'], ['marah', 'Marah', '😠'], ['kaget', 'Kaget', '😮'],
      ['pusing', 'Pusing', '😵‍💫'], ['sakit', 'Sakit', '🤒'], ['peluk', 'Peluk', '🤗'], ['diam', 'Diam', '🤫'], ['cemas', 'Cemas', '😰'],
      ['party', 'Party', '🥳'], ['capek', 'Capek', '😩'], ['cinta', 'Jatuh cinta', '😍'], ['hati-hijau', 'Hati hijau', '💚'], ['hati-ungu', 'Hati ungu', '💜'],
      ['hati-kuning', 'Hati kuning', '💛'], ['patah-hati', 'Patah hati', '💔'], ['kilau-hati', 'Hati berkilau', '💖'],
      ['senyum-lebar', 'Senyum lebar', '😁'], ['kedip', 'Kedip', '😉'], ['melongo', 'Melongo', '😶'], ['bingung', 'Bingung', '😵'], ['gugup', 'Gugup', '😬'], ['terharu', 'Terharu', '🥹'], ['santai', 'Santai', '😏'], ['bintang-mata', 'Kagum', '🤩'], ['sedih', 'Sedih', '😢'], ['bosan', 'Bosan', '🥱'], ['yummy', 'Enak', '😋'], ['nyengir', 'Nyengir', '😆'], ['hati-oranye', 'Hati oranye', '🧡'], ['hati-biru', 'Hati biru', '💙'], ['hati-putih', 'Hati putih', '🤍'], ['hati-cokelat', 'Hati cokelat', '🤎'], ['hati-pink', 'Hati pink', '🩷'], ['hati-dua', 'Dua hati', '💕'], ['hati-tumbuh', 'Hati tumbuh', '💗'], ['hati-panah', 'Hati panah', '💘']]) },
    { id: 'aktivitas', name: 'Aktivitas', items: list('aktivitas', [
      ['belajar', 'Belajar', '📚'], ['nulis', 'Nulis', '✏️'], ['kerja', 'Kerja', '💻'], ['lari', 'Lari', '🏃'], ['yoga', 'Yoga', '🧘'],
      ['musik', 'Musik', '🎧'], ['kopi', 'Kopi', '☕'], ['masak', 'Masak', '🍳'], ['belanja', 'Belanja', '🛒'], ['main', 'Main game', '🎮'],
      ['gambar', 'Gambar', '🎨'], ['olahraga', 'Olahraga', '💪'], ['jalan', 'Jalan-jalan', '✈️'], ['tidur', 'Tidur', '🛌'],
      ['sepeda', 'Sepeda', '🚴'], ['renang', 'Renang', '🏊'], ['baca', 'Baca', '📖'], ['film', 'Nonton film', '🎬'], ['foto', 'Foto', '📷'],
      ['gitar', 'Gitar', '🎸'], ['nyanyi', 'Nyanyi', '🎤'], ['bersih', 'Bersih-bersih', '🧹'], ['cuci', 'Cuci baju', '🧺'], ['tanam', 'Berkebun', '🪴'],
      ['meditasi', 'Meditasi', '🕯️'], ['minum', 'Minum air', '💧'], ['obat', 'Minum obat', '💊'], ['mandi', 'Mandi', '🛁'], ['bola', 'Main bola', '⚽'],
      ['basket', 'Basket', '🏀'], ['badminton', 'Badminton', '🏸'], ['hiking', 'Hiking', '🥾'], ['rajut', 'Merajut', '🧶'], ['podcast', 'Podcast', '🎙️'],
      ['telepon', 'Telepon', '📞'], ['ngoding', 'Ngoding', '⌨️'], ['catat', 'Catat', '📝'], ['ibadah', 'Ibadah', '🤲'],
      ['skate', 'Skateboard', '🛹'], ['ski', 'Ski', '⛷️'], ['tenis', 'Tenis', '🎾'], ['voli', 'Voli', '🏐'], ['bowling', 'Bowling', '🎳'], ['panah', 'Panahan', '🏹'], ['catur', 'Catur', '♟️'], ['puzzle', 'Puzzle', '🧩'], ['dadu', 'Dadu', '🎲'], ['piano', 'Piano', '🎹'], ['drum', 'Drum', '🥁'], ['biola', 'Biola', '🎻'], ['dansa', 'Dansa', '💃'], ['jahit', 'Menjahit', '🧵'], ['cat', 'Mengecat', '🖌️'], ['angkat-beban', 'Angkat beban', '🏋️'], ['tinju', 'Tinju', '🥊'], ['mancing', 'Mancing', '🎣'], ['kemah', 'Kemah', '🏕️'], ['skincare', 'Skincare', '🧴'], ['sikat-gigi', 'Sikat gigi', '🪥'], ['jalan-kaki', 'Jalan kaki', '🚶'], ['laptop-kerja', 'Nugas', '🧑‍💻'], ['vlog', 'Vlog', '📹']]) },
    { id: 'kerja', name: 'Kerja & Sekolah', items: list('kerja', [
      ['tas', 'Tas kerja', '💼'], ['kalender', 'Kalender', '📅'], ['jam', 'Jam', '⏰'], ['pin', 'Pin', '📌'], ['klip', 'Klip', '📎'],
      ['grafik', 'Grafik naik', '📈'], ['ide', 'Ide', '💡'], ['target', 'Target', '🎯'], ['roket', 'Roket', '🚀'], ['centang', 'Centang', '✅'],
      ['email', 'Email', '📧'], ['folder', 'Folder', '📁'], ['rapat', 'Rapat', '🗂️'], ['uang', 'Uang', '💰'], ['tabung', 'Celengan', '🐖'],
      ['kunci', 'Kunci', '🔑'], ['gembok', 'Fokus', '🔒'], ['penggaris', 'Penggaris', '📐'], ['mikroskop', 'Sains', '🔬'], ['globe', 'Globe', '🌏'],
      ['toga', 'Toga', '🎓'], ['sekolah', 'Sekolah', '🏫'], ['pensil', 'Pensil', '✍️'], ['buku-catatan', 'Buku catatan', '📓'], ['jam-pasir', 'Jam pasir', '⏳'],
      ['baterai', 'Baterai penuh', '🔋'], ['lowbat', 'Lowbat', '🪫'], ['medali', 'Medali', '🏅'],
      ['kalkulator', 'Kalkulator', '🧮'], ['printer', 'Printer', '🖨️'], ['mouse', 'Mouse', '🖱️'], ['flashdisk', 'Flashdisk', '💾'], ['link', 'Link', '🔗'], ['cari', 'Cari', '🔍'], ['lonceng', 'Notifikasi', '🔔'], ['amplop', 'Amplop', '✉️'], ['kotak-masuk', 'Inbox', '📥'], ['paket', 'Paket', '📦'], ['struk', 'Struk', '🧾'], ['kartu', 'Kartu', '💳'], ['grafik-turun', 'Grafik turun', '📉'], ['bar', 'Diagram', '📊'], ['label', 'Label', '🏷️'], ['palu', 'Palu', '🔨'], ['obeng', 'Obeng', '🪛'], ['gunting', 'Gunting', '✂️'], ['krayon', 'Krayon', '🖍️'], ['tali', 'Lanyard', '🪪']]) },
    { id: 'makanan', name: 'Makanan', items: list('makanan', [
      ['nasi', 'Nasi', '🍚'], ['mie', 'Mie', '🍜'], ['roti', 'Roti', '🍞'], ['donat', 'Donat', '🍩'], ['kue', 'Kue', '🍰'],
      ['es-krim', 'Es krim', '🍦'], ['pizza', 'Pizza', '🍕'], ['burger', 'Burger', '🍔'], ['sushi', 'Sushi', '🍣'], ['sate', 'Sate', '🍢'],
      ['apel', 'Apel', '🍎'], ['pisang', 'Pisang', '🍌'], ['semangka', 'Semangka', '🍉'], ['stroberi', 'Stroberi', '🍓'], ['alpukat', 'Alpukat', '🥑'],
      ['salad', 'Salad', '🥗'], ['teh', 'Teh', '🍵'], ['boba', 'Boba', '🧋'], ['jus', 'Jus', '🧃'], ['coklat', 'Coklat', '🍫'],
      ['permen', 'Permen', '🍬'], ['kukis', 'Kukis', '🍪'], ['telur', 'Telur', '🥚'], ['wortel', 'Wortel', '🥕'], ['ceri', 'Ceri', '🍒'],
      ['madu', 'Madu', '🍯'], ['popcorn', 'Popcorn', '🍿'], ['jeruk', 'Jeruk', '🍊'],
      ['anggur', 'Anggur', '🍇'], ['nanas', 'Nanas', '🍍'], ['mangga', 'Mangga', '🥭'], ['kelapa', 'Kelapa', '🥥'], ['kiwi', 'Kiwi', '🥝'], ['lemon', 'Lemon', '🍋'], ['persik', 'Persik', '🍑'], ['brokoli', 'Brokoli', '🥦'], ['jagung', 'Jagung', '🌽'], ['cabai', 'Cabai', '🌶️'], ['kentang', 'Kentang', '🥔'], ['croissant', 'Croissant', '🥐'], ['pancake', 'Pancake', '🥞'], ['taco', 'Taco', '🌮'], ['dimsum', 'Dimsum', '🥟'], ['bento', 'Bento', '🍱'], ['kari', 'Kari', '🍛'], ['ayam', 'Ayam goreng', '🍗'], ['kentang-goreng', 'Kentang goreng', '🍟'], ['susu', 'Susu', '🥛'], ['kue-mangkok', 'Cupcake', '🧁'], ['pai', 'Pai', '🥧'], ['puding', 'Puding', '🍮'], ['es-serut', 'Es serut', '🍧'], ['kacang', 'Kacang', '🥜']]) },
    { id: 'alam', name: 'Alam', items: [
      M('alam/kaktus', 'Kaktus', 'kaktus'), M('alam/bunga', 'Bunga', 'bunga'), M('alam/tunas', 'Tunas', 'tunas'), M('alam/jamur', 'Jamur', 'jamur'), M('alam/awan', 'Awan', 'awan')
    ].concat(list('alam', [
      ['pelangi', 'Pelangi', '🌈'], ['matahari', 'Matahari', '☀️'], ['semanggi', 'Semanggi', '🍀'], ['bulan', 'Bulan', '🌙'], ['ombak', 'Ombak', '🌊'],
      ['daun', 'Daun gugur', '🍁'], ['sakura', 'Sakura', '🌸'], ['mawar', 'Mawar', '🌹'], ['tulip', 'Tulip', '🌷'], ['matahari-bunga', 'Bunga matahari', '🌻'],
      ['pohon', 'Pohon', '🌳'], ['cemara', 'Cemara', '🌲'], ['palem', 'Palem', '🌴'], ['daun-hijau', 'Daun', '🌿'], ['gunung', 'Gunung', '⛰️'],
      ['bintang-jatuh', 'Bintang jatuh', '🌠'], ['bumi', 'Bumi', '🌍'], ['salju', 'Salju', '❄️'], ['api', 'Api', '🔥'], ['batu', 'Batu', '🪨'],
      ['kerang-laut', 'Pantai', '🏖️'], ['bunga-putih', 'Bunga putih', '💮'], ['hibiscus', 'Kembang sepatu', '🌺'], ['jamur-merah', 'Jamur merah', '🍄'],
      ['kaktus-emoji', 'Kaktus mini', '🌵'], ['tanaman-pot', 'Tanaman pot', '🪴'], ['bibit', 'Bibit', '🌱'], ['ranting', 'Ranting', '🪵'], ['bunga-teratai', 'Teratai', '🪷'], ['bunga-ungu', 'Bunga ungu', '🪻'], ['daun-jatuh', 'Daun jatuh', '🍂'], ['bintang-langit', 'Bintang', '⭐'], ['bulan-purnama', 'Purnama', '🌕'], ['gunung-salju', 'Gunung salju', '🏔️'], ['gunung-api', 'Gunung api', '🌋'], ['padang', 'Padang pasir', '🏜️'], ['air-terjun', 'Air terjun', '🏞️'], ['tetes', 'Tetes air', '💧'], ['planet', 'Planet', '🪐']])) },
    { id: 'cuaca', name: 'Cuaca', items: list('cuaca', [
      ['cerah', 'Cerah', '☀️'], ['berawan', 'Berawan', '⛅'], ['mendung', 'Mendung', '☁️'], ['hujan', 'Hujan', '🌧️'], ['badai', 'Badai', '⛈️'],
      ['petir', 'Petir', '⚡'], ['salju', 'Salju', '🌨️'], ['angin', 'Angin', '💨'], ['kabut', 'Kabut', '🌫️'], ['pelangi', 'Pelangi', '🌈'],
      ['payung', 'Payung', '☔'], ['termometer', 'Panas', '🌡️'], ['bulan-sabit', 'Bulan sabit', '🌙'], ['bintang', 'Malam berbintang', '🌌'], ['sunrise', 'Matahari terbit', '🌅']]) },
    { id: 'hewan', name: 'Hewan', items: [
      M('hewan/kelinci', 'Kelinci', 'kelinci'), M('hewan/kucing', 'Kucing', 'kucing'), M('hewan/beruang', 'Beruang', 'beruang'), M('hewan/rubah', 'Rubah', 'rubah'),
      M('hewan/anjing', 'Anjing', 'anjing'), M('hewan/ayam', 'Anak ayam', 'ayam'), M('hewan/elang', 'Elang', 'elang'),
      M('hewan/m-panda', 'Panda', 'panda'), M('hewan/m-koala', 'Koala', 'koala'), M('hewan/m-pinguin', 'Pinguin', 'pinguin'), M('hewan/m-katak', 'Katak', 'katak'), M('hewan/m-babi', 'Babi', 'babi'), M('hewan/m-sapi', 'Sapi', 'sapi'), M('hewan/m-domba', 'Domba', 'domba'), M('hewan/m-singa', 'Singa', 'singa'), M('hewan/m-harimau', 'Harimau', 'harimau'), M('hewan/m-burung-hantu', 'Burung hantu', 'burung-hantu'), M('hewan/m-gajah', 'Gajah', 'gajah'), M('hewan/m-hamster', 'Hamster', 'hamster'), M('hewan/m-monyet', 'Monyet', 'monyet'), M('hewan/m-kura-kura', 'Kura-kura', 'kura-kura'), M('hewan/m-paus', 'Paus', 'paus'), M('hewan/m-gurita', 'Gurita', 'gurita'), M('hewan/m-ikan', 'Ikan', 'ikan'),
      M('hewan/s-serigala', 'Serigala', 'serigala'), M('hewan/s-singa-jantan', 'Singa jantan', 'singa-jantan'), M('hewan/s-naga', 'Naga', 'naga'), M('hewan/s-banteng', 'Banteng', 'banteng'), M('hewan/s-hiu', 'Hiu', 'hiu'), M('hewan/s-buaya', 'Buaya', 'buaya'), M('hewan/s-macan-tutul', 'Macan tutul', 'macan-tutul'), M('hewan/s-macan-kumbang', 'Macan kumbang', 'macan-kumbang'), M('hewan/s-beruang-grizzly', 'Grizzly', 'beruang-grizzly'), M('hewan/s-kalajengking', 'Kalajengking', 'kalajengking'), M('hewan/s-gorila', 'Gorila', 'gorila')
    ].concat(list('hewan', [
      ['kupu', 'Kupu-kupu', '🦋'], ['jejak', 'Jejak kaki', '🐾'], ['kerang', 'Kerang', '🐚'], ['bulu', 'Bulu', '🪶'],
      ['lebah', 'Lebah', '🐝'], ['kepik', 'Kepik', '🐞'], ['siput', 'Siput', '🐌'], ['ikan', 'Ikan', '🐟'], ['ikan-tropis', 'Ikan hias', '🐠'],
      ['paus', 'Paus', '🐳'], ['lumba', 'Lumba-lumba', '🐬'], ['kura', 'Kura-kura', '🐢'], ['burung', 'Burung', '🐦'], ['bebek', 'Bebek', '🦆'],
      ['angsa', 'Angsa', '🦢'], ['flamingo', 'Flamingo', '🦩'], ['merak', 'Merak', '🦚'], ['gurita', 'Gurita', '🐙'], ['kepiting', 'Kepiting', '🦀'],
      ['dino', 'Dino', '🦕'], ['tulang', 'Tulang', '🦴'], ['telur-menetas', 'Menetas', '🐣'],
      ['koala', 'Koala', '🐨'], ['panda', 'Panda', '🐼'], ['pinguin', 'Pinguin', '🐧'], ['burung-hantu', 'Burung hantu', '🦉'], ['kakatua', 'Kakatua', '🦜'], ['katak', 'Katak', '🐸'], ['ular', 'Ular', '🐍'], ['kadal', 'Kadal', '🦎'], ['landak', 'Landak', '🦔'], ['tupai', 'Tupai', '🐿️'], ['rakun', 'Rakun', '🦝'], ['berang', 'Berang-berang', '🦦'], ['kuda', 'Kuda', '🐴'], ['unicorn', 'Unicorn', '🦄'], ['sapi', 'Sapi', '🐄'], ['domba', 'Domba', '🐑'], ['babi', 'Babi', '🐷'], ['gajah', 'Gajah', '🐘'], ['jerapah', 'Jerapah', '🦒'], ['zebra', 'Zebra', '🦓'], ['singa', 'Singa', '🦁'], ['harimau', 'Harimau', '🐯'], ['monyet', 'Monyet', '🐒'], ['kanguru', 'Kanguru', '🦘'], ['ubur', 'Ubur-ubur', '🪼'], ['hiu', 'Hiu', '🦈'], ['udang', 'Udang', '🦐'], ['semut', 'Semut', '🐜'], ['ulat', 'Ulat', '🐛'], ['capung', 'Capung', '🪰']])) },
    { id: 'perjalanan', name: 'Perjalanan', items: list('perjalanan', [
      ['pesawat', 'Pesawat', '✈️'], ['koper', 'Koper', '🧳'], ['peta', 'Peta', '🗺️'], ['kompas', 'Kompas', '🧭'], ['tenda', 'Kemah', '⛺'],
      ['pantai', 'Pantai', '🏝️'], ['kereta', 'Kereta', '🚆'], ['mobil', 'Mobil', '🚗'], ['bus', 'Bus', '🚌'], ['motor', 'Motor', '🛵'],
      ['kapal', 'Kapal', '⛵'], ['rumah', 'Rumah', '🏠'], ['kota', 'Kota', '🏙️'], ['menara', 'Menara', '🗼'], ['kuil', 'Kuil', '⛩️'],
      ['balon-udara', 'Balon udara', '🎈'], ['karcis', 'Tiket', '🎫'], ['paspor', 'Paspor', '🛂'], ['kamera', 'Kamera', '📸'], ['bianglala', 'Bianglala', '🎡'],
      ['roket', 'Roket', '🚀'], ['helikopter', 'Helikopter', '🚁'], ['sepeda-emoji', 'Sepeda', '🚲'], ['taksi', 'Taksi', '🚕'], ['ambulans', 'Ambulans', '🚑'], ['truk', 'Truk', '🚚'], ['jangkar', 'Jangkar', '⚓'], ['patung', 'Liberty', '🗽'], ['istana', 'Istana', '🏰'], ['masjid', 'Masjid', '🕌'], ['gereja', 'Gereja', '⛪'], ['candi', 'Candi', '🛕'], ['jembatan', 'Jembatan', '🌉'], ['air-mancur', 'Air mancur', '⛲'], ['komedi-putar', 'Komidi putar', '🎠'], ['rollercoaster', 'Roller coaster', '🎢'], ['hotel', 'Hotel', '🏨'], ['pulau', 'Pulau', '🗾']]) },
    { id: 'perayaan', name: 'Perayaan', items: list('perayaan', [
      ['pesta', 'Pesta', '🎉'], ['kue', 'Kue ultah', '🎂'], ['kado', 'Kado', '🎁'], ['balon', 'Balon', '🎈'], ['kilau', 'Kilau', '✨'],
      ['bintang', 'Bintang', '⭐'], ['wisuda', 'Wisuda', '🎓'], ['cincin', 'Cincin', '💍'], ['natal', 'Pohon natal', '🎄'], ['piala', 'Piala', '🏆'],
      ['konfeti', 'Konfeti', '🎊'], ['pita', 'Pita', '🎀'], ['target', 'Target', '🎯'], ['mahkota', 'Mahkota', '👑'], ['kembang-api', 'Kembang api', '🎆'],
      ['ketupat', 'Lebaran', '🌙'], ['lentera', 'Lentera', '🏮'], ['angpao', 'Angpao', '🧧'], ['labu', 'Labu', '🎃'], ['cokelat-hati', 'Valentine', '💝'],
      ['bunga-buket', 'Buket', '💐'], ['sampanye', 'Bersulang', '🥂'], ['bintang-besar', 'Bintang terang', '🌟'], ['berlian', 'Berlian', '💎'], ['surat-cinta', 'Surat cinta', '💌'],
      ['lilin', 'Lilin', '🕯️'], ['pinata', 'Piñata', '🪅'], ['topi-pesta', 'Terompet', '🥳'], ['tanabata', 'Tanabata', '🎋'], ['bulan-tsukimi', 'Tsukimi', '🎑'], ['boneka', 'Boneka', '🧸'], ['kupon', 'Kupon', '🎟️'], ['medali-emas', 'Emas', '🥇'], ['medali-perak', 'Perak', '🥈'], ['medali-perunggu', 'Perunggu', '🥉'], ['hadiah-pita', 'Hadiah', '🎁'], ['kembang-api2', 'Kembang api kecil', '🎇'], ['jempol-pesta', 'Selamat', '🙌'], ['kartu-ucapan', 'Kartu ucapan', '💌'], ['bunga-wisuda', 'Bunga tulip', '🌷']]) },
    { id: 'simbol', name: 'Simbol', items: list('simbol', [
      ['oke', 'Oke', '👌'], ['jempol', 'Jempol', '👍'], ['tepuk', 'Tepuk tangan', '👏'], ['tos', 'Tos', '🙌'], ['semangat-tangan', 'Kepal', '✊'],
      ['damai', 'Damai', '✌️'], ['doa', 'Doa', '🙏'], ['seratus', 'Seratus', '💯'], ['tanda-seru', 'Penting', '❗'], ['tanya', 'Tanya', '❓'],
      ['silang', 'Silang', '❌'], ['larangan', 'Stop', '⛔'], ['peringatan', 'Hati-hati', '⚠️'], ['ulang', 'Ulang', '🔁'], ['baru', 'Baru', '🆕'],
      ['infinity', 'Selamanya', '♾️'], ['yin-yang', 'Seimbang', '☯️'], ['bintang-kilat', 'Kilat', '💫'], ['gelembung', 'Gelembung', '🫧'], ['zzz', 'Zzz', '💤'],
      ['musik-not', 'Nada', '🎵'], ['bendera', 'Bendera finish', '🏁'], ['lingkaran-merah', 'Titik merah', '🔴'], ['lingkaran-hijau', 'Titik hijau', '🟢'], ['lingkaran-ungu', 'Titik ungu', '🟣'],
      ['plus', 'Tambah', '➕'], ['minus', 'Kurang', '➖'], ['panah-atas', 'Naik', '⬆️'], ['panah-bawah', 'Turun', '⬇️'], ['panah-kanan', 'Lanjut', '➡️'], ['refresh', 'Refresh', '🔄'], ['sparkle', 'Kilauan', '❇️'], ['bintang-delapan', 'Bintang 8', '✴️'], ['kotak-centang', 'Kotak centang', '☑️'], ['lampu-merah', 'Lampu merah', '🚨'], ['bendera-merah', 'Bendera merah', '🚩'], ['pin-bulat', 'Pin bulat', '📍'], ['target-panah', 'Tepat', '🎯'], ['mata', 'Lihat', '👀'], ['tangan-tulis', 'Tulis', '✍️'], ['otot', 'Kuat', '💪'], ['otak', 'Otak', '🧠'], ['jam-alarm', 'Alarm', '⏰'], ['kuning-kotak', 'Kotak kuning', '🟨'], ['biru-bulat', 'Titik biru', '🔵'], ['oranye-bulat', 'Titik oranye', '🟠'], ['kuning-bulat', 'Titik kuning', '🟡']]) }
  ];
  // Makhluk hidup wajib faceless: wajah diganti simbol cuaca/benda, hewan/orang berwajah dibuang
  // Mood boleh pakai emoticon wajah; hewan (dan orang) wajib faceless → emoji berwajah dibuang, maskot hewan sudah tanpa wajah
  var REMAP = {};
  var DROP = ['🐖','🐷','🐨','🐼','🐧','🦉','🦜','🐸','🐍','🦎','🦔','🐿️','🦝','🦦','🐴','🦄','🐄','🐑','🐘','🦒','🦓','🦁','🐯','🐒','🦘','🪼','🦈','🦐','🐜','🐛','🪰','🐝','🐞','🐌','🐟','🐠','🐳','🐬','🐢','🐦','🦆','🦢','🦩','🦚','🐙','🦀','🦕','🐣',
    '🏃','🧘','🚴','🏊','🏋️','💃','🚶','🧑‍💻','🎃','🧸','🗽','👀'];
  packs.forEach(function (p) {
    p.items = p.items.filter(function (it) { if (REMAP[it.id]) it.e = REMAP[it.id]; return it.m || DROP.indexOf(it.e) < 0; });
  });
  var seen = {}; packs.forEach(function (p) { p.items = p.items.filter(function (it) { var k = p.id + '|' + (it.m || it.e); if (seen[k]) return false; seen[k] = 1; return true; }); });
  var byId = {};
  packs.forEach(function (p) { p.items.forEach(function (it) { it.pack = p.id; byId[it.id] = it; }); });
  var TINT = { mood: '#FFE7A8', aktivitas: '#DDE7FB', kerja: '#E4DCF5', makanan: '#FFD3BC', alam: '#E0F2DA', cuaca: '#D6EEF5', hewan: '#F2E4CC', perjalanan: '#DDE7FB', perayaan: '#FCE0F2', simbol: '#F2E4CC' };
  window.IP_STICKERS = { packs: packs, byId: byId, tint: TINT, base: function (sid) { return String(sid || '').replace(/^icon:/, ''); }, isIcon: function (sid) { return /^icon:/.test(String(sid || '')); } };
})();
