# Pod lokal modul `sodium` (#181). Ada di akar modul (bukan ios/) supaya `cpp/` - lapisan C yang sama
# dengan Android dan uji host - bisa masuk `source_files` tanpa path di luar pod.
Pod::Spec.new do |s|
  s.name           = 'IpSodium'
  s.version        = '0.1.0'
  s.summary        = 'Binding libsodium (Expo Module) untuk Improve Personal'
  s.description    = 'libsodium 1.0.21 dibangun dari sumber terverifikasi (scripts/build-libsodium.sh).'
  s.license        = { type: 'UNLICENSED' }
  s.author         = 'Stackinnov'
  s.homepage       = 'https://github.com/stackinnov/improve-personal'
  s.platforms      = { ios: '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }

  s.source_files = 'ios/*.swift', 'cpp/ip_sodium.{h,c}'
  s.public_header_files = 'cpp/ip_sodium.h'

  # Tidak ada binary prebuilt di repo: xcframework ini dibuat `build-libsodium.sh ios` dari tarball
  # yang lolos minisign + SHA-256. Belum dibangun = `pod install` gagal, bukan memakai binary lain.
  xcframework = 'vendor/ios/Clibsodium.xcframework'
  unless File.exist?(File.join(__dir__, xcframework))
    raise "IpSodium: #{xcframework} belum ada. Jalankan: bash modules/sodium/scripts/build-libsodium.sh ios"
  end
  s.vendored_frameworks = xcframework

  s.test_spec 'Tests' do |test|
    test.source_files = 'ios/Tests/*.swift'
    test.resources = 'test-vectors/vectors.json'
  end
end
