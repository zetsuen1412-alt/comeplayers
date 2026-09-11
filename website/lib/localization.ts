export type SupportedCurrency =
  | "IDR"
  | "USD"
  | "EUR"
  | "GBP"
  | "SGD"
  | "MYR"
  | "PHP"
  | "THB"
  | "VND"
  | "JPY"
  | "KRW"
  | "AUD"
  | "CAD";

export const BASE_CURRENCY = "USD";

export type SupportedLocale =
  | "id-ID"
  | "en-US"
  | "ms-MY"
  | "th-TH"
  | "vi-VN"
  | "ja-JP"
  | "ko-KR";

export type LanguageOption = {
  locale: SupportedLocale;
  label: string;
  nativeLabel: string;
};

export type CountryOption = {
  country: string;
  label: string;
  locale: SupportedLocale;
  currency: SupportedCurrency;
};

export type CurrencyOption = {
  currency: SupportedCurrency;
  label: string;
  region: string;
};

export const LANGUAGE_OPTIONS: LanguageOption[] = [
  { locale: "en-US", label: "English", nativeLabel: "English" },
  { locale: "id-ID", label: "Indonesian", nativeLabel: "Bahasa Indonesia" },
  { locale: "ms-MY", label: "Malay", nativeLabel: "Bahasa Melayu" },
  { locale: "th-TH", label: "Thai", nativeLabel: "ไทย" },
  { locale: "vi-VN", label: "Vietnamese", nativeLabel: "Tiếng Việt" },
  { locale: "ja-JP", label: "Japanese", nativeLabel: "日本語" },
  { locale: "ko-KR", label: "Korean", nativeLabel: "한국어" },
];

export const COUNTRY_OPTIONS: CountryOption[] = [
  { country: "ID", label: "Indonesia", locale: "id-ID", currency: "IDR" },
  { country: "US", label: "United States", locale: "en-US", currency: "USD" },
  { country: "GB", label: "United Kingdom", locale: "en-US", currency: "GBP" },
  { country: "CA", label: "Canada", locale: "en-US", currency: "CAD" },
  { country: "AU", label: "Australia", locale: "en-US", currency: "AUD" },
  { country: "NZ", label: "New Zealand", locale: "en-US", currency: "AUD" },
  { country: "SG", label: "Singapore", locale: "en-US", currency: "SGD" },
  { country: "MY", label: "Malaysia", locale: "ms-MY", currency: "MYR" },
  { country: "PH", label: "Philippines", locale: "en-US", currency: "PHP" },
  { country: "TH", label: "Thailand", locale: "th-TH", currency: "THB" },
  { country: "VN", label: "Vietnam", locale: "vi-VN", currency: "VND" },
  { country: "JP", label: "Japan", locale: "ja-JP", currency: "JPY" },
  { country: "KR", label: "South Korea", locale: "ko-KR", currency: "KRW" },
  { country: "CN", label: "China", locale: "en-US", currency: "USD" },
  { country: "HK", label: "Hong Kong", locale: "en-US", currency: "USD" },
  { country: "TW", label: "Taiwan", locale: "en-US", currency: "USD" },
  { country: "IN", label: "India", locale: "en-US", currency: "USD" },
  { country: "PK", label: "Pakistan", locale: "en-US", currency: "USD" },
  { country: "BD", label: "Bangladesh", locale: "en-US", currency: "USD" },
  { country: "LK", label: "Sri Lanka", locale: "en-US", currency: "USD" },
  { country: "KH", label: "Cambodia", locale: "en-US", currency: "USD" },
  { country: "LA", label: "Laos", locale: "en-US", currency: "USD" },
  { country: "MM", label: "Myanmar", locale: "en-US", currency: "USD" },
  { country: "BN", label: "Brunei", locale: "en-US", currency: "SGD" },
  { country: "DE", label: "Germany", locale: "en-US", currency: "EUR" },
  { country: "FR", label: "France", locale: "en-US", currency: "EUR" },
  { country: "ES", label: "Spain", locale: "en-US", currency: "EUR" },
  { country: "IT", label: "Italy", locale: "en-US", currency: "EUR" },
  { country: "NL", label: "Netherlands", locale: "en-US", currency: "EUR" },
  { country: "BE", label: "Belgium", locale: "en-US", currency: "EUR" },
  { country: "AT", label: "Austria", locale: "en-US", currency: "EUR" },
  { country: "IE", label: "Ireland", locale: "en-US", currency: "EUR" },
  { country: "PT", label: "Portugal", locale: "en-US", currency: "EUR" },
  { country: "FI", label: "Finland", locale: "en-US", currency: "EUR" },
  { country: "GR", label: "Greece", locale: "en-US", currency: "EUR" },
  { country: "PL", label: "Poland", locale: "en-US", currency: "EUR" },
  { country: "SE", label: "Sweden", locale: "en-US", currency: "EUR" },
  { country: "DK", label: "Denmark", locale: "en-US", currency: "EUR" },
  { country: "NO", label: "Norway", locale: "en-US", currency: "EUR" },
  { country: "CH", label: "Switzerland", locale: "en-US", currency: "EUR" },
  { country: "TR", label: "Turkey", locale: "en-US", currency: "USD" },
  { country: "UA", label: "Ukraine", locale: "en-US", currency: "USD" },
  { country: "BR", label: "Brazil", locale: "en-US", currency: "USD" },
  { country: "MX", label: "Mexico", locale: "en-US", currency: "USD" },
  { country: "AR", label: "Argentina", locale: "en-US", currency: "USD" },
  { country: "CL", label: "Chile", locale: "en-US", currency: "USD" },
  { country: "CO", label: "Colombia", locale: "en-US", currency: "USD" },
  { country: "PE", label: "Peru", locale: "en-US", currency: "USD" },
  { country: "AE", label: "United Arab Emirates", locale: "en-US", currency: "USD" },
  { country: "SA", label: "Saudi Arabia", locale: "en-US", currency: "USD" },
  { country: "QA", label: "Qatar", locale: "en-US", currency: "USD" },
  { country: "KW", label: "Kuwait", locale: "en-US", currency: "USD" },
  { country: "ZA", label: "South Africa", locale: "en-US", currency: "USD" },
  { country: "NG", label: "Nigeria", locale: "en-US", currency: "USD" },
  { country: "EG", label: "Egypt", locale: "en-US", currency: "USD" },
  { country: "MA", label: "Morocco", locale: "en-US", currency: "USD" },
  { country: "EU", label: "European Union", locale: "en-US", currency: "EUR" },
];

