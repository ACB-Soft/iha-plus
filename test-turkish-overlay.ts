import { jsPDF } from 'jspdf';

async function test() {
  const doc = new jsPDF('p', 'mm', 'a4');

  const regularRes = await fetch('https://fonts.gstatic.com/s/roboto/v30/KFOmCnqEu92Fr1Me5WZLCzYlKw.ttf');
  const regularBuf = await regularRes.arrayBuffer();
  const base64 = Buffer.from(regularBuf).toString('base64');

  doc.addFileToVFS('Roboto-Regular.ttf', base64);
  doc.addFont('Roboto-Regular.ttf', 'Roboto', 'normal');
  doc.setFont('Roboto');

  doc.internal.write('3 Tr'); // Invisible mode
  doc.setFontSize(12);
  doc.text('Planlanan Uçuş Raporu: ş, ğ, ı, ö, ç, ü, Ş, Ğ, İ, Ö, Ç, Ü', 10, 20);
  doc.internal.write('0 Tr');

  console.log('Turkish invisible text written successfully');
}

test().catch(console.error);
