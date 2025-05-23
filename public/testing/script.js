let autoScroll = true;
let logCounter = 0;
let socket = null;

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
    setupEventListeners();
    setupWebSocket();
});

function setupEventListeners() {
    // Button click handlers
    document.getElementById('refreshBtn').addEventListener('click', refreshStatus);
    document.getElementById('clearLogsBtn').addEventListener('click', clearLogs);
    document.getElementById('sendBtn').addEventListener('click', sendMessage);
    document.getElementById('copyBtn').addEventListener('click', copyResponse);
    document.getElementById('autoScrollBtn').addEventListener('click', toggleAutoScroll);
    document.getElementById('closeModalBtn').addEventListener('click', closeFunctionModal);

    // Select change handlers
    document.getElementById('templateSelect').addEventListener('change', handleTemplateSelect);
    document.getElementById('functionSelect').addEventListener('change', handleFunctionSelect);

    // Modal close on outside click
    window.addEventListener('click', function(event) {
        const modal = document.getElementById('functionModal');
        if (event.target === modal) {
            modal.style.display = 'none';
        }
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', function(event) {
        if (event.ctrlKey && event.key === 'Enter') {
            event.preventDefault();
            sendMessage();
        }
        if (event.ctrlKey && event.key === 'l') {
            event.preventDefault();
            clearLogs();
        }
    });
}

function setupWebSocket() {
    socket = io();

    socket.on('connect', () => {
        logMessage('info', 'Connected to server');
    });

    socket.on('disconnect', () => {
        logMessage('warn', 'Disconnected from server');
    });

    socket.on('message:processing', (data) => {
        logMessage('info', `Processing message ${data.messageId}...`);
    });

    socket.on('message:orchestration', (data) => {
        logMessage('info', `Orchestrating message ${data.messageId}...`);
    });

    socket.on('message:responding', (data) => {
        logMessage('info', `Sending response for message ${data.messageId}...`);
    });

    socket.on('message:complete', (data) => {
        const responseOutput = document.getElementById('responseOutput');
        responseOutput.value = JSON.stringify(data.response, null, 2);
        logMessage('info', `Message ${data.messageId} processed successfully`);
    });

    socket.on('message:error', (data) => {
        const responseOutput = document.getElementById('responseOutput');
        responseOutput.value = `Error: ${data.error}`;
        logMessage('error', `Error processing message ${data.messageId}: ${data.error}`);
    });
}

async function initializeApp() {
    logMessage('info', 'Initializing AI Agent Testing Interface...');
    
    try {
        await Promise.all([
            loadMessageTemplates(),
            loadFunctions(),
            refreshStatus()
        ]);
        
        logMessage('info', 'Application initialized successfully');
        startStatusMonitoring();
    } catch (error) {
        logMessage('error', `Initialization failed: ${error.message}`);
    }
}

async function loadMessageTemplates() {
    try {
        const response = await fetch('/api/message-templates');
        const data = await response.json();
        
        const select = document.getElementById('templateSelect');
        select.innerHTML = '<option value="">Select a message template...</option>';
        
        data.templates.forEach(template => {
            const option = document.createElement('option');
            option.value = template.content;
            option.textContent = `${template.name} - ${template.description}`;
            select.appendChild(option);
        });
        
        logMessage('info', `Loaded ${data.templates.length} message templates`);
    } catch (error) {
        logMessage('error', `Failed to load message templates: ${error.message}`);
    }
}

async function loadFunctions() {
    try {
        const response = await fetch('/api/functions');
        const data = await response.json();
        
        const select = document.getElementById('functionSelect');
        select.innerHTML = '<option value="">View function definitions...</option>';
        
        data.functions.forEach(func => {
            const option = document.createElement('option');
            option.value = func.name;
            option.textContent = `${func.name} (${func.type}) - ${func.description}`;
            select.appendChild(option);
        });
        
        logMessage('info', `Loaded ${data.functions.length} function definitions`);
    } catch (error) {
        logMessage('error', `Failed to load functions: ${error.message}`);
    }
}

async function refreshStatus() {
    const refreshBtn = document.getElementById('refreshBtn');
    const originalText = refreshBtn.textContent;
    refreshBtn.innerHTML = '<span class="loading"></span> Refreshing...';
    refreshBtn.disabled = true;
    
    try {
        const response = await fetch('/health');
        const data = await response.json();
        
        updateStatusLights(data.modules);
        logMessage('info', `System status updated - Overall: ${data.status}`);
        
        data.modules.forEach(module => {
            logMessage(module.status === 'healthy' ? 'info' : 'warn', 
                      `${module.module}: ${module.status} - ${module.details}`);
        });
        
    } catch (error) {
        logMessage('error', `Failed to refresh status: ${error.message}`);
        updateStatusLights([]);
    } finally {
        refreshBtn.textContent = originalText;
        refreshBtn.disabled = false;
    }
}

function updateStatusLights(modules) {
    const container = document.getElementById('statusLights');
    container.innerHTML = '';
    
    if (modules.length === 0) {
        container.innerHTML = '<div class="status-item"><div class="status-light unknown"></div>System Status Unknown</div>';
        return;
    }
    
    modules.forEach(module => {
        const statusItem = document.createElement('div');
        statusItem.className = 'status-item';
        statusItem.innerHTML = `
            <div class="status-light ${module.status}"></div>
            ${module.module}
        `;
        statusItem.title = module.details;
        container.appendChild(statusItem);
    });
}

function startStatusMonitoring() {
    setInterval(refreshStatus, 30000);
    logMessage('info', 'Status monitoring started (30s intervals)');
}