export const CURRENCY_OPTIONS: CurrencyOption[] = [
  { currency: "IDR", label: "Indonesia Rupiah", region: "Indonesia" },
  { currency: "USD", label: "US Dollar", region: "United States" },
  { currency: "EUR", label: "Euro", region: "Europe" },
  { currency: "GBP", label: "British Pound", region: "United Kingdom" },
  { currency: "SGD", label: "Singapore Dollar", region: "Singapore" },
  { currency: "MYR", label: "Malaysian Ringgit", region: "Malaysia" },
  { currency: "PHP", label: "Philippine Peso", region: "Philippines" },
  { currency: "THB", label: "Thai Baht", region: "Thailand" },
  { currency: "VND", label: "Vietnamese Dong", region: "Vietnam" },
  { currency: "JPY", label: "Japanese Yen", region: "Japan" },
  { currency: "KRW", label: "Korean Won", region: "South Korea" },
  { currency: "AUD", label: "Australian Dollar", region: "Australia" },
  { currency: "CAD", label: "Canadian Dollar", region: "Canada" },
];

const LANGUAGE_PREFIX_LOCALES: Record<string, SupportedLocale> = {
  id: "id-ID",
  en: "en-US",
  ms: "ms-MY",
  th: "th-TH",
  vi: "vi-VN",
  ja: "ja-JP",
  ko: "ko-KR",
};

const COUNTRY_ALIASES: Record<string, string> = {
  UK: "GB",
  EL: "GR",
};

const EURO_COUNTRIES = new Set([
  "AD",
  "AT",
  "BE",
  "CY",
  "DE",
  "EE",
  "ES",
  "FI",
  "FR",
  "GR",
  "HR",
  "IE",
  "IT",
  "LT",
  "LU",
  "LV",
  "MC",
  "MT",
  "NL",
  "PT",
  "SI",
  "SK",
  "SM",
  "VA",
]);

const EN_TRANSLATIONS = {
  "common.search": "Search",
  "common.cancel": "Cancel",
  "common.save": "Save",
  "common.all": "All",
  "common.previous": "Previous",
  "common.next": "Next",
  "common.pageOf": "Page {page} / {total}",
  "locale.title": "Language Settings",
  "locale.country": "Country / Region",
  "locale.language": "Language",
  "locale.currency": "Currency",
  "locale.close": "Close",
  "locale.buttonLabel": "Language and currency",
  "locale.autoNote": "English is the default interface language. Region and currency are detected automatically until you save your own preferences.",
  "locale.eyebrow": "ComePlayers Preferences",
  "locale.subtitle": "Personalize your marketplace region, language, and display currency.",
  "locale.currentSetup": "Current setup",
  "locale.countryHelp": "Select the marketplace region used for local defaults.",
  "locale.languageHelp": "Interface language",
  "locale.currencyHelp": "Marketplace price display",
  "locale.rateLoading": "Updating prices for your selected currency...",
  "locale.rateLive": "Product prices automatically follow the buyer's selected currency.",
  "locale.rateFallback": "Product prices remain available in your selected currency.",
  "header.sellWithUs": "Sell With Us",
  "header.sell": "Sell",
  "header.login": "Login",
  "header.loginSignup": "Login / Signup",
  "header.messages": "Chat",
  "header.notifications": "Notifications",
  "header.profile": "Profile",
  "header.walletCredit": "Wallet Credit",
  "header.wallet": "Wallet",
  "header.myOrders": "My Orders",
  "header.resolutionCenter": "Resolution Center",
  "header.selling": "Selling",
  "header.settings": "Settings",
  "header.logout": "Log Out",
  "header.becomeSeller": "Become a Seller",
  "header.sellerDashboard": "Seller Dashboard",
  "header.manageProducts": "Manage Products",
  "header.createProduct": "Create Product",
  "header.manageOrders": "Manage Orders",
  "header.payment": "Payment",
  "header.account": "Account",
  "header.socialConnect": "Social Connect",
  "header.privacySecurity": "Privacy & Security",
  "header.verification": "Verification",
  "header.unreadUpdates": "{count} unread updates",
  "header.viewAll": "View all ->",
  "header.noUpdates": "No new updates.",
  "header.newChat": "New chat",
  "header.sentMessage": "Sent a message.",
  "header.openConversation": "Click to open conversation ->",
  "footer.aboutAria": "About ComePlayers",
  "footer.homeAria": "ComePlayers home",
  "footer.description": "ComePlayers is a trusted marketplace for digital gaming products, secure transactions, and verified sellers.",
  "footer.addressTitle": "Company Address",
  "footer.contactTitle": "Official Contact",
  "footer.navigationAria": "Footer legal and support links",
  "footer.socialAria": "ComePlayers social media",
  "footer.legalCenter": "Legal Center",
  "footer.terms": "Terms",
  "footer.privacy": "Privacy",
  "footer.refunds": "Refunds",
  "footer.sellerRules": "Seller Rules",
  "footer.feesPayouts": "Fees & Payouts",
  "footer.helpCenter": "Alexia Help Center",
  "footer.submitTicket": "Submit Ticket",
  "footer.myTickets": "My Tickets",
  "search.placeholder": "Search games, products, categories...",
  "search.headerPlaceholder": "Search games, products...",
  "search.allCategories": "All Categories",
  "search.ariaLabel": "Search marketplace",
  "search.loading": "Searching marketplace...",
  "search.games": "Games",
  "search.products": "Products",
  "search.categories": "Categories",
  "search.offers": "offers",
  "search.hot": "HOT",
  "search.game": "Game",
  "search.viewAllResults": "View all results",
  "search.noResults": "No marketplace results found.",
  "browse.heroBadge": "ComePlayers Marketplace Catalog",
  "browse.heroTitle": "Browse Games A-Z",
  "browse.heroCopy": "Search game accounts, coins, items, boosting, and top-up services from one unified game catalog.",
  "browse.allGames": "All Games",
  "browse.categoryGames": "{category} Games",
  "browse.gamesFound": "games found",
  "browse.filterPlaceholder": "Filter games...",
  "browse.loadingGames": "Loading games...",
  "browse.noGames": "No games found.",
  "browse.marketplaceCategories": "Marketplace Categories",
  "browse.giftCardsTitle": "Gift Cards Catalog",
  "browse.giftCardsCopy": "Browse prepaid cards, wallet codes, subscriptions, and entertainment vouchers in one dedicated catalog.",
  "browse.giftCardsHeading": "Gift Cards",
  "browse.giftCardsCount": "digital products found",
  "browse.giftCardsFilter": "Filter gift cards...",
  "browse.giftCardsLoading": "Loading gift cards...",
  "browse.giftCardsEmpty": "No gift cards found.",
  "browse.softwareTitle": "Software Catalog",
  "browse.softwareCopy": "Browse productivity, security, creative, VPN, and developer software offers without mixing them into the game catalog.",
  "browse.softwareHeading": "Software",
  "browse.softwareCount": "software products found",
  "browse.softwareFilter": "Filter software...",
  "browse.softwareLoading": "Loading software...",
  "browse.softwareEmpty": "No software found.",
  "offers.categoryTabsAria": "Game product categories",
  "offers.categoryTabAria": "{category}, {count} products",
  "offers.category.coin": "Game Coins",
  "offers.category.boosting": "Boosting",
  "offers.category.item": "Items",
  "offers.category.account": "Game Accounts",
  "offers.home": "Home",
  "offers.title.coin": "{game} Coins",
  "offers.title.boosting": "{game} Boosting Services",
  "offers.title.item": "{game} Items",
  "offers.title.account": "{game} Accounts",
  "offers.compareOffers": "Compare offers, seller reputation, price, stock, and delivery time.",
  "offers.compareSellers": "Compare all {server}{faction} sellers by recommendation or unit price.",
  "offers.selectCoinServerTitle": "Select a Game Coins server first",
  "offers.selectCoinServerCopy": "The server determines the available sellers, region, faction, stock, and price.",
  "offers.viewServers": "View servers",
  "offers.filterPlaceholder": "Type to filter...",
  "offers.allRegions": "All regions",
  "offers.maxBudget": "Maximum budget",
  "offers.onlineSellers": "Online sellers",
  "offers.popularSearches": "Popular searches:",
  "offers.otherSellers": "Other sellers",
  "offers.offers": "Offers",
  "offers.sortBy": "Sort by:",
  "offers.sort.recommended": "Recommended",
  "offers.sort.newest": "Newest",
  "offers.sort.lowestPrice": "Lowest price",
  "offers.sort.highestPrice": "Highest price",
  "offers.loadError": "Unable to load offers.",
  "offers.noOffersTitle": "No offers match these filters",
  "offers.noOffersCopy": "Clear the filters or create the first offer for this selection.",
  "offers.createOffer": "Create an offer",
  "offers.pageOf": "Page {page} of {total}",
  "offers.newSeller": "New seller",
  "offers.sold": "{count} sold",
  "offers.stock": "Stock {count}",
  "offers.perUnit": "per unit",
  "offers.verifiedSeller": "Verified seller",
  "offers.sellerLevel": "{level} seller",
  "offers.deliveryNotConfigured": "Not configured",
  "offers.deliveryMinutes": "{count} min",
  "offers.deliveryHour": "{count} hour",
  "offers.deliveryHours": "{count} hours",
  "offers.deliveryDay": "{count} day",
  "offers.deliveryDays": "{count} days",
  "offers.escrowTitle": "Protected escrow",
  "offers.escrowCopy": "Payment is released after the order is completed.",
  "offers.sellerStatusTitle": "Seller status",
  "offers.sellerStatusCopy": "Filter online sellers and check delivery estimates.",
  "offers.transparentPriceTitle": "Transparent pricing",
  "offers.transparentPriceCopy": "Compare effective unit prices instead of misleading package prices.",
  "offers.notFound": "Offers not found",
  "offers.metaDescription": "Compare {category} offers for {game} by recommendation, price, seller reputation, and delivery time.",
} as const;

