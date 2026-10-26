(() => {
    const nav = document.querySelector('.nav');
    const links = nav?.querySelector('.nav-links');
    if (!nav || !links || document.getElementById('navMobile')) return;
    let toggle = document.getElementById('navToggle');
    if (!toggle) {
        toggle = document.createElement('button');
        toggle.className = 'nav-toggle';
        toggle.id = 'navToggle';
        toggle.type = 'button';
        toggle.setAttribute('aria-label', 'Open navigation menu');
        toggle.innerHTML = '<span></span><span></span><span></span>';
        nav.querySelector('.nav-container')?.append(toggle);
    }

    const menu = document.createElement('div');
    menu.className = 'nav-mobile';
    menu.id = 'navMobileMenu';
    menu.setAttribute('aria-label', 'Mobile navigation');
    const header = document.createElement('div');
    header.className = 'nav-mobile-header';
    const brand = nav.querySelector('.nav-logo')?.cloneNode(true);
    if (brand) header.append(brand);
    const close = document.createElement('button');
    close.className = 'btn btn-ghost';
    close.type = 'button';
    close.textContent = 'Close';
    close.setAttribute('aria-label', 'Close navigation menu');
    header.append(close);
    const list = document.createElement('div');
    list.className = 'nav-mobile-links';
    links.querySelectorAll('a').forEach(link => {
        const item = document.createElement('a');
        item.href = link.getAttribute('href');
        item.className = `nav-mobile-link${link.classList.contains('active') ? ' active' : ''}`;
        item.textContent = link.textContent.trim();
        list.append(item);
    });
    const actions = nav.querySelector('.nav-actions');
    actions?.querySelectorAll('a').forEach(link => {
        const item = document.createElement('a');
        item.href = link.href;
        item.className = 'nav-mobile-link';
        item.textContent = link.textContent.trim();
        list.append(item);
    });
    menu.append(header, list);
    document.body.append(menu);

    const closeMenu = () => {
        menu.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
    };
    toggle.setAttribute('aria-controls', menu.id);
    toggle.setAttribute('aria-expanded', 'false');
    toggle.addEventListener('click', () => {
        const open = menu.classList.toggle('open');
        toggle.setAttribute('aria-expanded', String(open));
    });
    close.addEventListener('click', closeMenu);
    menu.addEventListener('click', event => { if (event.target === menu) closeMenu(); });
    list.addEventListener('click', event => { if (event.target.closest('a')) closeMenu(); });
    document.addEventListener('keydown', event => { if (event.key === 'Escape') closeMenu(); });
})();
