// ========== STATE ==========
let state = {
  currentUser: JSON.parse(localStorage.getItem('tm_user')) || null,
  isLoginMode: false,
  activeTemplate: null,
  templates: [],
  coins: 0,
  currentSeat: 0,
  selectedSeats: [],
  previousView: null,
  editingTemplateId: null,
  uploadedImagePath: null,
  map: null
};

// ========== API HELPERS ==========
const api = {
  checkAuth(res) {
    if (res.status === 401 && !res.url.includes('/auth/login')) {
      localStorage.removeItem('tm_user');
      window.location.reload();
      throw new Error('Session expired');
    }
    return res;
  },
  getHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    if (state.currentUser) {
      headers['x-user-id'] = state.currentUser.id;
    }
    return headers;
  },
  async signup(name, email) {
    const res = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email })
    });
    if (!res.ok) throw new Error((await res.json()).error);
    return res.json();
  },
  async login(email) {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    if (!res.ok) throw new Error((await res.json()).error);
    return res.json();
  },
  async getActiveTemplate() {
    const res = await fetch('/api/templates/active', { headers: this.getHeaders() }).then(this.checkAuth);
    if (!res.ok) throw new Error();
    return res.json();
  },
  async getTemplates() {
    const res = await fetch('/api/templates', { headers: this.getHeaders() }).then(this.checkAuth);
    return res.json();
  },
  async createTemplate(data) {
    const res = await fetch('/api/templates', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(data)
    }).then(this.checkAuth);
    return res.json();
  },
  async updateTemplate(id, data) {
    const res = await fetch(`/api/templates/${id}`, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify(data)
    }).then(this.checkAuth);
    return res.json();
  },
  async deleteTemplate(id) {
    const res = await fetch(`/api/templates/${id}`, { method: 'DELETE', headers: this.getHeaders() }).then(this.checkAuth);
    return res.json();
  },
  async activateTemplate(id) {
    const res = await fetch(`/api/templates/${id}/activate`, { method: 'PUT', headers: this.getHeaders() }).then(this.checkAuth);
    return res.json();
  },
  async getCoins() {
    const res = await fetch('/api/coins', { headers: this.getHeaders() }).then(this.checkAuth);
    return res.json();
  },
  async uploadImage(file) {
    const fd = new FormData();
    fd.append('image', file);
    const res = await fetch('/api/upload', { method: 'POST', headers: { 'x-user-id': state.currentUser?.id || 1 }, body: fd }).then(this.checkAuth);
    return res.json();
  }
};

// ========== DOM REFS ==========
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const views = {
  auth: $('#viewAuth'),
  myTickets: $('#viewMyTickets'),
  addOns: $('#viewAddOns'),
  comingSoon: $('#viewComingSoon'),
  templateEditor: $('#viewTemplateEditor'),
  transfer: $('#viewTransfer'),
  transferForm: $('#viewTransferForm')
};

// ========== NAVIGATION ==========
function showView(viewId) {
  // If not logged in, only allow myTickets and auth
  if (!state.currentUser && viewId !== 'myTickets' && viewId !== 'auth') {
    Object.values(views).forEach(v => v.classList.remove('active'));
    $('.tabs').style.display = 'none';
    $('.header').style.display = 'none';
    if(views.auth) views.auth.classList.add('active');
    return;
  }
  
  if (viewId === 'auth') {
    $('.tabs').style.display = 'none';
    $('.header').style.display = 'none';
  } else if (state.currentUser) {
    $('.tabs').style.display = 'flex';
    $('.header').style.display = 'flex';
  } else if (!state.currentUser && viewId === 'myTickets') {
    // If not logged in but viewing myTickets, show header and tabs
    $('.tabs').style.display = 'flex';
    $('.header').style.display = 'flex';
  }

  Object.values(views).forEach(v => v.classList.remove('active'));
  if(views[viewId]) views[viewId].classList.add('active');
}

function showComingSoon(fromView) {
  state.previousView = fromView;
  showView('comingSoon');
}

