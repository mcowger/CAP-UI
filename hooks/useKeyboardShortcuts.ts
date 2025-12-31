/**
 * Keyboard Shortcuts Hook
 *
 * Global keyboard shortcut handling.
 */

import { useEffect } from 'react';

export interface KeyboardShortcut {
    key: string;
    ctrlKey?: boolean;
    metaKey?: boolean;
    shiftKey?: boolean;
    altKey?: boolean;
    handler: (event: KeyboardEvent) => void;
    description?: string;
}

export function useKeyboardShortcuts(shortcuts: KeyboardShortcut[], enabled = true) {
    useEffect(() => {
        if (!enabled) return;

        const handleKeyDown = (event: KeyboardEvent) => {
            // Don't trigger shortcuts when typing in inputs, textareas, or contenteditable
            const target = event.target as HTMLElement;
            if (
                target.tagName === 'INPUT' ||
                target.tagName === 'TEXTAREA' ||
                target.isContentEditable
            ) {
                // Exception: Allow Escape key even in inputs
                if (event.key !== 'Escape') {
                    return;
                }
            }

            for (const shortcut of shortcuts) {
                const keyMatches = event.key.toLowerCase() === shortcut.key.toLowerCase();
                const ctrlMatches = shortcut.ctrlKey !== undefined ? event.ctrlKey === shortcut.ctrlKey : true;
                const metaMatches = shortcut.metaKey !== undefined ? event.metaKey === shortcut.metaKey : true;
                const shiftMatches = shortcut.shiftKey !== undefined ? event.shiftKey === shortcut.shiftKey : true;
                const altMatches = shortcut.altKey !== undefined ? event.altKey === shortcut.altKey : true;

                // Special handling for Ctrl/Cmd key combinations
                if (shortcut.ctrlKey || shortcut.metaKey) {
                    const modifierMatches = (
                        (shortcut.ctrlKey && event.ctrlKey) ||
                        (shortcut.metaKey && event.metaKey)
                    );

                    if (keyMatches && modifierMatches && shiftMatches && altMatches) {
                        event.preventDefault();
                        shortcut.handler(event);
                        break;
                    }
                } else {
                    if (keyMatches && ctrlMatches && metaMatches && shiftMatches && altMatches) {
                        event.preventDefault();
                        shortcut.handler(event);
                        break;
                    }
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [shortcuts, enabled]);
}

export default useKeyboardShortcuts;
