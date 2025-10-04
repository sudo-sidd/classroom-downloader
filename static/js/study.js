// Main Study Interface Controller
class StudyApp {
    constructor() {
        this.currentMaterial = null;
        this.currentViewer = null;
        this.materials = [];
        this.courses = [];
        this.isNotesOpen = false;
        this.isChatOpen = false;
        
        this.init();
    }

    async init() {
        await this.loadMaterials();
        await this.loadCourses();
        this.setupEventListeners();
        this.setupPanels();
    }

    setupEventListeners() {
        // Header controls
        document.getElementById('toggle-notes-btn').addEventListener('click', () => {
            this.toggleNotesPanel();
        });
        
        document.getElementById('toggle-chat-btn').addEventListener('click', () => {
            this.toggleChatPanel();
        });
        
        document.getElementById('fullscreen-btn').addEventListener('click', () => {
            this.toggleFullscreen();
        });

        // File browser controls
        document.getElementById('refresh-files-btn').addEventListener('click', () => {
            this.loadMaterials();
        });
        
        document.getElementById('file-search').addEventListener('input', (e) => {
            this.filterFiles(e.target.value);
        });
        
        document.getElementById('course-filter').addEventListener('change', (e) => {
            this.filterByCourse(e.target.value);
        });

        // Type filters
        document.querySelectorAll('.type-filter').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.setActiveTypeFilter(e.target);
                this.filterByType(e.target.dataset.type);
            });
        });

        // Panel close buttons
        document.getElementById('close-notes-btn').addEventListener('click', () => {
            this.closeNotesPanel();
        });
        
        document.getElementById('close-chat-btn').addEventListener('click', () => {
            this.closeChatPanel();
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            this.handleKeyboardShortcuts(e);
        });

        // Window resize
        window.addEventListener('resize', () => {
            this.handleResize();
        });
    }

    setupPanels() {
        // Initialize panels as closed
        this.closeNotesPanel();
        this.closeChatPanel();
    }

    async loadMaterials() {
        try {
            const response = await fetch('/api/materials');
            if (response.ok) {
                const data = await response.json();
                // Handle both formats: direct array or object with materials property
                this.materials = Array.isArray(data) ? data : (data.materials || []);
                this.renderFileList();
            } else {
                console.error('Failed to load materials');
                this.showError('Failed to load materials');
            }
        } catch (error) {
            console.error('Error loading materials:', error);
            this.showError('Error loading materials');
        }
    }

    async loadCourses() {
        try {
            const response = await fetch('/api/courses');
            if (response.ok) {
                this.courses = await response.json();
                this.renderCourseFilter();
            }
        } catch (error) {
            console.error('Error loading courses:', error);
        }
    }

    renderFileList(filteredMaterials = null) {
        const fileList = document.getElementById('file-list');
        const materials = filteredMaterials || this.materials;
        
        if (materials.length === 0) {
            fileList.innerHTML = '<div class="loading">No materials found</div>';
            return;
        }

        fileList.innerHTML = materials.map(material => `
            <div class="file-item" data-material-id="${material.id}" onclick="studyApp.openMaterial(${material.id})">
                <div class="file-icon">
                    <i class="fas ${this.getFileIcon(material.mime_type)}"></i>
                </div>
                <div class="file-info">
                    <div class="file-name">${material.title}</div>
                    <div class="file-meta">${material.course_name} • ${this.formatFileSize(material.file_size)}</div>
                </div>
            </div>
        `).join('');
    }

    renderCourseFilter() {
        const courseFilter = document.getElementById('course-filter');
        courseFilter.innerHTML = '<option value="">All Courses</option>';
        
        this.courses.forEach(course => {
            courseFilter.innerHTML += `<option value="${course.id}">${course.name}</option>`;
        });
    }

    getFileIcon(mimeType) {
        if (mimeType.includes('pdf')) return 'fa-file-pdf';
        if (mimeType.includes('image')) return 'fa-file-image';
        if (mimeType.includes('video')) return 'fa-file-video';
        if (mimeType.includes('audio')) return 'fa-file-audio';
        if (mimeType.includes('document') || mimeType.includes('msword')) return 'fa-file-word';
        if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return 'fa-file-powerpoint';
        if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return 'fa-file-excel';
        if (mimeType.includes('epub')) return 'fa-book';
        if (mimeType.includes('text')) return 'fa-file-alt';
        return 'fa-file';
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    async openMaterial(materialId) {
        this.showLoading();
        
        try {
            const material = this.materials.find(m => m.id === materialId);
            if (!material) {
                throw new Error('Material not found');
            }

            this.currentMaterial = material;
            this.updateActiveFile(materialId);
            this.updateDocumentTitle(material.title);
            
            // Hide welcome screen
            document.getElementById('welcome-screen').style.display = 'none';
            
            // Determine viewer type based on mime type
            const viewerType = this.getViewerType(material.mime_type);
            await this.loadViewer(viewerType, material);
            
            // Load existing notes and study session
            await this.loadMaterialNotes(materialId);
            await this.loadStudySession(materialId);
            
            this.hideLoading();
        } catch (error) {
            console.error('Error opening material:', error);
            this.showError('Error opening document');
            this.hideLoading();
        }
    }

    getViewerType(mimeType) {
        if (mimeType.includes('pdf')) return 'pdf';
        if (mimeType.includes('epub')) return 'epub';
        if (mimeType.includes('image')) return 'image';
        if (mimeType.includes('video')) return 'video';
        if (mimeType.includes('audio')) return 'video'; // Use video player for audio
        if (mimeType.includes('text')) return 'text';
        return 'text'; // Default fallback
    }

    async loadViewer(viewerType, material) {
        // Hide all viewers
        document.querySelectorAll('.document-viewer').forEach(viewer => {
            viewer.style.display = 'none';
        });

        this.currentViewer = viewerType;
        const viewer = document.getElementById(`${viewerType}-viewer`);
        viewer.style.display = 'flex';

        // Load content based on viewer type
        switch (viewerType) {
            case 'pdf':
                await this.loadPDFViewer(material);
                break;
            case 'epub':
                await this.loadEPUBViewer(material);
                break;
            case 'image':
                await this.loadImageViewer(material);
                break;
            case 'video':
                await this.loadVideoViewer(material);
                break;
            case 'text':
                await this.loadTextViewer(material);
                break;
        }
    }

    async loadPDFViewer(material) {
        if (window.PDFViewer) {
            // Try API route first, fallback to direct file serving
            const apiUrl = `/api/file/${material.id}`;
            const directUrl = this.getDirectFileUrl(material);
            window.PDFViewer.loadDocument(apiUrl, directUrl);
        }
    }

    async loadEPUBViewer(material) {
        if (window.EPUBReader) {
            const apiUrl = `/api/file/${material.id}`;
            const directUrl = this.getDirectFileUrl(material);
            window.EPUBReader.loadBook(apiUrl, directUrl);
        }
    }

    async loadImageViewer(material) {
        const img = document.getElementById('image-content');
        const apiUrl = `/api/file/${material.id}`;
        const directUrl = this.getDirectFileUrl(material);
        
        // Try API route first
        img.src = apiUrl;
        img.alt = material.title;
        img.onerror = () => {
            // Fallback to direct file serving
            if (directUrl) {
                img.src = directUrl;
            }
        };
    }

    async loadVideoViewer(material) {
        const video = document.getElementById('video-player');
        const apiUrl = `/api/file/${material.id}`;
        const directUrl = this.getDirectFileUrl(material);
        
        // Try API route first
        video.src = apiUrl;
        video.onerror = () => {
            // Fallback to direct file serving
            if (directUrl) {
                video.src = directUrl;
            }
        };
    }

    getDirectFileUrl(material) {
        // Convert absolute path to relative URL
        if (material.local_path) {
            const relativePath = material.local_path.replace('/projects/classroom-downloader/downloads/', '');
            return `/files/${relativePath}`;
        }
        return null;
    }

    async loadTextViewer(material) {
        try {
            const response = await fetch(`/api/file/${material.id}`);
            const text = await response.text();
            document.getElementById('text-content').textContent = text;
        } catch (error) {
            console.error('Error loading text content:', error);
            document.getElementById('text-content').textContent = 'Error loading content';
        }
    }

    updateActiveFile(materialId) {
        document.querySelectorAll('.file-item').forEach(item => {
            item.classList.remove('active');
        });
        
        const activeItem = document.querySelector(`[data-material-id="${materialId}"]`);
        if (activeItem) {
            activeItem.classList.add('active');
        }
    }

    updateDocumentTitle(title) {
        document.getElementById('current-document-title').textContent = title;
    }

    async loadMaterialNotes(materialId) {
        if (window.NotesManager) {
            await window.NotesManager.loadNotes(materialId);
        }
    }

    async loadStudySession(materialId) {
        try {
            const response = await fetch(`/api/study-session/${materialId}`);
            if (response.ok) {
                const session = await response.json();
                // Apply session data (bookmarks, progress, etc.)
                this.applyStudySession(session);
            }
        } catch (error) {
            console.error('Error loading study session:', error);
        }
    }

    applyStudySession(session) {
        // This will be implemented based on the specific viewer
        console.log('Applying study session:', session);
    }

    // Panel management
    toggleNotesPanel() {
        if (this.isNotesOpen) {
            this.closeNotesPanel();
        } else {
            this.openNotesPanel();
        }
    }

    openNotesPanel() {
        const panel = document.getElementById('notes-panel');
        panel.classList.add('open');
        this.isNotesOpen = true;
        
        // Close chat panel if open
        if (this.isChatOpen) {
            this.closeChatPanel();
        }
        
        // Update button state
        document.getElementById('toggle-notes-btn').classList.add('active');
    }

    closeNotesPanel() {
        const panel = document.getElementById('notes-panel');
        panel.classList.remove('open');
        this.isNotesOpen = false;
        document.getElementById('toggle-notes-btn').classList.remove('active');
    }

    toggleChatPanel() {
        if (this.isChatOpen) {
            this.closeChatPanel();
        } else {
            this.openChatPanel();
        }
    }

    openChatPanel() {
        const panel = document.getElementById('chat-panel');
        panel.classList.add('open');
        this.isChatOpen = true;
        
        // Close notes panel if open
        if (this.isNotesOpen) {
            this.closeNotesPanel();
        }
        
        // Update button state
        document.getElementById('toggle-chat-btn').classList.add('active');
        
        // Initialize chat if needed
        if (window.ChatAssistant) {
            window.ChatAssistant.initialize();
        }
    }

    closeChatPanel() {
        const panel = document.getElementById('chat-panel');
        panel.classList.remove('open');
        this.isChatOpen = false;
        document.getElementById('toggle-chat-btn').classList.remove('active');
    }

    // Filtering
    filterFiles(searchTerm) {
        const filtered = this.materials.filter(material => 
            material.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
            material.course_name.toLowerCase().includes(searchTerm.toLowerCase())
        );
        this.renderFileList(filtered);
    }

    filterByCourse(courseId) {
        if (!courseId) {
            this.renderFileList();
            return;
        }
        
        const filtered = this.materials.filter(material => material.course_id === courseId);
        this.renderFileList(filtered);
    }

    filterByType(type) {
        if (!type) {
            this.renderFileList();
            return;
        }
        
        const filtered = this.materials.filter(material => {
            const mimeType = material.mime_type.toLowerCase();
            switch (type) {
                case 'pdf':
                    return mimeType.includes('pdf');
                case 'epub':
                    return mimeType.includes('epub');
                case 'image':
                    return mimeType.includes('image');
                case 'video':
                    return mimeType.includes('video');
                case 'document':
                    return mimeType.includes('document') || mimeType.includes('msword') || 
                           mimeType.includes('presentation') || mimeType.includes('spreadsheet');
                default:
                    return true;
            }
        });
        this.renderFileList(filtered);
    }

    setActiveTypeFilter(activeBtn) {
        document.querySelectorAll('.type-filter').forEach(btn => {
            btn.classList.remove('active');
        });
        activeBtn.classList.add('active');
    }

    // Utilities
    toggleFullscreen() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen();
        } else {
            document.exitFullscreen();
        }
    }

    handleKeyboardShortcuts(e) {
        // Ctrl/Cmd + N: Toggle notes
        if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
            e.preventDefault();
            this.toggleNotesPanel();
        }
        
        // Ctrl/Cmd + K: Toggle chat
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            this.toggleChatPanel();
        }
        
        // F11: Toggle fullscreen
        if (e.key === 'F11') {
            e.preventDefault();
            this.toggleFullscreen();
        }
        
        // Escape: Close panels
        if (e.key === 'Escape') {
            if (this.isNotesOpen) this.closeNotesPanel();
            if (this.isChatOpen) this.closeChatPanel();
        }
    }

    handleResize() {
        // Handle responsive behavior
        const isMobile = window.innerWidth <= 768;
        
        if (isMobile && (this.isNotesOpen || this.isChatOpen)) {
            // On mobile, panels should overlay
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'auto';
        }
    }

    showLoading() {
        document.getElementById('loading-overlay').style.display = 'flex';
    }

    hideLoading() {
        document.getElementById('loading-overlay').style.display = 'none';
    }

    showError(message) {
        // Simple error display - could be enhanced with a toast system
        alert(message);
    }
}

// Initialize the app when DOM is loaded
let studyApp;
document.addEventListener('DOMContentLoaded', () => {
    studyApp = new StudyApp();
});

// Export for use by other modules
window.StudyApp = StudyApp;
