import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { buildQrCardHtml } from '../utils/qrCardHtml';

// Reads the PNG from a react-native-qrcode-svg ref (set via getRef).
function qrImageFromRef(qrRef) {
  return new Promise((resolve, reject) => {
    if (!qrRef?.current?.toDataURL) {
      reject(new Error('The QR image is not ready yet.'));
      return;
    }
    qrRef.current.toDataURL((base64) => {
      if (base64) resolve(`data:image/png;base64,${base64}`);
      else reject(new Error('Could not prepare the QR image.'));
    });
  });
}

// Exports the already-issued QR card as a printable PDF. It never issues,
// replaces or revokes a card. Web opens the print dialog; Android/iOS open
// the Android print dialog or iOS share sheet so the card can be saved/printed.
export async function exportQrCard(qrRef) {
  const html = buildQrCardHtml(await qrImageFromRef(qrRef));
  if (Platform.OS === 'web') {
    await Print.printAsync({ html });
    return;
  }
  const { uri } = await Print.printToFileAsync({ html });
  if (!uri?.startsWith('file://')) throw new Error('The printable QR card could not be saved on this device.');
  // On Android, sending the Expo Print cache URI through the share sheet can
  // fail its file-provider read check. Open Android's print UI with the PDF;
  // users can save it with the system "Save as PDF" destination.
  if (Platform.OS === 'android') {
    await Print.printAsync({ uri });
    return;
  }
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Save or print QR card', UTI: '.pdf' });
  } else {
    await Print.printAsync({ uri });
  }
}
