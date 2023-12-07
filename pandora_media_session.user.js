// ==UserScript==
// @name         Pandora Media Session Support
// @namespace    https://github.com/snaphat/pandora_media_session
// @version      0.4.0
// @description  Shows media session information from Pandora Radio.
// @author       Aaron Landwehr
// @icon         https://raw.githubusercontent.com/snaphat/pandora_media_session_packager/main/assets/pandora_64x64.png
// @match        *://*.pandora.com/*
// @grant        none
// ==/UserScript==
// Note: document-idle breaks this script for firefox.

"use strict";

function willOrIsPlayingPageAudio() {
    return Array.from(document.querySelectorAll('audio')).some(audio => audio.willOrIsPlaying);
}

/**
 * Overloads the play and pause methods of a stub audio element.
 * 
 * The function modifies the play and pause behavior of the provided audio
 * element. It ensures that play is only invoked if no other page audio is 
 * currently playing. Additionally, it manages the playback state in the 
 * browser's media session.
 * 
 * @param {HTMLAudioElement} stubAudio - The audio element whose play and pause 
 *                                       methods are to be overloaded.
 */
function overloadStubAudioPlayPause(stubAudio) {
    // Store original play and pause methods
    let playMethod = stubAudio.play;
    let pauseMethod = stubAudio.pause;

    // Overload the play method
    stubAudio.play = () => {
        // Play the audio only if no other page audio is playing
        if (!willOrIsPlayingPageAudio()) {
            let playPromise = playMethod.call(stubAudio);

            // Handle the promise returned by the play method
            if (playPromise !== undefined) {
                playPromise.catch(error => { });
            }
        }

        // Update the media session's playback state to 'playing'
        navigator.mediaSession.playbackState = "playing";
    };

    // Overload the pause method
    stubAudio.pause = () => {
        // Call the original pause method
        pauseMethod.call(stubAudio);

        // Update the media session's playback state to 'paused'
        navigator.mediaSession.playbackState = "paused";
    };
}


/**
 * Overloads the play and pause methods of a real audio element.
 *
 * This function modifies the play and pause behavior of a given real audio
 * element. It ensures that when the real audio element is played, any stub
 * audio is paused, and the media session's playback state is updated
 * accordingly. The function also maintains a flag (`willOrIsPlaying`) on the
 * real audio element to track its playback state.
 *
 * @param {HTMLAudioElement} realAudio - The real audio element whose play and
 *                                       pause methods are to be overloaded.
 * @param {HTMLAudioElement} stubAudio - The stub audio element that should be
 *                                       paused when the real audio is played.
 */
function overloadRealAudioPlayPause(realAudio, stubAudio) {
    // Store the original play and pause methods
    let playMethod = realAudio.play;
    let pauseMethod = realAudio.pause;

    // Overload the play method
    realAudio.play = () => {
        // Set the flag indicating the audio is playing or will play
        realAudio.willOrIsPlaying = true;

        // Pause the stub audio
        stubAudio.pause();

        // Call the original play method and store its return value
        let returnValue = playMethod.call(realAudio);

        // Update the media session's playback state to 'playing'
        navigator.mediaSession.playbackState = "playing";

        // Return the original method's return value
        return returnValue;
    };

    // Overload the pause method
    realAudio.pause = () => {
        // Reset the flag as the audio is no longer playing
        realAudio.willOrIsPlaying = false;

        // Pause the stub audio
        stubAudio.pause();

        // Call the original pause method
        pauseMethod.call(realAudio);

        // Update the media session's playback state to 'paused'
        navigator.mediaSession.playbackState = "paused";
    };
}

/**
 * Updates the playback state of the stub audio based on a specific DOM mutation.
 *
 * This function checks the mutation details of a target element and changes the
 * playback state of the stub audio element accordingly. If the mutation has an
 * attribute value of "hover_menu_pause_button", then the stub audio will play;
 * otherwise, the stub audio will pause. This function is used within a 
 * MutationObserver to automatically synchronize the stubAudio with changes in 
 * the DOM that affect audio playback.
 *
 * @param {MutationRecord} mutation - The DOM mutation record containing details
 *                                    about the changes that occurred.
 * @param {HTMLAudioElement} stubAudio - The stub audio element whose playback
 *                                       state will be modified.
 */
function updateStubAudioState(mutation, stubAudio) {
    // Play or pause the stub audio based on the mutation's attribute value
    mutation.target.getAttribute(mutation.attributeName) === "hover_menu_pause_button" ? stubAudio.play() : stubAudio.pause();
}

/**
 * Retrieves the source URL of the first image within the first element of a given class.
 *
 * This function is designed to navigate through the DOM starting from the first
 * element of the specified class. It then attempts to access the first child's
 * first child assuming it's an image element and returns its source URL. If any
 * of these elements are not found or the structure is different, it returns an
 * empty string.
 *
 * @param {string} cls - The class name of the element from which the image source is to be extracted.
 * @returns {string} The source URL of the image if found, otherwise an empty string.
 */
function getArt(cls) {
    let e = document.getElementsByClassName(cls);
    return (e && e[0] && e[0].firstChild && e[0].firstChild.firstChild) ? e[0].firstChild.firstChild.src : "";
}

/**
 * Retrieves the text content from the first element of a given class.
 *
 * This function selects the first element with the specified class name and
 * returns its text content. If the element is not found, it returns an empty
 * string. This is useful for extracting text from specific elements identified
 * by their class name.
 *
 * @param {string} cls - The class name of the element whose text content is to be retrieved.
 * @returns {string} The text content of the element if found, otherwise an empty string.
 */
