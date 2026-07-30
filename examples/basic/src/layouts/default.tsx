import { component } from 'sigx';
import type { LayoutProps, LayoutSlots } from '@sigx/ssg';
import { RouterLink } from '@sigx/router';

export default component<LayoutProps, unknown, LayoutSlots>(({ slots }) => {
    return () => (
        <div class="site">
            <header>
                {/* RouterLink, not <a>: client-side navigation is what makes
                    the enhancer's MutationObserver worth having. */}
                <nav>
                    <RouterLink to="/">Diagrams</RouterLink>
                    {' · '}
                    <RouterLink to="/second/">Second page</RouterLink>
                </nav>
            </header>
            <main>{slots.default()}</main>
            <footer>Built with @sigx/ssg and @sigx/mermaid</footer>
        </div>
    );
});
