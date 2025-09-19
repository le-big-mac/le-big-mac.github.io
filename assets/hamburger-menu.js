// Hamburger menu functionality
document.addEventListener('DOMContentLoaded', function() {
    // Check for touchscreen devices
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

    // Target the hamburger menu, menu, and the document for event listeners
    const hamburgerMenu = document.querySelector('.hamburger-menu');
    const navMenu = document.querySelector('.nav');

    if (hamburgerMenu && navMenu) {
        // Event listener for the hamburger menu
        hamburgerMenu.addEventListener(isTouchDevice ? 'click' : 'mouseover', () => {
            navMenu.classList.toggle('show');
        });

        // Event listener to close the menu when clicking outside of it
        document.addEventListener('click', (event) => {
            // If the click didn't happen inside the menu or the hamburger icon, and
            // the menu is visible, then remove the 'show' class.
            if (!hamburgerMenu.contains(event.target) && !navMenu.contains(event.target) && navMenu.classList.contains('show')) {
                navMenu.classList.remove('show');
            }
        });
    }
});
