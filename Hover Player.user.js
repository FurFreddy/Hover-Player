// ==UserScript==
// @name         Hover Player
// @namespace    http://tampermonkey.net/
// @version      1.3
// @description  Hover-Preview for Videos and GIFs on e621, e926 & e6AI
// @author       FurFreddy
// @match        https://e621.net/*
// @match        https://e926.net/*
// @match        https://e6ai.net/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    let currentMedia = null;
    const HOVER_DELAY = 300;
    const LEAVE_DELAY = 100;

    // Get correct API base URL for current site
    function getApiBase() {
        const hostname = location.hostname;
        if (hostname.includes('e6ai.net')) {
            return 'https://e6ai.net';
        } else if (hostname.includes('e926.net')) {
            return 'https://e926.net';
        }
        return 'https://e621.net';  // Default for e621
    }

    // Check if content is animated (video/GIF)
    function isAnimatedContent(postData) {
        if (!postData || !postData.file || !postData.file.ext) return false;
        const ext = postData.file.ext.toLowerCase();
        return ['webm', 'mp4', 'gif'].includes(ext);
    }

    function playMediaInline(postId, mediaType, thumbnailElement, postData) {
        stopCurrentMedia();

        const container = thumbnailElement.closest('.thm-link') || thumbnailElement;
        const originalImg = container.querySelector('img');

        if (!originalImg) return;

        // Store original image state
        const originalParent = originalImg.parentNode;
        const originalStyle = originalImg.style.cssText;

        // Create media container
        const mediaContainer = document.createElement('div');
        mediaContainer.style.cssText = `
            position: relative;
            display: flex;
            justify-content: center;
            align-items: center;
            width: 100%;
            height: 100%;
            min-height: 150px;
            cursor: pointer;
        `;

        if (mediaType === 'video') {
            const video = document.createElement('video');
            video.src = postData.file.url;
            video.controls = false;
            video.muted = true;
            video.loop = true;
            video.autoplay = true;
            video.style.cssText = `
                max-width: 100%;
                max-height: 100%;
                object-fit: contain;
                display: block;
            `;

            mediaContainer.appendChild(video);
            originalParent.replaceChild(mediaContainer, originalImg);

            currentMedia = {
                element: mediaContainer,
                originalImg: originalImg,
                originalStyle: originalStyle,
                originalParent: originalParent,
                container: container,
                type: 'video',
                video: video
            };

        } else if (mediaType === 'gif') {
            const gif = document.createElement('img');
            gif.src = postData.file.url;
            gif.style.cssText = `
                max-width: 100%;
                max-height: 100%;
                object-fit: contain;
                display: block;
            `;

            mediaContainer.appendChild(gif);
            originalParent.replaceChild(mediaContainer, originalImg);

            currentMedia = {
                element: mediaContainer,
                originalImg: originalImg,
                originalStyle: originalStyle,
                originalParent: originalParent,
                container: container,
                type: 'gif'
            };
        }

        // Restore on mouse leave
        mediaContainer.addEventListener('mouseleave', () => {
            setTimeout(() => {
                if (currentMedia && currentMedia.container === container) {
                    stopCurrentMedia();
                }
            }, LEAVE_DELAY);
        });
    }

    function restoreOriginalImage() {
        if (currentMedia && currentMedia.originalImg) {
            if (currentMedia.element.parentNode) {
                // Use replaceChild to preserve exact position
                currentMedia.originalParent.replaceChild(
                    currentMedia.originalImg,
                    currentMedia.element
                );
            }
            currentMedia.originalImg.style.cssText = currentMedia.originalStyle;
            currentMedia = null;
        }
    }

    function stopCurrentMedia() {
        if (currentMedia) {
            if (currentMedia.type === 'video' && currentMedia.video) {
                currentMedia.video.pause();
                currentMedia.video.currentTime = 0;
            }
            restoreOriginalImage();
        }
    }

    function extractPostId(element) {
        // From href - adjusted for different sites
        if (element.href) {
            const match = element.href.match(/\/posts?\/(\d+)/);
            if (match) return match[1];
        }

        // From data-id attribute
        const dataIdElement = element.closest('[data-id]');
        if (dataIdElement) {
            return dataIdElement.getAttribute('data-id');
        }

        // From image alt text
        const img = element.querySelector('img');
        if (img && img.alt) {
            const match = img.alt.match(/post #(\d+)/);
            if (match) return match[1];
        }

        return null;
    }

    function setupHoverEvents() {
        // Broader selector for different sites
        const postLinks = document.querySelectorAll('a.thm-link, a[href*="/posts"], a[href*="/post/"]');

        postLinks.forEach(link => {
            if (link.hasAttribute('data-hover-processed')) return;
            link.setAttribute('data-hover-processed', 'true');

            let hoverTimeout = null;

            link.addEventListener('mouseenter', function(e) {
                const postId = extractPostId(this);
                if (!postId) return;

                hoverTimeout = setTimeout(async () => {
                    try {
                        const apiBase = getApiBase();
                        console.log(`Fetching ${postId} from ${apiBase}`); // Debug
                        const response = await fetch(`${apiBase}/posts/${postId}.json`);
                        if (response.ok) {
                            const data = await response.json();
                            const postData = data.post;

                            if (postData && postData.file && postData.file.url) {
                                const isAnimated = isAnimatedContent(postData);
                                if (isAnimated) {
                                    const mediaType = postData.file.ext.toLowerCase() === 'gif' ? 'gif' : 'video';
                                    playMediaInline(postId, mediaType, this, postData);
                                }
                            }
                        } else {
                            console.log(`API response not ok: ${response.status} for ${apiBase}/posts/${postId}`);
                        }
                    } catch (error) {
                        console.log(`Error fetching post ${postId} from ${getApiBase()}:`, error);
                    } finally {
                        hoverTimeout = null;
                    }
                }, HOVER_DELAY);
            });

            link.addEventListener('mouseleave', function(e) {
                if (hoverTimeout) {
                    clearTimeout(hoverTimeout);
                    hoverTimeout = null;
                }

                const relatedTarget = e.relatedTarget;
                if (!relatedTarget || !this.contains(relatedTarget)) {
                    setTimeout(() => {
                        if (currentMedia && currentMedia.container === this) {
                            stopCurrentMedia();
                        }
                    }, LEAVE_DELAY);
                }
            });
        });
    }

    function init() {
        setupHoverEvents();

        // Update on new content (infinite scroll, etc.)
        const observer = new MutationObserver(function(mutations) {
            let shouldUpdate = false;
            mutations.forEach(function(mutation) {
                if (mutation.addedNodes.length) {
                    shouldUpdate = true;
                }
            });
            if (shouldUpdate) {
                setTimeout(() => {
                    setupHoverEvents();
                }, 100);
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        // Stop media on escape key
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                stopCurrentMedia();
            }
        });
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