function getText(cls) {
    let e = document.getElementsByClassName(cls);
    return e && e[0] ? e[0].textContent : "";
}

/**
 * Updates the media session metadata based on the currently playing music.
 *
 * This function extracts music information such as the title, artist, album,
 * and artwork from the DOM elements identified by specific class names. It then
 * updates the media session's metadata with this information. If higher quality
 * artwork is available, it replaces the existing artwork URL with the higher
 * resolution version. The media session metadata is updated only if it does not
 * already exist or if any of the music information has changed.
 */
function updateMetadata() {
    // Retrieve music information from the DOM
    let title = getText('Tuner__Audio__TrackDetail__title');
    let artist = getText('Tuner__Audio__TrackDetail__artist');
    let album = getText('nowPlayingTopInfo__current__albumName');
    let art = getArt('Tuner__Audio__TrackDetail__img');

    // Attempt to get higher quality artwork if available
    if (art) art = art.replace("90W", "500W").replace("90H", "500H");

    // Populate and update media session metadata
    let metadata = navigator.mediaSession.metadata;
    if (!metadata || (
        metadata.title !== title || metadata.artist !== artist ||
        metadata.album !== album || metadata.artwork[0]?.src !== art)) {
        navigator.mediaSession.metadata = new MediaMetadata({
            title: title,
            artist: artist,
            album: album,
            artwork: [{ src: art, sizes: '500x500', type: 'image/jpeg' }]
        });
    }
}

/**
 * Simulates a click event on the first element of a given class.
 *
 * This function creates a new 'click' MouseEvent and dispatches it on the first
 * element found with the specified class name. This can be used to programmatically
 * trigger click events on elements that match the given class. The event bubbles
 * and is cancelable, mimicking the behavior of a standard user-initiated click event.
 *
 * @param {string} cls - The class name of the element on which to simulate the click event.
 */
function simulateClick(cls) {
    // Create a new click event
    let clickEvent = new MouseEvent('click', { view: null, bubbles: true, cancelable: true });

    // Get the first element with the specified class
    let e = document.getElementsByClassName(cls)[0];

    // Dispatch the event on the element if it exists
    if (e) e.dispatchEvent(clickEvent);
}

/**
 * Sets up media session action handlers to control audio playback.
 *
 * This function configures the action handlers for the browser's media session.
 * It allows the media session to control audio playback through standard media
 * controls such as play, pause, previous track, and next track. These controls
 * are tied to DOM elements through simulated click events, enabling the media
 * session to interact with a web page's custom audio controls.
 *
 * @param {HTMLAudioElement} stubAudio - The stub audio element which is controlled by the media session.
 */
function setupMediaSessionEventHandlers(stubAudio) {
    // Set action handler for 'play' action
    navigator.mediaSession.setActionHandler('play', () => {
        simulateClick("PlayButton"); // Simulates click on the Play button
    });

    // Set action handler for 'pause' action
    navigator.mediaSession.setActionHandler('pause', () => {
        simulateClick("PlayButton"); // Simulates click on the Play button
    });

    // Set action handler for 'previoustrack' (previous track or replay)
    navigator.mediaSession.setActionHandler('previoustrack', () => {
        simulateClick("ReplayButton"); // Simulates click on the Replay button (Station)
        simulateClick("Tuner__Control__SkipBack__Button"); // Simulates click on the Skip Back button (Playlist)
    });

    // Set action handler for 'nexttrack' (next track)
    navigator.mediaSession.setActionHandler('nexttrack', () => {
        simulateClick("Tuner__Control__Skip__Button"); // Simulates click on the Skip button (Station)
        simulateClick("Tuner__Control__SkipForward__Button"); // Simulates click on the Skip Forward button (Playlist)
    });
}

(function () {
    /**
     * Adds a 'stub' audio element to the DOM.
     * This stub audio is a small, silent audio file used to trick browsers like Firefox
     * into thinking there is always an audio element playing. This is necessary for enabling
     * On-Screen Display (OSD) features, as some browsers require an actual audio file to be playing.
     * The audio file used is very short and silent to be unobtrusive.
     */
    let stubAudio = document.createElement('audio');
    stubAudio.loop = true;
    stubAudio.volume = 0.1;
    stubAudio.src = "data:audio/ogg;base64,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";
    overloadStubAudioPlayPause(stubAudio);

    /**
     * Sets up a MutationObserver to monitor DOM changes.
     * This observer watches for the addition of audio elements and changes to certain attributes.
     * When new audio elements are added, they are processed to overload their play/pause methods.
     * Additionally, changes in specific attributes trigger updates in the stub audio state.
     */
    let observer = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
            mutation.addedNodes.forEach(node => {
                if (node.nodeName === 'AUDIO') overloadRealAudioPlayPause(node, stubAudio);
            });

            if (mutation.type === 'attributes' && mutation.attributeName == "data-qa") {
                updateStubAudioState(mutation, stubAudio);
            }
        });
    });

    // Observer configuration and initiation
    observer.observe(document.body, { attributes: true, childList: true, subtree: true });

    // Overload play/pause for existing audio elements
    document.querySelectorAll('audio').forEach(realAudio => { overloadRealAudioPlayPause(realAudio, stubAudio); });

    // Periodically update media metadata
    setInterval(updateMetadata, 100);

    // Setup media session controls
    setupMediaSessionEventHandlers(stubAudio);
})();
