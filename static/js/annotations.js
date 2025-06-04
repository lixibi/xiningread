class AnnotationsManager {
    constructor() {
        this.STORAGE_KEY_PREFIX = 'xining_annotations_'; // One key per file
        this.notes = {}; // In-memory cache for current file's notes
        this.currentFilePath = null;
    }

    _getStorageKey(filePath) {
        if (!filePath) return null;
        // Use a simpler key, btoa might not be needed if filePath is a simple relative path
        return `${this.STORAGE_KEY_PREFIX}${filePath.replace(/[^a-zA-Z0-9-_]/g, '_')}`;
    }

    setCurrentFile(filePath) {
        this.currentFilePath = filePath;
        this.notes = this._loadNotesForFile(filePath);
    }

    _loadNotesForFile(filePath) {
        if (!filePath) return [];
        const storageKey = this._getStorageKey(filePath);
        try {
            const storedNotes = localStorage.getItem(storageKey);
            if (storedNotes) {
                return JSON.parse(storedNotes);
            }
        } catch (e) {
            console.error(`Error parsing notes for ${filePath}:`, e);
        }
        return [];
    }

    getNotesForCurrentFile() {
        return this.notes || [];
    }

    _saveNotesForCurrentFile() {
        if (!this.currentFilePath) return;
        const storageKey = this._getStorageKey(this.currentFilePath);
        try {
            localStorage.setItem(storageKey, JSON.stringify(this.notes));
        } catch (e) {
            console.error(`Error saving notes for ${this.currentFilePath}:`, e);
        }
    }

    generateNoteId() {
        return `note_${new Date().getTime()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    addNote(noteObject) {
        if (!this.currentFilePath || !noteObject) return null;

        const newNote = { ...noteObject, id: this.generateNoteId() };
        this.notes.push(newNote);
        this._saveNotesForCurrentFile();
        console.log('Note added:', newNote);
        return newNote;
    }

    deleteNote(noteId) {
        if (!this.currentFilePath || !noteId) return;
        const initialLength = this.notes.length;
        this.notes = this.notes.filter(note => note.id !== noteId);
        if (this.notes.length < initialLength) {
            this._saveNotesForCurrentFile();
            console.log('Note deleted:', noteId);
            return true;
        }
        return false;
    }

    updateNoteComment(noteId, comment) {
        if (!this.currentFilePath || !noteId) return false;
        const note = this.notes.find(n => n.id === noteId);
        if (note) {
            note.comment = comment;
            this._saveNotesForCurrentFile();
            console.log('Note updated:', note);
            return true;
        }
        return false;
    }

    getNoteById(noteId) {
        if (!this.currentFilePath || !noteId) return null;
        return this.notes.find(n => n.id === noteId) || null;
    }
}

const annotationsManager = new AnnotationsManager();

// Helper function to get a simplified path to a node (for MD/HTML)
// This is a very basic example and might need significant improvement for robustness
function getPathTo(element) {
    if (element.id!=='') return 'id("'+element.id+'")';
    if (element===document.body) return element.tagName.toLowerCase();

    let ix= 0;
    const siblings= element.parentNode.childNodes;
    for (let i= 0; i<siblings.length; i++) {
        const sibling= siblings[i];
        if (sibling===element) return getPathTo(element.parentNode)+'/'+element.tagName.toLowerCase()+'['+(ix+1)+']';
        if (sibling.nodeType===1 && sibling.tagName === element.tagName) ix++;
    }
}