// ========== TAB SWITCHING ==========
$('#tabMyTickets').addEventListener('click', () => {
  $('#tabMyTickets').classList.add('active');
  $('#tabAddOns').classList.remove('active');
  $('#tabIndicator').classList.remove('right');
  showView('myTickets');
});

$('#tabAddOns').addEventListener('click', () => {
  $('#tabAddOns').classList.add('active');
  $('#tabMyTickets').classList.remove('active');
  $('#tabIndicator').classList.add('right');
  showView('addOns');
  loadDashboard();
});

// ========== COMING SOON ==========
$('#btnComingSoonBack').addEventListener('click', () => {
  if (state.previousView) {
    showView(state.previousView);
  } else {
    showView('myTickets');
  }
});

// ========== TICKET CARD RENDERING ==========
function renderTicketCard(template) {
  if (!template) {
    $('#lockedOverlay').style.display = 'flex';
    $('#ticketView').style.display = 'none';
    return;
  }

  $('#lockedOverlay').style.display = 'none';
  $('#ticketView').style.display = 'flex';

  state.activeTemplate = template;
  state.currentSeat = 0;

  const carousel = $('#cardCarousel');
  carousel.innerHTML = '';

  // Build date line
  const dateLine = `${template.event_date} \u00B7 ${template.venue_name} in ${template.venue_address.split(',').slice(1, 3).join(',').trim() || template.venue_address}`;

  // Create one card per seat
  for (let i = 0; i < template.num_seats; i++) {
    const seatNum = template.start_seat + i;
    const card = document.createElement('div');
    card.className = 'ticket-card';
    card.innerHTML = `
      <div class="card-header-blue">
        <div class="card-level-row">
          <span class="card-level-text">${template.level || 'Lower Level'}</span>
          <button class="card-info-btn">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <circle cx="10" cy="10" r="9" stroke="white" stroke-opacity="0.6" stroke-width="1.5"/>
              <text x="10" y="14" text-anchor="middle" fill="white" fill-opacity="0.6" font-size="12" font-weight="600">i</text>
            </svg>
          </button>
        </div>
        <div class="card-seat-row">
          <div class="card-seat-col">
            <span class="card-seat-label">SEC</span>
            <span class="card-seat-value">${template.section}</span>
          </div>
          <div class="card-seat-col">
            <span class="card-seat-label">ROW</span>
            <span class="card-seat-value">${template.row_name}</span>
          </div>
          <div class="card-seat-col">
            <span class="card-seat-label">SEAT</span>
            <span class="card-seat-value">${seatNum}</span>
          </div>
        </div>
      </div>
      <div class="card-artist-section" style="${template.artist_image ? 'background-image:url(' + template.artist_image + ')' : ''}">
        <div class="card-artist-overlay">
          <h2 class="card-event-title">${template.event_title}</h2>
          <p class="card-event-date">${dateLine}</p>
        </div>
      </div>
      <div class="card-white-section">
        <p class="card-mobile-ticket">Mobile Ticket</p>
        <button class="card-view-ticket-btn" onclick="showComingSoon('myTickets')">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <rect x="1" y="1" width="7" height="7" rx="0.8" stroke="white" stroke-width="1.4"/>
            <rect x="3" y="3" width="3" height="3" rx="0.5" fill="white"/>
            <rect x="12" y="1" width="7" height="7" rx="0.8" stroke="white" stroke-width="1.4"/>
            <rect x="14" y="3" width="3" height="3" rx="0.5" fill="white"/>
            <rect x="1" y="12" width="7" height="7" rx="0.8" stroke="white" stroke-width="1.4"/>
            <rect x="3" y="14" width="3" height="3" rx="0.5" fill="white"/>
            <rect x="10" y="10" width="2" height="2" fill="white"/>
            <rect x="13" y="10" width="2" height="2" fill="white"/>
            <rect x="16" y="10" width="2" height="2" fill="white"/>
            <rect x="10" y="13" width="2" height="2" fill="white"/>
            <rect x="14" y="13" width="1.5" height="1.5" fill="white"/>
            <rect x="17" y="13" width="1.5" height="1.5" fill="white"/>
            <rect x="10" y="16" width="2" height="2" fill="white"/>
            <rect x="13" y="16" width="2" height="2" fill="white"/>
            <rect x="16" y="16" width="2" height="2" fill="white"/>
            <rect x="9.5" y="4" width="1.2" height="1.2" fill="white"/>
            <rect x="4" y="9.5" width="1.2" height="1.2" fill="white"/>
          </svg>
          <span>View Ticket</span>
        </button>
        <p class="card-ticket-details" onclick="showComingSoon('myTickets')">Ticket Details</p>
      </div>
    `;
    carousel.appendChild(card);
  }

  // Render dots
  renderCarouselDots(template.num_seats);

  // Listen for scroll to update dots
  carousel.addEventListener('scroll', onCarouselScroll);

  // Map
  renderMap(template);
  updateMapCallout(template);
}

