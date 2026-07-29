import { jsPDF } from 'jspdf';

const doc = new jsPDF('p', 'mm', 'a4');
doc.setFillColor(240, 240, 240);
doc.rect(10, 10, 100, 50, 'F');

doc.internal.write('3 Tr'); // Set text rendering mode to 3 (invisible)
doc.setFontSize(16);
doc.text('Selectable Invisible Text', 15, 25);
doc.internal.write('0 Tr'); // Reset text rendering mode to 0 (fill)

doc.text('Visible Normal Text', 15, 40);

console.log('PDF stream generated successfully');
