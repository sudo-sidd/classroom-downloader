// Classroom Downloader Frontend Application
class ClassroomDownloader {
    constructor() {
        this.isAuthenticated = false;
        this.courses = [];
        this.selectedCourses = new Set();
        this.downloadInProgress = false;
        this.progressUpdateInterval = null;
        
        // Subject organization state
        this.subjects = [];
        this.filesBySubject = {};
        this.selectedFiles = new Set();
        this.draggedFiles = [];
        this.isSubjectView = true;
        this.llmAvailable = false;
        
        this.init();
    }
    
    async init() {
        this.bindEvents();
        await this.checkStatus();
        await this.loadSettings();
        this.updateUI();
        
        // Load subject organization data
        if (this.isAuthenticated) {
            await this.loadSubjects();
            await this.loadFilesBySubject();
            await this.checkLLMStatus();
        }
    }
    
    bindEvents() {
        // Authentication
        document.getElementById('auth-btn').addEventListener('click', () => this.handleAuth());
        
        // Settings
        document.getElementById('update-settings-btn').addEventListener('click', () => this.updateSettings());
        
        // Courses
        document.getElementById('refresh-courses-btn')?.addEventListener('click', () => this.loadCourses());
        document.getElementById('select-all-courses')?.addEventListener('click', () => this.selectAllCourses());
        document.getElementById('deselect-all-courses')?.addEventListener('click', () => this.deselectAllCourses());
        
        // Date controls
        document.getElementById('clear-dates')?.addEventListener('click', () => this.clearDates());
        
        // Download
        document.getElementById('start-download-btn')?.addEventListener('click', () => this.startDownload());
        
        // Subject Organization Events
        this.bindSubjectEvents();
        
        // Statistics
        document.getElementById('refresh-stats-btn')?.addEventListener('click', () => this.loadStatistics());
        
        // Materials browser
        document.getElementById('search-btn')?.addEventListener('click', () => this.searchMaterials());
        document.getElementById('search-materials')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.searchMaterials();
        });
        
        // Load initial data
        this.loadStatistics();
        this.loadUncategorizedMaterials();
    }
    
    bindSubjectEvents() {
        // Subject management
        document.getElementById('add-subject-btn')?.addEventListener('click', () => this.showAddSubjectModal());
        document.getElementById('auto-classify-btn')?.addEventListener('click', () => this.showAutoClassifyModal());
        document.getElementById('llm-classify-btn')?.addEventListener('click', () => this.showLLMClassifyModal());
        document.getElementById('view-toggle-btn')?.addEventListener('click', () => this.toggleView());
        
        // Subject form
        document.getElementById('subject-form')?.addEventListener('submit', (e) => this.handleSubjectSubmit(e));
        
        // Auto-classify
        document.getElementById('confirm-auto-classify')?.addEventListener('click', () => this.performAutoClassification());
        document.getElementById('confidence-threshold')?.addEventListener('input', (e) => {
            document.getElementById('confidence-value').textContent = e.target.value;
        });
        
        // LLM classify
        document.getElementById('confirm-llm-classify')?.addEventListener('click', () => this.performLLMClassification());
        document.getElementById('llm-confidence-threshold')?.addEventListener('input', (e) => {
            document.getElementById('llm-confidence-value').textContent = e.target.value;
        });
        
        // Modal controls
        document.querySelectorAll('.close-modal').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const modalId = e.target.getAttribute('data-target') || 
                               e.target.closest('[data-target]')?.getAttribute('data-target') ||
                               e.target.closest('.modal').id;
                if (modalId) this.hideModal(modalId);
            });
        });
        
        // Click outside modal to close
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal')) {
                this.hideModal(e.target.id);
            }
        });
    }
    
    async checkStatus() {
        try {
            const response = await fetch('/api/status');
            const status = await response.json();
            
            this.isAuthenticated = status.authenticated;
            
            if (status.base_directory) {
                document.getElementById('base-directory').value = status.base_directory;
            }
            
            if (!status.credentials_file_exists) {
                this.showToast('Setup Required: Please add your credentials.json file', 'error');
            }
            
        } catch (error) {
            console.error('Error checking status:', error);
            this.showToast('Error connecting to server', 'error');
        }
    }
    
    async loadSettings() {
        try {
            const response = await fetch('/api/settings');
            const settings = await response.json();
            
            if (settings.base_directory) {
                document.getElementById('base-directory').value = settings.base_directory;
            }
            
            if (settings.max_concurrent_downloads) {
                document.getElementById('concurrent-downloads').value = settings.max_concurrent_downloads;
            }
            
        } catch (error) {
            console.error('Error loading settings:', error);
        }
    }
    
    async updateSettings() {
        const baseDir = document.getElementById('base-directory').value.trim();
        const maxConcurrent = parseInt(document.getElementById('concurrent-downloads').value);
        
        if (!baseDir) {
            this.showToast('Please enter a download directory', 'error');
            return;
        }
        
        try {
            this.showLoading('Updating settings...');
            
            const response = await fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    base_directory: baseDir,
                    max_concurrent_downloads: maxConcurrent
                })
            });
            
            const result = await response.json();
            
            if (response.ok) {
                this.showToast('Settings updated successfully', 'success');
                this.showStatusMessage('setup-status', 'Settings saved', 'success');
            } else {
                this.showToast(result.error || 'Failed to update settings', 'error');
            }
            
        } catch (error) {
            console.error('Error updating settings:', error);
            this.showToast('Error updating settings', 'error');
        } finally {
            this.hideLoading();
        }
    }
    
    async handleAuth() {
        if (this.isAuthenticated) {
            await this.logout();
        } else {
            await this.authenticate();
        }
    }
    
    async authenticate() {
        try {
            this.showLoading('Authenticating with Google...');
            
            // Prefer popup-based OAuth to avoid redirecting away
            const startResp = await fetch('/oauth2/start');
            const startData = await startResp.json();
            if (!startResp.ok || !startData.auth_url) {
                throw new Error(startData.error || 'Failed to start OAuth');
            }

            const popup = window.open(startData.auth_url, 'oauthPopup', 'width=550,height=700,menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=yes');
            if (!popup) {
                this.hideLoading();
                this.showToast('Popup blocked. Allow popups and try again.', 'error');
                return;
            }

            const onMessage = async (event) => {
                if (!event || !event.data || event.data.type !== 'oauth-result') return;
                window.removeEventListener('message', onMessage);
                this.hideLoading();
                if (event.data.status === 'success') {
                    this.isAuthenticated = true;
                    this.showToast('Authentication successful!', 'success');
                    await this.loadCourses();
                } else {
                    this.showToast(event.data.message || 'Authentication failed', 'error');
                }
                this.updateUI();
            };
            window.addEventListener('message', onMessage);
            
        } catch (error) {
            console.error('Authentication error:', error);
            this.showToast('Authentication error', 'error');
        } finally {
            // popup flow will hide loading on message
            this.updateUI();
        }
    }
    
    showManualAuthDialog(authUrl, instructions) {
        // Create modal dialog for manual authentication
        const modal = document.createElement('div');
        modal.id = 'auth-modal';
        modal.className = 'auth-modal';
        modal.innerHTML = `
            <div class="auth-modal-content">
                <h3>Manual Authentication Required</h3>
                <p>${instructions}</p>
                <div class="auth-steps">
                    <div class="auth-step">
                        <strong>Step 1:</strong> Click the button below to open the authorization page
                    </div>
                    <div class="auth-step">
                        <button id="open-auth-url" class="btn btn-primary">
                            <i class="fas fa-external-link-alt"></i> Open Authorization Page
                        </button>
                    </div>
                    <div class="auth-step">
                        <strong>Step 2:</strong> After authorizing, paste the authorization code here:
                    </div>
                    <div class="auth-step">
                        <input type="text" id="auth-code-input" placeholder="Paste authorization code here..." />
                        <button id="submit-auth-code" class="btn btn-primary">Submit Code</button>
                    </div>
                </div>
                <div class="auth-modal-actions">
                    <button id="cancel-auth" class="btn btn-secondary">Cancel</button>
                </div>
            </div>
            <div class="auth-modal-overlay"></div>
        `;
        
        document.body.appendChild(modal);
        
        // Add event listeners
        document.getElementById('open-auth-url').addEventListener('click', () => {
            window.open(authUrl, '_blank', 'width=600,height=700,scrollbars=yes,resizable=yes');
        });
        
        document.getElementById('submit-auth-code').addEventListener('click', () => {
            this.submitAuthCode();
        });
        
        document.getElementById('auth-code-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.submitAuthCode();
            }
        });
        
        document.getElementById('cancel-auth').addEventListener('click', () => {
            this.closeAuthModal();
        });
        
        document.querySelector('.auth-modal-overlay').addEventListener('click', () => {
            this.closeAuthModal();
        });
    }
    
    async submitAuthCode() {
        const authCode = document.getElementById('auth-code-input').value.trim();
        if (!authCode) {
            this.showToast('Please enter the authorization code', 'error');
            return;
        }
        
        try {
            this.showLoading('Completing authentication...');
            
            const response = await fetch('/api/authenticate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ auth_code: authCode })
            });
            
            const result = await response.json();
            
            if (response.ok && result.success) {
                this.isAuthenticated = true;
                this.showToast('Authentication successful!', 'success');
                this.closeAuthModal();
                await this.loadCourses();
            } else {
                this.showToast(result.message || 'Authentication failed', 'error');
            }
            
        } catch (error) {
            console.error('Authentication error:', error);
            this.showToast('Authentication error', 'error');
        } finally {
            this.hideLoading();
            this.updateUI();
        }
    }
    
    closeAuthModal() {
        const modal = document.getElementById('auth-modal');
        if (modal) {
            modal.remove();
        }
    }
    
    async logout() {
        try {
            const response = await fetch('/api/logout', { method: 'POST' });
            const result = await response.json();
            
            if (response.ok && result.success) {
                this.isAuthenticated = false;
                this.courses = [];
                this.selectedCourses.clear();
                this.showToast('Logged out successfully', 'info');
            } else {
                this.showToast(result.message || 'Logout failed', 'error');
            }
            
        } catch (error) {
            console.error('Logout error:', error);
            this.showToast('Logout error', 'error');
        } finally {
            this.updateUI();
        }
    }
    
    async loadCourses() {
        if (!this.isAuthenticated) return;
        
        try {
            this.showLoading('Loading courses...');
            
            const response = await fetch('/api/courses');
            const result = await response.json();
            
            if (response.ok) {
                this.courses = result.courses || [];
                this.renderCourses();
                this.showStatusMessage('courses-status', `Loaded ${this.courses.length} courses`, 'success');
                
                // Update course filter dropdown
                this.updateCourseFilter();
            } else {
                this.showToast(result.error || 'Failed to load courses', 'error');
            }
            
        } catch (error) {
            console.error('Error loading courses:', error);
            this.showToast('Error loading courses', 'error');
        } finally {
            this.hideLoading();
        }
    }
    
    renderCourses() {
        const container = document.getElementById('courses-list');
        
        if (this.courses.length === 0) {
            container.innerHTML = '<p class="help-text">No courses found.</p>';
            return;
        }
        
        container.innerHTML = this.courses.map(course => `
            <div class="course-item" onclick="app.toggleCourse('${course.id}')">
                <input type="checkbox" id="course-${course.id}" ${this.selectedCourses.has(course.id) ? 'checked' : ''}>
                <div class="course-info">
                    <h3>${this.escapeHtml(course.name)}</h3>
                    <p>${this.escapeHtml(course.section || '')}</p>
                    <p class="course-meta">
                        ${course.enrollmentCode ? `Code: ${course.enrollmentCode} • ` : ''}
                        ${course.courseState || 'Active'}
                    </p>
                </div>
            </div>
        `).join('');
    }
    
    updateCourseFilter() {
        const select = document.getElementById('filter-course');
        select.innerHTML = '<option value="">All Courses</option>';
        
        this.courses.forEach(course => {
            select.innerHTML += `<option value="${course.id}">${this.escapeHtml(course.name)}</option>`;
        });
    }
    
    toggleCourse(courseId) {
        const checkbox = document.getElementById(`course-${courseId}`);
        
        if (this.selectedCourses.has(courseId)) {
            this.selectedCourses.delete(courseId);
            checkbox.checked = false;
        } else {
            this.selectedCourses.add(courseId);
            checkbox.checked = true;
        }
        
        this.updateUI();
    }
    
    selectAllCourses() {
        this.courses.forEach(course => {
            this.selectedCourses.add(course.id);
            const checkbox = document.getElementById(`course-${course.id}`);
            if (checkbox) checkbox.checked = true;
        });
        this.updateUI();
    }
    
    deselectAllCourses() {
        this.selectedCourses.clear();
        this.courses.forEach(course => {
            const checkbox = document.getElementById(`course-${course.id}`);
            if (checkbox) checkbox.checked = false;
        });
        this.updateUI();
    }
    
    clearDates() {
        document.getElementById('start-date').value = '';
        document.getElementById('end-date').value = '';
    }
    
    async startDownload() {
        if (this.selectedCourses.size === 0) {
            this.showToast('Please select at least one course', 'error');
            return;
        }
        
        const startDate = document.getElementById('start-date').value;
        const endDate = document.getElementById('end-date').value;
        
        try {
            this.downloadInProgress = true;
            this.updateUI();
            
            const response = await fetch('/api/download', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    course_ids: Array.from(this.selectedCourses),
                    start_date: startDate ? startDate + 'T00:00:00Z' : null,
                    end_date: endDate ? endDate + 'T23:59:59Z' : null
                })
            });
            
            const result = await response.json();
            
            if (response.ok && result.success) {
                this.showToast('Download started!', 'success');
                this.showProgressContainer();
                this.startProgressUpdates();
            } else {
                this.downloadInProgress = false;
                this.showToast(result.error || 'Failed to start download', 'error');
            }
            
        } catch (error) {
            console.error('Download error:', error);
            this.downloadInProgress = false;
            this.showToast('Error starting download', 'error');
        } finally {
            this.updateUI();
        }
    }
    
    showProgressContainer() {
        document.getElementById('progress-container').style.display = 'block';
    }
    
    startProgressUpdates() {
        this.progressUpdateInterval = setInterval(() => {
            this.updateProgress();
        }, 1000);
    }
    
    async updateProgress() {
        try {
            const response = await fetch('/api/download/status');
            const status = await response.json();
            
            if (response.ok) {
                this.renderProgress(status);
                
                if (status.is_complete || !status.is_active) {
                    this.downloadInProgress = false;
                    this.stopProgressUpdates();
                    
                    if (status.is_complete) {
                        this.showToast('Download completed!', 'success');
                        await this.loadStatistics();
                    }
                    
                    this.updateUI();
                }
            }
            
        } catch (error) {
            console.error('Error updating progress:', error);
        }
    }
    
    renderProgress(status) {
        // Update message
        const message = status.current_file ? 
            `Processing: ${status.current_file}` : 
            status.message || 'Processing...';
        document.getElementById('progress-message').textContent = message;
        
        // Update file counts
        const completedFiles = status.completed_files || 0;
        const totalFiles = status.total_files || 0;
        const duplicatesSkipped = status.duplicates_skipped || 0;
        
        document.getElementById('progress-files').textContent = 
            `${completedFiles + duplicatesSkipped} / ${totalFiles} files`;
        
        // Update percentage
        const percentage = status.overall_progress || 0;
        document.getElementById('progress-percentage').textContent = `${Math.round(percentage)}%`;
        document.getElementById('progress-fill').style.width = `${percentage}%`;
        
        // Update current file
        document.getElementById('current-file-name').textContent = 
            status.current_file || '-';
        
        // Show errors if any
        const errors = status.errors || [];
        const errorsContainer = document.getElementById('download-errors');
        const errorsList = document.getElementById('error-list');
        
        if (errors.length > 0) {
            errorsContainer.style.display = 'block';
            errorsList.innerHTML = errors.map(error => 
                `<li>${this.escapeHtml(error)}</li>`
            ).join('');
        } else {
            errorsContainer.style.display = 'none';
        }
    }
    
    stopProgressUpdates() {
        if (this.progressUpdateInterval) {
            clearInterval(this.progressUpdateInterval);
            this.progressUpdateInterval = null;
        }
    }
    
    async loadStatistics() {
        try {
            const response = await fetch('/api/statistics');
            const stats = await response.json();
            
            if (response.ok) {
                this.renderStatistics(stats);
            } else {
                console.error('Failed to load statistics:', stats.error);
            }
            
        } catch (error) {
            console.error('Error loading statistics:', error);
        }
    }
    
    renderStatistics(stats) {
        const db = stats.database || {};
        const fs = stats.filesystem || {};
        
        document.getElementById('total-files').textContent = 
            db.total_materials || 0;
        
        document.getElementById('total-size').textContent = 
            this.formatFileSize(fs.total_size || 0);
        
        document.getElementById('course-count').textContent = 
            Object.keys(fs.courses || {}).length;
        
        document.getElementById('uncategorized-files').textContent = 
            db.uncategorized || 0;
    }
    
    async searchMaterials() {
        const query = document.getElementById('search-materials').value.trim();
        const courseId = document.getElementById('filter-course').value;
        const mimeType = document.getElementById('filter-type').value;
        
        try {
            this.showLoading('Searching materials...');
            
            const params = new URLSearchParams();
            if (query) params.append('search', query);
            if (courseId) params.append('course_id', courseId);
            if (mimeType) params.append('mime_type', mimeType);
            
            const response = await fetch(`/api/materials?${params}`);
            const result = await response.json();
            
            if (response.ok) {
                this.renderMaterials(result.materials || []);
            } else {
                this.showToast(result.error || 'Failed to search materials', 'error');
            }
            
        } catch (error) {
            console.error('Error searching materials:', error);
            this.showToast('Error searching materials', 'error');
        } finally {
            this.hideLoading();
        }
    }
    
    renderMaterials(materials) {
        const container = document.getElementById('materials-list');
        
        if (materials.length === 0) {
            container.innerHTML = '<p class="help-text">No materials found.</p>';
            return;
        }
        
        container.innerHTML = materials.map(material => {
            const date = new Date(material.date_created || material.download_date).toLocaleDateString();
            const size = this.formatFileSize(material.file_size || 0);
            
            return `
                <div class="material-item">
                    <div class="material-info">
                        <h3>${this.escapeHtml(material.title)}</h3>
                        <div class="material-meta">
                            <span>Course: ${this.escapeHtml(material.course_name || 'Uncategorized')}</span>
                            <span>Type: ${material.mime_type || 'Unknown'}</span>
                            <span>Date: ${date}</span>
                            <span>Size: ${size}</span>
                        </div>
                    </div>
                    <div class="material-actions">
                        ${material.local_path ? 
                            `<button class="btn btn-secondary" onclick="app.openFile('${material.local_path}')">
                                <i class="fas fa-external-link-alt"></i> Open
                            </button>` : ''
                        }
                    </div>
                </div>
            `;
        }).join('');
    }
    
    async loadUncategorizedMaterials() {
        try {
            const response = await fetch('/api/materials/uncategorized');
            const result = await response.json();
            
            if (response.ok) {
                this.renderUncategorizedMaterials(result.materials || []);
            }
            
        } catch (error) {
            console.error('Error loading uncategorized materials:', error);
        }
    }
    
    renderUncategorizedMaterials(materials) {
        const container = document.getElementById('uncategorized-list');
        
        if (materials.length === 0) {
            container.innerHTML = '<p class="help-text">No uncategorized materials found.</p>';
            return;
        }
        
        container.innerHTML = materials.map(material => {
            const date = new Date(material.date_created || material.download_date).toLocaleDateString();
            
            return `
                <div class="material-item draggable" draggable="true" data-material-id="${material.id}">
                    <div class="material-info">
                        <h3>${this.escapeHtml(material.title)}</h3>
                        <div class="material-meta">
                            <span>Type: ${material.mime_type || 'Unknown'}</span>
                            <span>Date: ${date}</span>
                        </div>
                    </div>
                    <div class="material-actions">
                        <select onchange="app.moveMaterial(${material.id}, this.value)">
                            <option value="">Move to course...</option>
                            ${this.courses.map(course => 
                                `<option value="${course.id}">${this.escapeHtml(course.name)}</option>`
                            ).join('')}
                        </select>
                    </div>
                </div>
            `;
        }).join('');
    }
    
    async moveMaterial(materialId, courseId) {
        if (!courseId) return;
        
        const course = this.courses.find(c => c.id === courseId);
        if (!course) return;
        
        try {
            this.showLoading('Moving material...');
            
            const response = await fetch(`/api/materials/${materialId}/move`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    course_id: courseId,
                    course_name: course.name
                })
            });
            
            const result = await response.json();
            
            if (response.ok && result.success) {
                this.showToast('Material moved successfully', 'success');
                await this.loadUncategorizedMaterials();
                await this.loadStatistics();
            } else {
                this.showToast(result.error || 'Failed to move material', 'error');
            }
            
        } catch (error) {
            console.error('Error moving material:', error);
            this.showToast('Error moving material', 'error');
        } finally {
            this.hideLoading();
        }
    }
    
    openFile(filePath) {
        // This would open the file - for now just show info
        this.showToast(`File path: ${filePath}`, 'info');
    }
    
    updateUI() {
        // Update auth button
        const authBtn = document.getElementById('auth-btn');
        const authText = document.getElementById('auth-text');
        
        if (this.isAuthenticated) {
            authBtn.textContent = 'Logout';
            authBtn.className = 'btn btn-danger';
            authText.textContent = 'Authenticated';
        } else {
            authBtn.textContent = 'Authenticate';
            authBtn.className = 'btn btn-primary';
            authText.textContent = 'Not Authenticated';
        }
        
        // Show/hide sections based on auth status
        const sections = ['courses-section', 'date-section', 'download-section'];
        sections.forEach(sectionId => {
            const element = document.getElementById(sectionId);
            if (element) {
                element.style.display = this.isAuthenticated ? 'block' : 'none';
            }
        });
        
        // Show subject organization section when authenticated
        const subjectSection = document.getElementById('subject-organization-section');
        if (subjectSection) {
            subjectSection.style.display = this.isAuthenticated ? 'block' : 'none';
        }
        
        // Update download button
        const downloadBtn = document.getElementById('start-download-btn');
        if (downloadBtn) {
            downloadBtn.disabled = this.downloadInProgress || this.selectedCourses.size === 0;
            
            if (this.downloadInProgress) {
                downloadBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Downloading...';
            } else {
                downloadBtn.innerHTML = '<i class="fas fa-play"></i> Start Download';
            }
        }
    }
    
    // Utility functions
    showLoading(message = 'Loading...') {
        document.getElementById('loading-message').textContent = message;
        document.getElementById('loading-overlay').style.display = 'flex';
    }
    
    hideLoading() {
        document.getElementById('loading-overlay').style.display = 'none';
    }
    
    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        
        document.getElementById('toast-container').appendChild(toast);
        
        setTimeout(() => {
            toast.remove();
        }, 5000);
    }
    
    showStatusMessage(containerId, message, type) {
        const container = document.getElementById(containerId);
        container.textContent = message;
        container.className = `status-message ${type}`;
        
        setTimeout(() => {
            container.textContent = '';
            container.className = 'status-message';
        }, 5000);
    }
    
    // Subject Organization Methods
    
    async loadSubjects() {
        try {
            const response = await fetch('/api/subjects');
            const result = await response.json();
            
            if (response.ok) {
                this.subjects = result.subjects || [];
            } else {
                console.error('Error loading subjects:', result.error);
            }
        } catch (error) {
            console.error('Error loading subjects:', error);
        }
    }
    
    async loadFilesBySubject() {
        try {
            const response = await fetch('/api/files/by-subject');
            const result = await response.json();
            
            if (response.ok) {
                this.filesBySubject = result.files_by_subject || {};
                this.subjects = result.subjects || this.subjects;
                this.renderSubjectBins();
            } else {
                console.error('Error loading files by subject:', result.error);
            }
        } catch (error) {
            console.error('Error loading files by subject:', error);
        }
    }
    
    renderSubjectBins() {
        const container = document.getElementById('subject-bins-container');
        if (!container) return;
        
        const binElements = [];
        
        // Unclassified bin
        const unclassifiedFiles = this.filesBySubject.unclassified || [];
        binElements.push(this.createSubjectBin({
            id: 'unclassified',
            name: 'Unclassified Files',
            color: '#f56565',
            files: unclassifiedFiles,
            isUnclassified: true
        }));
        
        // Subject bins
        this.subjects.forEach(subject => {
            const subjectKey = `subject_${subject.id}`;
            const files = this.filesBySubject[subjectKey] || [];
            binElements.push(this.createSubjectBin({
                id: subject.id,
                name: subject.name,
                color: subject.color,
                keywords: subject.keywords,
                files: files,
                isUnclassified: false
            }));
        });
        
        container.innerHTML = binElements.join('');
        
        // Bind drag and drop events
        this.bindDragDropEvents();
        
        // Show the subject organization section
        document.getElementById('subject-organization-section').style.display = 'block';
    }
    
    createSubjectBin(subject) {
        const fileCount = subject.files.length;
        const binClass = subject.isUnclassified ? 'subject-bin unclassified-bin' : 'subject-bin';
        
        return `
            <div class="${binClass}" 
                 data-subject-id="${subject.id}"
                 data-is-unclassified="${subject.isUnclassified}">
                <div class="subject-bin-header" style="border-color: ${subject.color};">
                    <div class="subject-bin-title" style="color: ${subject.color};">
                        <i class="fas ${subject.isUnclassified ? 'fa-question-circle' : 'fa-folder'}"></i>
                        ${this.escapeHtml(subject.name)}
                        <span class="subject-bin-count">${fileCount}</span>
                    </div>
                    ${!subject.isUnclassified ? `
                        <div class="subject-bin-actions">
                            <button class="btn btn-icon btn-secondary" 
                                    onclick="app.editSubject(${subject.id})" 
                                    title="Edit Subject">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="btn btn-icon btn-danger" 
                                    onclick="app.deleteSubject(${subject.id})" 
                                    title="Delete Subject">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    ` : ''}
                </div>
                <div class="subject-bin-content">
                    ${fileCount > 0 ? subject.files.map(file => this.createFileItem(file)).join('') : 
                      '<div class="empty-bin">No files</div>'}
                </div>
            </div>
        `;
    }
    
    createFileItem(file) {
        const fileIcon = this.getFileIcon(file.mime_type);
        const date = file.date_created ? new Date(file.date_created).toLocaleDateString() : '';
        const classificationType = file.classification_type || '';
        
        return `
            <div class="file-item" 
                 draggable="true" 
                 data-file-id="${file.id}"
                 data-file-title="${this.escapeHtml(file.title)}">
                <div class="file-item-header">
                    <input type="checkbox" class="file-item-checkbox" data-file-id="${file.id}">
                    <div class="file-item-title">${this.escapeHtml(file.title)}</div>
                </div>
                <div class="file-item-meta">
                    <div class="meta-left">
                        <i class="fas ${fileIcon} file-type-icon"></i>
                        <span>${date}</span>
                    </div>
                    ${classificationType ? `
                        <span class="classification-badge classification-${classificationType}">
                            ${classificationType}
                        </span>
                    ` : ''}
                </div>
            </div>
        `;
    }
    
    getFileIcon(mimeType) {
        const iconMap = {
            'application/pdf': 'fa-file-pdf',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'fa-file-word',
            'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'fa-file-powerpoint',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'fa-file-excel',
            'text/plain': 'fa-file-alt',
            'image/jpeg': 'fa-file-image',
            'image/png': 'fa-file-image',
            'video/mp4': 'fa-file-video',
            'audio/mpeg': 'fa-file-audio'
        };
        
        return iconMap[mimeType] || 'fa-file';
    }
    
    bindDragDropEvents() {
        // File drag start
        document.querySelectorAll('.file-item').forEach(item => {
            item.addEventListener('dragstart', (e) => {
                const fileId = parseInt(e.target.getAttribute('data-file-id'));
                const isSelected = e.target.querySelector('.file-item-checkbox').checked;
                
                if (isSelected) {
                    // Drag all selected files
                    this.draggedFiles = Array.from(document.querySelectorAll('.file-item-checkbox:checked'))
                        .map(checkbox => parseInt(checkbox.getAttribute('data-file-id')));
                } else {
                    // Drag just this file
                    this.draggedFiles = [fileId];
                }
                
                e.target.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
            });
            
            item.addEventListener('dragend', (e) => {
                e.target.classList.remove('dragging');
            });
            
            // File selection
            const checkbox = item.querySelector('.file-item-checkbox');
            checkbox.addEventListener('change', (e) => {
                const fileId = parseInt(e.target.getAttribute('data-file-id'));
                if (e.target.checked) {
                    this.selectedFiles.add(fileId);
                    e.target.closest('.file-item').classList.add('selected');
                } else {
                    this.selectedFiles.delete(fileId);
                    e.target.closest('.file-item').classList.remove('selected');
                }
                this.updateBulkOperations();
            });
        });
        
        // Subject bin drop zones
        document.querySelectorAll('.subject-bin').forEach(bin => {
            bin.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                bin.classList.add('drag-over');
            });
            
            bin.addEventListener('dragleave', (e) => {
                if (!bin.contains(e.relatedTarget)) {
                    bin.classList.remove('drag-over');
                }
            });
            
            bin.addEventListener('drop', (e) => {
                e.preventDefault();
                bin.classList.remove('drag-over');
                
                const subjectId = bin.getAttribute('data-subject-id');
                const isUnclassified = bin.getAttribute('data-is-unclassified') === 'true';
                
                if (isUnclassified) {
                    this.unclassifyFiles(this.draggedFiles);
                } else {
                    this.classifyFiles(this.draggedFiles, parseInt(subjectId));
                }
            });
        });
    }
    
    async classifyFiles(fileIds, subjectId) {
        try {
            const response = await fetch('/api/files/bulk-classify', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    material_ids: fileIds,
                    subject_id: subjectId
                })
            });
            
            const result = await response.json();
            
            if (response.ok) {
                this.showToast(result.message, 'success');
                await this.loadFilesBySubject();
                this.clearSelection();
            } else {
                this.showToast(result.error || 'Classification failed', 'error');
            }
        } catch (error) {
            console.error('Error classifying files:', error);
            this.showToast('Error classifying files', 'error');
        }
    }
    
    async unclassifyFiles(fileIds) {
        try {
            let successCount = 0;
            for (const fileId of fileIds) {
                const response = await fetch(`/api/files/${fileId}/unclassify`, {
                    method: 'POST'
                });
                if (response.ok) successCount++;
            }
            
            this.showToast(`Unclassified ${successCount} files`, 'success');
            await this.loadFilesBySubject();
            this.clearSelection();
        } catch (error) {
            console.error('Error unclassifying files:', error);
            this.showToast('Error unclassifying files', 'error');
        }
    }
    
    showAddSubjectModal() {
        document.getElementById('modal-title').textContent = 'Add New Subject';
        document.getElementById('subject-form').reset();
        document.getElementById('subject-form').removeAttribute('data-subject-id');
        this.showModal('subject-modal');
    }
    
    async editSubject(subjectId) {
        const subject = this.subjects.find(s => s.id === subjectId);
        if (!subject) return;
        
        document.getElementById('modal-title').textContent = 'Edit Subject';
        document.getElementById('subject-name').value = subject.name;
        document.getElementById('subject-keywords').value = subject.keywords;
        document.getElementById('subject-priority').value = subject.priority;
        document.getElementById('subject-color').value = subject.color;
        document.getElementById('subject-form').setAttribute('data-subject-id', subjectId);
        
        this.showModal('subject-modal');
    }
    
    async deleteSubject(subjectId) {
        const subject = this.subjects.find(s => s.id === subjectId);
        if (!subject) return;
        
        if (!confirm(`Are you sure you want to delete the subject "${subject.name}"? All file classifications for this subject will be removed.`)) {
            return;
        }
        
        try {
            const response = await fetch(`/api/subjects/${subjectId}`, {
                method: 'DELETE'
            });
            
            const result = await response.json();
            
            if (response.ok) {
                this.showToast('Subject deleted successfully', 'success');
                await this.loadSubjects();
                await this.loadFilesBySubject();
            } else {
                this.showToast(result.error || 'Delete failed', 'error');
            }
        } catch (error) {
            console.error('Error deleting subject:', error);
            this.showToast('Error deleting subject', 'error');
        }
    }
    
    async handleSubjectSubmit(e) {
        e.preventDefault();
        
        const name = document.getElementById('subject-name').value.trim();
        const keywords = document.getElementById('subject-keywords').value.trim();
        const priority = parseInt(document.getElementById('subject-priority').value);
        const color = document.getElementById('subject-color').value;
        const subjectId = document.getElementById('subject-form').getAttribute('data-subject-id');
        
        if (!name || !keywords) {
            this.showToast('Please fill in all required fields', 'error');
            return;
        }
        
        const data = { name, keywords, priority, color };
        
        try {
            const url = subjectId ? `/api/subjects/${subjectId}` : '/api/subjects';
            const method = subjectId ? 'PUT' : 'POST';
            
            const response = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(data)
            });
            
            const result = await response.json();
            
            if (response.ok) {
                this.showToast(result.message, 'success');
                this.hideModal('subject-modal');
                await this.loadSubjects();
                await this.loadFilesBySubject();
            } else {
                this.showToast(result.error || 'Operation failed', 'error');
            }
        } catch (error) {
            console.error('Error saving subject:', error);
            this.showToast('Error saving subject', 'error');
        }
    }
    
    showAutoClassifyModal() {
        this.showModal('auto-classify-modal');
    }
    
    async performAutoClassification() {
        const threshold = parseFloat(document.getElementById('confidence-threshold').value);
        
        try {
            this.hideModal('auto-classify-modal');
            this.showLoading('Auto-classifying files...');
            
            const response = await fetch('/api/classify/auto', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    confidence_threshold: threshold
                })
            });
            
            const result = await response.json();
            
            if (response.ok) {
                this.showToast(result.message, 'success');
                await this.loadFilesBySubject();
            } else {
                this.showToast(result.error || 'Auto-classification failed', 'error');
            }
        } catch (error) {
            console.error('Error auto-classifying:', error);
            this.showToast('Error during auto-classification', 'error');
        } finally {
            this.hideLoading();
        }
    }
    
    async checkLLMStatus() {
        try {
            const response = await fetch('/api/llm/status');
            const status = await response.json();
            
            this.llmAvailable = status.available;
            this.updateLLMStatusUI(status);
            
        } catch (error) {
            console.error('Error checking LLM status:', error);
            this.llmAvailable = false;
            this.updateLLMStatusUI({ available: false });
        }
    }
    
    updateLLMStatusUI(status) {
        const statusEl = document.getElementById('llm-status');
        const llmBtn = document.getElementById('llm-classify-btn');
        
        if (statusEl) {
            statusEl.className = 'llm-status ' + (status.available ? 'available' : 'unavailable');
            statusEl.querySelector('span').textContent = status.available ? 'AI Ready' : 'AI Unavailable';
        }
        
        if (llmBtn) {
            llmBtn.disabled = !status.available;
            if (!status.available) {
                llmBtn.title = 'AI classification requires GEMINI_API_KEY';
            }
        }
    }
    
    showLLMClassifyModal() {
        if (!this.llmAvailable) {
            this.showToast('AI classification is not available. Please check your GEMINI_API_KEY configuration.', 'error');
            return;
        }
        this.showModal('llm-classify-modal');
    }
    
    async performLLMClassification() {
        const threshold = parseFloat(document.getElementById('llm-confidence-threshold').value);
        const autoCreateSubjects = document.getElementById('llm-auto-create-subjects').checked;
        
        try {
            this.hideModal('llm-classify-modal');
            this.showLoading('AI is analyzing documents...');
            
            const progressEl = document.getElementById('llm-analysis-progress');
            const progressText = document.getElementById('llm-progress-text');
            
            if (progressEl) progressEl.style.display = 'block';
            
            // Update progress text
            if (progressText) progressText.textContent = 'Extracting document content...';
            
            const response = await fetch('/api/classify/llm', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    confidence_threshold: threshold,
                    auto_create_subjects: autoCreateSubjects
                })
            });
            
            const result = await response.json();
            
            if (response.ok) {
                this.showLLMResults(result.results);
                await this.loadSubjects(); // Reload subjects in case new ones were created
                await this.loadFilesBySubject();
            } else {
                this.showToast(result.error || 'AI classification failed', 'error');
            }
        } catch (error) {
            console.error('Error during LLM classification:', error);
            this.showToast('Error during AI analysis', 'error');
        } finally {
            this.hideLoading();
            const progressEl = document.getElementById('llm-analysis-progress');
            if (progressEl) progressEl.style.display = 'none';
        }
    }
    
    showLLMResults(results) {
        const message = `
AI Analysis Complete:
• ${results.total_analyzed} files analyzed
• ${results.successfully_classified} files automatically classified
• ${results.new_subjects_created} new subjects created
• ${results.low_confidence_files.length} files need manual review
${results.errors.length > 0 ? `• ${results.errors.length} errors occurred` : ''}
        `.trim();
        
        this.showToast(message, 'success');
        
        // Show detailed results if there are low confidence files
        if (results.low_confidence_files.length > 0) {
            console.log('Files needing manual review:', results.low_confidence_files);
        }
        
        if (results.errors.length > 0) {
            console.log('Classification errors:', results.errors);
        }
    }
    
    async getLLMSuggestions(materialId) {
        try {
            const response = await fetch(`/api/files/${materialId}/llm-suggestions`);
            const result = await response.json();
            
            if (response.ok) {
                return result.suggestions || [];
            } else {
                console.error('Error getting LLM suggestions:', result.error);
                return [];
            }
        } catch (error) {
            console.error('Error fetching LLM suggestions:', error);
            return [];
        }
    }
    
    toggleView() {
        this.isSubjectView = !this.isSubjectView;
        const btn = document.getElementById('view-toggle-btn');
        const icon = btn.querySelector('i');
        
        if (this.isSubjectView) {
            btn.innerHTML = '<i class="fas fa-toggle-off"></i> File Type View';
            document.getElementById('subject-organization-section').style.display = 'block';
            // Hide other sections if needed
        } else {
            btn.innerHTML = '<i class="fas fa-toggle-on"></i> Subject View';
            document.getElementById('subject-organization-section').style.display = 'none';
            // Show other sections
        }
    }
    
    showModal(modalId) {
        document.getElementById(modalId).classList.add('show');
    }
    
    hideModal(modalId) {
        document.getElementById(modalId).classList.remove('show');
    }
    
    clearSelection() {
        this.selectedFiles.clear();
        document.querySelectorAll('.file-item-checkbox').forEach(checkbox => {
            checkbox.checked = false;
            checkbox.closest('.file-item').classList.remove('selected');
        });
        this.updateBulkOperations();
    }
    
    updateBulkOperations() {
        const selectedCount = this.selectedFiles.size;
        const bulkOps = document.getElementById('bulk-operations');
        
        if (selectedCount > 0) {
            bulkOps?.classList.add('show');
            document.getElementById('selected-count').textContent = selectedCount;
        } else {
            bulkOps?.classList.remove('show');
        }
    }
    
    showLoading(message) {
        const overlay = document.getElementById('loading-overlay');
        const messageEl = document.getElementById('loading-message');
        if (messageEl) messageEl.textContent = message;
        if (overlay) overlay.style.display = 'flex';
    }
    
    hideLoading() {
        const overlay = document.getElementById('loading-overlay');
        if (overlay) overlay.style.display = 'none';
    }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }
}

// Initialize the application
const app = new ClassroomDownloader();