function onCarouselScroll() {
  const carousel = $('#cardCarousel');
  const cardWidth = carousel.firstElementChild?.offsetWidth || 1;
  const scrollLeft = carousel.scrollLeft;
  const index = Math.round(scrollLeft / cardWidth);
  if (index !== state.currentSeat && index >= 0 && index < state.activeTemplate.num_seats) {
    state.currentSeat = index;
    updateCarouselDots(index);
  }
}

function renderCarouselDots(numSeats) {
  const container = $('#carouselDots');
  container.innerHTML = '';
  for (let i = 0; i < numSeats; i++) {
    const dot = document.createElement('div');
    dot.className = 'carousel-dot' + (i === 0 ? ' active' : '');
    dot.addEventListener('click', () => {
      state.currentSeat = i;
      scrollToCard(i);
      updateCarouselDots(i);
    });
    container.appendChild(dot);
  }
}

function scrollToCard(index) {
  const carousel = $('#cardCarousel');
  const card = carousel.children[index];
  if (card) {
    card.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }
}

function updateCarouselDots(activeIndex) {
  $$('.carousel-dot').forEach((dot, i) => {
    dot.classList.toggle('active', i === activeIndex);
  });
}

// ========== MAP ==========
function renderMap(template) {
  const container = $('#mapContainer');
  if (state.map) {
    state.map.remove();
    state.map = null;
  }

  const lat = template.venue_lat || 33.7573;
  const lng = template.venue_lng || -84.3963;

  state.map = L.map(container, {
    zoomControl: false,
    attributionControl: false
  }).setView([lat, lng], 16);

  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    maxZoom: 19
  }).addTo(state.map);

  L.marker([lat, lng]).addTo(state.map);

  // Fix map rendering - multiple calls to ensure full fill
  setTimeout(() => state.map.invalidateSize(), 100);
  setTimeout(() => state.map.invalidateSize(), 300);
  setTimeout(() => state.map.invalidateSize(), 600);
}

function updateMapCallout(template) {
  $('#mapVenueName').textContent = template.venue_name;
  $('#mapVenueAddress').textContent = template.venue_address;
  $('#mapRating').textContent = template.venue_rating || '4.5';
  $('#mapReviews').textContent = `(${template.venue_reviews || '6,465'})`;
  $('#mapDirectionsLink').href = `https://www.google.com/maps/dir/?api=1&destination=${template.venue_lat},${template.venue_lng}`;
}

// ========== BOTTOM SHEET (Seat Selection) ==========
$('#btnTransfer').addEventListener('click', () => {
  if (!state.activeTemplate) return;
  openBottomSheet();
});

