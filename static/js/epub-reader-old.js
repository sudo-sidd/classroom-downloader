// EPUB Reader using EPUB.js
class EPUBReader {
    constructor() {
        this.book = null;
        this.rendition = null;
        this.currentCfi = null;
        this.currentProgress = 0;
        this.isLoading = false;
        this.fontSize = 16;
        this.currentTheme = 'default';
        this.themes = {
            default: {
                body: { 'color': '#000', 'background': '#fff' }
            },
            dark: {
                body: { 'color': '#fff', 'background': '#222' }
            },
            sepia: {
                body: { 'color': '#5c4b37', 'background': '#f7f3e9' }
            }
        };
        
        this.setupEventListeners();
        
        // Check if EPUB.js is available
        this.checkLibraryAvailability();
    }
    
    checkLibraryAvailability() {
        if (typeof ePub === 'undefined') {
            console.warn('EPUB.js library not loaded. EPUB reading will not be available.');
            return false;
        }
        console.log('EPUB.js library loaded successfully');
        return true;
    }

    setupEventListeners() {
        // Navigation buttons
        document.getElementById('epub-prev').addEventListener('click', () => {
            this.prevPage();
        });
        
        document.getElementById('epub-next').addEventListener('click', () => {
            this.nextPage();
        });
        
        // Font size controls
        document.getElementById('epub-font-size-up').addEventListener('click', () => {
            this.increaseFontSize();
        });
        
        document.getElementById('epub-font-size-down').addEventListener('click', () => {
            this.decreaseFontSize();
        });
        
        // Table of contents
        document.getElementById('epub-toc').addEventListener('click', () => {
            this.toggleTableOfContents();
        });
        
        // Keyboard navigation
        document.addEventListener('keydown', (e) => {
            if (this.isActive()) {
                this.handleKeyPress(e);
            }
        });
    }

    isActive() {
        return document.getElementById('epub-viewer').style.display !== 'none';
    }