export type TranslationKey = keyof typeof EN_TRANSLATIONS;

const UI_TRANSLATIONS: Record<SupportedLocale, Record<TranslationKey, string>> = {
  "en-US": EN_TRANSLATIONS,
  "id-ID": {
    ...EN_TRANSLATIONS,
    "common.search": "Cari",
    "common.cancel": "Batal",
    "common.save": "Simpan",
    "common.all": "Semua",
    "common.previous": "Sebelumnya",
    "common.next": "Berikutnya",
    "common.pageOf": "Halaman {page} / {total}",
    "locale.title": "Pengaturan Bahasa",
    "locale.country": "Negara / Wilayah",
    "locale.language": "Bahasa",
    "locale.currency": "Mata Uang",
    "locale.close": "Tutup",
    "locale.buttonLabel": "Bahasa dan mata uang",
    "locale.autoNote": "Bahasa Inggris adalah bahasa antarmuka default. Negara dan mata uang dideteksi otomatis sampai kamu menyimpan preferensi sendiri.",
    "locale.eyebrow": "Preferensi ComePlayers",
    "locale.subtitle": "Atur wilayah marketplace, bahasa, dan mata uang tampilan Anda.",
    "locale.currentSetup": "Pengaturan saat ini",
    "locale.countryHelp": "Pilih wilayah marketplace untuk pengaturan lokal otomatis.",
    "locale.languageHelp": "Bahasa antarmuka",
    "locale.currencyHelp": "Tampilan harga marketplace",
    "locale.rateLoading": "Memperbarui harga sesuai mata uang pilihan Anda...",
    "locale.rateLive": "Harga produk otomatis mengikuti mata uang yang dipilih pembeli.",
    "locale.rateFallback": "Harga produk tetap tersedia dalam mata uang pilihan Anda.",
    "header.sellWithUs": "Jual Bersama Kami",
    "header.sell": "Jual",
    "header.login": "Masuk",
    "header.loginSignup": "Masuk / Daftar",
    "header.messages": "Chat",
    "header.notifications": "Notifikasi",
    "header.profile": "Profil",
    "header.walletCredit": "Kredit Dompet",
    "header.wallet": "Dompet",
    "header.myOrders": "Pesanan Saya",
    "header.resolutionCenter": "Pusat Resolusi",
    "header.selling": "Penjualan",
    "header.settings": "Pengaturan",
    "header.logout": "Keluar",
    "header.becomeSeller": "Jadi Penjual",
    "header.sellerDashboard": "Dashboard Penjual",
    "header.manageProducts": "Kelola Produk",
    "header.createProduct": "Buat Produk",
    "header.manageOrders": "Kelola Pesanan",
    "header.payment": "Pembayaran",
    "header.account": "Akun",
    "header.socialConnect": "Koneksi Sosial",
    "header.privacySecurity": "Privasi & Keamanan",
    "header.verification": "Verifikasi",
    "header.unreadUpdates": "{count} pembaruan belum dibaca",
    "header.viewAll": "Lihat semua ->",
    "header.noUpdates": "Tidak ada pembaruan baru.",
    "header.newChat": "Chat baru",
    "header.sentMessage": "Mengirim pesan.",
    "header.openConversation": "Klik untuk membuka percakapan ->",
    "footer.aboutAria": "Tentang ComePlayers",
    "footer.homeAria": "Beranda ComePlayers",
    "footer.description": "ComePlayers adalah marketplace tepercaya untuk produk gaming digital, transaksi aman, dan penjual terverifikasi.",
    "footer.addressTitle": "Alamat Perusahaan",
    "footer.contactTitle": "Kontak Resmi",
    "footer.navigationAria": "Tautan hukum dan dukungan",
    "footer.socialAria": "Media sosial ComePlayers",
    "footer.legalCenter": "Pusat Hukum",
    "footer.terms": "Ketentuan",
    "footer.privacy": "Privasi",
    "footer.refunds": "Pengembalian Dana",
    "footer.sellerRules": "Aturan Penjual",
    "footer.feesPayouts": "Biaya & Pencairan",
    "footer.helpCenter": "Pusat Bantuan Alexia",
    "footer.submitTicket": "Buat Tiket",
    "footer.myTickets": "Tiket Saya",
    "search.placeholder": "Cari game, produk, kategori...",
    "search.headerPlaceholder": "Cari game, produk...",
    "search.allCategories": "Semua Kategori",
    "search.ariaLabel": "Cari marketplace",
    "search.loading": "Mencari marketplace...",
    "search.games": "Game",
    "search.products": "Produk",
    "search.categories": "Kategori",
    "search.offers": "penawaran",
    "search.game": "Game",
    "search.viewAllResults": "Lihat semua hasil",
    "search.noResults": "Tidak ada hasil marketplace.",
    "browse.heroBadge": "Katalog Marketplace ComePlayers",
    "browse.heroTitle": "Jelajahi Game A-Z",
    "browse.heroCopy": "Cari akun game, coin, item, boosting, dan layanan top-up dari satu katalog game terpadu.",
    "browse.allGames": "Semua Game",
    "browse.categoryGames": "Game {category}",
    "browse.gamesFound": "game ditemukan",
    "browse.filterPlaceholder": "Filter game...",
    "browse.loadingGames": "Memuat game...",
    "browse.noGames": "Game tidak ditemukan.",
    "browse.marketplaceCategories": "Kategori Marketplace",
    "browse.giftCardsTitle": "Katalog Gift Card",
    "browse.giftCardsCopy": "Jelajahi kartu prabayar, kode wallet, langganan, dan voucher hiburan dalam satu katalog khusus.",
    "browse.giftCardsHeading": "Gift Card",
    "browse.giftCardsCount": "produk digital ditemukan",
    "browse.giftCardsFilter": "Filter gift card...",
    "browse.giftCardsLoading": "Memuat gift card...",
    "browse.giftCardsEmpty": "Gift card tidak ditemukan.",
    "browse.softwareTitle": "Katalog Software",
    "browse.softwareCopy": "Jelajahi penawaran software produktivitas, keamanan, kreatif, VPN, dan developer tanpa tercampur ke katalog game.",
    "browse.softwareHeading": "Software",
    "browse.softwareCount": "produk software ditemukan",
    "browse.softwareFilter": "Filter software...",
    "browse.softwareLoading": "Memuat software...",
    "browse.softwareEmpty": "Software tidak ditemukan.",
    "offers.categoryTabsAria": "Kategori produk game",
    "offers.categoryTabAria": "{category}, {count} produk",
    "offers.category.coin": "Koin Game",
    "offers.category.boosting": "Jasa Joki",
    "offers.category.item": "Item",
    "offers.category.account": "Akun Game",
    "offers.home": "Beranda",
    "offers.title.coin": "Koin {game}",
    "offers.title.boosting": "Jasa Joki {game}",
    "offers.title.item": "Item {game}",
    "offers.title.account": "Akun {game}",
    "offers.compareOffers": "Bandingkan penawaran, reputasi penjual, harga, stok, dan waktu pengiriman.",
    "offers.compareSellers": "Bandingkan semua penjual {server}{faction} berdasarkan rekomendasi atau harga per unit.",
    "offers.selectCoinServerTitle": "Pilih server Koin Game terlebih dahulu",
    "offers.selectCoinServerCopy": "Server menentukan penjual, wilayah, faction, stok, dan harga yang tersedia.",
    "offers.viewServers": "Lihat daftar server",
    "offers.filterPlaceholder": "Ketik untuk memfilter...",
    "offers.allRegions": "Semua wilayah",
    "offers.maxBudget": "Anggaran maksimum",
    "offers.onlineSellers": "Penjual online",
    "offers.popularSearches": "Pencarian populer:",
    "offers.otherSellers": "Penjual lain",
    "offers.offers": "Penawaran",
    "offers.sortBy": "Sortir berdasarkan:",
    "offers.sort.recommended": "Direkomendasikan",
    "offers.sort.newest": "Paling Baru",
    "offers.sort.lowestPrice": "Harga terendah",
    "offers.sort.highestPrice": "Harga tertinggi",
    "offers.loadError": "Gagal memuat penawaran.",
    "offers.noOffersTitle": "Belum ada penawaran sesuai filter",
    "offers.noOffersCopy": "Hapus filter atau buat penawaran pertama untuk pilihan ini.",
    "offers.createOffer": "Buat penawaran",
    "offers.pageOf": "Halaman {page} dari {total}",
    "offers.newSeller": "Penjual baru",
    "offers.sold": "{count} terjual",
    "offers.stock": "Stok {count}",
    "offers.perUnit": "per unit",
    "offers.verifiedSeller": "Penjual terverifikasi",
    "offers.sellerLevel": "Penjual {level}",
    "offers.deliveryNotConfigured": "Belum diatur",
    "offers.deliveryMinutes": "{count} menit",
    "offers.deliveryHour": "{count} jam",
    "offers.deliveryHours": "{count} jam",
    "offers.deliveryDay": "{count} hari",
    "offers.deliveryDays": "{count} hari",
    "offers.escrowTitle": "Escrow terlindungi",
    "offers.escrowCopy": "Pembayaran diteruskan setelah pesanan selesai.",
    "offers.sellerStatusTitle": "Status penjual",
    "offers.sellerStatusCopy": "Filter penjual online dan lihat estimasi pengiriman.",
    "offers.transparentPriceTitle": "Harga transparan",
    "offers.transparentPriceCopy": "Bandingkan harga efektif per unit, bukan harga paket semu.",
    "offers.notFound": "Penawaran tidak ditemukan",
    "offers.metaDescription": "Bandingkan penawaran {category} {game} berdasarkan rekomendasi, harga, reputasi penjual, dan waktu pengiriman.",
  },
  "ms-MY": {
    ...EN_TRANSLATIONS,
    "common.search": "Cari",
    "common.cancel": "Batal",
    "common.save": "Simpan",
    "common.all": "Semua",
    "common.previous": "Sebelumnya",
    "common.next": "Seterusnya",
    "common.pageOf": "Halaman {page} / {total}",
    "locale.title": "Tetapan Bahasa",
    "locale.country": "Negara / Wilayah",
    "locale.language": "Bahasa",
    "locale.currency": "Mata Wang",
    "locale.close": "Tutup",
    "locale.autoNote": "Bahasa Inggeris ialah bahasa antara muka lalai. Negara dan mata wang dikesan secara automatik sehingga anda menyimpan pilihan sendiri.",
    "header.sellWithUs": "Jual Dengan Kami",
    "header.sell": "Jual",
    "header.login": "Log Masuk",
    "header.loginSignup": "Log Masuk / Daftar",
    "header.messages": "Chat",
    "header.notifications": "Notifikasi",
    "header.profile": "Profil",
    "header.walletCredit": "Kredit Dompet",
    "header.wallet": "Dompet",
    "header.myOrders": "Pesanan Saya",
    "header.resolutionCenter": "Pusat Resolusi",
    "header.selling": "Jualan",
    "header.settings": "Tetapan",
    "header.logout": "Log Keluar",
    "header.unreadUpdates": "{count} kemas kini belum dibaca",
    "search.placeholder": "Cari game, produk, kategori...",
    "search.headerPlaceholder": "Cari game, produk...",
    "search.allCategories": "Semua Kategori",
    "search.loading": "Mencari marketplace...",
    "search.products": "Produk",
    "search.categories": "Kategori",
    "search.offers": "tawaran",
    "search.viewAllResults": "Lihat semua hasil",
    "search.noResults": "Tiada hasil marketplace ditemui.",
    "browse.heroBadge": "Katalog Marketplace ComePlayers",
    "browse.heroTitle": "Layari Game A-Z",
    "browse.heroCopy": "Cari akaun game, coin, item, boosting, dan top-up daripada satu katalog game bersepadu.",
    "browse.allGames": "Semua Game",
    "browse.categoryGames": "Game {category}",
    "browse.gamesFound": "game ditemui",
    "browse.filterPlaceholder": "Tapis game...",
    "browse.loadingGames": "Memuatkan game...",
    "browse.noGames": "Tiada game ditemui.",
    "browse.marketplaceCategories": "Kategori Marketplace",
    "browse.softwareTitle": "Katalog Software",
    "browse.softwareCopy": "Layari tawaran software produktiviti, keselamatan, kreatif, VPN, dan developer tanpa mencampurkannya ke katalog game.",
    "browse.softwareCount": "produk software ditemui",
  },
  "th-TH": {
    ...EN_TRANSLATIONS,
    "common.search": "ค้นหา",
    "common.cancel": "ยกเลิก",
    "common.save": "บันทึก",
    "common.all": "ทั้งหมด",
    "common.previous": "ก่อนหน้า",
    "common.next": "ถัดไป",
    "common.pageOf": "หน้า {page} / {total}",
    "locale.title": "ตั้งค่าภาษา",
    "locale.country": "ประเทศ / ภูมิภาค",
    "locale.language": "ภาษา",
    "locale.currency": "สกุลเงิน",
    "locale.close": "ปิด",
    "locale.autoNote": "ภาษาอังกฤษเป็นภาษาเริ่มต้นของอินเทอร์เฟซ ประเทศและสกุลเงินจะตรวจจับอัตโนมัติจนกว่าคุณจะบันทึกค่าที่ต้องการเอง",
    "header.sellWithUs": "ขายกับเรา",
    "header.sell": "ขาย",
    "header.login": "เข้าสู่ระบบ",
    "header.loginSignup": "เข้าสู่ระบบ / สมัคร",
    "header.messages": "แชท",
    "header.notifications": "การแจ้งเตือน",
    "header.profile": "โปรไฟล์",
    "header.walletCredit": "เครดิตวอลเล็ต",
    "header.wallet": "วอลเล็ต",
    "header.myOrders": "คำสั่งซื้อของฉัน",
    "header.resolutionCenter": "ศูนย์แก้ไขปัญหา",
    "header.selling": "การขาย",
    "header.settings": "การตั้งค่า",
    "header.logout": "ออกจากระบบ",
    "header.unreadUpdates": "{count} รายการยังไม่ได้อ่าน",
    "search.placeholder": "ค้นหาเกม สินค้า หมวดหมู่...",
    "search.headerPlaceholder": "ค้นหาเกม สินค้า...",
    "search.allCategories": "ทุกหมวดหมู่",
    "search.loading": "กำลังค้นหา marketplace...",
    "search.games": "เกม",
    "search.products": "สินค้า",
    "search.categories": "หมวดหมู่",
    "search.offers": "ข้อเสนอ",
    "search.viewAllResults": "ดูผลลัพธ์ทั้งหมด",
    "search.noResults": "ไม่พบผลลัพธ์ใน marketplace",
    "browse.heroBadge": "แคตตาล็อก ComePlayers Marketplace",
    "browse.heroTitle": "เรียกดูเกม A-Z",
    "browse.heroCopy": "ค้นหาบัญชีเกม เหรียญ ไอเทม บูสต์ และบริการเติมเงินจากแคตตาล็อกเดียว",
    "browse.allGames": "เกมทั้งหมด",
    "browse.categoryGames": "เกม {category}",
    "browse.gamesFound": "เกมที่พบ",
    "browse.filterPlaceholder": "กรองเกม...",
    "browse.loadingGames": "กำลังโหลดเกม...",
    "browse.noGames": "ไม่พบเกม",
    "browse.marketplaceCategories": "หมวดหมู่ Marketplace",
    "browse.softwareTitle": "แคตตาล็อกซอฟต์แวร์",
    "browse.softwareCopy": "เรียกดูข้อเสนอซอฟต์แวร์สำหรับงาน ความปลอดภัย ความคิดสร้างสรรค์ VPN และนักพัฒนา",
    "browse.softwareHeading": "ซอฟต์แวร์",
    "browse.softwareCount": "สินค้าซอฟต์แวร์ที่พบ",
  },
  "vi-VN": {
    ...EN_TRANSLATIONS,
    "common.search": "Tìm kiếm",
    "common.cancel": "Hủy",
    "common.save": "Lưu",
    "common.all": "Tất cả",
    "common.previous": "Trước",
    "common.next": "Tiếp",
    "common.pageOf": "Trang {page} / {total}",
    "locale.title": "Cài đặt ngôn ngữ",
    "locale.country": "Quốc gia / Khu vực",
    "locale.language": "Ngôn ngữ",
    "locale.currency": "Tiền tệ",
    "locale.close": "Đóng",
    "locale.autoNote": "Tiếng Anh là ngôn ngữ giao diện mặc định. Quốc gia và tiền tệ được tự động nhận diện cho đến khi bạn lưu lựa chọn riêng.",
    "header.sellWithUs": "Bán cùng chúng tôi",
    "header.sell": "Bán",
    "header.login": "Đăng nhập",
    "header.loginSignup": "Đăng nhập / Đăng ký",
    "header.messages": "Chat",
    "header.notifications": "Thông báo",
    "header.profile": "Hồ sơ",
    "header.walletCredit": "Số dư ví",
    "header.wallet": "Ví",
    "header.myOrders": "Đơn hàng của tôi",
    "header.resolutionCenter": "Trung tâm xử lý",
    "header.selling": "Bán hàng",
    "header.settings": "Cài đặt",
    "header.logout": "Đăng xuất",
    "header.unreadUpdates": "{count} cập nhật chưa đọc",
    "search.placeholder": "Tìm game, sản phẩm, danh mục...",
    "search.headerPlaceholder": "Tìm game, sản phẩm...",
    "search.allCategories": "Tất cả danh mục",
    "search.loading": "Đang tìm marketplace...",
    "search.games": "Game",
    "search.products": "Sản phẩm",
    "search.categories": "Danh mục",
    "search.offers": "ưu đãi",
    "search.viewAllResults": "Xem tất cả kết quả",
    "search.noResults": "Không tìm thấy kết quả marketplace.",
    "browse.heroBadge": "Danh mục ComePlayers Marketplace",
    "browse.heroTitle": "Duyệt game A-Z",
    "browse.heroCopy": "Tìm tài khoản game, coin, vật phẩm, boosting và top-up trong một danh mục thống nhất.",
    "browse.allGames": "Tất cả game",
    "browse.categoryGames": "Game {category}",
    "browse.gamesFound": "game được tìm thấy",
    "browse.filterPlaceholder": "Lọc game...",
    "browse.loadingGames": "Đang tải game...",
    "browse.noGames": "Không tìm thấy game.",
    "browse.marketplaceCategories": "Danh mục Marketplace",
    "browse.softwareTitle": "Danh mục phần mềm",
    "browse.softwareCopy": "Duyệt ưu đãi phần mềm năng suất, bảo mật, sáng tạo, VPN và developer.",
    "browse.softwareHeading": "Phần mềm",
    "browse.softwareCount": "sản phẩm phần mềm được tìm thấy",
  },
  "ja-JP": {
    ...EN_TRANSLATIONS,
    "common.search": "検索",
    "common.cancel": "キャンセル",
    "common.save": "保存",
    "common.all": "すべて",
    "common.previous": "前へ",
    "common.next": "次へ",
    "common.pageOf": "ページ {page} / {total}",
    "locale.title": "言語設定",
    "locale.country": "国 / 地域",
    "locale.language": "言語",
    "locale.currency": "通貨",
    "locale.close": "閉じる",
    "locale.autoNote": "英語が標準の表示言語です。国と通貨は、設定を保存するまで自動的に検出されます。",
    "header.sellWithUs": "販売する",
    "header.sell": "販売",
    "header.login": "ログイン",
    "header.loginSignup": "ログイン / 登録",
    "header.messages": "チャット",
    "header.notifications": "通知",
    "header.profile": "プロフィール",
    "header.walletCredit": "ウォレット残高",
    "header.wallet": "ウォレット",
    "header.myOrders": "注文履歴",
    "header.resolutionCenter": "解決センター",
    "header.selling": "販売管理",
    "header.settings": "設定",
    "header.logout": "ログアウト",
    "header.unreadUpdates": "未読アップデート {count} 件",
    "search.placeholder": "ゲーム、商品、カテゴリを検索...",
    "search.headerPlaceholder": "ゲーム、商品を検索...",
    "search.allCategories": "すべてのカテゴリ",
    "search.loading": "Marketplaceを検索中...",
    "search.games": "ゲーム",
    "search.products": "商品",
    "search.categories": "カテゴリ",
    "search.offers": "件の出品",
    "search.viewAllResults": "すべての結果を見る",
    "search.noResults": "Marketplaceの結果が見つかりません。",
    "browse.heroBadge": "ComePlayers Marketplaceカタログ",
    "browse.heroTitle": "ゲームをA-Zで探す",
    "browse.heroCopy": "ゲームアカウント、コイン、アイテム、ブースト、トップアップを一つのカタログから検索できます。",
    "browse.allGames": "すべてのゲーム",
    "browse.categoryGames": "{category}ゲーム",
    "browse.gamesFound": "件のゲームが見つかりました",
    "browse.filterPlaceholder": "ゲームを絞り込み...",
    "browse.loadingGames": "ゲームを読み込み中...",
    "browse.noGames": "ゲームが見つかりません。",
    "browse.marketplaceCategories": "Marketplaceカテゴリ",
    "browse.softwareTitle": "ソフトウェアカタログ",
    "browse.softwareCopy": "生産性、セキュリティ、クリエイティブ、VPN、開発者向けソフトウェアを探せます。",
    "browse.softwareHeading": "ソフトウェア",
    "browse.softwareCount": "件のソフトウェア商品が見つかりました",
  },
  "ko-KR": {
    ...EN_TRANSLATIONS,
    "common.search": "검색",
    "common.cancel": "취소",
    "common.save": "저장",
    "common.all": "전체",
    "common.previous": "이전",
    "common.next": "다음",
    "common.pageOf": "{page} / {total} 페이지",
    "locale.title": "언어 설정",
    "locale.country": "국가 / 지역",
    "locale.language": "언어",
    "locale.currency": "통화",
    "locale.close": "닫기",
    "locale.autoNote": "영어가 기본 인터페이스 언어입니다. 국가와 통화는 사용자가 설정을 저장할 때까지 자동으로 감지됩니다.",
    "header.sellWithUs": "판매하기",
    "header.sell": "판매",
    "header.login": "로그인",
    "header.loginSignup": "로그인 / 가입",
    "header.messages": "채팅",
    "header.notifications": "알림",
    "header.profile": "프로필",
    "header.walletCredit": "지갑 크레딧",
    "header.wallet": "지갑",
    "header.myOrders": "내 주문",
    "header.resolutionCenter": "해결 센터",
    "header.selling": "판매",
    "header.settings": "설정",
    "header.logout": "로그아웃",
    "header.unreadUpdates": "읽지 않은 업데이트 {count}개",
    "search.placeholder": "게임, 상품, 카테고리 검색...",
    "search.headerPlaceholder": "게임, 상품 검색...",
    "search.allCategories": "모든 카테고리",
    "search.loading": "Marketplace 검색 중...",
    "search.games": "게임",
    "search.products": "상품",
    "search.categories": "카테고리",
    "search.offers": "개 제안",
    "search.viewAllResults": "모든 결과 보기",
    "search.noResults": "Marketplace 결과가 없습니다.",
    "browse.heroBadge": "ComePlayers Marketplace 카탈로그",
    "browse.heroTitle": "게임 A-Z 둘러보기",
    "browse.heroCopy": "게임 계정, 코인, 아이템, 부스팅, 충전 서비스를 하나의 카탈로그에서 검색하세요.",
    "browse.allGames": "전체 게임",
    "browse.categoryGames": "{category} 게임",
    "browse.gamesFound": "개 게임 발견",
    "browse.filterPlaceholder": "게임 필터...",
    "browse.loadingGames": "게임 로딩 중...",
    "browse.noGames": "게임을 찾을 수 없습니다.",
    "browse.marketplaceCategories": "Marketplace 카테고리",
    "browse.softwareTitle": "소프트웨어 카탈로그",
    "browse.softwareCopy": "생산성, 보안, 크리에이티브, VPN, 개발자 소프트웨어 제안을 둘러보세요.",
    "browse.softwareHeading": "소프트웨어",
    "browse.softwareCount": "개 소프트웨어 상품 발견",
  },
};

