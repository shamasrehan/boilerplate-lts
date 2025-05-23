let autoScroll = true;
let logCounter = 0;
let socket = null;
let currentMessageId = null;

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
        logMessage('info', 'Connected to server via WebSocket');
        updateConnectionStatus(true);
    });

    socket.on('disconnect', () => {
        logMessage('warn', 'Disconnected from server');
        updateConnectionStatus(false);
    });

    // Message processing events
    socket.on('message:processing', (data) => {
        logMessage('info', `Processing message ${data.messageId}...`);
        updateMessageStatus('processing', data);
    });

    socket.on('message:orchestration', (data) => {
        logMessage('info', `Orchestrating message ${data.messageId} - LLM analyzing request...`);
        updateMessageStatus('orchestration', data);
    });

    socket.on('message:responding', (data) => {
        logMessage('info', `Sending response for message ${data.messageId}...`);
        updateMessageStatus('responding', data);
    });

    socket.on('message:complete', (data) => {
        const responseOutput = document.getElementById('responseOutput');
        responseOutput.value = typeof data.response === 'object' 
            ? JSON.stringify(data.response, null, 2)
            : data.response.content || data.response;
        
        logMessage('info', `Message ${data.messageId} processed successfully`);
        updateMessageStatus('complete', data);
        currentMessageId = null;
        enableSendButton();
    });

    socket.on('message:error', (data) => {
        const responseOutput = document.getElementById('responseOutput');
        responseOutput.value = `Error: ${data.error}`;
        logMessage('error', `Error processing message ${data.messageId}: ${data.error}`);
        updateMessageStatus('error', data);
        currentMessageId = null;
        enableSendButton();
    });

    // Job execution events
    socket.on('job:created', (data) => {
        logMessage('info', `Job created: ${data.jobId} for function ${data.functionName}`);
    });

    socket.on('job:started', (data) => {
        logMessage('info', `Job started: ${data.jobId}`);
    });

    socket.on('job:completed', (data) => {
        logMessage('info', `Job completed: ${data.jobId}`);
    });

    socket.on('job:failed', (data) => {
        logMessage('error', `Job failed: ${data.jobId} - ${data.error}`);
    });
}

function updateConnectionStatus(connected) {
    const statusLights = document.getElementById('statusLights');
    const wsStatus = document.querySelector('.ws-status');
    
    if (!wsStatus) {
        const statusItem = document.createElement('div');
        statusItem.className = 'status-item ws-status';
        statusItem.innerHTML = `
            <div class="status-light ${connected ? 'healthy' : 'unhealthy'}"></div>
            WebSocket
        `;
        statusLights.insertBefore(statusItem, statusLights.firstChild);
    } else {
        const light = wsStatus.querySelector('.status-light');
        light.className = `status-light ${connected ? 'healthy' : 'unhealthy'}`;
    }
}

