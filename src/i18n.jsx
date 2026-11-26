import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

// English and Filipino interface text. Legal pages are written in English
// (see content/legal.js); everything a bystander needs to request help is here.
const STRINGS = {
  en: {
    languageName: 'English',
    switchLanguage: 'Wika: Filipino',
    brandMessage: 'Teknolohiya na may malasakit.',
    tagline: 'Community care, within reach.',
    skipToContent: 'Skip to main content',

    homeIntro: 'QRAlalay helps barangays, families and neighbours look after older adults and persons with disability. If you find a resident wearing a QRAlalay card who needs help, scan the card to tell the barangay.',
    howTitle: 'How the QRAlalay card works',
    howStep1Title: 'Scan the card',
    howStep1: 'Point your phone camera at the QR code on the resident’s card. No app or account is needed.',
    howStep2Title: 'Request assistance',
    howStep2: 'Add a short note or landmark. You may share your location once if you choose to.',
    howStep3Title: 'The barangay coordinates help',
    howStep3: 'Barangay officials receive the request, send a responder and help the resident reconnect with family.',
    communityTitle: 'Community assistance, not emergency dispatch',
    communityBody: 'QRAlalay sends requests to the resident’s barangay. It does not contact ambulances, police or fire services. If anyone is in immediate danger, call 911.',
    noCardTitle: 'Found someone who needs help?',
    noCardBody: 'Scan the QR code on their QRAlalay card with your phone camera. The barangay’s confirmed contact number appears after you scan.',

    call911: 'Call 911',
    call911Note: 'For immediate danger to life or safety',
    callBarangay: 'Call Barangay',
    needHelpNow: 'Need immediate help?',
    noBarangayContact: 'This barangay has not published a confirmed contact number yet. Call 911 if anyone is in immediate danger.',

    loadingTitle: 'Checking the card…',
    loadingBody: 'Please wait a moment.',
    validCard: 'Valid resident card',
    barangay: 'Barangay',
    approvedName: 'Resident',
    approvedInstructions: 'How to help',
    helpTitle: 'Help a resident',
    helpIntro: 'Send an assistance request to the barangay. You do not need an account.',
    landmarkLabel: 'Where is the resident? (optional)',
    landmarkHint: 'A landmark, street or building, for example “near the chapel on Rizal St.”',
    noteLabel: 'What happened? (optional)',
    noteHint: 'Describe what you see. Do not include your own personal details.',
    shareLocationLabel: 'Share my current location once with this request',
    shareLocationHint: 'Your phone will ask for permission. You can still send the request without it.',
    requestAssistance: 'Request Assistance',
    sending: 'Sending request…',
    findingLocation: 'Finding your location…',
    privacyNoteScan: 'Your note, landmark and (if you allow it) one location are shared with barangay officials, the assigned responder and the resident’s verified guardian.',

    sentTitle: 'Assistance request sent',
    sentBody: 'The barangay has received your request. This does not mean a responder is on the way. Stay with the resident if it is safe to do so.',
    joinedBody: 'Someone has already requested help for this resident. Your report was added to the same request.',
    locationShared: 'Your location was shared once.',
    locationAccuracy: 'Accurate to about {m} metres.',
    locationNotShared: 'No location was shared.',
    locationDenied: 'Location was not shared because permission was denied or unavailable. Your landmark and note were still sent.',
    statusTitle: 'Request status',
    statusUnknown: 'Tap “Check status” to see the latest update.',
    checkStatus: 'Check status',
    checking: 'Checking…',
    statusCheckedAt: 'Checked at {time}',
    cancelRequest: 'Cancel mistaken request ({s}s)',
    cancelling: 'Cancelling…',
    cancelHint: 'Sent by mistake? You can cancel while the timer runs.',
    cancelExpired: 'The time to cancel has ended. If this request was a mistake, call the barangay.',
    cancelledTitle: 'Request cancelled',
    cancelledBody: 'Your request was cancelled. The barangay may already have been notified. If the resident still needs help, scan the card again or call for help.',
    cannotCancel: 'This request can no longer be cancelled. If it was a mistake, call the barangay.',

    invalidTitle: 'This QR card is not active',
    invalidBody: 'The card may have been replaced or cancelled by the barangay. You cannot send a request with it.',
    invalidLinkTitle: 'This QR link is incomplete',
    invalidLinkBody: 'Part of the link is missing or damaged. Try scanning the card again, holding the camera steady.',
    invalidRecovery: 'If the resident needs help, stay with them and call 911 or the barangay hall.',
    networkTitle: 'We couldn’t reach QRAlalay',
    networkBody: 'Check your internet connection and try again.',
    tryAgain: 'Try again',
    submitFailed: 'Your request was not sent.',
    submitRetry: 'Check your connection and tap Request Assistance again. Trying again will not create a duplicate request.',
    busyTitle: 'Too many attempts',
    busyBody: 'Please wait a minute, then try again.',

    stage_new: 'New Request',
    stage_in_progress: 'In Progress',
    stage_escalated: 'Escalated',
    stage_closed: 'Closed',
    stage_cancelled: 'Cancelled',
    stageHint_new: 'The barangay has received the request and will act on it.',
    stageHint_in_progress: 'The barangay is coordinating assistance.',
    stageHint_escalated: 'The request needs additional attention from the barangay.',
    stageHint_closed: 'A barangay official has reviewed and closed this request.',
    stageHint_cancelled: 'This request was cancelled.',

    footerPrivacy: 'Privacy Policy',
    footerTerms: 'Terms of Service',
    footerAbout: 'About QRAlalay',
    footerHome: 'Home',
    footerNote: 'QRAlalay is a barangay community assistance system. It does not replace 911.',
    backHome: '‹ Back to home',
    legalEnglishOnly: '',
  },
  fil: {
    languageName: 'Filipino',
    switchLanguage: 'Language: English',
    brandMessage: 'Teknolohiya na may malasakit.',
    tagline: 'Kalinga ng komunidad, abot-kamay.',
    skipToContent: 'Lumaktaw sa pangunahing nilalaman',

    homeIntro: 'Tinutulungan ng QRAlalay ang mga barangay, pamilya at kapitbahay na alagaan ang mga nakatatanda at may kapansanan. Kung may makita kang residenteng may QRAlalay card na nangangailangan ng tulong, i-scan ang card upang ipaalam sa barangay.',
    howTitle: 'Paano gumagana ang QRAlalay card',
    howStep1Title: 'I-scan ang card',
    howStep1: 'Itapat ang camera ng iyong telepono sa QR code ng card ng residente. Hindi kailangan ng app o account.',
    howStep2Title: 'Humingi ng tulong',
    howStep2: 'Magdagdag ng maikling tala o palatandaan. Maaari mong ibahagi ang iyong lokasyon nang isang beses kung nais mo.',
    howStep3Title: 'Ang barangay ang mag-uugnay ng tulong',
    howStep3: 'Matatanggap ng mga opisyal ng barangay ang kahilingan, magpapadala ng responder at tutulong na maibalik ang residente sa pamilya.',
    communityTitle: 'Tulong ng komunidad, hindi emergency dispatch',
    communityBody: 'Ipinapadala ng QRAlalay ang kahilingan sa barangay ng residente. Hindi ito tumatawag ng ambulansya, pulis o bumbero. Kung may nasa agarang panganib, tumawag sa 911.',
    noCardTitle: 'May nakitang nangangailangan ng tulong?',
    noCardBody: 'I-scan ang QR code sa kanilang QRAlalay card gamit ang camera ng telepono. Lalabas ang kumpirmadong numero ng barangay pagkatapos mag-scan.',

    call911: 'Tumawag sa 911',
    call911Note: 'Para sa agarang panganib sa buhay o kaligtasan',
    callBarangay: 'Tumawag sa Barangay',
    needHelpNow: 'Kailangan ng agarang tulong?',
    noBarangayContact: 'Wala pang kumpirmadong numero ang barangay na ito. Tumawag sa 911 kung may nasa agarang panganib.',

    loadingTitle: 'Sinusuri ang card…',
    loadingBody: 'Sandali lamang.',
    validCard: 'Aktibong card ng residente',
    barangay: 'Barangay',
    approvedName: 'Residente',
    approvedInstructions: 'Paano tumulong',
    helpTitle: 'Tulungan ang residente',
    helpIntro: 'Magpadala ng kahilingan ng tulong sa barangay. Hindi mo kailangan ng account.',
    landmarkLabel: 'Nasaan ang residente? (opsyonal)',
    landmarkHint: 'Palatandaan, kalye o gusali, halimbawa “malapit sa kapilya sa Rizal St.”',
    noteLabel: 'Ano ang nangyari? (opsyonal)',
    noteHint: 'Ilarawan ang nakikita mo. Huwag isama ang sarili mong personal na impormasyon.',
    shareLocationLabel: 'Ibahagi nang isang beses ang aking kasalukuyang lokasyon',
    shareLocationHint: 'Hihingi ng pahintulot ang iyong telepono. Maaari pa ring magpadala kahit wala ito.',
    requestAssistance: 'Humingi ng Tulong',
    sending: 'Ipinapadala…',
    findingLocation: 'Hinahanap ang iyong lokasyon…',
    privacyNoteScan: 'Ang iyong tala, palatandaan at (kung papayagan) isang lokasyon ay makikita ng mga opisyal ng barangay, ng itinalagang responder at ng beripikadong guardian ng residente.',

    sentTitle: 'Naipadala ang kahilingan',
    sentBody: 'Natanggap na ng barangay ang iyong kahilingan. Hindi pa ito nangangahulugang may responder nang papunta. Manatili sa residente kung ligtas.',
    joinedBody: 'May humingi na ng tulong para sa residenteng ito. Idinagdag ang iyong ulat sa parehong kahilingan.',
    locationShared: 'Naibahagi ang iyong lokasyon nang isang beses.',
    locationAccuracy: 'Tumpak sa humigit-kumulang {m} metro.',
    locationNotShared: 'Walang lokasyong ibinahagi.',
    locationDenied: 'Hindi naibahagi ang lokasyon dahil hindi pinayagan o hindi available. Naipadala pa rin ang palatandaan at tala.',
    statusTitle: 'Katayuan ng kahilingan',
    statusUnknown: 'Pindutin ang “Tingnan ang katayuan” para sa pinakabagong update.',
    checkStatus: 'Tingnan ang katayuan',
    checking: 'Sinusuri…',
    statusCheckedAt: 'Sinuri noong {time}',
    cancelRequest: 'Kanselahin ang maling kahilingan ({s}s)',
    cancelling: 'Kinakansela…',
    cancelHint: 'Napadala nang hindi sinasadya? Maaari mo itong kanselahin habang tumatakbo ang oras.',
    cancelExpired: 'Tapos na ang oras para magkansela. Kung mali ang kahilingan, tumawag sa barangay.',
    cancelledTitle: 'Nakansela ang kahilingan',
    cancelledBody: 'Nakansela ang iyong kahilingan. Maaaring naabisuhan na ang barangay. Kung kailangan pa ng tulong, i-scan muli ang card o tumawag.',
    cannotCancel: 'Hindi na maaaring kanselahin ang kahilingang ito. Kung mali ito, tumawag sa barangay.',

    invalidTitle: 'Hindi aktibo ang QR card na ito',
    invalidBody: 'Maaaring pinalitan o kinansela ito ng barangay. Hindi ito magagamit upang magpadala ng kahilingan.',
    invalidLinkTitle: 'Kulang ang QR link na ito',
    invalidLinkBody: 'May nawawala o sirang bahagi ng link. Subukang i-scan muli ang card nang hindi gumagalaw ang camera.',
    invalidRecovery: 'Kung kailangan ng residente ng tulong, samahan sila at tumawag sa 911 o sa barangay hall.',
    networkTitle: 'Hindi maabot ang QRAlalay',
    networkBody: 'Suriin ang iyong internet at subukang muli.',
    tryAgain: 'Subukang muli',
    submitFailed: 'Hindi naipadala ang iyong kahilingan.',
    submitRetry: 'Suriin ang koneksyon at pindutin muli ang Humingi ng Tulong. Hindi ito gagawa ng dobleng kahilingan.',
    busyTitle: 'Masyadong maraming pagsubok',
    busyBody: 'Maghintay ng isang minuto at subukang muli.',

    stage_new: 'Bagong Kahilingan',
    stage_in_progress: 'Isinasagawa',
    stage_escalated: 'Itinaas',
    stage_closed: 'Sarado',
    stage_cancelled: 'Kinansela',
    stageHint_new: 'Natanggap na ng barangay ang kahilingan at aaksyunan ito.',
    stageHint_in_progress: 'Inaayos na ng barangay ang tulong.',
    stageHint_escalated: 'Kailangan ng karagdagang atensyon ng barangay.',
    stageHint_closed: 'Sinuri at isinara na ng isang opisyal ng barangay ang kahilingan.',
    stageHint_cancelled: 'Kinansela ang kahilingang ito.',

    footerPrivacy: 'Patakaran sa Privacy',
    footerTerms: 'Mga Tuntunin ng Serbisyo',
    footerAbout: 'Tungkol sa QRAlalay',
    footerHome: 'Home',
    footerNote: 'Ang QRAlalay ay sistema ng tulong ng barangay. Hindi nito pinapalitan ang 911.',
    backHome: '‹ Bumalik sa home',
    legalEnglishOnly: 'Ang pahinang ito ay nasa Ingles pa lamang.',
  },
};

const STORAGE_KEY = 'qralalay.language';
const LanguageContext = createContext(null);

function initialLanguage() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'en' || saved === 'fil') return saved;
  } catch { /* Storage may be blocked; fall back to the browser language. */ }
  const browser = (navigator.language || '').toLowerCase();
  return browser.startsWith('fil') || browser.startsWith('tl') ? 'fil' : 'en';
}

export function LanguageProvider({ children }) {
  const [language, setLanguage] = useState(initialLanguage);

  useEffect(() => {
    document.documentElement.lang = language === 'fil' ? 'fil' : 'en';
    try { localStorage.setItem(STORAGE_KEY, language); } catch { /* optional */ }
  }, [language]);

  const t = useCallback((key, vars) => {
    const text = STRINGS[language][key] ?? STRINGS.en[key] ?? key;
    return vars ? text.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? '')) : text;
  }, [language]);

  const value = useMemo(() => ({
    language, t,
    toggleLanguage: () => setLanguage((current) => (current === 'en' ? 'fil' : 'en')),
  }), [language, t]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useI18n() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('useI18n must be used inside LanguageProvider');
  return context;
}

export const STRING_KEYS = { en: Object.keys(STRINGS.en), fil: Object.keys(STRINGS.fil) };