const CATEGORY_TRANSLATIONS: Record<string, Partial<Record<SupportedLocale, string>>> = {
  all: {
    "id-ID": "Semua",
    "ms-MY": "Semua",
    "th-TH": "ทั้งหมด",
    "vi-VN": "Tất cả",
    "ja-JP": "すべて",
    "ko-KR": "전체",
  },
  boosting: {
    "id-ID": "Boosting",
    "ms-MY": "Boosting",
    "th-TH": "บูสต์",
    "vi-VN": "Boosting",
    "ja-JP": "ブースト",
    "ko-KR": "부스팅",
  },
  "game accounts": {
    "id-ID": "Akun Game",
    "ms-MY": "Akaun Game",
    "th-TH": "บัญชีเกม",
    "vi-VN": "Tài khoản game",
    "ja-JP": "ゲームアカウント",
    "ko-KR": "게임 계정",
  },
  "game coins": {
    "id-ID": "Coin Game",
    "ms-MY": "Coin Game",
    "th-TH": "เหรียญเกม",
    "vi-VN": "Coin game",
    "ja-JP": "ゲームコイン",
    "ko-KR": "게임 코인",
  },
  "game items": {
    "id-ID": "Item Game",
    "ms-MY": "Item Game",
    "th-TH": "ไอเทมเกม",
    "vi-VN": "Vật phẩm game",
    "ja-JP": "ゲームアイテム",
    "ko-KR": "게임 아이템",
  },
  "gift cards": {
    "id-ID": "Gift Card",
    "ms-MY": "Gift Card",
    "th-TH": "บัตรของขวัญ",
    "vi-VN": "Thẻ quà tặng",
    "ja-JP": "ギフトカード",
    "ko-KR": "기프트 카드",
  },
  skins: {
    "id-ID": "Skin",
    "ms-MY": "Skin",
    "th-TH": "สกิน",
    "vi-VN": "Skin",
    "ja-JP": "スキン",
    "ko-KR": "스킨",
  },
  software: {
    "id-ID": "Software",
    "ms-MY": "Software",
    "th-TH": "ซอฟต์แวร์",
    "vi-VN": "Phần mềm",
    "ja-JP": "ソフトウェア",
    "ko-KR": "소프트웨어",
  },
  "top up": {
    "id-ID": "Top Up",
    "ms-MY": "Top Up",
    "th-TH": "เติมเงิน",
    "vi-VN": "Nạp tiền",
    "ja-JP": "トップアップ",
    "ko-KR": "충전",
  },
};

