import React, { useState } from 'react';
import { X, Printer, FileText, Download, Loader2 } from 'lucide-react';
import { PlacedItem } from '../utils/layoutEngine';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

interface EstimateModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: PlacedItem[];
  totalCost: number;
  counts: Record<string, number>;
}

const EstimateModal: React.FC<EstimateModalProps> = ({ isOpen, onClose, items, totalCost, counts }) => {
  const [isGenerating, setIsGenerating] = useState(false);

  if (!isOpen) return null;

  const today = new Date().toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const handleDownloadPDF = async () => {
    const input = document.getElementById('estimate-content');
    if (!input) return;

    setIsGenerating(true);

    try {
      // Wait for fonts to load
      await document.fonts.ready;

      const canvas = await html2canvas(input, {
        scale: 2, // Higher resolution
        logging: false,
        useCORS: true,
        backgroundColor: '#ffffff'
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      const imgWidth = 210; // A4 width in mm
      const pageHeight = 297; // A4 height in mm
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      
      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      while (heightLeft >= 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      pdf.save(`estimate-${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (error) {
      console.error('PDF generation failed', error);
      alert('PDFの生成に失敗しました。');
    } finally {
      setIsGenerating(false);
    }
  };

  // Group items by type for the table
  const tableRows = Object.entries(counts).map(([name, count]) => {
    const item = items.find(i => i.type.name === name);
    if (!item) return null;
    return {
      name,
      count,
      unitPrice: item.type.unitPrice,
      subtotal: item.type.unitPrice * count
    };
  }).filter(Boolean);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 print:bg-white print:static print:block">
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #estimate-content, #estimate-content * {
            visibility: visible;
          }
          #estimate-content {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            margin: 0;
            padding: 20px;
          }
          @page {
            margin: 0;
            size: auto;
          }
        }
      `}</style>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto print:shadow-none print:w-full print:max-w-none print:h-auto print:overflow-visible">
        
        {/* Header Actions (Hidden in Print) */}
        <div className="flex justify-between items-center p-6 border-b border-gray-100 print:hidden sticky top-0 bg-white z-10">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <FileText className="w-5 h-5 text-indigo-600" />
            御見積書プレビュー
          </h2>
          <div className="flex gap-3">
            <button
              onClick={handleDownloadPDF}
              disabled={isGenerating}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  生成中...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  PDFをダウンロード
                </>
              )}
            </button>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Content */}
        <div className="p-12 print:p-0 print:m-0" id="estimate-content">
          {/* Estimate Header */}
          <div className="flex justify-between items-start mb-12 border-b-2 border-gray-800 pb-8">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-4 tracking-wider">御 見 積 書</h1>
              <p className="text-gray-600">下記の通り御見積申し上げます。</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-500 mb-1">発行日</p>
              <p className="font-medium">{today}</p>
              <div className="mt-4 text-sm text-gray-600">
                <p className="font-bold text-lg mb-1">株式会社 サンプルインテリア</p>
                <p>〒100-0001</p>
                <p>東京都千代田区千代田1-1</p>
                <p>TEL: 03-1234-5678</p>
              </div>
            </div>
          </div>

          {/* Total Amount */}
          <div className="mb-12">
            <div className="flex justify-between items-end border-b border-gray-300 pb-2">
              <span className="text-lg font-medium text-gray-700">御見積金額計</span>
              <span className="text-4xl font-bold text-gray-900">
                ¥{totalCost.toLocaleString()}
                <span className="text-base font-normal text-gray-500 ml-2">- (税込)</span>
              </span>
            </div>
          </div>

          {/* Items Table */}
          <table className="w-full mb-12">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="py-3 px-4 text-left font-semibold text-gray-700 w-1/2">品名</th>
                <th className="py-3 px-4 text-right font-semibold text-gray-700">単価</th>
                <th className="py-3 px-4 text-right font-semibold text-gray-700">数量</th>
                <th className="py-3 px-4 text-right font-semibold text-gray-700">金額</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {tableRows.map((row, index) => (
                <tr key={index} className="hover:bg-gray-50/50">
                  <td className="py-4 px-4 text-gray-800">{row?.name}</td>
                  <td className="py-4 px-4 text-right text-gray-600">¥{row?.unitPrice.toLocaleString()}</td>
                  <td className="py-4 px-4 text-right text-gray-600">{row?.count}</td>
                  <td className="py-4 px-4 text-right font-medium text-gray-900">¥{row?.subtotal.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-800">
                <td colSpan={3} className="py-4 px-4 text-right font-bold text-gray-900">小計</td>
                <td className="py-4 px-4 text-right font-bold text-gray-900">¥{totalCost.toLocaleString()}</td>
              </tr>
              <tr>
                <td colSpan={3} className="py-2 px-4 text-right text-gray-600">消費税 (10%)</td>
                <td className="py-2 px-4 text-right text-gray-600">¥{Math.floor(totalCost * 0.1).toLocaleString()}</td>
              </tr>
              <tr className="border-t border-gray-300">
                <td colSpan={3} className="py-4 px-4 text-right font-bold text-lg text-indigo-900">合計</td>
                <td className="py-4 px-4 text-right font-bold text-lg text-indigo-900">¥{Math.floor(totalCost * 1.1).toLocaleString()}</td>
              </tr>
            </tfoot>
          </table>

          {/* Notes */}
          <div className="bg-gray-50 p-6 rounded-lg border border-gray-100 print:bg-transparent print:border-gray-200">
            <h3 className="font-semibold text-gray-900 mb-2">備考</h3>
            <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
              <li>本見積書の有効期限は発行日より30日間です。</li>
              <li>配送・設置費用は別途申し受けます。</li>
              <li>実際の商品仕様は予告なく変更される場合があります。</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EstimateModal;
