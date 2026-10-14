/**
 * Student App PDF Viewer Module
 * In-memory PDF.js canvas rendering and isolated iframe web PDF viewer.
 */

export class PdfViewerManager {
  constructor(domElements) {
    this.container = domElements.pdfContainer;
    this.canvas = domElements.pdfRenderCanvas;
    this.webFrame = domElements.pdfWebFrame;
    this.pageNumDisplay = domElements.pdfPageNum;
    this.pageCountDisplay = domElements.pdfPageCount;
    this.zoomLevelDisplay = domElements.pdfZoomLevel;
    this.btnPrev = domElements.btnPdfPrev;
    this.btnNext = domElements.btnPdfNext;
    this.btnZoomIn = domElements.btnPdfZoomIn;
    this.btnZoomOut = domElements.btnPdfZoomOut;

    this.pdfDoc = null;
    this.currentPage = 1;
    this.zoom = 1.0;

    this.bindControls();
  }

  bindControls() {
    if (this.btnPrev) {
      this.btnPrev.addEventListener('click', () => {
        if (this.currentPage > 1) {
          this.currentPage--;
          this.renderPage(this.currentPage);
        }
      });
    }

    if (this.btnNext) {
      this.btnNext.addEventListener('click', () => {
        if (this.pdfDoc && this.currentPage < this.pdfDoc.numPages) {
          this.currentPage++;
          this.renderPage(this.currentPage);
        }
      });
    }

    if (this.btnZoomIn) {
      this.btnZoomIn.addEventListener('click', () => {
        if (this.zoom < 2.5) {
          this.zoom += 0.2;
          this.renderPage(this.currentPage);
        }
      });
    }

    if (this.btnZoomOut) {
      this.btnZoomOut.addEventListener('click', () => {
        if (this.zoom > 0.6) {
          this.zoom -= 0.2;
          this.renderPage(this.currentPage);
        }
      });
    }
  }

  async loadLesson(lesson, activeCourseData) {
    this.cleanup();
    if (this.container) this.container.classList.remove('hidden');

    const blob = activeCourseData?.files?.get(lesson.filename);

    if (blob) {
      // In-memory decrypted local PDF
      if (this.btnOpenTab) this.btnOpenTab.classList.add('hidden');
      if (this.webFrame) this.webFrame.classList.add('hidden');
      if (this.canvas) this.canvas.classList.remove('hidden');

      try {
        const arrayBuffer = await blob.arrayBuffer();
        if (window.pdfjsLib) {
          const loadingTask = window.pdfjsLib.getDocument({ data: arrayBuffer });
          this.pdfDoc = await loadingTask.promise;
          if (this.pageCountDisplay) this.pageCountDisplay.textContent = this.pdfDoc.numPages;
          this.currentPage = 1;
          await this.renderPage(this.currentPage);
        }
      } catch (err) {
        console.error('PDF.js in-memory render error:', err);
      }
    } else if (lesson.url) {

      if (lesson.url.endsWith('.pdf') && window.pdfjsLib) {
        if (this.webFrame) this.webFrame.classList.add('hidden');
        if (this.canvas) this.canvas.classList.remove('hidden');
        try {
          const loadingTask = window.pdfjsLib.getDocument(lesson.url);
          this.pdfDoc = await loadingTask.promise;
          if (this.pageCountDisplay) this.pageCountDisplay.textContent = this.pdfDoc.numPages;
          this.currentPage = 1;
          await this.renderPage(this.currentPage);
        } catch {
          this.fallbackToIframe(lesson.url);
        }
      } else {
        this.fallbackToIframe(lesson.url);
      }
    }
  }

  fallbackToIframe(url) {
    if (this.canvas) this.canvas.classList.add('hidden');
    if (this.webFrame) {
      this.webFrame.classList.remove('hidden');
      this.webFrame.src = url;
    }
  }

  async renderPage(num) {
    if (!this.pdfDoc || !this.canvas) return;
    try {
      const page = await this.pdfDoc.getPage(num);
      const viewport = page.getViewport({ scale: this.zoom });

      this.canvas.height = viewport.height;
      this.canvas.width = viewport.width;

      const renderContext = {
        canvasContext: this.canvas.getContext('2d'),
        viewport
      };

      await page.render(renderContext).promise;

      if (this.pageNumDisplay) this.pageNumDisplay.textContent = num;
      if (this.zoomLevelDisplay) this.zoomLevelDisplay.textContent = `${Math.round(this.zoom * 100)}%`;
    } catch (err) {
      console.warn('PDF renderPage error:', err);
    }
  }

  cleanup() {
    this.pdfDoc = null;
    if (this.webFrame) {
      this.webFrame.src = 'about:blank';
      this.webFrame.classList.add('hidden');
    }
    if (this.canvas) {
      this.canvas.classList.remove('hidden');
      const ctx = this.canvas.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
    if (this.container) {
      this.container.classList.add('hidden');
    }
  }
}