const ZERO_DECIMAL_CURRENCIES = new Set<SupportedCurrency>([
  "IDR",
  "JPY",
  "KRW",
  "VND",
]);

export type ExchangeRate = {
  currency: SupportedCurrency;
  units_per_usd: number;
  margin_percent: number;
};

export const FALLBACK_EXCHANGE_RATES: Record<SupportedCurrency, ExchangeRate> = {
  USD: { currency: "USD", units_per_usd: 1, margin_percent: 0 },
  IDR: { currency: "IDR", units_per_usd: 16250, margin_percent: 0 },
  EUR: { currency: "EUR", units_per_usd: 0.878378, margin_percent: 2.5 },
  GBP: { currency: "GBP", units_per_usd: 0.755814, margin_percent: 2.5 },
  SGD: { currency: "SGD", units_per_usd: 1.27451, margin_percent: 2.5 },
  MYR: { currency: "MYR", units_per_usd: 4.710145, margin_percent: 2.5 },
  PHP: { currency: "PHP", units_per_usd: 57.017544, margin_percent: 2.5 },
  THB: { currency: "THB", units_per_usd: 36.111111, margin_percent: 2.5 },
  VND: { currency: "VND", units_per_usd: 25000, margin_percent: 2.5 },
  JPY: { currency: "JPY", units_per_usd: 145.089286, margin_percent: 2.5 },
  KRW: { currency: "KRW", units_per_usd: 1354.166667, margin_percent: 2.5 },
  AUD: { currency: "AUD", units_per_usd: 1.533019, margin_percent: 2.5 },
  CAD: { currency: "CAD", units_per_usd: 1.365546, margin_percent: 2.5 },
};