function updateMessageStatus(status, data) {
    const statusContainer = document.getElementById('messageStatus');
    if (!statusContainer) {
        const responsePanel = document.querySelector('.panel:nth-child(2) .panel-header');
        const statusDiv = document.createElement('div');
        statusDiv.id = 'messageStatus';
        statusDiv.style.fontSize = '0.85rem';
        statusDiv.style.color = '#667eea';
        statusDiv.style.marginLeft = 'auto';
        responsePanel.insertBefore(statusDiv, responsePanel.lastChild);
    }
    
    const statusText = {
        'processing': 'Processing...',
        'orchestration': 'Analyzing with LLM...',
        'responding': 'Generating response...',
        'complete': 'Complete',
        'error': 'Error'
    };
    
    const statusElement = document.getElementById('messageStatus');
    if (statusElement) {
        statusElement.textContent = statusText[status] || status;
        statusElement.style.color = status === 'error' ? '#ef4444' : 
                                  status === 'complete' ? '#4ade80' : '#667eea';
    }
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
            option.value = JSON.stringify({
                content: template.content,
                isTemplate: true
            });
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
        
        // Group functions by type
        const grouped = {
            helper: [],
            runner: [],
            worker: []
        };
        
        data.functions.forEach(func => {
            grouped[func.type].push(func);
        });
        
        // Add grouped options
        Object.entries(grouped).forEach(([type, funcs]) => {
            if (funcs.length > 0) {
                const optgroup = document.createElement('optgroup');
                optgroup.label = type.charAt(0).toUpperCase() + type.slice(1) + ' Functions';
                
                funcs.forEach(func => {
                    const option = document.createElement('option');
                    option.value = func.name;
                    option.textContent = `${func.name} - ${func.description}`;
                    optgroup.appendChild(option);
                });
                
                select.appendChild(optgroup);
            }
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
            if (module.status !== 'healthy') {
                logMessage('warn', `${module.module}: ${module.status} - ${module.details}`);
            }
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
    
    // Preserve WebSocket status
    const wsStatus = container.querySelector('.ws-status');
    container.innerHTML = '';
    
    if (wsStatus) {
        container.appendChild(wsStatus);
    }
    
    if (modules.length === 0) {
        container.innerHTML += '<div class="status-item"><div class="status-light unknown"></div>System Status Unknown</div>';
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
    const templateData = this.value;
    if (templateData) {
        try {
            const template = JSON.parse(templateData);
            const messageInput = document.getElementById('messageInput');
            
            const messageObj = {
                content: template.content,
                metadata: {
                    userId: "test-user",
                    sessionId: "test-session-" + Date.now(),
                    timestamp: new Date().toISOString()
                }
            };
            
            messageInput.value = JSON.stringify(messageObj, null, 2);
            logMessage('info', `Template selected: ${this.options[this.selectedIndex].text}`);
        } catch (error) {
            logMessage('error', 'Failed to parse template');
        }
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
            <p><strong>Type:</strong> <span style="color: #667eea; text-transform: uppercase;">${funcDef.type}</span></p>
            <p><strong>Description:</strong> ${funcDef.description}</p>
            <p><strong>Timeout:</strong> ${funcDef.timeout || 30000}ms</p>
            <p><strong>Retries:</strong> ${funcDef.retries || 3}</p>
            
            <h3>Parameters:</h3>
            ${funcDef.parameters.length > 0 ? funcDef.parameters.map(param => `
                <div class="parameter">
                    <strong>${param.name}</strong> (${param.type}) ${param.required ? '<span style="color: #ef4444;">- Required</span>' : '<span style="color: #4ade80;">- Optional</span>'}
                    <p>${param.description}</p>
                    ${param.default !== undefined ? `<p><em>Default: ${param.default}</em></p>` : ''}
                </div>
            `).join('') : '<p>No parameters required</p>'}
            
            <h3>Example Usage:</h3>
            <div class="parameter" style="background: #1a1a1a; color: #00ff00; font-family: monospace; padding: 15px;">
                ${generateExampleUsage(funcDef)}
            </div>
        </div>
    `;
    
    modal.style.display = 'block';
}

function generateExampleUsage(funcDef) {
    const examples = {
        weather: `"What's the weather in London?"`,
        mathUtils: `"Calculate the average of 10, 20, 30, 45, 55"`,
        stringUtils: `"Convert this text to uppercase: hello world"`,
        timer: `"Set a timer for 5 seconds"`,
        sentimentAnalysis: `"Analyze sentiment: I love this amazing product!"`
    };
    
    return examples[funcDef.name] || `"Execute ${funcDef.name} function"`;
}

function closeFunctionModal() {
    document.getElementById('functionModal').style.display = 'none';
}

async function sendMessage() {
    const messageInput = document.getElementById('messageInput');
    const responseOutput = document.getElementById('responseOutput');
    const sendBtn = document.getElementById('sendBtn');
    
    const originalText = sendBtn.textContent;
    
    try {
        let messageData;
        const inputText = messageInput.value.trim();
        
        if (!inputText) {
            throw new Error('Please enter a message');
        }
        
        // Disable button and show loading
        sendBtn.innerHTML = '<span class="loading"></span> Sending...';
        sendBtn.disabled = true;
        responseOutput.value = 'Waiting for response...';
        
        try {
            messageData = JSON.parse(inputText);
        } catch {
            // If not JSON, create message object
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
            currentMessageId = result.messageId;
            logMessage('info', `Message sent successfully - ID: ${result.messageId}`);
            logMessage('info', 'Waiting for processing pipeline...');
            
            // Don't re-enable button yet - wait for WebSocket events
            sendBtn.innerHTML = '<span class="loading"></span> Processing...';
        } else {
            responseOutput.value = JSON.stringify(result, null, 2);
            logMessage('error', `Failed to send message: ${result.error}`);
            enableSendButton();
        }
        
    } catch (error) {
        responseOutput.value = `Error: ${error.message}`;
        logMessage('error', `Send message error: ${error.message}`);
        enableSendButton();
    }
}

function enableSendButton() {
    const sendBtn = document.getElementById('sendBtn');
    sendBtn.textContent = 'Send Message';
    sendBtn.disabled = false;
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
    
    // Add icon based on level
    const icons = {
        info: '📘',
        warn: '⚠️',
        error: '❌'
    };
    
    logEntry.innerHTML = `
        <span class="log-timestamp">[${timestamp}]</span>
        <span class="log-level-${level}">${icons[level] || ''} [${level.toUpperCase()}]</span>
        ${message}
    `;
    
    console.appendChild(logEntry);
    
    if (autoScroll) {
        console.scrollTop = console.scrollHeight;
    }
    
    logCounter++;
    
    // Limit log entries
    if (console.children.length > 1000) {
        console.removeChild(console.firstChild);
    }
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

// Add workflow visualization
function showWorkflowStatus() {
    const workflowSteps = [
        { id: 'receive', name: 'Message Received', status: 'pending' },
        { id: 'process', name: 'Processing', status: 'pending' },
        { id: 'orchestrate', name: 'LLM Analysis', status: 'pending' },
        { id: 'execute', name: 'Function Execution', status: 'pending' },
        { id: 'respond', name: 'Response Sent', status: 'pending' }
    ];
    
    // You can add a visual workflow indicator here
}

// Add initial logs
setTimeout(() => {
    logMessage('info', '🚀 AI Agent Testing Interface ready');
    logMessage('info', 'Use Ctrl+Enter to send messages, Ctrl+L to clear logs');
    logMessage('info', 'Workflow: RabbitMQ → AgentMaster → LLM → JobQueue → Function → Response');
}, 100);