function openBottomSheet() {
  const t = state.activeTemplate;
  state.selectedSeats = [];

  $('#bsSectionRow').textContent = `Sec ${t.section}, Row ${t.row_name}`;
  $('#bsTicketCount').textContent = `${t.num_seats} Tickets`;

  const container = $('#bsSeats');
  container.innerHTML = '';

  for (let i = 0; i < t.num_seats; i++) {
    const seatNum = t.start_seat + i;
    const pill = document.createElement('div');
    pill.className = 'bs-seat-pill';
    pill.dataset.seat = i;
    pill.innerHTML = `
      <div class="bs-seat-top">SEAT ${seatNum}</div>
      <div class="bs-seat-bottom">
        <div class="bs-seat-indicator"></div>
      </div>
    `;
    pill.addEventListener('click', () => toggleSeatSelection(pill, i));
    container.appendChild(pill);
  }

  updateSelectedCount();
  $('#bottomSheetOverlay').classList.add('open');
}

function toggleSeatSelection(pill, index) {
  pill.classList.toggle('selected');
  if (pill.classList.contains('selected')) {
    state.selectedSeats.push(index);
  } else {
    state.selectedSeats = state.selectedSeats.filter(s => s !== index);
  }
  updateSelectedCount();
}

function updateSelectedCount() {
  const count = state.selectedSeats.length;
  $('#bsSelectedCount').textContent = `${count} Selected`;
}

function closeBottomSheet() {
  $('#bottomSheetOverlay').classList.remove('open');
}

$('#bottomSheetOverlay').addEventListener('click', (e) => {
  if (e.target === $('#bottomSheetOverlay')) closeBottomSheet();
});

$('#btnBsTransferTo').addEventListener('click', () => {
  if (state.selectedSeats.length === 0) return;
  closeBottomSheet();
  const count = state.selectedSeats.length;
  $('#transferActionCount').textContent = count;
  $('#formActionCount').textContent = count;
  showView('transfer');
});

// ========== TRANSFER FLOW ==========
$('#btnSelectContacts').addEventListener('click', () => showComingSoon('transfer'));
$('#btnManualEntry').addEventListener('click', () => showView('transferForm'));
$('#btnTransferCancel').addEventListener('click', () => showView('myTickets'));
$('#btnFormCancel').addEventListener('click', () => showView('transfer'));
$('#btnFormSubmit').addEventListener('click', () => showComingSoon('myTickets'));
$('#btnTransferAction').addEventListener('click', () => showComingSoon('myTickets'));

// ========== COMING SOON TRIGGERS ==========
$('#btnClose').addEventListener('click', () => showComingSoon('myTickets'));

// ========== LOCKED STATE ==========
$('#btnLockedCreate').addEventListener('click', () => {
  if (!state.currentUser) {
    showView('auth');
  } else {
    $('#tabAddOns').click();
  }
});

// ========== DASHBOARD ==========
async function loadDashboard() {
  const [templates, coins] = await Promise.all([
    api.getTemplates(),
    api.getCoins()
  ]);

  state.templates = templates;
  state.coins = coins.balance;

  $('#dashCoinBalance').textContent = coins.balance;
  $('#dashTemplateCount').textContent = `${templates.length}/3`;

  const list = $('#dashTemplatesList');
  list.innerHTML = '';

  if (templates.length === 0) {
    list.innerHTML = '<p style="text-align:center;color:#888;font-size:13px;padding:20px 0;">No templates yet</p>';
  } else {
    templates.forEach(t => {
      const item = document.createElement('div');
      item.className = 'dash-template-item';
      item.innerHTML = `
        <div class="dash-template-info">
          <div class="dash-template-name">${t.event_title}</div>
          <div class="dash-template-meta">${t.section} \u00B7 Row ${t.row_name} \u00B7 ${t.num_seats} seats</div>
        </div>
        <div class="dash-template-actions">
          <button class="dash-template-btn activate ${t.is_active ? 'is-active' : ''}" data-id="${t.id}">
            ${t.is_active ? 'Active' : 'Activate'}
          </button>
          <button class="dash-template-btn edit" data-id="${t.id}">Edit</button>
          <button class="dash-template-btn delete" data-id="${t.id}">Del</button>
        </div>
      `;
      list.appendChild(item);
    });

    // Event listeners for template actions
    list.querySelectorAll('.activate').forEach(btn => {
      btn.addEventListener('click', async () => {
        await api.activateTemplate(btn.dataset.id);
        await refreshAll();
      });
    });

    list.querySelectorAll('.edit').forEach(btn => {
      btn.addEventListener('click', () => openTemplateEditor(btn.dataset.id));
    });

    list.querySelectorAll('.delete').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (confirm('Delete this template?')) {
          await api.deleteTemplate(btn.dataset.id);
          await refreshAll();
        }
      });
    });
  }
}

