// AI Chat Assistant using Gemini API
class ChatAssistant {
    constructor() {
        this.sessionId = this.generateSessionId();
        this.messages = [];
        this.isInitialized = false;
        this.isProcessing = false;
        this.currentMaterialId = null;
        this.currentContext = null;
        
        this.setupEventListeners();
    }

    setupEventListeners() {
        // Chat input handling
        const chatInput = document.getElementById('chat-input');
        const sendBtn = document.getElementById('send-chat-btn');
        
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });
        
        sendBtn.addEventListener('click', () => {
            this.sendMessage();
        });

        // Listen for document context changes
        window.addEventListener('pdf-text-extracted', (e) => {
            this.updateDocumentContext('pdf', e.detail);
        });

        // Material change handler
        document.addEventListener('material-changed', (e) => {
            this.handleMaterialChange(e.detail);
        });
    }

    generateSessionId() {
        return 'chat_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    initialize() {
        if (this.isInitialized) return;
        
        this.isInitialized = true;
        this.loadChatHistory();
        
        // Welcome message if no previous chat
        if (this.messages.length === 0) {
            this.addWelcomeMessage();
        }
    }

    async loadChatHistory() {
        try {
            const response = await fetch(`/api/chat-history/${this.sessionId}`);
            if (response.ok) {
                const history = await response.json();
                this.messages = history;
                this.renderMessages();
            }
        } catch (error) {
            console.error('Error loading chat history:', error);
        }
    }

    addWelcomeMessage() {
        const welcomeMessage = {
            type: 'assistant',
            content: `Hello! I'm your AI study assistant powered by Google Gemini. I can help you with:

• **Document Q&A** - Ask questions about your current document
• **Explanations** - Get detailed explanations of complex topics
• **Summaries** - Create summaries of your materials
• **Study Tips** - Get personalized study recommendations
• **Flashcards** - Generate practice questions from content

${window.studyApp && window.studyApp.currentMaterial ? 
    `I can see you're currently studying "${window.studyApp.currentMaterial.title}". Feel free to ask me anything about it!` : 
    'Open a document to get started with context-aware assistance!'}

What would you like to know?`,
            timestamp: new Date().toISOString()
        };
        
        this.messages.push(welcomeMessage);
        this.renderMessages();
    }

    async sendMessage() {
        const input = document.getElementById('chat-input');
        const message = input.value.trim();
        
        if (!message || this.isProcessing) return;
        
        // Add user message
        const userMessage = {
            type: 'user',
            content: message,
            timestamp: new Date().toISOString()
        };
        
        this.messages.push(userMessage);
        input.value = '';
        this.renderMessages();
        
        // Send to AI and get response
        await this.processAIResponse(message);
    }

    async processAIResponse(userMessage) {
        this.isProcessing = true;
        this.showTypingIndicator();
        
        try {
            // Prepare context
            const context = this.prepareContext();
            
            // Send to AI endpoint
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message: userMessage,
                    session_id: this.sessionId,
                    material_id: this.currentMaterialId,
                    context: context
                })
            });
            
            if (!response.ok) {
                throw new Error('Failed to get AI response');
            }
            
            const aiResponse = await response.json();
            
            // Add AI response to messages
            const assistantMessage = {
                type: 'assistant',
                content: aiResponse.response,
                timestamp: new Date().toISOString()
            };
            
            this.messages.push(assistantMessage);
            this.hideTypingIndicator();
            this.renderMessages();
            
            // Save conversation to database
            await this.saveChatHistory(userMessage, aiResponse.response);
            
        } catch (error) {
            console.error('Error processing AI response:', error);
            this.hideTypingIndicator();
            this.addErrorMessage('Sorry, I encountered an error. Please try again.');
        } finally {
            this.isProcessing = false;
        }
    }

    prepareContext() {
        let context = {
            has_document: false,
            document_type: null,
            current_content: null,
            material_info: null
        };

        // Add current document context
        if (window.studyApp && window.studyApp.currentMaterial) {
            context.has_document = true;
            context.material_info = {
                title: window.studyApp.currentMaterial.title,
                course: window.studyApp.currentMaterial.course_name,
                type: window.studyApp.currentMaterial.mime_type
            };
            
            // Add current viewer content
            switch (window.studyApp.currentViewer) {
                case 'pdf':
                    if (window.PDFViewer) {
                        context.document_type = 'pdf';
                        context.current_content = window.PDFViewer.getCurrentPageText();
                        context.page_info = window.PDFViewer.getDocumentInfo();
                    }
                    break;
                case 'epub':
                    if (window.EPUBReader) {
                        context.document_type = 'epub';
                        // Add current chapter/section content
                        window.EPUBReader.getCurrentContent().then(content => {
                            context.current_content = content;
                        });
                    }
                    break;
            }
        }

        // Add user's notes for additional context
        if (window.NotesManager && this.currentMaterialId) {
            context.user_notes = window.NotesManager.notes.map(note => ({
                type: note.note_type,
                content: note.content,
                created_at: note.created_at
            }));
        }

        return context;
    }

    async saveChatHistory(userMessage, aiResponse) {
        try {
            await fetch('/api/chat-history', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    session_id: this.sessionId,
                    material_id: this.currentMaterialId,
                    messages: [
                        { type: 'user', content: userMessage },
                        { type: 'assistant', content: aiResponse }
                    ]
                })
            });
        } catch (error) {
            console.error('Error saving chat history:', error);
        }
    }

    renderMessages() {
        const messagesContainer = document.getElementById('chat-messages');
        const isScrolledToBottom = messagesContainer.scrollHeight - messagesContainer.clientHeight <= messagesContainer.scrollTop + 1;
        
        messagesContainer.innerHTML = this.messages.map(message => 
            this.renderMessage(message)
        ).join('');
        
        // Auto-scroll to bottom if user was at bottom
        if (isScrolledToBottom) {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
    }

    renderMessage(message) {
        const timeFormatted = new Date(message.timestamp).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit'
        });

        return `
            <div class="chat-message ${message.type}">
                <div class="message-avatar">
                    <i class="fas ${message.type === 'user' ? 'fa-user' : 'fa-robot'}"></i>
                </div>
                <div class="message-content">
                    ${this.formatMessageContent(message.content)}
                    <div class="message-time">${timeFormatted}</div>
                </div>
            </div>
        `;
    }

    formatMessageContent(content) {
        // Basic markdown-like formatting
        return content
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // Bold
            .replace(/\*(.*?)\*/g, '<em>$1</em>') // Italic
            .replace(/`(.*?)`/g, '<code>$1</code>') // Code
            .replace(/\n/g, '<br>') // Line breaks
            .replace(/• /g, '• '); // Keep bullet points
    }

    showTypingIndicator() {
        const messagesContainer = document.getElementById('chat-messages');
        const typingIndicator = document.createElement('div');
        typingIndicator.className = 'chat-message assistant typing';
        typingIndicator.id = 'typing-indicator';
        typingIndicator.innerHTML = `
            <div class="message-avatar">
                <i class="fas fa-robot"></i>
            </div>
            <div class="message-content">
                <div class="typing-dots">
                    <span></span>
                    <span></span>
                    <span></span>
                </div>
            </div>
        `;
        
        messagesContainer.appendChild(typingIndicator);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    hideTypingIndicator() {
        const indicator = document.getElementById('typing-indicator');
        if (indicator) {
            indicator.remove();
        }
    }

    addErrorMessage(message) {
        const errorMessage = {
            type: 'assistant',
            content: `⚠️ ${message}`,
            timestamp: new Date().toISOString()
        };
        
        this.messages.push(errorMessage);
        this.renderMessages();
    }

    // Special methods for context-aware features
    askAboutText(selectedText) {
        if (!window.studyApp.isChatOpen) {
            window.studyApp.openChatPanel();
        }
        
        const input = document.getElementById('chat-input');
        input.value = `Can you explain this text: "${selectedText}"`;
        input.focus();
    }

    async generateSummary() {
        if (!this.currentMaterialId) {
            this.addErrorMessage('Please open a document first to generate a summary.');
            return;
        }
        
        const summaryMessage = "Please provide a comprehensive summary of this document, highlighting the key points and main concepts.";
        
        // Add to input and send
        document.getElementById('chat-input').value = summaryMessage;
        await this.sendMessage();
    }

    async generateFlashcards() {
        if (!this.currentMaterialId) {
            this.addErrorMessage('Please open a document first to generate flashcards.');
            return;
        }
        
        const flashcardMessage = "Can you create 5-10 flashcard questions based on this document content? Format them as Q: question and A: answer.";
        
        document.getElementById('chat-input').value = flashcardMessage;
        await this.sendMessage();
    }

    async explainConcept(concept) {
        const explanationMessage = `Can you provide a detailed explanation of "${concept}" in the context of this document?`;
        
        document.getElementById('chat-input').value = explanationMessage;
        await this.sendMessage();
    }

    handleMaterialChange(materialInfo) {
        this.currentMaterialId = materialInfo.id;
        
        // Add context change message
        const contextMessage = {
            type: 'assistant',
            content: `📚 I can now help you with "${materialInfo.title}" from ${materialInfo.course}. What would you like to know about this material?`,
            timestamp: new Date().toISOString()
        };
        
        this.messages.push(contextMessage);
        this.renderMessages();
    }

    updateDocumentContext(viewerType, contextData) {
        this.currentContext = {
            type: viewerType,
            data: contextData
        };
    }

    clearChat() {
        if (confirm('Are you sure you want to clear the chat history?')) {
            this.messages = [];
            this.renderMessages();
            this.addWelcomeMessage();
            
            // Clear from server
            fetch(`/api/chat-history/${this.sessionId}`, {
                method: 'DELETE'
            }).catch(error => {
                console.error('Error clearing chat history:', error);
            });
        }
    }

    // Export chat functionality
    exportChat() {
        const chatData = {
            session_id: this.sessionId,
            material_id: this.currentMaterialId,
            material_title: window.studyApp?.currentMaterial?.title || 'Unknown',
            messages: this.messages,
            exported_at: new Date().toISOString()
        };
        
        const blob = new Blob([JSON.stringify(chatData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `study-chat-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        
        URL.revokeObjectURL(url);
    }
}