    async loadBook(bookUrl, fallbackUrl = null) {
        if (this.isLoading) return;
        
        this.isLoading = true;
        this.updateLoadingState(true);
        
        // Check if EPUB.js is available
        if (typeof ePub === 'undefined') {
            console.error('EPUB.js library not loaded');
            this.showError('EPUB.js library not available. Please refresh the page.');
            this.isLoading = false;
            this.updateLoadingState(false);
            return;
        }
        
        let urlToTry = bookUrl;
        
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
            
            // Try to load as a simple reader first
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
            this.updateLoadingState(false);
        }
    }

    setupRenditionEventListeners() {
        // Track location changes
        this.rendition.on('locationChanged', (location) => {
            this.currentCfi = location.start.cfi;
            this.updateProgress();
            this.saveProgress();
        });
        
        // Handle text selection
        this.rendition.on('selected', (cfiRange, contents) => {
            const selectedText = contents.window.getSelection().toString();
            if (selectedText.trim()) {
                this.handleTextSelection(cfiRange, selectedText);
            }
        });
        
        // Handle clicks for annotations
        this.rendition.on('click', (event) => {
            // Could be used for adding click-based annotations
        });
    }

    async loadBookMetadata() {
        try {
            await this.book.ready;
            
            this.metadata = {
                title: this.book.package.metadata.title,
                author: this.book.package.metadata.creator,
                description: this.book.package.metadata.description,
                language: this.book.package.metadata.language,
                publisher: this.book.package.metadata.publisher
            };
            
            // Update UI with metadata
            this.updateMetadataDisplay();
        } catch (error) {
            console.error('Error loading book metadata:', error);
        }
    }

    async loadTableOfContents() {
        try {
            this.toc = await this.book.navigation.toc;
            this.createTableOfContentsUI();
        } catch (error) {
            console.error('Error loading table of contents:', error);
        }
    }

    // Navigation methods
    async prevPage() {
        if (this.rendition) {
            await this.rendition.prev();
        }
    }

    async nextPage() {
        if (this.rendition) {
            await this.rendition.next();
        }
    }

    async goToChapter(href) {
        if (this.rendition) {
            await this.rendition.display(href);
        }
    }

    async goToLocation(cfi) {
        if (this.rendition) {
            await this.rendition.display(cfi);
        }
    }

    // Font and theme controls
    increaseFontSize() {
        this.fontSize = Math.min(this.fontSize + 2, 24);
        this.rendition.themes.fontSize(`${this.fontSize}px`);
        this.saveSettings();
    }

    decreaseFontSize() {
        this.fontSize = Math.max(this.fontSize - 2, 12);
        this.rendition.themes.fontSize(`${this.fontSize}px`);
        this.saveSettings();
    }

    changeTheme(theme) {
        if (this.themes[theme]) {
            this.currentTheme = theme;
            this.rendition.themes.select(theme);
            this.saveSettings();
        }
    }

    // Table of Contents
    toggleTableOfContents() {
        const tocPanel = document.getElementById('epub-toc-panel');
        if (tocPanel) {
            tocPanel.classList.toggle('open');
        } else {
            this.createTableOfContentsPanel();
        }
    }

    createTableOfContentsUI() {
        // Create TOC panel if it doesn't exist
        if (!document.getElementById('epub-toc-panel')) {
            this.createTableOfContentsPanel();
        }
        
        const tocList = document.getElementById('epub-toc-list');
        if (tocList && this.toc) {
            tocList.innerHTML = this.toc.map(item => `
                <div class="toc-item" onclick="epubReader.goToChapter('${item.href}')">
                    <span class="toc-label">${item.label}</span>
                </div>
            `).join('');
        }
    }

    createTableOfContentsPanel() {
        const panel = document.createElement('div');
        panel.id = 'epub-toc-panel';
        panel.className = 'epub-toc-panel';
        panel.innerHTML = `
            <div class="toc-header">
                <h3>Table of Contents</h3>
                <button class="close-toc" onclick="document.getElementById('epub-toc-panel').classList.remove('open')">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="toc-content">
                <div id="epub-toc-list" class="toc-list"></div>
            </div>
        `;
        
        document.getElementById('epub-viewer').appendChild(panel);
        this.createTableOfContentsUI();
    }

    // Progress tracking
    updateProgress() {
        if (this.book && this.currentCfi) {
            const progress = this.book.locations.percentageFromCfi(this.currentCfi);
            this.currentProgress = progress * 100;
            
            document.getElementById('epub-progress').textContent = `${Math.round(this.currentProgress)}%`;
        }
    }

    async saveProgress() {
        if (!window.studyApp || !window.studyApp.currentMaterial) return;
        
        const progressData = {
            material_id: window.studyApp.currentMaterial.id,
            progress_percentage: this.currentProgress,
            last_position: JSON.stringify({
                cfi: this.currentCfi,
                progress: this.currentProgress
            }),
            reading_time: this.getReadingTime()
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

    // Settings persistence
    saveSettings() {
        const settings = {
            fontSize: this.fontSize,
            theme: this.currentTheme
        };
        
        localStorage.setItem('epub-reader-settings', JSON.stringify(settings));
    }

    loadSettings() {
        try {
            const settings = JSON.parse(localStorage.getItem('epub-reader-settings') || '{}');
            this.fontSize = settings.fontSize || 16;
            this.currentTheme = settings.theme || 'default';
        } catch (error) {
            console.error('Error loading settings:', error);
        }
    }

    // Text selection and annotations
    handleTextSelection(cfiRange, selectedText) {
        // Create annotation options
        if (window.NotesManager) {
            window.NotesManager.showAnnotationDialog(event, selectedText, {
                cfiRange: cfiRange,
                type: 'epub'
            });
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
            case '+':
            case '=':
                if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    this.increaseFontSize();
                }
                break;
            case '-':
                if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    this.decreaseFontSize();
                }
                break;
            case 't':
                if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    this.toggleTableOfContents();
                }
                break;
        }
    }

    // Utility methods
    updateLoadingState(isLoading) {
        const buttons = document.querySelectorAll('#epub-viewer .tool-btn');
        buttons.forEach(btn => btn.disabled = isLoading);
        
        const container = document.getElementById('epub-container');
        if (isLoading) {
            container.innerHTML = '<div class="epub-loading">Loading book...</div>';
        }
    }

    updateMetadataDisplay() {
        // This could be used to display book info in the UI
        console.log('Book metadata:', this.metadata);
    }

    showError(message) {
        console.error('EPUB Reader Error:', message);
        const container = document.getElementById('epub-container');
        if (container) {
            container.innerHTML = `
                <div class="epub-error" style="text-align: center; padding: 40px; color: #666;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 48px; color: #ff6b6b; margin-bottom: 20px;"></i>
                    <h3 style="margin-bottom: 10px;">Error Loading EPUB</h3>
                    <p style="margin-bottom: 20px;">${message}</p>
                    <div class="error-details" style="background: #f5f5f5; padding: 10px; border-radius: 5px; margin-bottom: 20px;">
                        <p><strong>EPUB.js Available:</strong> ${typeof ePub !== 'undefined' ? 'Yes' : 'No'}</p>
                        <p><strong>Container Found:</strong> ${container ? 'Yes' : 'No'}</p>
                    </div>
                    <button onclick="location.reload()" class="retry-btn" style="background: #4285f4; color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer;">
                        <i class="fas fa-refresh"></i> Retry
                    </button>
                </div>
            `;
        }
    }

    getReadingTime() {
        // Simple reading time calculation
        // This could be enhanced to track actual reading time
        return Math.floor(Date.now() / 1000);
    }

    // Get current content for AI context
    async getCurrentContent() {
        if (this.rendition && this.rendition.manager && this.rendition.manager.current) {
            try {
                const contents = this.rendition.manager.current.contents;
                const textContent = contents.document.body.textContent || '';
                return textContent.substring(0, 2000); // Limit for context
            } catch (error) {
                console.error('Error getting current content:', error);
                return '';
            }
        }
        return '';
    }

    // Get book info for AI context
    getBookInfo() {
        return {
            metadata: this.metadata,
            progress: this.currentProgress,
            currentLocation: this.currentCfi
        };
    }
}

