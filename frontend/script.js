document.addEventListener('DOMContentLoaded', () => {
    const backendUrl = 'http://localhost:8000';

    // --- DOM Elements ---
    const dmxStatusElement = document.getElementById('dmx-status');
    const tabs = document.getElementById('tabs');
    const gridTabContent = document.getElementById('grid-tab-content');
    const fixturesTabContent = document.getElementById('fixtures-tab-content');
    const universeTabContent = document.getElementById('universe-tab-content');
    const dmxGrid = document.getElementById('dmx-grid');
    const fixturesList = document.getElementById('fixtures-list');
    const addFixtureBtn = document.getElementById('add-fixture-btn');
    const universeGrid = document.getElementById('universe-grid');

    // Modals
    const settingsModal = document.getElementById('settings-modal');
    const editModal = document.getElementById('edit-modal');
    const fixtureModal = document.getElementById('fixture-modal');

    // Fixture Modal Specific Elements
    const oflFixtureSelect = document.getElementById('ofl-fixture-select');
    const importOflFixtureBtn = document.getElementById('import-ofl-fixture-btn');
    const fixtureNameInput = document.getElementById('fixture-name-input');
    const fixtureAddressInput = document.getElementById('fixture-address-input');
    const fixtureCountInput = document.getElementById('fixture-count-input');
    const fixtureModeSelect = document.getElementById('fixture-mode-select');
    const modeChannelCountSpan = document.getElementById('mode-channel-count');
    const saveFixtureBtn = document.getElementById('save-fixture-btn');
    const deleteFixtureBtn = document.getElementById('delete-fixture-btn');

    // --- State Variables ---
    let gridConfig = Array(15).fill(null);
    let fixtures = [];
    let currentEditingCellIndex = null;
    let currentEditingFixtureId = null;
    let currentOflModes = []; // To store modes of the currently imported OFL fixture

    // --- Local Storage Functions ---
    const saveGridConfig = () => localStorage.setItem('dmxGridConfig', JSON.stringify(gridConfig));
    const loadGridConfig = () => {
        const saved = localStorage.getItem('dmxGridConfig');
        if (saved) gridConfig = JSON.parse(saved);
    };

    // --- API Communication ---
    const api = {
        async get(endpoint) {
            try {
                const response = await fetch(`${backendUrl}${endpoint}`);
                if (!response.ok) throw new Error(`API Error: ${response.statusText}`);
                return await response.json();
            } catch (error) {
                console.error(`Error fetching ${endpoint}:`, error);
                return null;
            }
        },
        async post(endpoint, body) {
            try {
                const response = await fetch(`${backendUrl}${endpoint}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                });
                if (!response.ok) throw new Error(`API Error: ${response.statusText}`);
                return await response.json();
            } catch (error) {
                console.error(`Error posting to ${endpoint}:`, error);
                return null;
            }
        },
        async put(endpoint, body) {
            try {
                const response = await fetch(`${backendUrl}${endpoint}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                });
                if (!response.ok) throw new Error(`API Error: ${response.statusText}`);
                return await response.json();
            } catch (error) {
                console.error(`Error putting to ${endpoint}:`, error);
                return null;
            }
        },
        async delete(endpoint) {
            try {
                const response = await fetch(`${backendUrl}${endpoint}`, {
                    method: 'DELETE',
                });
                if (!response.ok) throw new Error(`API Error: ${response.statusText}`);
                return await response.json();
            } catch (error) {
                console.error(`Error deleting ${endpoint}:`, error);
                return null;
            }
        }
    };

    const updateDMXStatus = async () => {
        const data = await api.get('/api/dmx_status');
        if (data) {
            dmxStatusElement.textContent = data.connected ? 'DMX Dongle: Connected' : 'DMX Dongle: Disconnected';
            dmxStatusElement.className = `text-center mb-4 text-lg font-semibold ${data.connected ? 'text-green-600' : 'text-red-600'}`;
        } else {
            dmxStatusElement.textContent = 'DMX Dongle: Backend Error';
            dmxStatusElement.className = 'text-center mb-4 text-lg font-semibold text-yellow-600';
        }
    };

    // --- Tab Switching Logic ---
    tabs.addEventListener('click', (e) => {
        if (!e.target.matches('.tab-btn')) return;

        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('text-white', 'border-blue-500');
            btn.classList.add('text-gray-400', 'border-transparent');
        });
        e.target.classList.add('text-white', 'border-blue-500');
        e.target.classList.remove('text-gray-400', 'border-transparent');

        document.querySelectorAll('.tab-content').forEach(content => content.classList.add('hidden'));
        document.getElementById(`${e.target.dataset.tab}-content`).classList.remove('hidden');

        if (e.target.dataset.tab === 'fixtures-tab') {
            fetchAndRenderFixtures();
        } else if (e.target.dataset.tab === 'universe-tab') {
            renderUniverse();
        }
    });

    // --- Grid Rendering ---
    function renderGrid() {
        dmxGrid.innerHTML = '';
        const renderedIndices = new Set();
        for (let i = 0; i < 15; i++) {
            if (renderedIndices.has(i)) continue;

            const module = gridConfig[i];
            const cell = document.createElement('div');
            cell.className = 'dmx-grid-cell bg-gray-600 p-4 rounded-lg shadow-md flex flex-col items-center justify-center cursor-pointer hover:bg-gray-500 transition-colors';
            cell.dataset.cellIndex = i;
            cell.addEventListener('click', () => showEditModal(i));

            if (module) {
                if (module.type === 'fader') {
                    cell.classList.add('fader-module');
                    if (i + 5 < 15) renderedIndices.add(i + 5);
                    const fixture = fixtures.find(f => f.id === module.fixtureId);
                    cell.innerHTML = `
                        <label class="block text-sm font-medium text-gray-300">${fixture ? fixture.name : 'Unassigned'}</label>
                        <input type="range" min="0" max="255" value="0" class="mt-2 w-full h-3/4 bg-gray-500 rounded-lg appearance-none cursor-pointer" style="writing-mode: bt-lr; -webkit-appearance: slider-vertical;">
                        <span class="block text-center mt-2 text-lg font-semibold text-gray-100">0</span>
                    `;
                    const slider = cell.querySelector('input[type=range]');
                    slider.addEventListener('input', (e) => {
                        const value = e.target.value;
                        cell.querySelector('span').textContent = value;
                        if (fixture) api.post('/api/set_channel', { channel: fixture.address, value: parseInt(value) });
                    });
                    slider.addEventListener('click', (e) => e.stopPropagation());
                } else if (module.type === 'dimmer') {
                     const fixture = fixtures.find(f => f.id === module.fixtureId);
                    cell.innerHTML = `
                        <label class="block text-sm font-medium text-gray-300">${fixture ? fixture.name : 'Unassigned'}</label>
                        <input type="range" min="0" max="255" value="0" class="mt-2 w-full h-2 bg-gray-500 rounded-lg appearance-none cursor-pointer">
                        <span class="block text-center mt-2 text-lg font-semibold text-gray-100">0</span>
                    `;
                    const slider = cell.querySelector('input[type=range]');
                    slider.addEventListener('input', (e) => {
                        const value = e.target.value;
                        cell.querySelector('span').textContent = value;
                        if (fixture) api.post('/api/set_channel', { channel: fixture.address, value: parseInt(value) });
                    });
                    slider.addEventListener('click', (e) => e.stopPropagation());
                } else if (module.type === 'group') {
                    // Group logic here
                }
            } else {
                cell.innerHTML = `<span class="text-gray-400 text-lg">+</span>`;
            }
            dmxGrid.appendChild(cell);
            renderedIndices.add(i);
        }
    }

    // --- Fixture Management ---
    async function fetchAndRenderFixtures() {
        const showData = await api.get('/api/show');
        if (showData) {
            fixtures = showData.fixtures;
            fixturesList.innerHTML = '';
            fixtures.forEach(fixture => {
                const div = document.createElement('div');
                div.className = 'bg-gray-700 p-4 rounded-lg flex justify-between items-center';
                div.innerHTML = `
                    <div>
                        <h3 class="text-lg font-bold">${fixture.name}</h3>
                        <p class="text-sm text-gray-400">Address: ${fixture.address}, Count: ${fixture.count}, Mode: ${fixture.mode}</p>
                    </div>
                    <button data-fixture-id="${fixture.id}" class="edit-fixture-btn bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-md">Edit</button>
                `;
                fixturesList.appendChild(div);
            });
            document.querySelectorAll('.edit-fixture-btn').forEach(btn => {
                btn.addEventListener('click', (e) => showFixtureModal(e.target.dataset.fixtureId));
            });
        }
    }

    // --- DMX Universe Rendering ---
    function getChannelCountForMode(oflModes, modeName) {
        const mode = oflModes.find(m => m.name === modeName);
        return mode ? mode.channels.length : 0;
    }

    async function renderUniverse() {
        universeGrid.innerHTML = '';
        const channelDataMap = new Map(); // Map to store detailed info for each channel
        const dmxValues = (await api.get('/api/dmx_universe_values')).values; // Fetch current DMX values

        fixtures.forEach(fixture => {
            const channelCount = getChannelCountForMode(fixture.ofl_modes || [], fixture.mode);
            const selectedMode = (fixture.ofl_modes || []).find(m => m.name === fixture.mode);

            for (let i = 0; i < fixture.count; i++) {
                for (let j = 0; j < channelCount; j++) {
                    const universeChannel = fixture.address + j + (i * channelCount);
                    if (universeChannel <= 512) {
                        const channelFunction = selectedMode && selectedMode.channels[j] ? selectedMode.channels[j].name : `Channel ${j + 1}`;
                        channelDataMap.set(universeChannel, {
                            fixtureName: fixture.name,
                            channelFunction: channelFunction,
                            value: dmxValues[universeChannel - 1] // DMX values are 0-indexed
                        });
                    }
                }
            }
        });

        for (let i = 1; i <= 512; i++) {
            const channelDiv = document.createElement('div');
            channelDiv.className = 'p-1 border border-gray-700 rounded';
            
            if (channelDataMap.has(i)) {
                const data = channelDataMap.get(i);
                channelDiv.classList.add('bg-green-700');
                channelDiv.title = `Fixture: ${data.fixtureName}\nFunction: ${data.channelFunction}\nValue: ${data.value}`;
                channelDiv.textContent = i; // Show channel number
            } else {
                channelDiv.classList.add('bg-gray-800');
                channelDiv.textContent = i; // Show channel number
            }
            universeGrid.appendChild(channelDiv);
        }
    }

    // --- Modal Logic ---
    function setupModal(modalElement, closeBtnId) {
        const closeBtn = document.getElementById(closeBtnId);
        if(closeBtn) closeBtn.addEventListener('click', () => modalElement.classList.add('hidden'));
    }

    setupModal(settingsModal, 'close-settings-modal-btn');
    setupModal(editModal, 'close-edit-modal-btn');
    setupModal(fixtureModal, 'close-fixture-modal-btn');

    document.getElementById('settings-cog-btn').addEventListener('click', () => settingsModal.classList.remove('hidden'));
    addFixtureBtn.addEventListener('click', () => showFixtureModal());

    function showEditModal(index) {
        currentEditingCellIndex = index;
        const module = gridConfig[index];
        const typeSelect = editModal.querySelector('#module-type-select');
        const dimmerOptions = editModal.querySelector('#edit-dimmer-options');
        const fixtureSelect = dimmerOptions.querySelector('#dimmer-channel-input'); // Re-using for fixture selection

        fixtureSelect.innerHTML = '';
        fixtures.forEach(f => {
            const option = document.createElement('option');
            option.value = f.id;
            option.textContent = `${f.name} (Ch: ${f.address})`;
            fixtureSelect.appendChild(option);
        });

        if (module && (module.type === 'dimmer' || module.type === 'fader')) {
            typeSelect.value = module.type;
            fixtureSelect.value = module.fixtureId;
            dimmerOptions.classList.remove('hidden');
        } else {
            typeSelect.value = 'empty';
            dimmerOptions.classList.add('hidden');
        }

        editModal.classList.remove('hidden');
    }

    editModal.querySelector('#module-type-select').addEventListener('change', (e) => {
        const dimmerOptions = editModal.querySelector('#edit-dimmer-options');
        if (e.target.value === 'dimmer' || e.target.value === 'fader') {
            dimmerOptions.classList.remove('hidden');
        } else {
            dimmerOptions.classList.add('hidden');
        }
    });

    editModal.querySelector('#save-edit-btn').addEventListener('click', () => {
        const type = editModal.querySelector('#module-type-select').value;
        if (type === 'empty') {
            gridConfig[currentEditingCellIndex] = null;
        } else {
            const fixtureId = editModal.querySelector('#dimmer-channel-input').value;
            gridConfig[currentEditingCellIndex] = { type, fixtureId };
            if (type === 'fader' && currentEditingCellIndex + 5 < 15) {
                gridConfig[currentEditingCellIndex + 5] = { type: 'fader_placeholder' };
            }
        }
        saveGridConfig();
        renderGrid();
        editModal.classList.add('hidden');
    });

    editModal.querySelector('#remove-module-btn').addEventListener('click', () => {
        const module = gridConfig[currentEditingCellIndex];
        if (module && module.type === 'fader' && currentEditingCellIndex + 5 < 15) {
            gridConfig[currentEditingCellIndex + 5] = null;
        }
        gridConfig[currentEditingCellIndex] = null;
        saveGridConfig();
        renderGrid();
        editModal.classList.add('hidden');
    });

    async function fetchOflFixtures() {
        oflFixtureSelect.innerHTML = '<option value="">-- Loading OFL Fixtures --</option>';
        const data = await api.get('/api/ofl_fixtures');
        oflFixtureSelect.innerHTML = '<option value="">-- Select OFL Fixture --</option>'; // Reset
        if (data && data.files) {
            data.files.forEach(file => {
                const option = document.createElement('option');
                option.value = file;
                option.textContent = file.replace('.json', '').replace(/_/g, ' ');
                oflFixtureSelect.appendChild(option);
            });
        } else {
            const option = document.createElement('option');
            option.textContent = 'No OFL fixtures found or error loading';
            option.disabled = true;
            oflFixtureSelect.appendChild(option);
        }
    }

    importOflFixtureBtn.addEventListener('click', async () => {
        const selectedFile = oflFixtureSelect.value;
        if (selectedFile) {
            const fixtureData = await api.get(`/api/ofl_fixtures/${selectedFile}`);
            if (fixtureData) {
                currentOflModes = fixtureData.modes || [];
                // Populate form fields with OFL data
                fixtureNameInput.value = fixtureData.name || '';
                // OFL address is not directly mapped, keep current address
                // OFL count is not directly mapped, keep current count
                populateModeSelect(currentOflModes);
                if (currentOflModes.length > 0) {
                    fixtureModeSelect.value = currentOflModes[0].name;
                } else {
                    fixtureModeSelect.value = 'default';
                }
                updateModeChannelCountDisplay();
            }
        }
        else {
            alert('Please select an OFL fixture to import.');
        }
    });

    function populateModeSelect(modes) {
        fixtureModeSelect.innerHTML = '';
        if (modes.length > 0) {
            modes.forEach(mode => {
                const option = document.createElement('option');
                option.value = mode.name;
                option.textContent = mode.name;
                fixtureModeSelect.appendChild(option);
            });
        } else {
            const option = document.createElement('option');
            option.value = 'default';
            option.textContent = 'default';
            fixtureModeSelect.appendChild(option);
        }
    }

    function updateModeChannelCountDisplay() {
        const selectedModeName = fixtureModeSelect.value;
        const selectedMode = currentOflModes.find(m => m.name === selectedModeName);
        const channelCount = selectedMode ? selectedMode.channels.length : 0;
        modeChannelCountSpan.textContent = channelCount;
    }

    fixtureModeSelect.addEventListener('change', updateModeChannelCountDisplay);

    function showFixtureModal(fixtureId = null) {
        const title = fixtureModal.querySelector('#fixture-modal-title');
        const nameInput = fixtureModal.querySelector('#fixture-name-input');
        const addressInput = fixtureModal.querySelector('#fixture-address-input');
        const countInput = fixtureModal.querySelector('#fixture-count-input');
        const deleteBtn = fixtureModal.querySelector('#delete-fixture-btn');

        // Reset OFL select and modes
        oflFixtureSelect.value = '';
        currentOflModes = [];
        populateModeSelect([]); // Clear and reset mode select
        modeChannelCountSpan.textContent = '0';
        fetchOflFixtures(); // Always fetch latest OFL list when opening modal

        if (fixtureId) {
            currentEditingFixtureId = fixtureId;
            const fixture = fixtures.find(f => f.id === fixtureId);
            title.textContent = 'Edit Fixture';
            nameInput.value = fixture.name;
            addressInput.value = fixture.address;
            countInput.value = fixture.count || 1; // Default to 1 if not set
            
            // Populate mode select with stored OFL modes if available
            if (fixture.ofl_modes) {
                currentOflModes = fixture.ofl_modes;
                populateModeSelect(fixture.ofl_modes);
                fixtureModeSelect.value = fixture.mode || 'default';
            } else {
                fixtureModeSelect.value = fixture.mode || 'default';
            }
            updateModeChannelCountDisplay();
            deleteBtn.classList.remove('hidden');
        } else {
            currentEditingFixtureId = null;
            title.textContent = 'Add Fixture';
            nameInput.value = '';
            addressInput.value = '';
            countInput.value = 1; // Default for new fixture
            fixtureModeSelect.value = 'default'; // Default for new fixture
            deleteBtn.classList.add('hidden');
        }
        fixtureModal.classList.remove('hidden');
    }

    saveFixtureBtn.addEventListener('click', async () => {
        const name = fixtureNameInput.value;
        const address = parseInt(fixtureAddressInput.value);
        const count = parseInt(fixtureCountInput.value);
        const mode = fixtureModeSelect.value;

        if (!name || isNaN(address) || !count || !mode) {
            alert('Please fill out all required fields (Name, Address, Count, Mode).');
            return;
        }

        const fixtureData = { name, address, count, mode, ofl_modes: currentOflModes };

        if (currentEditingFixtureId) {
            const updatedFixture = await api.put(`/api/fixtures/${currentEditingFixtureId}`, { ...fixtureData, id: currentEditingFixtureId });
            if (updatedFixture) {
                const index = fixtures.findIndex(f => f.id === currentEditingFixtureId);
                if (index !== -1) fixtures[index] = updatedFixture;
            }
        } else {
            const newFixture = await api.post('/api/fixtures', fixtureData);
            if (newFixture) {
                fixtures.push(newFixture);
            }
        }
        fetchAndRenderFixtures(); // Re-fetch and render to ensure data consistency with backend
        renderGrid(); // Re-render grid to update fixture names
        fixtureModal.classList.add('hidden');
    });

    deleteFixtureBtn.addEventListener('click', async () => {
        if (currentEditingFixtureId) {
            const success = await api.delete(`/api/fixtures/${currentEditingFixtureId}`);
            if (success) {
                fixtures = fixtures.filter(f => f.id !== currentEditingFixtureId);
                // Also remove any grid modules associated with this fixture
                gridConfig = gridConfig.map(module => {
                    if (module && module.fixtureId === currentEditingFixtureId) {
                        return null;
                    }
                    return module;
                });
                saveGridConfig();
            }
        }
        fetchAndRenderFixtures();
        renderGrid();
        fixtureModal.classList.add('hidden');
    });

    // --- Settings Modal ---
    const settingsCogBtn = document.getElementById('settings-cog-btn');
    const dmxPortSelect = document.getElementById('dmx-port-select');
    const saveSettingsBtn = document.getElementById('save-settings-btn');
    const settingsStatus = document.getElementById('settings-status');

    settingsCogBtn.addEventListener('click', () => settingsModal.classList.remove('hidden'));

    settingsModal.querySelector('#close-settings-modal-btn').addEventListener('click', () => settingsModal.classList.add('hidden'));

    async function fetchPorts() {
        try {
            const response = await fetch(`${backendUrl}/api/ports`);
            const data = await response.json();
            dmxPortSelect.innerHTML = '';
            if (data.ports && data.ports.length > 0) {
                data.ports.forEach(port => {
                    const option = document.createElement('option');
                    option.value = port;
                    option.textContent = port;
                    if (port === data.selected_port) {
                        option.selected = true;
                    }
                    dmxPortSelect.appendChild(option);
                });
                saveSettingsBtn.disabled = false;
            } else {
                const option = document.createElement('option');
                option.textContent = 'No DMX ports found';
                dmxPortSelect.appendChild(option);
                saveSettingsBtn.disabled = true;
            }
        } catch (error) {
            console.error('Error fetching ports:', error);
            settingsStatus.textContent = 'Error loading ports. Is backend running?';
            settingsStatus.className = 'mt-4 text-center text-sm font-medium text-red-600';
            saveSettingsBtn.disabled = true;
        }
    }

    saveSettingsBtn.addEventListener('click', async () => {
        const selectedPort = dmxPortSelect.value;
        if (!selectedPort) {
            settingsStatus.textContent = 'Please select a port.';
            settingsStatus.className = 'mt-4 text-center text-sm font-medium text-yellow-600';
            return;
        }
        try {
            const response = await fetch(`${backendUrl}/api/set_dmx_port`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ port: selectedPort }),
            });
            const data = await response.json();
            if (response.ok) {
                settingsStatus.textContent = `Settings saved! DMX connected: ${data.connected}`;
                settingsStatus.className = 'mt-4 text-center text-sm font-medium text-green-600';
                updateDMXStatus();
            } else {
                settingsStatus.textContent = `Error saving settings: ${data.detail}`;
                settingsStatus.className = 'mt-4 text-center text-sm font-medium text-red-600';
            }
        } catch (error) {
            console.error('Error saving settings:', error);
            settingsStatus.textContent = 'Network error or backend is not running.';
            settingsStatus.className = 'mt-4 text-center text-sm font-medium text-red-600';
        }
    });

    // --- Initial Setup ---
    loadGridConfig();
    fetchAndRenderFixtures(); // Load fixtures from backend on startup
    renderGrid();
    updateDMXStatus();
    setInterval(updateDMXStatus, 5000);
});