// Notes and Annotations Manager
class NotesManager {
    constructor() {
        this.currentMaterialId = null;
        this.notes = [];
        this.activeNoteTool = 'text';
        this.isRecording = false;
        this.mediaRecorder = null;
        this.audioChunks = [];
        
        this.setupEventListeners();
        this.initializeAudioRecorder();
    }

    setupEventListeners() {
        // Note tool buttons
        document.querySelectorAll('.note-tool-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.setActiveNoteTool(e.target.dataset.tool);
            });
        });

        // Context menu actions
        document.addEventListener('click', (e) => {
            if (e.target.closest('.context-item')) {
                const action = e.target.closest('.context-item').dataset.action;
                this.handleContextAction(action);
            }
        });

        // Voice note recording
        document.getElementById('add-voice-note-btn').addEventListener('click', () => {
            this.toggleVoiceRecording();
        });

        // Add text note button
        document.getElementById('add-text-note-btn').addEventListener('click', () => {
            this.showTextNoteDialog();
        });
    }

    async initializeAudioRecorder() {
        try {
            if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                this.mediaRecorder = new MediaRecorder(stream);
                
                this.mediaRecorder.ondataavailable = (event) => {
                    this.audioChunks.push(event.data);
                };
                
                this.mediaRecorder.onstop = () => {
                    this.saveVoiceNote();
                };
            }
        } catch (error) {
            console.log('Audio recording not available:', error);
        }
    }

    setActiveNoteTool(tool) {
        // Update active button
        document.querySelectorAll('.note-tool-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        
        document.querySelector(`[data-tool="${tool}"]`).classList.add('active');
        this.activeNoteTool = tool;
        
        // Update cursor/interaction mode based on tool
        this.updateInteractionMode(tool);
    }

    updateInteractionMode(tool) {
        const viewers = document.querySelectorAll('.document-viewer');
        viewers.forEach(viewer => {
            viewer.classList.remove('highlight-mode', 'note-mode');
            
            switch (tool) {
                case 'highlight':
                    viewer.classList.add('highlight-mode');
                    break;
                case 'text':
                    viewer.classList.add('note-mode');
                    break;
            }
        });
    }

    async loadNotes(materialId) {
        this.currentMaterialId = materialId;
        
        try {
            const response = await fetch(`/api/notes/${materialId}`);
            if (response.ok) {
                this.notes = await response.json();
                this.renderNotes();
            }
        } catch (error) {
            console.error('Error loading notes:', error);
        }
    }

    renderNotes() {
        const notesList = document.getElementById('notes-list');
        
        if (this.notes.length === 0) {
            notesList.innerHTML = `
                <div class="no-notes">
                    <i class="fas fa-sticky-note"></i>
                    <p>No notes yet. Start taking notes to see them here.</p>
                </div>
            `;
            return;
        }

        notesList.innerHTML = this.notes.map(note => this.renderNoteItem(note)).join('');
    }

    renderNoteItem(note) {
        const iconMap = {
            'text_note': 'fa-font',
            'highlight': 'fa-highlighter',
            'sticky_note': 'fa-sticky-note',
            'voice_note': 'fa-microphone'
        };

        const timeAgo = this.formatTimeAgo(note.created_at);
        
        return `
            <div class="note-item" data-note-id="${note.id}">
                <div class="note-header">
                    <div class="note-type">
                        <i class="fas ${iconMap[note.note_type] || 'fa-note'}"></i>
                        ${this.formatNoteType(note.note_type)}
                        ${note.page_number ? `• Page ${note.page_number}` : ''}
                    </div>
                    <div class="note-time">${timeAgo}</div>
                </div>
                <div class="note-content">
                    ${this.renderNoteContent(note)}
                </div>
                <div class="note-actions">
                    <button class="note-action-btn" onclick="notesManager.editNote(${note.id})" title="Edit">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="note-action-btn" onclick="notesManager.deleteNote(${note.id})" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                    ${note.note_type === 'highlight' ? 
                        `<button class="note-action-btn" onclick="notesManager.goToHighlight(${note.id})" title="Go to location">
                            <i class="fas fa-map-marker-alt"></i>
                        </button>` : ''
                    }
                </div>
            </div>
        `;
    }

    renderNoteContent(note) {
        switch (note.note_type) {
            case 'voice_note':
                return `
                    <audio controls class="voice-note-player">
                        <source src="/api/audio-note/${note.id}" type="audio/webm">
                        Your browser does not support audio playback.
                    </audio>
                `;
            case 'highlight':
                return `<div class="highlight-text">"${note.content}"</div>`;
            default:
                return `<div class="note-text">${note.content}</div>`;
        }
    }

    formatNoteType(type) {
        const typeMap = {
            'text_note': 'Text Note',
            'highlight': 'Highlight',
            'sticky_note': 'Sticky Note',
            'voice_note': 'Voice Note'
        };
        return typeMap[type] || type;
    }

    formatTimeAgo(timestamp) {
        const now = new Date();
        const time = new Date(timestamp);
        const diffInSeconds = Math.floor((now - time) / 1000);

        if (diffInSeconds < 60) return 'Just now';
        if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
        if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
        return `${Math.floor(diffInSeconds / 86400)}d ago`;
    }

    // Text note creation
    showTextNoteDialog() {
        const dialog = this.createNoteDialog('Add Text Note', '', (content) => {
            this.saveTextNote(content);
        });
        document.body.appendChild(dialog);
    }

    createNoteDialog(title, initialContent, onSave) {
        const dialog = document.createElement('div');
        dialog.className = 'note-dialog-overlay';
        dialog.innerHTML = `
            <div class="note-dialog">
                <div class="note-dialog-header">
                    <h3>${title}</h3>
                    <button class="close-dialog-btn" onclick="this.closest('.note-dialog-overlay').remove()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="note-dialog-content">
                    <textarea class="note-input" placeholder="Enter your note..." rows="6">${initialContent}</textarea>
                    <div class="note-tags">
                        <label>Tags (comma-separated):</label>
                        <input type="text" class="tags-input" placeholder="tag1, tag2, tag3">
                    </div>
                </div>
                <div class="note-dialog-actions">
                    <button class="btn btn-secondary" onclick="this.closest('.note-dialog-overlay').remove()">
                        Cancel
                    </button>
                    <button class="btn btn-primary save-note-btn">
                        Save Note
                    </button>
                </div>
            </div>
        `;

        // Handle save action
        dialog.querySelector('.save-note-btn').addEventListener('click', () => {
            const content = dialog.querySelector('.note-input').value.trim();
            const tags = dialog.querySelector('.tags-input').value.split(',').map(tag => tag.trim()).filter(tag => tag);
            
            if (content) {
                onSave(content, tags);
                dialog.remove();
            }
        });

        return dialog;
    }

    async saveTextNote(content, tags = []) {
        const noteData = {
            material_id: this.currentMaterialId,
            note_type: 'text_note',
            content: content,
            tags: JSON.stringify(tags),
            position_data: this.getCurrentPosition()
        };

        await this.saveNote(noteData);
    }

    // Voice note recording
    toggleVoiceRecording() {
        if (this.isRecording) {
            this.stopRecording();
        } else {
            this.startRecording();
        }
    }

    startRecording() {
        if (!this.mediaRecorder) {
            alert('Audio recording is not available in your browser');
            return;
        }

        this.audioChunks = [];
        this.mediaRecorder.start();
        this.isRecording = true;
        
        // Update UI
        const btn = document.getElementById('add-voice-note-btn');
        btn.classList.add('recording');
        btn.innerHTML = '<i class="fas fa-stop"></i> Stop Recording';
    }

    stopRecording() {
        if (this.mediaRecorder && this.isRecording) {
            this.mediaRecorder.stop();
            this.isRecording = false;
            
            // Update UI
            const btn = document.getElementById('add-voice-note-btn');
            btn.classList.remove('recording');
            btn.innerHTML = '<i class="fas fa-microphone"></i> Voice Note';
        }
    }

    async saveVoiceNote() {
        if (this.audioChunks.length === 0) return;

        const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
        const formData = new FormData();
        
        formData.append('audio', audioBlob, 'voice-note.webm');
        formData.append('material_id', this.currentMaterialId);
        formData.append('note_type', 'voice_note');
        formData.append('position_data', this.getCurrentPosition());

        try {
            const response = await fetch('/api/voice-note', {
                method: 'POST',
                body: formData
            });

            if (response.ok) {
                await this.loadNotes(this.currentMaterialId); // Refresh notes
                this.showSuccess('Voice note saved successfully!');
            } else {
                throw new Error('Failed to save voice note');
            }
        } catch (error) {
            console.error('Error saving voice note:', error);
            this.showError('Failed to save voice note');
        }
    }

    // Highlight functionality
    showAnnotationDialog(event, selectedText, position) {
        const dialog = document.createElement('div');
        dialog.className = 'annotation-dialog';
        dialog.innerHTML = `
            <div class="annotation-options">
                <button class="annotation-btn highlight-btn" onclick="notesManager.createHighlight('${selectedText}', '${JSON.stringify(position)}')">
                    <i class="fas fa-highlighter"></i>
                    Highlight
                </button>
                <button class="annotation-btn note-btn" onclick="notesManager.createAnnotationNote('${selectedText}', '${JSON.stringify(position)}')">
                    <i class="fas fa-sticky-note"></i>
                    Add Note
                </button>
                <button class="annotation-btn ai-btn" onclick="notesManager.askAIAboutText('${selectedText}')">
                    <i class="fas fa-robot"></i>
                    Ask AI
                </button>
            </div>
        `;

        // Position dialog near the selection
        dialog.style.position = 'absolute';
        dialog.style.left = event.pageX + 'px';
        dialog.style.top = (event.pageY - 60) + 'px';
        
        document.body.appendChild(dialog);

        // Remove dialog when clicking elsewhere
        setTimeout(() => {
            document.addEventListener('click', function removeDialog(e) {
                if (!e.target.closest('.annotation-dialog')) {
                    dialog.remove();
                    document.removeEventListener('click', removeDialog);
                }
            });
        }, 100);
    }

    async createHighlight(selectedText, position) {
        const noteData = {
            material_id: this.currentMaterialId,
            note_type: 'highlight',
            content: selectedText,
            position_data: position
        };

        await this.saveNote(noteData);
        
        // Remove selection and dialog
        window.getSelection().removeAllRanges();
        document.querySelector('.annotation-dialog')?.remove();
    }

    createAnnotationNote(selectedText, position) {
        const dialog = this.createNoteDialog('Add Note for Selection', `Selected text: "${selectedText}"\n\nNote:`, (content, tags) => {
            const noteData = {
                material_id: this.currentMaterialId,
                note_type: 'sticky_note',
                content: content,
                tags: JSON.stringify(tags),
                position_data: position
            };
            this.saveNote(noteData);
        });
        
        document.body.appendChild(dialog);
        document.querySelector('.annotation-dialog')?.remove();
    }

    askAIAboutText(selectedText) {
        if (window.ChatAssistant) {
            window.ChatAssistant.askAboutText(selectedText);
        }
        document.querySelector('.annotation-dialog')?.remove();
    }

    // Context menu actions
    handleContextAction(action) {
        const selection = window.getSelection().toString();
        
        switch (action) {
            case 'highlight':
                if (selection) {
                    this.createHighlight(selection, this.getCurrentPosition());
                }
                break;
            case 'note':
                if (selection) {
                    this.createAnnotationNote(selection, this.getCurrentPosition());
                }
                break;
            case 'ask-ai':
                if (selection) {
                    this.askAIAboutText(selection);
                }
                break;
        }
        
        // Hide context menu
        document.getElementById('text-context-menu').style.display = 'none';
    }

    // Note management
    async saveNote(noteData) {
        try {
            const response = await fetch('/api/notes', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(noteData)
            });

            if (response.ok) {
                await this.loadNotes(this.currentMaterialId); // Refresh notes
                this.showSuccess('Note saved successfully!');
            } else {
                throw new Error('Failed to save note');
            }
        } catch (error) {
            console.error('Error saving note:', error);
            this.showError('Failed to save note');
        }
    }

    async deleteNote(noteId) {
        if (confirm('Are you sure you want to delete this note?')) {
            try {
                const response = await fetch(`/api/notes/${noteId}`, {
                    method: 'DELETE'
                });

                if (response.ok) {
                    await this.loadNotes(this.currentMaterialId); // Refresh notes
                    this.showSuccess('Note deleted successfully!');
                } else {
                    throw new Error('Failed to delete note');
                }
            } catch (error) {
                console.error('Error deleting note:', error);
                this.showError('Failed to delete note');
            }
        }
    }

    editNote(noteId) {
        const note = this.notes.find(n => n.id === noteId);
        if (!note) return;

        if (note.note_type === 'voice_note') {
            alert('Voice notes cannot be edited');
            return;
        }

        const dialog = this.createNoteDialog('Edit Note', note.content, async (content, tags) => {
            try {
                const response = await fetch(`/api/notes/${noteId}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        content: content,
                        tags: JSON.stringify(tags)
                    })
                });

                if (response.ok) {
                    await this.loadNotes(this.currentMaterialId);
                    this.showSuccess('Note updated successfully!');
                } else {
                    throw new Error('Failed to update note');
                }
            } catch (error) {
                console.error('Error updating note:', error);
                this.showError('Failed to update note');
            }
        });
        
        document.body.appendChild(dialog);
    }

    goToHighlight(noteId) {
        const note = this.notes.find(n => n.id === noteId);
        if (!note || !note.position_data) return;

        try {
            const position = JSON.parse(note.position_data);
            
            // Navigate to the highlight position based on viewer type
            if (position.page) {
                // PDF viewer
                if (window.PDFViewer && window.studyApp.currentViewer === 'pdf') {
                    window.PDFViewer.goToPage(position.page);
                }
            } else if (position.cfiRange) {
                // EPUB viewer
                if (window.EPUBReader && window.studyApp.currentViewer === 'epub') {
                    window.EPUBReader.goToLocation(position.cfiRange);
                }
            }
        } catch (error) {
            console.error('Error navigating to highlight:', error);
        }
    }

    // Utility methods
    getCurrentPosition() {
        let position = {};
        
        if (window.studyApp) {
            switch (window.studyApp.currentViewer) {
                case 'pdf':
                    if (window.PDFViewer) {
                        position = {
                            page: window.PDFViewer.currentPage,
                            scale: window.PDFViewer.scale
                        };
                    }
                    break;
                case 'epub':
                    if (window.EPUBReader) {
                        position = {
                            cfi: window.EPUBReader.currentCfi,
                            progress: window.EPUBReader.currentProgress
                        };
                    }
                    break;
            }
        }
        
        return JSON.stringify(position);
    }

    showSuccess(message) {
        this.showToast(message, 'success');
    }

    showError(message) {
        this.showToast(message, 'error');
    }

    showToast(message, type) {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `
            <i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}"></i>
            ${message}
        `;
        
        document.body.appendChild(toast);
        
        // Show toast
        setTimeout(() => toast.classList.add('show'), 100);
        
        // Hide toast after 3 seconds
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
}

// Initialize notes manager
document.addEventListener('DOMContentLoaded', () => {
    window.NotesManager = new NotesManager();
});

// Add CSS for notes components
const notesStyles = `
    .note-dialog-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
    }
    
    .note-dialog {
        background: white;
        border-radius: 12px;
        width: 500px;
        max-width: 90vw;
        box-shadow: 0 8px 32px rgba(0,0,0,0.3);
    }
    
    .note-dialog-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 20px;
        border-bottom: 1px solid var(--border-color);
    }
    
    .note-dialog-content {
        padding: 20px;
    }
    
    .note-input {
        width: 100%;
        padding: 12px;
        border: 1px solid var(--border-color);
        border-radius: 8px;
        font-family: inherit;
        resize: vertical;
        margin-bottom: 15px;
    }
    
    .note-tags label {
        display: block;
        margin-bottom: 5px;
        font-weight: 500;
        color: #666;
    }
    
    .tags-input {
        width: 100%;
        padding: 8px 12px;
        border: 1px solid var(--border-color);
        border-radius: 6px;
    }
    
    .note-dialog-actions {
        display: flex;
        gap: 10px;
        justify-content: flex-end;
        padding: 20px;
        border-top: 1px solid var(--border-color);
    }
    
    .annotation-dialog {
        background: white;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 10000;
        padding: 10px;
    }
    
    .annotation-options {
        display: flex;
        gap: 5px;
    }
    
    .annotation-btn {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 8px 12px;
        border: none;
        background: var(--light-color);
        border-radius: 6px;
        cursor: pointer;
        font-size: 0.8rem;
        transition: var(--transition);
    }
    
    .annotation-btn:hover {
        background: var(--primary-color);
        color: white;
    }
    
    .note-actions {
        display: flex;
        gap: 5px;
        margin-top: 10px;
        padding-top: 10px;
        border-top: 1px solid #f0f0f0;
    }
    
    .note-action-btn {
        padding: 6px 8px;
        border: none;
        background: var(--light-color);
        border-radius: 4px;
        cursor: pointer;
        font-size: 0.8rem;
        color: #666;
        transition: var(--transition);
    }
    
    .note-action-btn:hover {
        background: var(--primary-color);
        color: white;
    }
    
    .voice-note-player {
        width: 100%;
        margin: 5px 0;
    }
    
    .highlight-text {
        background: rgba(255, 235, 59, 0.3);
        padding: 8px;
        border-radius: 4px;
        border-left: 3px solid #FFC107;
        font-style: italic;
    }
    
    .recording {
        animation: pulse 1.5s infinite;
        background: var(--danger-color) !important;
        color: white !important;
    }
    
    @keyframes pulse {
        0% { opacity: 1; }
        50% { opacity: 0.7; }
        100% { opacity: 1; }
    }
    
    .toast {
        position: fixed;
        bottom: 20px;
        right: 20px;
        padding: 12px 16px;
        border-radius: 8px;
        color: white;
        display: flex;
        align-items: center;
        gap: 8px;
        opacity: 0;
        transform: translateY(20px);
        transition: all 0.3s ease;
        z-index: 10000;
    }
    
    .toast.show {
        opacity: 1;
        transform: translateY(0);
    }
    
    .toast-success {
        background: var(--secondary-color);
    }
    
    .toast-error {
        background: var(--danger-color);
    }
    
    .highlight-mode {
        cursor: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="yellow" stroke="orange" stroke-width="2"><path d="M9 11H1l2-2 2-2 3 3zm10.73 4.27L15 10l-1.5-1.5L12 7 7 12l3 3 5 5 5.73-5.73z"/></svg>') 10 10, auto;
    }
    
    .note-mode {
        cursor: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18V3H3zm12 12H9v-2h6v2zm0-4H9V9h6v2z"/></svg>') 8 8, auto;
    }
`;

// Inject styles
const notesStyleSheet = document.createElement('style');
notesStyleSheet.textContent = notesStyles;
document.head.appendChild(notesStyleSheet);

// Export for use by other modules
window.NotesManager = window.NotesManager || new NotesManager();
