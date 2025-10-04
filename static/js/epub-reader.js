class EPUBReader {
    constructor() {
        this.isLoading = false;
        this.entries = null;
        this.basePath = '';
        this.manifestItems = {};
        this.spineItems = [];
        this.currentIndex = 0;
    }

    async loadBook(bookUrl, fallbackUrl = null) {
        if (this.isLoading) return;
        
        this.isLoading = true;
        this.updateLoadingState(true);
        
        // Check if zip.js is available for EPUB extraction
        if (typeof zip === 'undefined') {
            console.error('zip.js library not loaded');
            this.showError('ZIP extraction library not available. Please refresh the page.');
            this.isLoading = false;
            this.updateLoadingState(false);
            return;
        }
        
        let urlToTry = bookUrl;
        
        try {
            console.log('Loading EPUB from:', urlToTry);
            await this.loadSimpleEpubReader(urlToTry);
            console.log('EPUB loaded successfully');
        } catch (error) {
            console.error('Error loading EPUB:', error);
            // Try fallback URL if primary failed
            if (urlToTry === bookUrl && fallbackUrl) {
                console.log('Trying fallback URL after primary failure');
                try {
                    await this.loadSimpleEpubReader(fallbackUrl);
                    console.log('EPUB loaded successfully from fallback URL');
                } catch (fallbackError) {
                    console.error('Fallback URL also failed:', fallbackError);
                    this.showError(`Failed to load EPUB: ${error.message}`);
                }
            } else {
                this.showError(`Failed to load EPUB: ${error.message}`);
            }
        } finally {
            this.isLoading = false;
            this.updateLoadingState(false);
        }
    }

    async loadSimpleEpubReader(bookUrl) {
        const container = document.getElementById('epub-container');
        if (!container) {
            throw new Error('EPUB container not found');
        }

        try {
            // Fetch the EPUB file
            const response = await fetch(bookUrl);
            if (!response.ok) {
                throw new Error(`Failed to fetch EPUB: ${response.statusText}`);
            }

            const arrayBuffer = await response.arrayBuffer();
            
            // Extract EPUB content using zip.js
            const reader = new zip.ZipReader(new zip.Uint8ArrayReader(new Uint8Array(arrayBuffer)));
            const entries = await reader.getEntries();
            
            // Find content.opf to get the reading order
            let contentOpf = null;
            let opfPath = '';
            
            for (const entry of entries) {
                if (entry.filename.endsWith('.opf') || entry.filename.includes('content.opf')) {
                    contentOpf = await entry.getData(new zip.TextWriter());
                    opfPath = entry.filename.split('/').slice(0, -1).join('/');
                    if (opfPath) opfPath += '/';
                    break;
                }
            }

            if (!contentOpf) {
                throw new Error('Could not find EPUB content file');
            }

            // Parse the OPF to get reading order
            const parser = new DOMParser();
            const opfDoc = parser.parseFromString(contentOpf, 'text/xml');
            const spine = opfDoc.querySelector('spine');
            const manifest = opfDoc.querySelector('manifest');
            
            if (!spine || !manifest) {
                throw new Error('Invalid EPUB structure');
            }

            // Get ordered list of content files
            const spineItems = Array.from(spine.querySelectorAll('itemref'));
            const manifestItems = {};
            
            Array.from(manifest.querySelectorAll('item')).forEach(item => {
                manifestItems[item.getAttribute('id')] = item.getAttribute('href');
            });

            // Extract and display the first chapter
            if (spineItems.length > 0) {
                const firstItemId = spineItems[0].getAttribute('idref');
                const firstItemHref = manifestItems[firstItemId];
                
                if (firstItemHref) {
                    const fullPath = opfPath + firstItemHref;
                    const contentEntry = entries.find(e => e.filename === fullPath);
                    
                    if (contentEntry) {
                        const content = await contentEntry.getData(new zip.TextWriter());
                        this.displayContent(content, entries, opfPath, manifestItems, spineItems, 0);
                    } else {
                        throw new Error('Could not find first chapter content');
                    }
                }
            }

            await reader.close();
            
        } catch (error) {
            console.error('Error in simple EPUB reader:', error);
            // Fallback to basic display
            container.innerHTML = `
                <div class="epub-simple-viewer">
                    <div class="epub-error">
                        <h3>EPUB Display</h3>
                        <p>This EPUB file cannot be fully rendered, but you can download it to read in a dedicated EPUB reader.</p>
                        <a href="${bookUrl}" download class="download-btn">
                            <i class="fas fa-download"></i> Download EPUB
                        </a>
                        <div class="epub-info">
                            <p><strong>File:</strong> ${bookUrl.split('/').pop()}</p>
                            <p><strong>Type:</strong> EPUB eBook</p>
                        </div>
                    </div>
                </div>
            `;
        }
    }

    displayContent(htmlContent, entries, basePath, manifestItems, spineItems, currentIndex) {
        const container = document.getElementById('epub-container');
        
        // Clean up the HTML content
        const cleanContent = htmlContent
            .replace(/<\?xml[^>]*\?>/gi, '')
            .replace(/<!DOCTYPE[^>]*>/gi, '')
            .replace(/<html[^>]*>/gi, '<div>')
            .replace(/<\/html>/gi, '</div>')
            .replace(/<head[^>]*>.*?<\/head>/gis, '')
            .replace(/<body[^>]*>/gi, '<div>')
            .replace(/<\/body>/gi, '</div>');

        container.innerHTML = `
            <div class="epub-simple-viewer">
                <div class="epub-controls">
                    <button onclick="epubReader.previousChapter()" ${currentIndex === 0 ? 'disabled' : ''}>
                        <i class="fas fa-chevron-left"></i> Previous
                    </button>
                    <span class="chapter-info">Chapter ${currentIndex + 1} of ${spineItems.length}</span>
                    <button onclick="epubReader.nextChapter()" ${currentIndex >= spineItems.length - 1 ? 'disabled' : ''}>
                        Next <i class="fas fa-chevron-right"></i>
                    </button>
                </div>
                <div class="epub-content">
                    ${cleanContent}
                </div>
            </div>
        `;

        // Store data for navigation
        this.entries = entries;
        this.basePath = basePath;
        this.manifestItems = manifestItems;
        this.spineItems = spineItems;
        this.currentIndex = currentIndex;
    }

    async nextChapter() {
        if (this.currentIndex < this.spineItems.length - 1) {
            this.currentIndex++;
            await this.loadChapter(this.currentIndex);
        }
    }

    async previousChapter() {
        if (this.currentIndex > 0) {
            this.currentIndex--;
            await this.loadChapter(this.currentIndex);
        }
    }

    async loadChapter(index) {
        const itemId = this.spineItems[index].getAttribute('idref');
        const itemHref = this.manifestItems[itemId];
        
        if (itemHref) {
            const fullPath = this.basePath + itemHref;
            const contentEntry = this.entries.find(e => e.filename === fullPath);
            
            if (contentEntry) {
                const content = await contentEntry.getData(new zip.TextWriter());
                this.displayContent(content, this.entries, this.basePath, this.manifestItems, this.spineItems, index);
            }
        }
    }

    updateLoadingState(isLoading) {
        const loadingElement = document.getElementById('epub-loading');
        if (loadingElement) {
            loadingElement.style.display = isLoading ? 'block' : 'none';
        }
    }

    showError(message) {
        const container = document.getElementById('epub-container');
        if (container) {
            container.innerHTML = `
                <div class="epub-error-container">
                    <div class="epub-error">
                        <i class="fas fa-exclamation-triangle"></i>
                        <h3>Unable to Load EPUB</h3>
                        <p>${message}</p>
                        <button onclick="window.history.back()" class="back-btn">
                            <i class="fas fa-arrow-left"></i> Go Back
                        </button>
                    </div>
                </div>
            `;
        }
    }

    destroy() {
        this.entries = null;
        this.manifestItems = {};
        this.spineItems = [];
        this.currentIndex = 0;
    }
}

// Global instance
let epubReader = null;

// Initialize EPUB reader when document is ready
document.addEventListener('DOMContentLoaded', function() {
    epubReader = new EPUBReader();
});
