class MetadataEditorManager {
    constructor() {
        this.STORAGE_KEY = 'xining_user_metadata';
        this.metadataCache = this._loadAllUserMetadata(); // Cache all metadata for performance
    }

    _loadAllUserMetadata() {
        try {
            const storedData = localStorage.getItem(this.STORAGE_KEY);
            return storedData ? JSON.parse(storedData) : {};
        } catch (e) {
            console.error("Error loading all user metadata:", e);
            return {};
        }
    }

    _saveAllUserMetadata() {
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.metadataCache));
        } catch (e) {
            console.error("Error saving all user metadata:", e);
        }
    }

    getUserMetadata(filePath) {
        return this.metadataCache[filePath] || null;
    }

    saveUserMetadata(filePath, metadataObject) {
        if (!filePath || !metadataObject) return;

        // Ensure we only save known fields, e.g., title and author
        const cleanMetadata = {};
        if (metadataObject.title !== undefined) {
            cleanMetadata.title = metadataObject.title.trim();
        }
        if (metadataObject.author !== undefined) {
            cleanMetadata.author = metadataObject.author.trim();
        }

        // If both are empty, consider removing the entry
        if (!cleanMetadata.title && !cleanMetadata.author) {
            delete this.metadataCache[filePath];
        } else {
            this.metadataCache[filePath] = cleanMetadata;
        }
        this._saveAllUserMetadata();
        console.log(`User metadata saved for ${filePath}:`, cleanMetadata);
    }

    // Get display title: custom title if set, otherwise original (fallback) title
    getDisplayTitle(filePath, originalTitle) {
        const userMeta = this.getUserMetadata(filePath);
        return (userMeta && userMeta.title) ? userMeta.title : originalTitle;
    }

    // Get display author: custom author if set, otherwise original (fallback) author (if provided)
    // If originalAuthor is not consistently available, this will mostly return user-defined or empty.
    getDisplayAuthor(filePath, originalAuthor = "") {
        const userMeta = this.getUserMetadata(filePath);
        return (userMeta && userMeta.author) ? userMeta.author : originalAuthor;
    }
}

const metadataEditorManager = new MetadataEditorManager();

// UI Interaction Logic (will be expanded for modal interaction)
document.addEventListener('DOMContentLoaded', function() {
    const modal = document.getElementById('metadata-editor-modal');
    const filenameSpan = document.getElementById('meta-editor-filename');
    const filepathInput = document.getElementById('meta-editor-filepath');
    const titleInput = document.getElementById('meta-editor-title');
    const authorInput = document.getElementById('meta-editor-author');
    const saveButton = document.getElementById('meta-editor-save');
    const cancelButton = document.getElementById('meta-editor-cancel');

    // Function to open the modal
    window.openMetadataEditor = function(filePath, originalFileName) {
        if (!modal) return;

        filepathInput.value = filePath;
        filenameSpan.textContent = originalFileName; // Display original name as reference

        const userMeta = metadataEditorManager.getUserMetadata(filePath);
        titleInput.value = (userMeta && userMeta.title) ? userMeta.title : ''; // Prefer empty if no custom title
        authorInput.value = (userMeta && userMeta.author) ? userMeta.author : '';

        modal.style.display = 'block';
    };

    // Close modal
    function closeModal() {
        if (modal) modal.style.display = 'none';
    }

    if (cancelButton) {
        cancelButton.addEventListener('click', closeModal);
    }

    if (saveButton) {
        saveButton.addEventListener('click', function() {
            const filePath = filepathInput.value;
            const title = titleInput.value.trim();
            const author = authorInput.value.trim();

            if (!filePath) return;

            metadataEditorManager.saveUserMetadata(filePath, { title, author });
            closeModal();

            // Dispatch an event to notify other parts of the app (e.g., file list) to update
            // This is better than direct DOM manipulation from here if list is complex
            document.dispatchEvent(new CustomEvent('metadataUpdated', { detail: { filePath: filePath } }));
        });
    }

    // Close modal if clicked outside (optional)
    if (modal) {
        modal.addEventListener('click', function(event) {
            if (event.target === modal) { // Clicked on the modal backdrop
                closeModal();
            }
        });
    }
});
