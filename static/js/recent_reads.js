class RecentReadsManager {
    constructor() {
        this.STORAGE_KEY = 'xining_recent_reads';
        this.MAX_ITEMS = 5; // Max number of recent items to store
        // No need to load initially here, getRecentReads will always fetch
    }

    getRecentReads() {
        try {
            const storedRecentReads = localStorage.getItem(this.STORAGE_KEY);
            if (storedRecentReads) {
                return JSON.parse(storedRecentReads);
            }
        } catch (e) {
            console.error("Error parsing recent reads from localStorage:", e);
        }
        return [];
    }

    saveRecentReads(recentReadsArray) {
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(recentReadsArray));
        } catch (e) {
            console.error("Error saving recent reads to localStorage:", e);
        }
    }

    addRecentRead(filePath, fileName) {
        if (!filePath || !fileName) {
            console.warn("Attempted to add recent read with invalid filePath or fileName.");
            return;
        }

        let currentRecentReads = this.getRecentReads();

        // Create new item
        const newItem = {
            path: filePath,
            name: fileName,
            timestamp: new Date().getTime()
        };

        // Remove any existing item with the same path to update its position and timestamp
        currentRecentReads = currentRecentReads.filter(item => item.path !== filePath);

        // Add new item to the beginning of the list
        currentRecentReads.unshift(newItem);

        // Ensure list does not exceed MAX_ITEMS
        if (currentRecentReads.length > this.MAX_ITEMS) {
            currentRecentReads = currentRecentReads.slice(0, this.MAX_ITEMS);
        }

        this.saveRecentReads(currentRecentReads);
        console.log(`Added to recent reads: ${fileName} (${filePath})`);
    }
}

const recentReadsManager = new RecentReadsManager();

// Function to display recent reads on the index page
function displayRecentReads() {
    const recentReadsListContainer = document.getElementById('recent-reads-list');
    const emptyRecentReadsMessage = document.getElementById('empty-recent-reads-message');

    // Check if we are on the index page and the container exists
    if (!recentReadsListContainer || !emptyRecentReadsMessage) {
        return;
    }

    const recentReads = recentReadsManager.getRecentReads();

    if (recentReads.length === 0) {
        emptyRecentReadsMessage.style.display = 'block';
        recentReadsListContainer.style.display = 'none';
    } else {
        emptyRecentReadsMessage.style.display = 'none';
        recentReadsListContainer.style.display = 'block';
        recentReadsListContainer.innerHTML = ''; // Clear existing items

        recentReads.forEach(item => {
            const listItem = document.createElement('li');
            const link = document.createElement('a');
            // Note: url_for is Python/Jinja. In JS, we construct the URL manually.
            // Assuming read_file_url_template is available globally or passed appropriately if complex routing is needed.
            // For simple query param like /read?path=...
            link.href = `/read?path=${encodeURIComponent(item.path)}`;
            link.textContent = item.name;
            // Add a class for styling if needed, e.g., link.className = 'recent-read-link';

            const timestamp = new Date(item.timestamp);
            const timeAgo = document.createElement('span');
            timeAgo.textContent = ` - ${timestamp.toLocaleDateString()} ${timestamp.toLocaleTimeString()}`;
            timeAgo.style.fontSize = '0.8em';
            timeAgo.style.color = '#666'; // Style as needed

            listItem.appendChild(link);
            listItem.appendChild(timeAgo);
            recentReadsListContainer.appendChild(listItem);
        });
    }
}

// Call displayRecentReads on DOMContentLoaded if the relevant elements are on the page
document.addEventListener('DOMContentLoaded', function() {
    // This will attempt to display recent reads if the list container is found.
    // It's primarily for the index page.
    if (document.getElementById('recent-reads-list')) {
        displayRecentReads();
    }

    // Logic for adding to recent reads will be in specific reader page templates.
});
