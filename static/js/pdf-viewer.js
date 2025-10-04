// PDF Viewer using PDF.js
class PDFViewer {
    constructor() {
        this.pdfDoc = null;
        this.currentPage = 1;
        this.totalPages = 0;
        this.scale = 1.0;
        this.canvas = document.getElementById('pdf-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.isLoading = false;
        
        this.setupEventListeners();
    }

    setupEventListeners() {
        // Navigation buttons
        document.getElementById('pdf-prev-page').addEventListener('click', () => {
            this.prevPage();
        });
        
        document.getElementById('pdf-next-page').addEventListener('click', () => {
            this.nextPage();
        });
        
        // Zoom controls
        document.getElementById('pdf-zoom-in').addEventListener('click', () => {
            this.zoomIn();
        });
        
        document.getElementById('pdf-zoom-out').addEventListener('click', () => {
            this.zoomOut();
        });
        
        document.getElementById('pdf-fit-width').addEventListener('click', () => {
            this.fitToWidth();
        });
        
        // Download button
        document.getElementById('pdf-download').addEventListener('click', () => {
            this.downloadPDF();
        });
        
        // Keyboard navigation
        document.addEventListener('keydown', (e) => {
            if (this.isActive()) {
                this.handleKeyPress(e);
            }
        });
        
        // Mouse wheel zoom
        this.canvas.addEventListener('wheel', (e) => {
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                if (e.deltaY > 0) {
                    this.zoomOut();
                } else {
                    this.zoomIn();
                }
            }
        });
        
        // Text selection for notes/highlighting
        this.canvas.addEventListener('mouseup', (e) => {
            this.handleTextSelection(e);
        });
        
        // Context menu for annotations
        this.canvas.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.showContextMenu(e);
        });
    }

    isActive() {
        return document.getElementById('pdf-viewer').style.display !== 'none';
    }

    async loadDocument(documentUrl, fallbackUrl = null) {
        if (this.isLoading) return;
        
        this.isLoading = true;
        this.updateLoadingState(true);
        
        try {
            // Configure PDF.js worker
            if (typeof pdfjsLib !== 'undefined') {
                pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
            }
            
            let urlToTry = documentUrl;
            let loadingTask;
            
            try {
                // Try primary URL first
                loadingTask = pdfjsLib.getDocument(urlToTry);
                this.pdfDoc = await loadingTask.promise;
            } catch (error) {
                console.warn('Primary URL failed, trying fallback:', error);
                if (fallbackUrl) {
                    urlToTry = fallbackUrl;
                    loadingTask = pdfjsLib.getDocument(urlToTry);
                    this.pdfDoc = await loadingTask.promise;
                } else {
                    throw error;
                }
            }
            
            this.totalPages = this.pdfDoc.numPages;
            this.currentPage = 1;
            
            // Render first page
            await this.renderPage(this.currentPage);
            this.updatePageInfo();
            this.updateNavigationState();
            
            console.log('PDF loaded successfully:', this.totalPages, 'pages');
        } catch (error) {
            console.error('Error loading PDF:', error);
            this.showError('Failed to load PDF document');
        } finally {
            this.isLoading = false;
            this.updateLoadingState(false);
        }
    }

    async renderPage(pageNum) {
        if (!this.pdfDoc) return;
        
        try {
            const page = await this.pdfDoc.getPage(pageNum);
            const viewport = page.getViewport({ scale: this.scale });
            
            // Set canvas dimensions
            this.canvas.width = viewport.width;
            this.canvas.height = viewport.height;
            
            // Render the page
            const renderContext = {
                canvasContext: this.ctx,
                viewport: viewport
            };
            
            await page.render(renderContext).promise;
            
            // Extract text content for search and annotations
            this.extractTextContent(page);
            
        } catch (error) {
            console.error('Error rendering page:', error);
            this.showError('Failed to render PDF page');
        }
    }

    async extractTextContent(page) {
        try {
            const textContent = await page.getTextContent();
            // Store text content for search and AI context
            this.currentPageText = textContent.items.map(item => item.str).join(' ');
            
            // Dispatch event for other components (like chat assistant)
            window.dispatchEvent(new CustomEvent('pdf-text-extracted', {
                detail: {
                    page: this.currentPage,
                    text: this.currentPageText
                }
            }));
        } catch (error) {
            console.error('Error extracting text content:', error);
        }
    }

    // Navigation methods
    async prevPage() {
        if (this.currentPage > 1) {
            this.currentPage--;
            await this.renderPage(this.currentPage);
            this.updatePageInfo();
            this.updateNavigationState();
            this.saveProgress();
        }
    }

    async nextPage() {
        if (this.currentPage < this.totalPages) {
            this.currentPage++;
            await this.renderPage(this.currentPage);
            this.updatePageInfo();
            this.updateNavigationState();
            this.saveProgress();
        }
    }

    async goToPage(pageNum) {
        if (pageNum >= 1 && pageNum <= this.totalPages) {
            this.currentPage = pageNum;
            await this.renderPage(this.currentPage);
            this.updatePageInfo();
            this.updateNavigationState();
            this.saveProgress();
        }
    }

    // Zoom methods
    async zoomIn() {
        this.scale = Math.min(this.scale * 1.2, 5.0);
        await this.renderPage(this.currentPage);
        this.updateZoomLevel();
    }

    async zoomOut() {
        this.scale = Math.max(this.scale / 1.2, 0.25);
        await this.renderPage(this.currentPage);
        this.updateZoomLevel();
    }

    async fitToWidth() {
        const container = document.getElementById('pdf-canvas-container');
        const containerWidth = container.clientWidth - 40; // Account for padding
        
        if (this.pdfDoc && this.canvas.width > 0) {
            const newScale = containerWidth / (this.canvas.width / this.scale);
            this.scale = Math.max(0.25, Math.min(newScale, 5.0));
            await this.renderPage(this.currentPage);
            this.updateZoomLevel();
        }
    }

    // UI update methods
    updatePageInfo() {
        document.getElementById('pdf-page-info').textContent = 
            `Page ${this.currentPage} of ${this.totalPages}`;
    }

    updateNavigationState() {
        document.getElementById('pdf-prev-page').disabled = this.currentPage <= 1;
        document.getElementById('pdf-next-page').disabled = this.currentPage >= this.totalPages;
    }

    updateZoomLevel() {
        document.getElementById('pdf-zoom-level').textContent = `${Math.round(this.scale * 100)}%`;
    }

    updateLoadingState(isLoading) {
        const buttons = document.querySelectorAll('#pdf-viewer .tool-btn');
        buttons.forEach(btn => btn.disabled = isLoading);
        
        if (isLoading) {
            this.ctx.fillStyle = '#f0f0f0';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            this.ctx.fillStyle = '#666';
            this.ctx.font = '16px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText('Loading...', this.canvas.width / 2, this.canvas.height / 2);
        }
    }

    // Keyboard handling
    handleKeyPress(e) {
        switch (e.key) {
            case 'ArrowLeft':
            case 'PageUp':
                e.preventDefault();
                this.prevPage();
                break;
            case 'ArrowRight':
            case 'PageDown':
                e.preventDefault();
                this.nextPage();
                break;
            case 'Home':
                e.preventDefault();
                this.goToPage(1);
                break;
            case 'End':
                e.preventDefault();
                this.goToPage(this.totalPages);
                break;
            case '+':
            case '=':
                if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    this.zoomIn();
                }
                break;
            case '-':
                if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    this.zoomOut();
                }
                break;
            case '0':
                if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    this.scale = 1.0;
                    this.renderPage(this.currentPage);
                    this.updateZoomLevel();
                }
                break;
        }
    }

    // Annotation and interaction methods
    handleTextSelection(e) {
        const selection = window.getSelection();
        if (selection.toString().trim()) {
            // Show annotation options
            this.showAnnotationOptions(e, selection.toString());
        }
    }

    showContextMenu(e) {
        const contextMenu = document.getElementById('text-context-menu');
        contextMenu.style.display = 'block';
        contextMenu.style.left = e.pageX + 'px';
        contextMenu.style.top = e.pageY + 'px';
        
        // Hide context menu when clicking elsewhere
        setTimeout(() => {
            document.addEventListener('click', function hideContextMenu() {
                contextMenu.style.display = 'none';
                document.removeEventListener('click', hideContextMenu);
            });
        }, 100);
    }

    showAnnotationOptions(e, selectedText) {
        // This would integrate with the notes system
        if (window.NotesManager) {
            window.NotesManager.showAnnotationDialog(e, selectedText, {
                page: this.currentPage,
                coordinates: { x: e.offsetX, y: e.offsetY }
            });
        }
    }

    // Progress tracking
    async saveProgress() {
        if (!window.studyApp || !window.studyApp.currentMaterial) return;
        
        const progressData = {
            material_id: window.studyApp.currentMaterial.id,
            current_page: this.currentPage,
            total_pages: this.totalPages,
            progress_percentage: (this.currentPage / this.totalPages) * 100,
            last_position: JSON.stringify({
                page: this.currentPage,
                scale: this.scale
            })
        };
        
        try {
            await fetch('/api/study-session', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(progressData)
            });
        } catch (error) {
            console.error('Error saving progress:', error);
        }
    }

    // Utility methods
    downloadPDF() {
        if (window.studyApp && window.studyApp.currentMaterial) {
            const link = document.createElement('a');
            link.href = `/api/file/${window.studyApp.currentMaterial.id}`;
            link.download = window.studyApp.currentMaterial.title;
            link.click();
        }
    }

    showError(message) {
        console.error('PDF Viewer Error:', message);
        // Display error in canvas
        this.ctx.fillStyle = '#f8f9fa';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.fillStyle = '#dc3545';
        this.ctx.font = '16px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(message, this.canvas.width / 2, this.canvas.height / 2);
    }

    // Get current page text for AI context
    getCurrentPageText() {
        return this.currentPageText || '';
    }

    // Get document info for AI context
    getDocumentInfo() {
        return {
            currentPage: this.currentPage,
            totalPages: this.totalPages,
            scale: this.scale,
            text: this.getCurrentPageText()
        };
    }
}

// Initialize PDF viewer
document.addEventListener('DOMContentLoaded', () => {
    window.PDFViewer = new PDFViewer();
});

// Export for use by other modules
window.PDFViewer = window.PDFViewer || new PDFViewer();
