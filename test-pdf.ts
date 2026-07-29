import { jsPDF } from 'jspdf';

async function test() {
  const doc = new jsPDF();
  const fontUrl = 'https://fonts.gstatic.com/s/roboto/v30/KFOmCnqEu92Fr1Me5WZLCzYlKw.ttf';
  const resp = await fetch(fontUrl);
  const buffer = await resp.arrayBuffer();
  const base64String = Buffer.from(buffer).toString('base64');
  
  doc.addFileToVFS('Roboto-Regular.ttf', base64String);
  doc.addFont('Roboto-Regular.ttf', 'Roboto', 'normal');
  doc.setFont('Roboto');
  doc.text('Türkçe Karakterler: ş, ğ, ı, ö, ç, ü, Ş, Ğ, İ, Ö, Ç, Ü', 10, 10);
  console.log('Success!');
}
test().catch(console.error);