// Initialize chat assistant
document.addEventListener('DOMContentLoaded', () => {
    window.ChatAssistant = new ChatAssistant();
});

// Add CSS for chat enhancements
const chatStyles = `
    .typing-dots {
        display: flex;
        gap: 4px;
        padding: 8px 0;
    }
    
    .typing-dots span {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background-color: #666;
        animation: typing 1.4s infinite ease-in-out;
    }
    
    .typing-dots span:nth-child(1) {
        animation-delay: -0.32s;
    }
    
    .typing-dots span:nth-child(2) {
        animation-delay: -0.16s;
    }
    
    @keyframes typing {
        0%, 80%, 100% {
            transform: scale(0);
            opacity: 0.5;
        }
        40% {
            transform: scale(1);
            opacity: 1;
        }
    }
    
    .message-time {
        font-size: 0.7rem;
        color: #999;
        margin-top: 8px;
        text-align: right;
    }
    
    .chat-message.user .message-time {
        color: rgba(255,255,255,0.7);
    }
    
    .message-content code {
        background: rgba(0,0,0,0.1);
        padding: 2px 4px;
        border-radius: 3px;
        font-family: 'Courier New', monospace;
        font-size: 0.9em;
    }
    
    .chat-message.user .message-content code {
        background: rgba(255,255,255,0.2);
    }
    
    .chat-input:disabled {
        background-color: #f5f5f5;
        cursor: not-allowed;
    }
    
    .send-btn:disabled {
        background: #ccc;
        cursor: not-allowed;
    }
    
    .send-btn:disabled:hover {
        background: #ccc;
    }
    
    .chat-actions {
        padding: 10px 20px;
        border-top: 1px solid var(--border-color);
        display: flex;
        gap: 10px;
        background: var(--light-color);
    }
    
    .chat-action-btn {
        padding: 6px 12px;
        border: 1px solid var(--border-color);
        background: white;
        border-radius: 6px;
        cursor: pointer;
        font-size: 0.8rem;
        transition: var(--transition);
        display: flex;
        align-items: center;
        gap: 6px;
    }
    
    .chat-action-btn:hover {
        background: var(--primary-color);
        color: white;
        border-color: var(--primary-color);
    }
`;