export function parseIdrAmount(value: string | number | null | undefined) {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  return Number(String(value).replace(/[^\d]/g, "") || 0);
}

export function normalizeCurrency(value: string | null | undefined) {
  const currency = String(value || BASE_CURRENCY).toUpperCase() as SupportedCurrency;
  return FALLBACK_EXCHANGE_RATES[currency] ? currency : BASE_CURRENCY;
}

function supportedLocale(value: string | null | undefined) {
  const locale = String(value || "").trim() as SupportedLocale;
  return LANGUAGE_OPTIONS.some((option) => option.locale === locale)
    ? locale
    : null;
}

export function normalizeLocale(value: string | null | undefined) {
  const exact = supportedLocale(value);
  if (exact) return exact;

  const language = String(value || "")
    .trim()
    .toLowerCase()
    .split("-")[0];

  return LANGUAGE_PREFIX_LOCALES[language] || "en-US";
}

export function localeFromAcceptLanguage(value: string | null | undefined) {
  const ranges = String(value || "")
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const qParam = params.find((param) => param.trim().startsWith("q="));
      const q = qParam ? Number(qParam.split("=")[1]) : 1;

      return {
        tag,
        q: Number.isFinite(q) ? q : 1,
      };
    })
    .filter((item) => item.tag)
    .sort((a, b) => b.q - a.q);

  for (const item of ranges) {
    const exact = supportedLocale(item.tag);
    if (exact) return exact;

    const language = item.tag.toLowerCase().split("-")[0];
    const locale = LANGUAGE_PREFIX_LOCALES[language];
    if (locale) return locale;
  }

  return null;
}

