import { component } from 'sigx';
import type { LayoutProps, LayoutSlots } from '@sigx/ssg';
import { RouterLink } from '@sigx/router';

/**
 * Flip `data-theme` on <html>, which global.css keys off — the daisyUI
 * convention. @sigx/mermaid watches that attribute and re-renders every
 * diagram against the new palette; nothing here talks to mermaid.
 */
function toggleTheme() {
    const root = document.documentElement;
    const current = root.getAttribute('data-theme') ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    root.setAttribute('data-theme', current === 'dark' ? 'light' : 'dark');
}

export default component<LayoutProps, unknown, LayoutSlots>(({ slots }) => {
    return () => (
        <div class="site">
            <header>
                <button type="button" class="theme-toggle" onClick={toggleTheme}>
                    Toggle theme
                </button>
                {/* RouterLink, not <a>: client-side navigation is what makes
                    the enhancer's MutationObserver worth having. */}
                <nav>
                    <RouterLink to="/">Diagrams</RouterLink>
                    {' · '}
                    <RouterLink to="/second/">Second page</RouterLink>
                </nav>
            </header>
            <main>{slots.default?.()}</main>
            <footer>Built with @sigx/ssg and @sigx/mermaid</footer>
        </div>
    );
});
