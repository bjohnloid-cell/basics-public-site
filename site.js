(() => {
    const config = window.BASICS_PUBLIC_CONFIG || {};
    const status = document.getElementById('announcement-status');
    const announcements = document.getElementById('announcement-list');
    const staffList = document.getElementById('staff-list');

    const setText = (selector, value) => {
        if (!value) return;
        document.querySelectorAll(selector).forEach((element) => {
            element.textContent = value;
        });
    };

    const renderStaff = (staff = []) => {
        staffList.replaceChildren();

        if (!staff.length) {
            const empty = document.createElement('p');
            empty.className = 'empty-staff';
            empty.textContent = 'Staff information is not currently available.';
            staffList.append(empty);
            return;
        }

        staff.forEach((person) => {
            const card = document.createElement('article');
            card.className = 'staff-card';
            const name = document.createElement('h3');
            name.textContent = person.name || '';
            const position = document.createElement('p');
            position.textContent = person.position || '';
            card.append(name, position);
            staffList.append(card);
        });
    };

    const renderAnnouncements = (items = []) => {
        announcements.replaceChildren();

        if (!items.length) {
            status.textContent = 'There are no published announcements right now. Please check again soon.';
            status.hidden = false;
            return;
        }

        status.hidden = true;
        items.forEach((item) => {
            const card = document.createElement('article');
            card.className = 'announcement-card';

            if (item.image_url) {
                const image = document.createElement('img');
                image.className = 'announcement-image';
                image.src = item.image_url;
                image.alt = item.title || 'Announcement image';
                image.loading = 'lazy';
                card.append(image);
            } else {
                const placeholder = document.createElement('div');
                placeholder.className = 'announcement-placeholder';
                placeholder.setAttribute('aria-hidden', 'true');
                const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                icon.setAttribute('class', 'icon-svg');
                icon.setAttribute('viewBox', '0 0 24 24');
                [
                    'm3 11 18-5v12L3 13z',
                    'M11.6 15.4 13 21l4-1-2.2-5.4M3 11v2'
                ].forEach((pathData) => {
                    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                    path.setAttribute('d', pathData);
                    icon.append(path);
                });
                placeholder.append(icon);
                card.append(placeholder);
            }

            const content = document.createElement('div');
            content.className = 'announcement-body';
            const date = document.createElement('time');
            date.className = 'announcement-date';
            const publishedAt = item.published_at ? new Date(item.published_at) : null;
            if (publishedAt && !Number.isNaN(publishedAt.valueOf())) {
                date.dateTime = publishedAt.toISOString();
                date.textContent = new Intl.DateTimeFormat('en', {
                    month: 'long',
                    day: '2-digit',
                    year: 'numeric'
                }).format(publishedAt).toUpperCase();
            }

            const title = document.createElement('h3');
            title.textContent = item.title || '';
            content.append(date, title);

            if (item.slogan) {
                const slogan = document.createElement('p');
                slogan.className = 'announcement-slogan';
                slogan.textContent = item.slogan;
                content.append(slogan);
            }

            const body = document.createElement('p');
            body.className = 'announcement-copy';
            const fullText = (item.body || '').replace(/<[^>]*>/g, '');
            body.textContent = fullText.slice(0, 145);
            content.append(body);

            if (fullText.length > 145) {
                const fullBody = document.createElement('p');
                fullBody.className = 'announcement-copy announcement-full-copy';
                fullBody.hidden = true;
                fullBody.textContent = fullText;
                content.append(fullBody);

                const more = document.createElement('button');
                more.className = 'announcement-link';
                more.type = 'button';
                more.textContent = 'Read announcement →';
                more.addEventListener('click', () => {
                    const expanded = fullBody.hidden;
                    fullBody.hidden = !expanded;
                    more.textContent = expanded ? 'Show less ↑' : 'Read announcement →';
                });
                content.append(more);
            }

            card.append(content);
            announcements.append(card);
        });
    };

    const setContact = (selector, value, prefix) => {
        const link = document.querySelector(selector);
        if (!value) {
            link.hidden = true;
            return;
        }
        link.hidden = false;
        link.querySelector('[data-contact-value]').textContent = value;
        link.href = `${prefix}${value.replace(/[^\d+]/g, '')}`;
        if (prefix === 'mailto:') link.href = `${prefix}${value}`;
    };

    const loadPublicContent = async () => {
        if (!config.supabaseUrl || !config.supabaseAnonKey) {
            status.textContent = 'Public updates are not configured yet.';
            return;
        }

        try {
            const response = await fetch(
                `${config.supabaseUrl.replace(/\/$/, '')}/rest/v1/public_site_content?select=payload&limit=1`,
                {
                    headers: {
                        apikey: config.supabaseAnonKey
                    },
                    cache: 'no-store'
                }
            );

            if (!response.ok) throw new Error(`Supabase returned HTTP ${response.status}`);

            const [row] = await response.json();
            if (!row || !row.payload) throw new Error('Public-site content has not been synchronized yet');

            const { barangay = {}, staff = [], announcements: items = [] } = row.payload;
            const name = barangay.barangay_name || 'Barangay Uyong';
            const municipality = barangay.municipality || 'Labrador';
            const province = barangay.province || 'Pangasinan';
            setText('[data-field="name"]', name);
            setText('[data-field="municipality"]', municipality);
            setText('[data-field="province"]', province);
            setText('[data-field="location"]', `${municipality}, ${province}`);
            setText('[data-field="region"]', `${municipality} · ${province}`);

            const address = document.querySelector('[data-contact="address"] [data-contact-value]');
            address.textContent = barangay.address || `Uyong, ${municipality}, ${province}`;
            setContact('[data-contact="phone"]', barangay.contact_number, 'tel:');
            setContact('[data-contact="email"]', barangay.email, 'mailto:');
            const contactCta = document.querySelector('[data-contact-cta]');
            contactCta.hidden = !barangay.email;
            if (barangay.email) contactCta.href = `mailto:${barangay.email}`;
            renderStaff(staff);
            renderAnnouncements(items);
        } catch (error) {
            console.error('Unable to load the public barangay updates.', error);
            status.textContent = 'Public updates are temporarily unavailable. Please try again later.';
        }
    };

    loadPublicContent();
    window.setInterval(loadPublicContent, 60_000);
})();