function resolveCountryCode(value: string | null | undefined) {
  const country = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, "");

  if (!country) return null;

  const aliasedCountry = COUNTRY_ALIASES[country] || country;

  if (COUNTRY_OPTIONS.some((option) => option.country === aliasedCountry)) {
    return aliasedCountry;
  }

  if (EURO_COUNTRIES.has(aliasedCountry)) return "EU";

  return null;
}

export function normalizeCountry(value: string | null | undefined) {
  return resolveCountryCode(value) || "ID";
}

export function getCountryOption(country: string | null | undefined) {
  const safeCountry = normalizeCountry(country);
  return (
    COUNTRY_OPTIONS.find((option) => option.country === safeCountry) ||
    COUNTRY_OPTIONS[0]
  );
}

export function countryFlagEmoji(country: string | null | undefined) {
  const safeCountry = normalizeCountry(country);

  if (safeCountry.length !== 2) return safeCountry;

  return Array.from(safeCountry)
    .map((letter) => String.fromCodePoint(127397 + letter.charCodeAt(0)))
    .join("");
}

export function countryFlagImageUrl(country: string | null | undefined) {
  return `https://flagcdn.com/w40/${normalizeCountry(country).toLowerCase()}.png`;
}

export function formatCountryName(
  country: string | null | undefined,
  locale: string | null | undefined
) {
  const option = getCountryOption(country);
  const safeLocale = normalizeLocale(locale);

  try {
    return (
      new Intl.DisplayNames([safeLocale], { type: "region" }).of(
        option.country
      ) || option.label
    );
  } catch {
    return option.label;
  }
}

