import { jsPDF } from 'jspdf';
import * as pdfjsLib from 'pdfjs-dist';

// Configure worker for pdf.js
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://esm.sh/pdfjs-dist@4.0.379/build/pdf.worker.min.mjs';

/**
 * Compresses a PDF file by rendering pages to JPEG images and rebuilding the PDF.
 * This is effective for reducing file size of scanned documents or heavy image-based PDFs
 * before uploading to Gemini.
 */
export const compressPDF = async (
  file: File, 
  onStatus: (status: string) => void
): Promise<File> => {
  try {
    onStatus("Reading file for compression...");
    const arrayBuffer = await file.arrayBuffer();
    
    onStatus("Loading PDF document...");
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const totalPages = pdf.numPages;
    
    // Create new PDF document
    const doc = new jsPDF({
      orientation: 'p',
      unit: 'pt',
      format: 'a4',
      compress: true
    });
    
    // Remove the default initial page so we can add pages with correct dimensions
    doc.deletePage(1);

    for (let i = 1; i <= totalPages; i++) {
      onStatus(`Compressing page ${i} of ${totalPages}...`);
      const page = await pdf.getPage(i);
      
      // Scale 1.5 offers a balance between readability (for AI OCR) and file size
      // A4 at 72dpi = ~595px width. Scale 1.5 = ~892px width.
      const viewport = page.getViewport({ scale: 1.5 });
      
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      canvas.height = viewport.height;
      canvas.width = viewport.width;

      if (!context) throw new Error("Canvas context failed");

      const renderContext = {
        canvasContext: context,
        viewport: viewport
      };

      // Cast to any to avoid type mismatch issues with pdfjs-dist RenderParameters
      await page.render(renderContext as any).promise;

      // Compress to JPEG with 0.6 quality (60%)
      const imgData = canvas.toDataURL('image/jpeg', 0.6);
      
      // Add page to new PDF matching the viewport dimensions
      // jsPDF orientation logic: if width > height, it's landscape
      const isLandscape = viewport.width > viewport.height;
      doc.addPage([viewport.width, viewport.height], isLandscape ? 'l' : 'p');
      
      // Add the compressed image
      doc.addImage(imgData, 'JPEG', 0, 0, viewport.width, viewport.height);
      
      // Cleanup canvas to free memory
      canvas.remove();
    }

    onStatus("Finalizing compressed file...");
    const blob = doc.output('blob');
    
    // Check if compression actually helped
    if (blob.size >= file.size) {
        console.log("Compression did not reduce size (original was smaller or purely text), using original.");
        return file;
    }
    
    console.log(`Compression successful: ${(file.size / 1024 / 1024).toFixed(2)}MB -> ${(blob.size / 1024 / 1024).toFixed(2)}MB`);
    return new File([blob], file.name, { type: 'application/pdf' });
    
  } catch (e) {
    console.error("Compression failed", e);
    // If compression fails, we should let the caller handle the original file or throw
    throw new Error("Failed to compress PDF. The file might be corrupted or password protected.");
  }
};