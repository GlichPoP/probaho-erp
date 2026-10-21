/**
 * PROBAHO ERP: UNIVERSAL LOGO & BRAND IMAGE PROCESSOR
 * File: src/utils/imageUtils.ts
 * 
 * Supports ALL formats:
 * - Raster Images: PNG, JPEG, JPG, WEBP, GIF, BMP, ICO
 * - Vector: SVG
 * - Documents: PDF (automatically extracts and renders Page 1 onto high-res canvas)
 */

export interface ProcessedLogoResult {
  dataUrl: string;
  width?: number;
  height?: number;
  originalName: string;
  format: string;
}

function toBase64(str: string): string {
  if (typeof btoa !== 'undefined') {
    return btoa(unescape(encodeURIComponent(str)));
  }
  return Buffer.from(str, 'utf8').toString('base64');
}

/**
 * Automatically processes any uploaded file (PNG, JPG, SVG, WebP, GIF, BMP, PDF, etc.)
 * and converts it into a high-resolution base64 PNG/SVG data URL suitable for header display and print chits.
 */
export async function processCompanyLogoFile(file: File): Promise<string> {
  const fileName = (file.name || '').toLowerCase();
  const fileType = (file.type || '').toLowerCase();

  const isPdf = fileType === 'application/pdf' || fileName.endsWith('.pdf');
  const isSvg = fileType === 'image/svg+xml' || fileName.endsWith('.svg');

  // CASE 1: PDF Document (Extract and render page 1 onto canvas)
  if (isPdf) {
    try {
      if (typeof document === 'undefined') {
        // Fallback for Node/test environment
        return createCompanyFallbackBadge(file.name.replace(/\.pdf$/i, ''));
      }
      const buffer = await file.arrayBuffer();
      // Dynamically load pdfjs to keep bundle modular
      const pdfjsLib = await import('pdfjs-dist/build/pdf.js');

      // Configure PDF.js worker
      if (pdfjsLib.GlobalWorkerOptions) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = '';
      }

      const loadingTask = pdfjsLib.getDocument({
        data: new Uint8Array(buffer),
        isEvalSupported: false,
        useWorkerFetch: false,
        isOffscreenCanvasSupported: false
      });

      const pdf = await loadingTask.promise;
      const page = await pdf.getPage(1);
      const initialViewport = page.getViewport({ scale: 1.0 });

      // Target ~500px dimension for high clarity on Retina/4K displays
      const targetDim = 500;
      const scale = Math.max(1.0, Math.min(3.0, targetDim / Math.max(initialViewport.width, initialViewport.height)));
      const viewport = page.getViewport({ scale });

      const canvas = document.createElement('canvas');
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Canvas 2D context unavailable.');
      }

      // Fill white background for PDF page in case transparent
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      await page.render({
        canvasContext: ctx,
        viewport
      }).promise;

      return canvas.toDataURL('image/png');
    } catch (pdfErr) {
      console.warn('[imageUtils] PDF rendering failed, falling back to basic preview:', pdfErr);
      // Fallback: Generate corporate document badge
      return createCompanyFallbackBadge(file.name.replace(/\.pdf$/i, ''));
    }
  }

  // CASE 2: SVG Vector Graphic
  if (isSvg) {
    let content = '';
    if (typeof file.text === 'function') {
      content = await file.text();
    } else if (typeof FileReader !== 'undefined') {
      content = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('Failed to read SVG logo file.'));
        reader.readAsText(file);
      });
    } else {
      const buf = await file.arrayBuffer();
      content = Buffer.from(buf).toString('utf8');
    }

    if (content.startsWith('data:image/svg+xml')) {
      return content;
    }
    if (!content.includes('xmlns=')) {
      content = content.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
    }
    const base64 = toBase64(content);
    return `data:image/svg+xml;base64,${base64}`;
  }

  // CASE 3: Standard Raster Images (PNG, JPG, WEBP, GIF, BMP, ICO, etc.)
  if (typeof FileReader === 'undefined' || typeof document === 'undefined') {
    // In Node / non-browser test environment
    const buf = await file.arrayBuffer();
    const base64 = Buffer.from(buf).toString('base64');
    const mime = file.type || 'image/png';
    return `data:${mime};base64,${base64}`;
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const rawDataUrl = reader.result as string;
      const img = new Image();

      img.onload = () => {
        const MAX_WIDTH = 512;
        const MAX_HEIGHT = 512;

        let width = img.width;
        let height = img.height;

        if (width > MAX_WIDTH || height > MAX_HEIGHT) {
          const ratio = Math.min(MAX_WIDTH / width, MAX_HEIGHT / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(rawDataUrl);
          return;
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        resolve(canvas.toDataURL('image/png'));
      };

      img.onerror = () => {
        // If image fails to decode, return raw dataUrl or fallback
        resolve(rawDataUrl);
      };

      img.src = rawDataUrl;
    };

    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.readAsDataURL(file);
  });
}

/**
 * Creates an elegant corporate SVG badge fallback if a non-image file is provided.
 */
export function createCompanyFallbackBadge(name: string): string {
  const cleanName = (name || 'Company').trim();
  const initial = cleanName.charAt(0).toUpperCase();

  const svg = `<svg width="120" height="120" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="120" height="120" rx="24" fill="#0F172A"/>
    <rect x="2" y="2" width="116" height="116" rx="22" stroke="#10B981" stroke-width="3" stroke-opacity="0.5"/>
    <text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" fill="#10B981" font-family="system-ui, -apple-system, sans-serif" font-size="52" font-weight="bold">${initial}</text>
  </svg>`;

  const base64 = toBase64(svg);
  return `data:image/svg+xml;base64,${base64}`;
}
