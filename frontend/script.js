document.addEventListener('DOMContentLoaded', () => {
    const dmxGrid = document.getElementById('dmx-grid');
    const dmxStatusElement = document.getElementById('dmx-status');
    const settingsCogBtn = document.getElementById('settings-cog-btn');
    const settingsModal = document.getElementById('settings-modal');
    const closeSettingsModalBtn = document.getElementById('close-settings-modal-btn');
    const dmxPortSelect = document.getElementById('dmx-port-select');
    const saveSettingsBtn = document.getElementById('save-settings-btn');
    const settingsStatus = document.getElementById('settings-status');

    // Edit Modal Elements
    const editModal = document.getElementById('edit-modal');
    const closeEditModalBtn = document.getElementById('close-edit-modal-btn');
    const moduleTypeSelect = document.getElementById('module-type-select');
    const editDimmerOptions = document.getElementById('edit-dimmer-options');
    const dimmerChannelInput = document.getElementById('dimmer-channel-input');
    const editGroupOptions = document.getElementById('edit-group-options');
    const groupSelect = document.getElementById('group-select');
    const saveEditBtn = document.getElementById('save-edit-btn');
    const removeModuleBtn = document.getElementById('remove-module-btn');

    const backendUrl = 'http://localhost:8000';
    let gridConfig = Array(15).fill(null);
    let currentEditingCellIndex = null;

    // --- Local Storage Functions ---
    function saveGridConfig() {
        localStorage.setItem('dmxGridConfig', JSON.stringify(gridConfig));
    }

    function loadGridConfig() {
        const savedConfig = localStorage.getItem('dmxGridConfig');
        if (savedConfig) {
            gridConfig = JSON.parse(savedConfig);
        }
    }

    // --- API Communication ---
    async function updateDMXStatus() {
        try {
            const response = await fetch(`${backendUrl}/api/dmx_status`);
            const data = await response.json();
            dmxStatusElement.textContent = data.connected ? 'DMX Dongle: Connected' : 'DMX Dongle: Disconnected';
            dmxStatusElement.className = `text-center mb-4 text-lg font-semibold ${data.connected ? 'text-green-600' : 'text-red-600'}`;
        } catch (error) {
            dmxStatusElement.textContent = 'DMX Dongle: Backend Error';
            dmxStatusElement.className = 'text-center mb-4 text-lg font-semibold text-yellow-600';
            console.error('Error fetching DMX status:', error);
        }
    }

    async function sendDMXValue(channel, value) {
        try {
            await fetch(`${backendUrl}/api/set_channel`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ channel, value }),
            });
        } catch (error) {
            console.error('Network error or backend is not running:', error);
        }
    }

    async function sendDMXGroupValue(groupName, value) {
        try {
            await fetch(`${backendUrl}/api/set_group`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: groupName, value }),
            });
        } catch (error) {
            console.error('Network error or backend is not running:', error);
        }
    }

    async function fetchGroups() {
        try {
            const response = await fetch(`${backendUrl}/api/groups`);
            const groups = await response.json();
            groupSelect.innerHTML = '';
            if (groups.length > 0) {
                groups.forEach(group => {
                    const option = document.createElement('option');
                    option.value = group.name;
                    option.textContent = group.name;
                    groupSelect.appendChild(option);
                });
            } else {
                const option = document.createElement('option');
                option.textContent = 'No groups found';
                option.disabled = true;
                groupSelect.appendChild(option);
            }
        } catch (error) {
            console.error('Error fetching groups:', error);
        }
    }

    // --- Grid and Module Rendering ---
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
                    // Mark the cell below as rendered
                    if (i + 5 < 15) renderedIndices.add(i + 5);

                    cell.innerHTML = `
                        <label for="fader-${module.channel}" class="block text-sm font-medium text-gray-300">Channel ${module.channel}</label>
                        <input type="range" id="fader-${module.channel}" min="0" max="255" value="0" class="mt-2 w-full h-3/4 bg-gray-500 rounded-lg appearance-none cursor-pointer" style="writing-mode: bt-lr; -webkit-appearance: slider-vertical;">
                        <span id="fader-value-${module.channel}" class="block text-center mt-2 text-lg font-semibold text-gray-100">0</span>
                    `;
                    const slider = cell.querySelector(`#fader-${module.channel}`);
                    const valueSpan = cell.querySelector(`#fader-value-${module.channel}`);
                    slider.addEventListener('input', (event) => {
                        const value = event.target.value;
                        valueSpan.textContent = value;
                        sendDMXValue(module.channel, parseInt(value));
                    });
                    slider.addEventListener('click', (e) => e.stopPropagation());
                } else if (module.type === 'dimmer') {
                    cell.innerHTML = `
                        <label for="dimmer-${module.channel}" class="block text-sm font-medium text-gray-300">Channel ${module.channel}</label>
                        <input type="range" id="dimmer-${module.channel}" min="0" max="255" value="0" class="mt-2 w-full h-2 bg-gray-500 rounded-lg appearance-none cursor-pointer">
                        <span id="dimmer-value-${module.channel}" class="block text-center mt-2 text-lg font-semibold text-gray-100">0</span>
                    `;
                    const slider = cell.querySelector(`#dimmer-${module.channel}`);
                    const valueSpan = cell.querySelector(`#dimmer-value-${module.channel}`);
                    slider.addEventListener('input', (event) => {
                        const value = event.target.value;
                        valueSpan.textContent = value;
                        sendDMXValue(module.channel, parseInt(value));
                    });
                    slider.addEventListener('click', (e) => e.stopPropagation());
                } else if (module.type === 'group') {
                    cell.innerHTML = `
                        <label for="group-${module.name}" class="block text-sm font-medium text-gray-300">Group: ${module.name}</label>
                        <input type="range" id="group-${module.name}" min="0" max="255" value="0" class="mt-2 w-full h-2 bg-gray-500 rounded-lg appearance-none cursor-pointer">
                        <span id="group-value-${module.name}" class="block text-center mt-2 text-lg font-semibold text-gray-100">0</span>
                    `;
                    const slider = cell.querySelector(`#group-${module.name}`);
                    const valueSpan = cell.querySelector(`#group-value-${module.name}`);
                    slider.addEventListener('input', (event) => {
                        const value = event.target.value;
                        valueSpan.textContent = value;
                        sendDMXGroupValue(module.name, parseInt(value));
                    });
                    slider.addEventListener('click', (e) => e.stopPropagation());
                }
            } else {
                cell.innerHTML = `<span class="text-gray-400 text-lg">+</span>`;
            }
            dmxGrid.appendChild(cell);
            renderedIndices.add(i);
        }
    }

    // --- Modal Functions ---
    function showEditModal(index) {
        currentEditingCellIndex = index;
        const module = gridConfig[index];

        // Reset form
        moduleTypeSelect.value = 'empty';
        dimmerChannelInput.value = '';
        editDimmerOptions.classList.add('hidden');
        editGroupOptions.classList.add('hidden');

        if (module) {
            moduleTypeSelect.value = module.type;
            if (module.type === 'dimmer' || module.type === 'fader') {
                dimmerChannelInput.value = module.channel;
                editDimmerOptions.classList.remove('hidden');
            } else if (module.type === 'group') {
                fetchGroups().then(() => {
                    groupSelect.value = module.name;
                    editGroupOptions.classList.remove('hidden');
                });
            }
        }
        editModal.classList.remove('hidden');
    }

    function hideEditModal() {
        editModal.classList.add('hidden');
        currentEditingCellIndex = null;
    }

    moduleTypeSelect.addEventListener('change', () => {
        editDimmerOptions.classList.add('hidden');
        editGroupOptions.classList.add('hidden');
        if (moduleTypeSelect.value === 'dimmer' || moduleTypeSelect.value === 'fader') {
            editDimmerOptions.classList.remove('hidden');
        } else if (moduleTypeSelect.value === 'group') {
            fetchGroups();
            editGroupOptions.classList.remove('hidden');
        }
    });

    saveEditBtn.addEventListener('click', () => {
        const type = moduleTypeSelect.value;
        if (type === 'empty') {
            gridConfig[currentEditingCellIndex] = null;
        } else if (type === 'dimmer' || type === 'fader') {
            const channel = parseInt(dimmerChannelInput.value);
            if (channel >= 1 && channel <= 512) {
                gridConfig[currentEditingCellIndex] = { type, channel };
                if (type === 'fader' && currentEditingCellIndex + 5 < 15) {
                    gridConfig[currentEditingCellIndex + 5] = { type: 'fader_placeholder' };
                }
            } else {
                alert('Channel must be between 1 and 512.');
                return;
            }
        } else if (type === 'group') {
            const name = groupSelect.value;
            if (name) {
                gridConfig[currentEditingCellIndex] = { type: 'group', name };
            } else {
                alert('Please select a group.');
                return;
            }
        }
        saveGridConfig();
        renderGrid();
        hideEditModal();
    });

    removeModuleBtn.addEventListener('click', () => {
        const module = gridConfig[currentEditingCellIndex];
        if (module && module.type === 'fader' && currentEditingCellIndex + 5 < 15) {
            gridConfig[currentEditingCellIndex + 5] = null;
        }
        gridConfig[currentEditingCellIndex] = null;
        saveGridConfig();
        renderGrid();
        hideEditModal();
    });

    closeEditModalBtn.addEventListener('click', hideEditModal);

    // --- Settings Modal ---
    function showSettingsModal() {
        settingsModal.classList.remove('hidden');
        fetchPorts();
    }

    function hideSettingsModal() {
        settingsModal.classList.add('hidden');
    }

    settingsCogBtn.addEventListener('click', showSettingsModal);
    closeSettingsModalBtn.addEventListener('click', hideSettingsModal);

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
    renderGrid();
    updateDMXStatus();
    setInterval(updateDMXStatus, 5000);
});