# Pilar Performa - Mobile (React Native)

Target: React Native >= 0.79 dengan New Architecture (Fabric + TurboModules) dan Hermes.
Angka diukur di **release build** pada perangkat Android mid-range acuan (kelas ~4 GB RAM, mis. Samsung Galaxy A-series) dan iPhone 2-3 generasi lalu. Build debug/dev TIDAK dipakai untuk ngukur.

## Budget (gagal = blocker merge)

| Metrik | Budget |
|---|---|
| Cold start -> TTI (Android mid-range) | <= 2.0 s |
| Cold start -> TTI (iOS) | <= 1.5 s |
| Frame rate scroll/animasi | >= 58 FPS rata-rata, 0 frame > 100 ms (JS & UI thread) |
| Transisi navigasi (tap -> layar ter-render) | <= 300 ms |
| Respons sentuh (tap -> feedback visual) | <= 100 ms |
| JS bundle (Hermes bytecode) | <= 6 MB; naik > 200 KB per PR wajib dijustifikasi |
| Ukuran download (APK per-ABI / IPA) | <= 30 MB |
| Memori steady-state | <= 250 MB |

## Arsitektur & runtime

- WAJIB New Architecture + Hermes aktif. Library yang belum mendukung New Arch DILARANG ditambahkan tanpa trade-off tertulis.
- DILARANG `console.log` di release build (strip via `babel-plugin-transform-remove-console` atau logger dengan level).
- Kerja berat di startup DILARANG sinkron di root: inisialisasi SDK non-kritis ditunda setelah first render (`InteractionManager`/`requestIdleCallback`/setelah `onReady` navigasi).
- Layar yang tidak dibuka di awal: lazy (`React.lazy` / `getComponent` di navigator) agar tidak dievaluasi saat startup.
- Splash screen ditahan hanya sampai data kritis (session, font) siap, bukan sampai semua data.

## List

- List > 20 item WAJIB virtualized: `FlashList` (default) atau `FlatList`. DILARANG `ScrollView` + `.map()` untuk data dinamis.
- `keyExtractor` WAJIB pakai id stabil, bukan index.
- `renderItem` WAJIB komponen `React.memo` + callback stabil (`useCallback`); DILARANG fungsi/objek inline baru di props item.
- FlashList: set `getItemType` untuk item heterogen; ukuran item konsisten. FlatList: `getItemLayout` bila tinggi tetap, `windowSize`/`maxToRenderPerBatch`/`initialNumToRender` di-tune, `removeClippedSubviews` di Android.
- Pagination/infinite scroll wajib (`onEndReached` + threshold), DILARANG load ribuan item sekaligus.
- DILARANG list bersarang dengan arah scroll yang sama.

## Re-render

- Komponen di jalur panas (item list, layar utama) WAJIB dicek dengan React DevTools Profiler; render ulang tanpa perubahan props = bug.
- State global (Zustand/Redux/dll.) WAJIB dibaca lewat selector sempit (`useStore(s => s.user.name)`), DILARANG ambil seluruh store.
- Context hanya untuk nilai yang jarang berubah (tema, locale); value Context WAJIB di-`useMemo`.
- Data server lewat library query (mis. TanStack Query) dengan `staleTime` eksplisit; DILARANG fetch ulang di setiap focus tanpa alasan.
- Kalau React Compiler aktif, `memo`/`useMemo` manual hanya bila profiler membuktikan perlu.

## Animasi & gesture

- Animasi WAJIB di UI thread: Reanimated (`useSharedValue`, `useAnimatedStyle`, worklet) atau `Animated` dengan `useNativeDriver: true`.
- Gesture pakai `react-native-gesture-handler`; DILARANG `PanResponder` untuk gesture baru.
- DILARANG `setState` per frame (scroll/gesture) di JS thread; pakai `useAnimatedScrollHandler`.
- Animasi hanya properti murah (`transform`, `opacity`); hindari animasi `width/height/top` pada list.

## Gambar

- WAJIB `expo-image` atau `react-native-fast-image` (cache memori + disk), DILARANG `<Image>` bawaan untuk gambar remote.
- Minta ukuran dari server sesuai ukuran render (thumbnail di list, bukan original). Format WebP/AVIF.
- Placeholder (blurhash/warna) + dimensi tetap agar layout tidak lompat.
- Aset lokal: dikompres, resolusi @2x/@3x saja.

## Jaringan & storage

- Response di-cache (query cache) dan dipersist hanya yang perlu untuk offline/startup.
- Storage key-value sinkron/cepat: `react-native-mmkv`; DILARANG simpan payload besar (> 100 KB) di AsyncStorage di jalur startup.
- Request independen paralel; payload pakai pagination & field yang dibutuhkan saja.

## Bundle

- Dependency baru WAJIB sebut dampak ukuran bundle di PR. DILARANG library berat untuk hal yang bisa native/kecil (mis. moment -> `Intl`/date-fns per fungsi).
- Import per-modul (`lodash/debounce`, bukan `lodash`). Aktifkan inline requires di Metro.
- Release Android: R8/minify + `enableProguardInReleaseBuilds`, App Bundle (AAB) per-ABI.

## Checklist review

- [ ] List pakai FlashList/FlatList dengan `keyExtractor` id + item `memo`.
- [ ] Tidak ada fungsi/objek inline di props item list; store dibaca via selector.
- [ ] Animasi jalan di UI thread (Reanimated / native driver).
- [ ] Gambar remote pakai komponen ber-cache dengan ukuran yang pas.
- [ ] Tidak ada kerja sinkron berat di startup; layar non-awal lazy.
- [ ] Dependency baru disebut ukurannya; bundle naik <= 200 KB atau dijustifikasi.
- [ ] Angka TTI/FPS dari release build dilampirkan untuk layar yang disentuh di jalur panas.