// Inject styles
const chatStyleSheet = document.createElement('style');
chatStyleSheet.textContent = chatStyles;
document.head.appendChild(chatStyleSheet);

// Add quick action buttons to chat panel
document.addEventListener('DOMContentLoaded', () => {
    const chatPanel = document.getElementById('chat-panel');
    if (chatPanel) {
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'chat-actions';
        actionsDiv.innerHTML = `
            <button class="chat-action-btn" onclick="window.ChatAssistant.generateSummary()">
                <i class="fas fa-file-alt"></i>
                Summarize
            </button>
            <button class="chat-action-btn" onclick="window.ChatAssistant.generateFlashcards()">
                <i class="fas fa-cards-blank"></i>
                Flashcards
            </button>
            <button class="chat-action-btn" onclick="window.ChatAssistant.clearChat()">
                <i class="fas fa-trash"></i>
                Clear
            </button>
            <button class="chat-action-btn" onclick="window.ChatAssistant.exportChat()">
                <i class="fas fa-download"></i>
                Export
            </button>
        `;
        
        // Insert before the input container
        const inputContainer = chatPanel.querySelector('.chat-input-container');
        chatPanel.insertBefore(actionsDiv, inputContainer);
    }
});

// Export for use by other modules
window.ChatAssistant = window.ChatAssistant || new ChatAssistant();