function handleTemplateSelect() {
    const template = this.value;
    if (template) {
        const messageInput = document.getElementById('messageInput');
        
        const messageObj = {
            content: template,
            metadata: {
                userId: "test-user",
                sessionId: "test-session-" + Date.now(),
                timestamp: new Date().toISOString()
            }
        };
        
        messageInput.value = JSON.stringify(messageObj, null, 2);
        logMessage('info', `Template selected: ${this.options[this.selectedIndex].text}`);
    }
}

async function handleFunctionSelect() {
    const functionName = this.value;
    if (functionName) {
        await showFunctionDefinition(functionName);
        this.value = ''; // Reset selection
    }
}

async function showFunctionDefinition(functionName) {
    try {
        const response = await fetch(`/api/functions/${functionName}`);
        const data = await response.json();
        
        if (data.function) {
            displayFunctionModal(data.function);
            logMessage('info', `Viewing function definition: ${functionName}`);
        } else {
            logMessage('error', `Function ${functionName} not found`);
        }
    } catch (error) {
        logMessage('error', `Failed to load function ${functionName}: ${error.message}`);
    }
}

function displayFunctionModal(funcDef) {
    const modal = document.getElementById('functionModal');
    const details = document.getElementById('functionDetails');
    
    details.innerHTML = `
        <h2>${funcDef.name}</h2>
        <div class="function-definition">
            <p><strong>Type:</strong> ${funcDef.type}</p>
            <p><strong>Description:</strong> ${funcDef.description}</p>
            <p><strong>Timeout:</strong> ${funcDef.timeout || 30000}ms</p>
            <p><strong>Retries:</strong> ${funcDef.retries || 3}</p>
            
            <h3>Parameters:</h3>
            ${funcDef.parameters.map(param => `
                <div class="parameter">
                    <strong>${param.name}</strong> (${param.type}) ${param.required ? '- Required' : '- Optional'}
                    <p>${param.description}</p>
                    ${param.default !== undefined ? `<p><em>Default: ${param.default}</em></p>` : ''}
                </div>
            `).join('')}
        </div>
    `;
    
    modal.style.display = 'block';
}

function closeFunctionModal() {
    document.getElementById('functionModal').style.display = 'none';
}

async function sendMessage() {
    const messageInput = document.getElementById('messageInput');
    const responseOutput = document.getElementById('responseOutput');
    const sendBtn = document.getElementById('sendBtn');
    
    const originalText = sendBtn.textContent;
    sendBtn.innerHTML = '<span class="loading"></span> Sending...';
    sendBtn.disabled = true;
    
    try {
        let messageData;
        const inputText = messageInput.value.trim();
        
        if (!inputText) {
            throw new Error('Please enter a message');
        }
        
        try {
            messageData = JSON.parse(inputText);
        } catch {
            messageData = {
                content: inputText,
                metadata: {
                    userId: "test-user",
                    sessionId: "test-session-" + Date.now(),
                    timestamp: new Date().toISOString()
                }
            };
        }
        
        if (!messageData.content) {
            throw new Error('Message must have content property');
        }
        
        logMessage('info', `Sending message: ${messageData.content.substring(0, 50)}...`);
        
        const response = await fetch('/api/test-message', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(messageData)
        });
        
        const result = await response.json();
        
        if (response.ok) {
            responseOutput.value = JSON.stringify(result, null, 2);
            logMessage('info', `Message sent successfully - ID: ${result.messageId}`);
            logMessage('info', 'Waiting for system response...');
        } else {
            responseOutput.value = JSON.stringify(result, null, 2);
            logMessage('error', `Failed to send message: ${result.error}`);
        }
        
    } catch (error) {
        responseOutput.value = `Error: ${error.message}`;
        logMessage('error', `Send message error: ${error.message}`);
    } finally {
        sendBtn.textContent = originalText;
        sendBtn.disabled = false;
    }
}

function copyResponse() {
    const responseOutput = document.getElementById('responseOutput');
    responseOutput.select();
    document.execCommand('copy');
    
    const copyBtn = document.getElementById('copyBtn');
    const originalText = copyBtn.textContent;
    copyBtn.textContent = '✅ Copied!';
    
    setTimeout(() => {
        copyBtn.textContent = originalText;
    }, 2000);
    
    logMessage('info', 'Response copied to clipboard');
}

function logMessage(level, message) {
    const console = document.getElementById('logsConsole');
    const timestamp = new Date().toLocaleTimeString();
    
    const logEntry = document.createElement('div');
    logEntry.className = 'log-entry';
    logEntry.innerHTML = `
        <span class="log-timestamp">[${timestamp}]</span>
        <span class="log-level-${level}">[${level.toUpperCase()}]</span>
        ${message}
    `;
    
    console.appendChild(logEntry);
    
    if (autoScroll) {
        console.scrollTop = console.scrollHeight;
    }
    
    logCounter++;
}

function toggleAutoScroll() {
    autoScroll = !autoScroll;
    const btn = document.getElementById('autoScrollBtn');
    btn.textContent = `📜 Auto-scroll: ${autoScroll ? 'ON' : 'OFF'}`;
    
    logMessage('info', `Auto-scroll ${autoScroll ? 'enabled' : 'disabled'}`);
}

function clearLogs() {
    document.getElementById('logsConsole').innerHTML = '';
    logCounter = 0;
    logMessage('info', 'Logs cleared');
}

// Add initial logs
setTimeout(() => {
    logMessage('info', 'AI Agent Testing Interface ready');
    logMessage('info', 'Use Ctrl+Enter to send messages, Ctrl+L to clear logs');
}, 100);
