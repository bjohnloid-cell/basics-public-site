(() => {
    const config = window.BASICS_PUBLIC_CONFIG || {};
    const status = document.getElementById('announcement-status');
    const announcements = document.getElementById('announcement-list');
    const staffList = document.getElementById('staff-list');
    const concernForm = document.getElementById('concern-form');
    const concernStatus = document.getElementById('concern-status');
    const concernSubmit = document.getElementById('concern-submit');
    const concernDialog = document.getElementById('concern-dialog');
    const concernDetails = concernForm?.querySelector('[name="message"]');
    let pendingConcernSubmissionId = null;
    let concernSubmissionInFlight = false;
    const certificateGrid = document.querySelector('.service-grid');
    const certificateDialog = document.getElementById('certificate-request-dialog');
    const certificateForm = document.getElementById('certificate-request-form');
    const certificateStatus = document.getElementById('certificate-request-status');
    const certificateSubmit = document.getElementById('certificate-request-submit');
    let pendingCertificateSubmissionId = null;
    let certificateSubmissionInFlight = false;

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
        announcements.classList.toggle('announcement-grid-single', items.length === 1);

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

    const resizeConcernDetails = () => {
        if (!concernDetails) return;

        concernDetails.style.height = 'auto';
        const maxHeight = Number.parseFloat(getComputedStyle(concernDetails).maxHeight);
        concernDetails.style.height = `${Math.min(concernDetails.scrollHeight, maxHeight)}px`;
        concernDetails.style.overflowY = concernDetails.scrollHeight > maxHeight ? 'auto' : 'hidden';
    };

    concernDetails?.addEventListener('input', resizeConcernDetails);

    const setSubmissionFieldsDisabled = (form, disabled) => {
        form.querySelectorAll('input:not([type="hidden"]), select, textarea')
            .forEach((field) => { field.disabled = disabled; });
    };

    certificateForm?.addEventListener('input', () => {
        if (!certificateSubmissionInFlight) pendingCertificateSubmissionId = null;
    });
    certificateForm?.addEventListener('change', () => {
        if (!certificateSubmissionInFlight) pendingCertificateSubmissionId = null;
    });
    concernForm?.addEventListener('input', () => {
        if (!concernSubmissionInFlight) pendingConcernSubmissionId = null;
    });
    concernForm?.addEventListener('change', () => {
        if (!concernSubmissionInFlight) pendingConcernSubmissionId = null;
    });

    certificateGrid?.querySelectorAll('.service-card').forEach((card) => {
        card.setAttribute('role', 'button');
        card.setAttribute('tabindex', '0');
        card.setAttribute('aria-label', `Request ${card.querySelector('h3')?.textContent.trim() || 'certificate'}`);
    });

    const openCertificateRequest = (card) => {
        const certificateType = card.querySelector('h3')?.textContent.trim();
        if (!certificateType || !certificateForm || !certificateDialog) return;

        certificateForm.reset();
        certificateForm.elements.namedItem('certificate_type').value = certificateType;
        certificateStatus.hidden = true;
        certificateStatus.className = 'concern-message';
        certificateDialog.showModal();
        certificateForm.elements.namedItem('requester_name').focus();
    };

    certificateGrid?.addEventListener('click', (event) => {
        const card = event.target.closest('.service-card');
        if (card) openCertificateRequest(card);
    });

    certificateGrid?.addEventListener('keydown', (event) => {
        if (event.target.matches('.service-card') && (event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault();
            openCertificateRequest(event.target);
        }
    });

    document.getElementById('certificate-request-close')?.addEventListener('click', () => {
        certificateDialog.close();
    });

    document.getElementById('concern-open')?.addEventListener('click', () => {
        concernDialog.showModal();
        resizeConcernDetails();
        concernForm.querySelector('[name="sender_name"]').focus();
    });

    document.getElementById('concern-close')?.addEventListener('click', () => {
        concernDialog.close();
    });

    certificateForm?.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (certificateSubmissionInFlight) return;

        const formData = new FormData(certificateForm);
        if (formData.get('website')) return;

        certificateSubmissionInFlight = true;
        certificateStatus.hidden = false;
        certificateStatus.className = 'concern-message';
        certificateStatus.textContent = 'Ipinapadala ang iyong certificate request...';
        certificateSubmit.disabled = true;
        setSubmissionFieldsDisabled(certificateForm, true);

        try {
            if (!config.supabaseUrl || !config.supabaseAnonKey) {
                throw new Error('Hindi pa naka-configure ang certificate request submission.');
            }

            const email = String(formData.get('email') || '').trim();
            const validIdNumber = String(formData.get('valid_id_number') || '').trim();
            if (!email) {
                throw new Error('Maglagay ng email para matanggap ang status ng request.');
            }
            if (!validIdNumber) {
                throw new Error('Ilagay ang numero ng iyong valid ID.');
            }

            pendingCertificateSubmissionId ||= crypto.randomUUID();
            const response = await fetch(
                `${config.supabaseUrl.replace(/\/$/, '')}/functions/v1/submit-public-certificate-request`,
                {
                    method: 'POST',
                    headers: {
                        apikey: config.supabaseAnonKey,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        submission_id: pendingCertificateSubmissionId,
                        requester_name: String(formData.get('requester_name') || '').trim(),
                        email: email || null,
                        contact_number: String(formData.get('contact_number') || '').trim() || null,
                        valid_id_type: String(formData.get('valid_id_type') || ''),
                        valid_id_number: validIdNumber,
                        certificate_type: String(formData.get('certificate_type') || ''),
                        purpose: String(formData.get('purpose') || '').trim()
                    })
                }
            );

            const result = await response.json().catch(() => null);
            if (!response.ok || !result?.saved) {
                console.error('Certificate request submission rejected by Supabase.', response.status);
                if (response.status === 429) {
                    throw new Error('Dalawang certificate request na ang naipadala mula sa koneksyong ito. Pakisubukang muli pagkalipas ng isang oras.');
                }
                throw new Error('Hindi naipadala ang request. Pakisubukang muli mamaya.');
            }

            certificateForm.reset();
            pendingCertificateSubmissionId = null;
            certificateStatus.classList.add('success');
            certificateStatus.textContent = 'Natanggap na ang iyong request. Ipapadala sa email mo ang update kapag naaprubahan o tinanggihan ito.';
        } catch (error) {
            console.error('Unable to submit public certificate request.', error);
            certificateStatus.classList.add('error');
            certificateStatus.textContent = error.message || 'Hindi naipadala ang request. Pakisubukang muli mamaya.';
        } finally {
            certificateSubmit.disabled = false;
            setSubmissionFieldsDisabled(certificateForm, false);
            certificateSubmissionInFlight = false;
        }
    });

    concernForm?.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (concernSubmissionInFlight) return;

        const formData = new FormData(concernForm);
        if (formData.get('website')) return;

        concernSubmissionInFlight = true;
        concernStatus.hidden = false;
        concernStatus.className = 'concern-message';
        concernStatus.textContent = 'Submitting your concern...';
        concernSubmit.disabled = true;
        setSubmissionFieldsDisabled(concernForm, true);

        try {
            if (!config.supabaseUrl || !config.supabaseAnonKey) {
                throw new Error('Concern submission is not configured yet.');
            }

            pendingConcernSubmissionId ||= crypto.randomUUID();
            const response = await fetch(
                `${config.supabaseUrl.replace(/\/$/, '')}/functions/v1/auto-reply-concern`,
                {
                    method: 'POST',
                    headers: {
                        apikey: config.supabaseAnonKey,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        submission_id: pendingConcernSubmissionId,
                        sender_name: String(formData.get('sender_name') || '').trim() || null,
                        contact: String(formData.get('contact') || '').trim() || null,
                        category: String(formData.get('category') || ''),
                        message: String(formData.get('message') || '').trim()
                    })
                }
            );

            const result = await response.json().catch(() => null);
            if (!response.ok || !result?.saved) {
                console.error('Concern submission rejected by Supabase.', response.status);
                if (response.status === 429) {
                    throw new Error('Too many concerns have been submitted from this connection. Please try again in an hour.');
                }
                throw new Error(result?.error || 'Your concern could not be submitted. Please try again later.');
            }

            concernForm.reset();
            requestAnimationFrame(resizeConcernDetails);
            pendingConcernSubmissionId = null;
            concernStatus.classList.add('success');
            concernStatus.textContent = 'Your concern has been received. Barangay staff will review it and contact you if needed.';
        } catch (error) {
            console.error('Unable to submit public concern.', error);
            concernStatus.classList.add('error');
            concernStatus.textContent = error.message || 'Your concern could not be submitted. Please try again later.';
        } finally {
            concernSubmit.disabled = false;
            setSubmissionFieldsDisabled(concernForm, false);
            concernSubmissionInFlight = false;
        }
    });

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