export function formatCurrencyName(
  currency: string | null | undefined,
  locale: string | null | undefined
) {
  const safeCurrency = normalizeCurrency(currency);
  const fallback =
    CURRENCY_OPTIONS.find((option) => option.currency === safeCurrency)
      ?.label || safeCurrency;

  try {
    return (
      new Intl.DisplayNames([normalizeLocale(locale)], {
        type: "currency",
      }).of(safeCurrency) || fallback
    );
  } catch {
    return fallback;
  }
}

export function translate(
  locale: string | null | undefined,
  key: TranslationKey,
  values: Record<string, string | number> = {}
) {
  const safeLocale = normalizeLocale(locale);
  const template =
    UI_TRANSLATIONS[safeLocale]?.[key] || UI_TRANSLATIONS["en-US"][key] || key;

  return Object.entries(values).reduce((text, [name, value]) => {
    return text.replaceAll(`{${name}}`, String(value));
  }, template);
}

export function translateCategoryLabel(
  locale: string | null | undefined,
  label: string | null | undefined
) {
  const safeLocale = normalizeLocale(locale);
  const value = String(label || "").trim();
  const key = value.toLowerCase();

  return CATEGORY_TRANSLATIONS[key]?.[safeLocale] || value;
}

export function resolveRequestPreferences({
  country,
  acceptLanguage,
}: {
  country?: string | null;
  acceptLanguage?: string | null;
}) {
  const countryOption = getCountryOption(country || "ID");
  const browserLocale = localeFromAcceptLanguage(acceptLanguage);

  return {
    country: countryOption.country,
    locale: browserLocale || countryOption.locale,
    currency: countryOption.currency,
  };
}

export function getFallbackExchangeRate(
  currency: string | null | undefined
): ExchangeRate {
  return FALLBACK_EXCHANGE_RATES[normalizeCurrency(currency)];
}

export function convertFromBaseCurrency(
  amountUsd: string | number | null | undefined,
  currency: string | null | undefined,
  exchangeRate?: Partial<ExchangeRate> | null
) {
  const amount = Number(amountUsd || 0);
  const safeCurrency = normalizeCurrency(currency);

  if (safeCurrency === BASE_CURRENCY) return amount;

  const fallback = getFallbackExchangeRate(safeCurrency);

  const unitsPerUsd = Number(exchangeRate?.units_per_usd || fallback.units_per_usd);
  const marginPercent = Number(
    exchangeRate?.margin_percent ?? fallback.margin_percent
  );

  const protectiveMultiplier = 1 + Math.max(0, marginPercent) / 100;

  if (!unitsPerUsd || unitsPerUsd <= 0) return amount;

  return amount * unitsPerUsd * protectiveMultiplier;
}

export function currencyFractionDigits(currency: string | null | undefined) {
  return ZERO_DECIMAL_CURRENCIES.has(normalizeCurrency(currency)) ? 0 : 2;
}

export function roundUpCurrencyAmount(
  value: number,
  currency: string | null | undefined
) {
  const digits = currencyFractionDigits(currency);
  const factor = 10 ** digits;
  return Math.ceil((value + Number.EPSILON) * factor) / factor;
}

export function convertFromBaseCurrencyForCheckout(
  amountUsd: string | number | null | undefined,
  currency: string | null | undefined,
  exchangeRate?: Partial<ExchangeRate> | null
) {
  const safeCurrency = normalizeCurrency(currency);
  const converted = convertFromBaseCurrency(amountUsd, safeCurrency, exchangeRate);
  return roundUpCurrencyAmount(converted, safeCurrency);
}

export function formatLocalizedPrice(
  amountUsd: string | number | null | undefined,
  locale = "en-US",
  currency = BASE_CURRENCY,
  exchangeRate?: Partial<ExchangeRate> | null
) {
  const safeCurrency = normalizeCurrency(currency);
  const converted = convertFromBaseCurrency(amountUsd, safeCurrency, exchangeRate);

  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: safeCurrency,
    maximumFractionDigits: currencyFractionDigits(safeCurrency),
  }).format(converted);
}
