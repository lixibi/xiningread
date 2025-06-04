class FavoritesManager {
    constructor() {
        this.STORAGE_KEY = 'xining_favorites';
        this.favorites = this.getFavorites(); // Load initially
    }

    getFavorites() {
        try {
            const storedFavorites = localStorage.getItem(this.STORAGE_KEY);
            if (storedFavorites) {
                return JSON.parse(storedFavorites);
            }
        } catch (e) {
            console.error("Error parsing favorites from localStorage:", e);
        }
        return [];
    }

    saveFavorites(favoritesArray) {
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(favoritesArray));
            this.favorites = favoritesArray; // Update internal state
        } catch (e) {
            console.error("Error saving favorites to localStorage:", e);
        }
    }

    addFavorite(filePath) {
        if (!this.isFavorite(filePath)) {
            const currentFavorites = this.getFavorites(); // Get latest from storage
            currentFavorites.push(filePath);
            this.saveFavorites(currentFavorites);
            console.log(`Added favorite: ${filePath}`);
        }
    }

    removeFavorite(filePath) {
        const currentFavorites = this.getFavorites(); // Get latest from storage
        const updatedFavorites = currentFavorites.filter(fav => fav !== filePath);
        this.saveFavorites(updatedFavorites);
        console.log(`Removed favorite: ${filePath}`);
    }

    isFavorite(filePath) {
        // Use the internal this.favorites for quick checks, but ensure it's up-to-date if multiple tabs could change it.
        // For this app, assuming single tab interaction or accepting slight delay if changed in another tab.
        // Alternatively, always call this.getFavorites() for absolute certainty.
        return this.favorites.includes(filePath);
    }
}

const favoritesManager = new FavoritesManager();

// Integration logic will be added here later in Phase 4
document.addEventListener('DOMContentLoaded', function() {
    const favoriteButtons = document.querySelectorAll('.btn-favorite');

    function updateButtonAppearance(button, filePath) {
        const icon = button.querySelector('.favorite-icon');
        if (favoritesManager.isFavorite(filePath)) {
            if (icon) icon.textContent = '★'; // Solid star for favorited
            button.classList.add('favorited');
            button.title = '取消收藏';
        } else {
            if (icon) icon.textContent = '☆'; // Empty star for not favorited
            button.classList.remove('favorited');
            button.title = '收藏';
        }
    }

    favoriteButtons.forEach(button => {
        const filePath = button.dataset.filepath;
        if (filePath) {
            updateButtonAppearance(button, filePath); // Set initial state

            button.addEventListener('click', function() {
                if (favoritesManager.isFavorite(filePath)) {
                    favoritesManager.removeFavorite(filePath);
                } else {
                    favoritesManager.addFavorite(filePath);
                }
                updateButtonAppearance(button, filePath); // Update after click
            });
        }
    });
});