// Initialize EPUB reader
document.addEventListener('DOMContentLoaded', () => {
    window.EPUBReader = new EPUBReader();
});

// Add CSS for TOC panel
const tocStyles = `
    .epub-toc-panel {
        position: absolute;
        top: 60px;
        left: -300px;
        width: 300px;
        height: calc(100% - 60px);
        background: white;
        border-right: 1px solid var(--border-color);
        z-index: 1000;
        transition: left 0.3s ease;
        display: flex;
        flex-direction: column;
    }
    
    .epub-toc-panel.open {
        left: 0;
    }
    
    .toc-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 20px;
        border-bottom: 1px solid var(--border-color);
    }
    
    .toc-header h3 {
        margin: 0;
        font-size: 1.1rem;
    }
    
    .close-toc {
        background: none;
        border: none;
        font-size: 1.2rem;
        cursor: pointer;
        color: #666;
        padding: 5px;
    }
    
    .toc-content {
        flex: 1;
        overflow-y: auto;
    }
    
    .toc-item {
        padding: 12px 20px;
        cursor: pointer;
        border-bottom: 1px solid #f0f0f0;
        transition: background-color 0.2s;
    }
    
    .toc-item:hover {
        background-color: var(--light-color);
    }
    
    .toc-label {
        font-size: 0.9rem;
        line-height: 1.4;
    }
    
    .epub-loading, .epub-error {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 100%;
        font-size: 1.1rem;
        color: #666;
    }
    
    .epub-error {
        color: var(--danger-color);
    }
`;

// Inject styles
const styleSheet = document.createElement('style');
styleSheet.textContent = tocStyles;
document.head.appendChild(styleSheet);

// Export for use by other modules
window.EPUBReader = window.EPUBReader || new EPUBReader();
