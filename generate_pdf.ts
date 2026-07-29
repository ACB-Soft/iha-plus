import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// just checking TS compilation with autoTable
const doc = new jsPDF();
autoTable(doc, {
  head: [['Name', 'Email']],
  body: [['John', 'john@example.com']],
});
