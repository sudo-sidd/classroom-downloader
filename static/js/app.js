// Classroom Downloader Frontend Application
class ClassroomDownloader {
    constructor() {
        this.isAuthenticated = false;
        this.courses = [];
        this.selectedCourses = new Set();
        this.downloadInProgress = false;
        this.progressUpdateInterval = null;
        
        this.init();
    }
    
    async init() {
        this.bindEvents();
        await this.checkStatus();
        await this.loadSettings();
        this.updateUI();
    }
    
    bindEvents() {
        // Authentication
        document.getElementById('auth-btn').addEventListener('click', () => this.handleAuth());
        
        // Settings
        document.getElementById('update-settings-btn').addEventListener('click', () => this.updateSettings());
        
        // Courses
        document.getElementById('refresh-courses-btn').addEventListener('click', () => this.loadCourses());
        document.getElementById('select-all-courses').addEventListener('click', () => this.selectAllCourses());
        document.getElementById('deselect-all-courses').addEventListener('click', () => this.deselectAllCourses());
        
        // Date controls
        document.getElementById('clear-dates').addEventListener('click', () => this.clearDates());
        
        // Download
        document.getElementById('start-download-btn').addEventListener('click', () => this.startDownload());
        
        // Statistics
        document.getElementById('refresh-stats-btn').addEventListener('click', () => this.loadStatistics());
        
        // Materials browser
        document.getElementById('search-btn').addEventListener('click', () => this.searchMaterials());
        document.getElementById('search-materials').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.searchMaterials();
        });
        
        // Load initial data
        this.loadStatistics();
        this.loadUncategorizedMaterials();
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
            document.getElementById(sectionId).style.display = 
                this.isAuthenticated ? 'block' : 'none';
        });
        
        // Update download button
        const downloadBtn = document.getElementById('start-download-btn');
        downloadBtn.disabled = this.downloadInProgress || this.selectedCourses.size === 0;
        
        if (this.downloadInProgress) {
            downloadBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Downloading...';
        } else {
            downloadBtn.innerHTML = '<i class="fas fa-play"></i> Start Download';
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
