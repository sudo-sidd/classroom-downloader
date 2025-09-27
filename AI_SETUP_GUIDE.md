# AI-Powered Subject Organization Setup

Your classroom downloader now includes intelligent document classification using Google's Gemini AI! 🤖

## Setup Instructions

### 1. Get Your Gemini API Key
1. Visit [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Sign in with your Google account
3. Click "Create API Key"
4. Copy the generated API key

### 2. Configure Environment Variables
1. Open the `.env` file in the root directory
2. Replace `your_api_key_here` with your actual Gemini API key:
   ```
   GEMINI_API_KEY=AIza...your_actual_key_here
   ```

### 3. How It Works

#### Intelligent Analysis
The AI system will:
- 📄 **Read document content** (first 3 pages of PDFs, full content of DOCs/TXT files)
- 📝 **Analyze announcement text** that came with the file
- 🧠 **Understand context** using advanced language understanding
- 📊 **Create smart subject classifications** based on actual content

#### Automatic Subject Creation
- 🆕 **Creates subjects automatically** based on document analysis
- 📚 **Detects common academic subjects** (Software Engineering, Computer Vision, Mathematics, etc.)
- 🎯 **Uses confidence scoring** to ensure accurate classifications
- 🔄 **Learns from document patterns** to improve future classifications

#### Smart Organization Features
- 📁 **Subject bins** with drag-and-drop interface
- 🎨 **Color-coded subjects** for visual organization
- 📈 **Confidence indicators** showing classification certainty
- 🔍 **Manual review** for low-confidence classifications
- 💾 **Bulk operations** for organizing multiple files at once

### 4. Using AI Classification

#### Method 1: Auto-Classification
1. Click the **"AI Classify"** button in the Subject Organization section
2. Adjust the confidence threshold (default: 0.7)
3. Enable "Automatically create new subjects" (recommended)
4. Click "Start AI Analysis"

The system will:
- Analyze each unclassified document
- Extract and understand the content
- Suggest or create appropriate subjects
- Automatically organize files with high confidence
- Flag low-confidence files for manual review

#### Method 2: Manual Classification with AI Suggestions
1. Right-click on any file in the unclassified bin
2. Select "Get AI Suggestions"
3. Review the suggested subjects with confidence scores
4. Choose the best classification or create a new subject

### 5. What the AI Analyzes

#### Document Content
- **PDFs**: Text from first 3 pages (handles scanned documents via OCR if available)
- **Word Documents**: First 20 paragraphs of content
- **Text Files**: First 5000 characters
- **File Names**: Intelligent parsing of naming conventions

#### Context Information
- **Announcement Text**: Original message from Google Classroom
- **Course Context**: Which course the file belongs to
- **File Metadata**: Creation dates, file types, etc.

#### Subject Detection
The AI can identify subjects like:
- 💻 Computer Science, Software Engineering
- 🔬 Physics, Chemistry, Biology
- 📊 Mathematics, Statistics, Data Science
- 🏗️ Engineering disciplines
- 📖 Literature, History, Social Sciences
- 🎨 Arts, Design, Media Studies
- And many more!

### 6. Example Classification Process

For a file named "UNIT-4.pdf":

1. **Content Analysis**: "This document covers software testing methodologies, including unit testing, integration testing, and test-driven development..."

2. **AI Classification**: 
   - **Subject**: "Software Engineering"
   - **Confidence**: 92%
   - **Keywords**: ["testing", "software", "unit testing", "TDD"]
   - **Reasoning**: "Document contains comprehensive coverage of software testing concepts"

3. **Action**: Automatically creates "Software Engineering" subject and classifies the file

### 7. Benefits

#### For Students
- 📚 **Organized study materials** by actual subject content
- 🔍 **Easy retrieval** of specific topic materials
- 📊 **Visual organization** with color-coded subjects
- ⏱️ **Time savings** from manual organization

#### For Researchers
- 🔬 **Content-based categorization** for research papers
- 📈 **Batch processing** of large document collections
- 🧠 **Intelligent insights** into document themes
- 📋 **Automated cataloging** of research materials

### 8. Troubleshooting

#### AI Status Shows "Unavailable"
- Check that your GEMINI_API_KEY is correctly set in `.env`
- Ensure you have internet connectivity
- Verify your API key is valid and has usage quota

#### Low Classification Accuracy
- Try adjusting the confidence threshold
- Review and manually classify a few files to see patterns
- Check that document content is readable (not just images)

#### Performance Issues
- The AI analysis takes time for large documents
- Consider processing files in smaller batches
- PDF text extraction may be slower for scanned documents

### 9. Privacy & Security

- 📡 **Document content is sent to Google's Gemini API** for analysis
- 🔒 **No content is permanently stored** by Google for this API
- 🛡️ **Your files remain local** - only text content is analyzed
- 🔑 **API key is stored locally** in your .env file

---

## Ready to Get Started?

1. ✅ Add your Gemini API key to `.env`
2. ✅ Restart the application
3. ✅ Click "AI Classify" and watch the magic happen!

Your files will be intelligently organized by their actual content, not just filenames. Perfect for those ambiguous files like "UNIT-4.pdf" that could be anything! 🎯
