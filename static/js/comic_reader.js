document.addEventListener('DOMContentLoaded', function() {
    if (typeof comicData === 'undefined' || !comicData) {
        console.error('Comic data not found. Ensure it is passed correctly from the template.');
        // Optionally display an error message to the user in the UI
        const imageContainer = document.getElementById('comic-image-container');
        if (imageContainer) {
            imageContainer.innerHTML = '<p style="color: red; text-align: center;">无法加载漫画数据。</p>';
        }
        return;
    }

    const prevButton = document.getElementById('prev-comic-page');
    const nextButton = document.getElementById('next-comic-page');
    const currentPageSpan = document.getElementById('current-comic-page');
    const totalPagesSpan = document.getElementById('total-comic-pages'); // Already set by template
    const comicImage = document.getElementById('comic-image');

    let currentPageIndex = 0; // 0-indexed
    let recentReadAdded = false; // Flag to ensure addRecentRead is called only once

    function loadPage(pageIndex) {
        if (pageIndex < 0 || pageIndex >= comicData.total_pages) {
            console.warn(`Invalid page index: ${pageIndex}`);
            return;
        }

        // Update current page index
        currentPageIndex = pageIndex;

        const imageFilename = comicData.image_list[pageIndex];
        // Filenames from zipfile should generally be UTF-8.
        // Browsers handle UTF-8 in URLs, but spaces or special chars need encoding.
        const encodedImageFilename = encodeURIComponent(imageFilename);

        // Construct the URL for the image
        // comicData.comic_file_path_encoded is already URL-encoded by Python's quote()
        const imageUrl = `/comic_page_data/${comicData.comic_file_path_encoded}/${encodedImageFilename}`;

        comicImage.src = imageUrl;
        comicImage.alt = `漫画第 ${pageIndex + 1} 页`;
        if (currentPageSpan) currentPageSpan.textContent = pageIndex + 1;

        // Update button states
        if (prevButton) prevButton.disabled = (pageIndex === 0);
        if (nextButton) nextButton.disabled = (pageIndex === comicData.total_pages - 1);

        // Add to recent reads only once when the first page of the comic is loaded
        if (!recentReadAdded && typeof recentReadsManager !== 'undefined' && comicData.current_file_path_for_recent && comicData.original_filename) {
            recentReadsManager.addRecentRead(comicData.current_file_path_for_recent, comicData.original_filename);
            recentReadAdded = true;
            console.log("Added to recent reads from comic_reader.js using comicData.original_filename");
        }

        // Scroll to top of page/image container might be useful
        window.scrollTo(0, 0); // Or scroll specific container
    }

    // Event Listeners for buttons
    if (prevButton) {
        prevButton.addEventListener('click', function() {
            if (currentPageIndex > 0) {
                loadPage(currentPageIndex - 1);
            }
        });
    }

    if (nextButton) {
        nextButton.addEventListener('click', function() {
            if (currentPageIndex < comicData.total_pages - 1) {
                loadPage(currentPageIndex + 1);
            }
        });
    }

    // Keyboard navigation (optional, but good for UX)
    document.addEventListener('keydown', function(e) {
        if (e.key === 'ArrowLeft') { // Previous page
            if (prevButton && !prevButton.disabled) prevButton.click();
        } else if (e.key === 'ArrowRight') { // Next page
            if (nextButton && !nextButton.disabled) nextButton.click();
        }
    });

    // Initial load
    if (comicData.total_pages > 0) {
        loadPage(0); // Load the first page
    } else {
        comicImage.alt = '漫画为空或没有图片。';
        if (currentPageSpan) currentPageSpan.textContent = '0';
        if (prevButton) prevButton.disabled = true;
        if (nextButton) nextButton.disabled = true;
        // Optionally inform recentReadsManager even for empty comics if that's desired
        if (!recentReadAdded && typeof recentReadsManager !== 'undefined' && comicData.current_file_path_for_recent && comicData.original_filename) {
             recentReadsManager.addRecentRead(comicData.current_file_path_for_recent, comicData.original_filename);
             recentReadAdded = true;
        }
    }
});