$('#btnBuyCoins').addEventListener('click', () => {
  const telegramLink = 'https://t.me/verifiedboiy?text=I%20want%20to%20purchase%20a%20coin';
  window.open(telegramLink, '_blank');
});

$('#btnCreateTemplate').addEventListener('click', () => openTemplateEditor(null));

// ========== TEMPLATE EDITOR ==========
function openTemplateEditor(templateId) {
  state.editingTemplateId = templateId;
  state.uploadedImagePath = null;

  // Reset form
  $('#teEventTitle').value = '';
  $('#teEventDate').value = '';
  $('#teVenueName').value = '';
  $('#teVenueAddress').value = '';
  $('#teVenueRating').value = '';
  $('#teVenueReviews').value = '';
  $('#teVenueLat').value = '';
  $('#teVenueLng').value = '';
  $('#teLevel').value = '';
  $('#teSection').value = '';
  $('#teRow').value = '';
  $('#teNumSeats').value = '';
  $('#teStartSeat').value = '';
  $('#teImagePreview').style.display = 'none';
  $('#teUploadText').textContent = 'Upload Image';

  if (templateId) {
    // Edit mode - populate fields
    const t = state.templates.find(t => t.id == templateId);
    if (t) {
      $('#teTitle').textContent = 'EDIT TEMPLATE';
      $('#teEventTitle').value = t.event_title || '';
      $('#teEventDate').value = t.event_date || '';
      $('#teVenueName').value = t.venue_name || '';
      $('#teVenueAddress').value = t.venue_address || '';
      $('#teVenueRating').value = t.venue_rating || '';
      $('#teVenueReviews').value = t.venue_reviews || '';
      $('#teVenueLat').value = t.venue_lat || '';
      $('#teVenueLng').value = t.venue_lng || '';
      $('#teLevel').value = t.level || '';
      $('#teSection').value = t.section || '';
      $('#teRow').value = t.row_name || '';
      $('#teNumSeats').value = t.num_seats || '';
      $('#teStartSeat').value = t.start_seat || '';
      if (t.artist_image) {
        state.uploadedImagePath = t.artist_image;
        $('#teImagePreview').src = t.artist_image;
        $('#teImagePreview').style.display = 'block';
        $('#teUploadText').textContent = 'Change Image';
      }
    }
  } else {
    $('#teTitle').textContent = 'CREATE TEMPLATE';
  }

  showView('templateEditor');
}

$('#btnEditorBack').addEventListener('click', () => {
  showView('addOns');
  loadDashboard();
});

// Image upload
$('#teUploadArea').addEventListener('click', () => $('#teImageInput').click());
$('#teImageInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  try {
    const result = await api.uploadImage(file);
    state.uploadedImagePath = result.path;
    $('#teImagePreview').src = result.path;
    $('#teImagePreview').style.display = 'block';
    $('#teUploadText').textContent = 'Change Image';
  } catch (err) {
    alert('Upload failed');
  }
});

// Save template
$('#btnEditorSave').addEventListener('click', async () => {
  const data = {
    event_title: $('#teEventTitle').value.trim(),
    event_date: $('#teEventDate').value.trim(),
    venue_name: $('#teVenueName').value.trim(),
    venue_address: $('#teVenueAddress').value.trim(),
    venue_rating: $('#teVenueRating').value.trim() || '4.5',
    venue_reviews: $('#teVenueReviews').value.trim() || '6,465',
    venue_lat: parseFloat($('#teVenueLat').value) || 33.7573,
    venue_lng: parseFloat($('#teVenueLng').value) || -84.3963,
    section: $('#teSection').value.trim(),
    row_name: $('#teRow').value.trim(),
    level: $('#teLevel').value.trim() || 'Lower Level',
    num_seats: parseInt($('#teNumSeats').value) || 4,
    start_seat: parseInt($('#teStartSeat').value) || 1,
    artist_image: state.uploadedImagePath
  };

  // Validate required fields
  if (!data.event_title || !data.event_date || !data.venue_name || !data.venue_address || !data.section || !data.row_name) {
    alert('Please fill in all required fields');
    return;
  }

  try {
    let result;
    if (state.editingTemplateId) {
      result = await api.updateTemplate(state.editingTemplateId, data);
    } else {
      result = await api.createTemplate(data);
    }

    if (result.error) {
      alert(result.error === 'Not enough coins' ? 'You need at least 1 coin. Buy coins to continue.' : result.error);
      return;
    }

    await refreshAll();
    showView('addOns');
    loadDashboard();
  } catch (err) {
    alert('Failed to save template');
  }
});


// ========== APP INIT ==========
async function init() {
  const savedUser = localStorage.getItem('tm_user');
  if (savedUser) {
    state.currentUser = JSON.parse(savedUser);
  }

  // Initialize dashboard user info if logged in
  if (state.currentUser) {
    if ($('#dashUserName')) $('#dashUserName').textContent = state.currentUser.name;
    if ($('#dashUserEmail')) $('#dashUserEmail').textContent = state.currentUser.email;
  }

  // Always show my tickets first
  showView('myTickets');
  await refreshAll();
}

async function refreshAll() {
  try {
    const template = await api.getActiveTemplate();
    renderTicketCard(template);
  } catch (err) {
    renderTicketCard(null);
  }
}

// ========== AUTHENTICATION FLOW ==========
$('#btnAuthToggle').addEventListener('click', () => {
  state.isLoginMode = !state.isLoginMode;
  if (state.isLoginMode) {
    $('.auth-title').textContent = 'Welcome Back';
    $('.auth-subtitle').textContent = 'Log in to access your tickets';
    $('#authNameField').style.display = 'none';
    $('#btnAuthSubmit').textContent = 'Log In';
    $('#authToggleText').textContent = 'Don\'t have an account?';
    $('#btnAuthToggle').textContent = 'Sign Up';
  } else {
    $('.auth-title').textContent = 'Welcome to Ticketmaster';
    $('.auth-subtitle').textContent = 'Sign in or create an account to get started.';
    $('#authNameField').style.display = 'block';
    $('#btnAuthSubmit').textContent = 'Sign Up';
    $('#authToggleText').textContent = 'Already have an account?';
    $('#btnAuthToggle').textContent = 'Log In';
  }
});

$('#btnAuthSubmit').addEventListener('click', async () => {
  const name = $('#authName').value.trim();
  const email = $('#authEmail').value.trim();
  
  if (!email) return alert('Email is required');
  if (!state.isLoginMode && !name) return alert('Name is required');

  try {
    const btn = $('#btnAuthSubmit');
    const originalText = btn.textContent;
    btn.textContent = 'Please wait...';
    btn.disabled = true;

    let user;
    if (state.isLoginMode) {
      user = await api.login(email);
    } else {
      user = await api.signup(name, email);
    }
    
    state.currentUser = user;
    localStorage.setItem('tm_user', JSON.stringify(user));
    
    // Update dashboard labels
    if ($('#dashUserName')) $('#dashUserName').textContent = user.name;
    if ($('#dashUserEmail')) $('#dashUserEmail').textContent = user.email;

    showView('myTickets');
    await refreshAll();
  } catch (err) {
    alert(err.message);
  } finally {
    $('#btnAuthSubmit').disabled = false;
    $('#btnAuthSubmit').textContent = state.isLoginMode ? 'Log In' : 'Sign Up';
  }
});

document.addEventListener('DOMContentLoaded', init);
