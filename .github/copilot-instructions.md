# ioBroker Adapter Development with GitHub Copilot

**Version:** 0.4.0
**Template Source:** https://github.com/DrozmotiX/ioBroker-Copilot-Instructions

This file contains instructions and best practices for GitHub Copilot when working on ioBroker adapter development.

## Project Context

You are working on an ioBroker adapter. ioBroker is an integration platform for the Internet of Things, focused on building smart home and industrial IoT solutions. Adapters are plugins that connect ioBroker to external systems, devices, or services.

This is the **Helios KWL easyControls** adapter that connects to Helios KWL (Kontrollierte Wohnungslüftung - Controlled Ventilation) systems. Helios KWL systems are residential ventilation units that provide fresh air exchange with heat recovery. The adapter communicates with these systems via HTTP requests to their easyControls web interface.

## Adapter-Specific Context

### Core Functionality
- **Adapter Name**: helios
- **Primary Function**: Climate control for Helios KWL ventilation systems
- **Communication**: HTTP-based communication with Helios easyControls web interface
- **Data Points**: Extensive set of predefined data points for system monitoring and control
- **Configuration**: IP address, password authentication, configurable polling intervals

### Key Components
- **Main Data Points File** (`datapoints.js`): Contains over 500 predefined data points organized by categories:
  - System status and operational data
  - Fan speeds and operating modes
  - Temperature sensors (intake, exhaust, outdoor, supply)
  - Filter status and maintenance indicators
  - Party mode and vacation mode controls
  - Weekly scheduling parameters
  - Error codes and diagnostic information

### Communication Pattern
- **HTTP Polling**: Regular requests to various endpoint pages (info.htm, anzeig.htm, woche.htm, etc.)
- **Remote Commands**: Write operations to controllable data points trigger commands to the system
- **Authentication**: Password-based authentication for system access
- **Data Updates**: Configurable array of data point categories for selective updating

### System Integration Points
1. **info.htm**: Current fan speed and operating mode
2. **anzeig.htm**: System status, temperatures, fan speeds
3. **party.htm / ruhe.htm**: Party mode and quiet mode controls  
4. **woche.htm**: Weekly schedule programming
5. **urlaub.htm**: Vacation mode settings
6. **nachheiz.htm**: Post-heating profiles
7. **tinfo.htm**: Device information and serial numbers

## Testing

### Unit Testing
- Use Jest as the primary testing framework for ioBroker adapters
- Create tests for all adapter main functions and helper methods
- Test error handling scenarios and edge cases
- Mock external API calls and hardware dependencies
- For adapters connecting to APIs/devices not reachable by internet, provide example data files to allow testing of functionality without live connections
- Example test structure:
  ```javascript
  describe('AdapterName', () => {
    let adapter;
    
    beforeEach(() => {
      // Setup test adapter instance
    });
    
    test('should initialize correctly', () => {
      // Test adapter initialization
    });
  });
  ```

### Integration Testing

**IMPORTANT**: Use the official `@iobroker/testing` framework for all integration tests. This is the ONLY correct way to test ioBroker adapters.

**Official Documentation**: https://github.com/ioBroker/testing

#### Framework Structure
Integration tests MUST follow this exact pattern:

```javascript
const path = require('path');
const { tests } = require('@iobroker/testing');

// Define test coordinates or configuration
const TEST_COORDINATES = '52.520008,13.404954'; // Berlin
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

// Use tests.integration() with defineAdditionalTests
tests.integration(path.join(__dirname, '..'), {
    defineAdditionalTests({ suite }) {
        suite('Test adapter with specific configuration', (getHarness) => {
            let harness;

            before(() => {
                harness = getHarness();
            });

            it('should configure and start adapter', function () {
                return new Promise(async (resolve, reject) => {
                    try {
                        harness = getHarness();
                        
                        // Get adapter object using promisified pattern
                        const obj = await new Promise((res, rej) => {
                            harness.objects.getObject('system.adapter.your-adapter.0', (err, o) => {
                                if (err) return rej(err);
                                res(o);
                            });
                        });
                        
                        if (!obj) {
                            return reject(new Error('Adapter object not found'));
                        }

                        // Configure adapter properties
                        Object.assign(obj.native, {
                            position: TEST_COORDINATES,
                            createCurrently: true,
                            createHourly: true,
                            createDaily: true,
                            // Add other configuration as needed
                        });

                        // Set the updated configuration
                        harness.objects.setObject(obj._id, obj);

                        console.log('✅ Step 1: Configuration written, starting adapter...');
                        
                        // Start adapter and wait
                        await harness.startAdapterAndWait();
                        
                        console.log('✅ Step 2: Adapter started');

                        // Wait for adapter to process data
                        const waitMs = 15000;
                        await wait(waitMs);

                        console.log('🔍 Step 3: Checking states after adapter run...');
                        
                        // Get states and validate
                        const states = await harness.states.getKeysAsync('your-adapter.0.*');
                        console.log(`Found ${states.length} states`);
                        
                        if (states.length > 0) {
                            console.log('Sample states:');
                            for (let i = 0; i < Math.min(5, states.length); i++) {
                                const state = await harness.states.getStateAsync(states[i]);
                                console.log(`  ${states[i]}: ${state ? state.val : 'null'} (${state ? typeof state.val : 'N/A'})`);
                            }
                        }
                        
                        resolve();
                    } catch (error) {
                        reject(error);
                    }
                });
            });
        });
    }
});
```

#### Important Testing Guidelines:

1. **Always Use `tests.integration()`**: This is the official and ONLY correct method for integration testing
2. **Use `defineAdditionalTests`**: Structure tests with the `{ suite }` parameter
3. **Proper Harness Usage**: Always get harness with `getHarness()` in your suite
4. **Async/Await Patterns**: Use proper promise handling as shown in examples
5. **State Validation**: Always validate that expected states are created and have correct values
6. **Cleanup**: The framework handles cleanup automatically

#### Framework Benefits:
- Simulates real ioBroker environment
- Handles adapter lifecycle (start/stop)
- Provides database (states/objects) simulation  
- Manages timers and intervals properly
- Cleans up resources after tests

### Authentication and Security Testing
- Never hardcode real passwords in tests
- Use mock responses for HTTP authentication flows
- Test password encryption/decryption if implemented
- Validate proper error handling for authentication failures

## Development Guidelines

### ioBroker Adapter Patterns

#### State Management
```javascript
// Creating states with proper structure
await this.setObjectNotExistsAsync('device.temperature', {
    type: 'state',
    common: {
        name: 'Temperature',
        type: 'number',
        role: 'value.temperature',
        unit: '°C',
        read: true,
        write: false,
    },
    native: {},
});

// Setting state values
await this.setStateAsync('device.temperature', { val: 23.5, ack: true });
```

#### Error Handling and Logging
```javascript
try {
    // Adapter operations
    this.log.debug('Debug message');
    this.log.info('Information message');
    this.log.warn('Warning message');
    this.log.error('Error message');
} catch (error) {
    this.log.error(`Error in operation: ${error.message}`);
}
```

#### Connection Status Management
```javascript
// Set connection status
await this.setStateAsync('info.connection', { val: true, ack: true });

// Handle disconnection
await this.setStateAsync('info.connection', { val: false, ack: true });
```

#### Interval Management
```javascript
// Setting up intervals
if (this.updateInterval) {
    this.clearInterval(this.updateInterval);
}
this.updateInterval = this.setInterval(() => {
    this.updateData();
}, this.config.interval * 1000);

// Cleanup in unload
if (this.updateInterval) {
    this.clearInterval(this.updateInterval);
    this.updateInterval = null;
}
```

#### State Change Handling
```javascript
onStateChange(id, state) {
    if (!state || state.ack) return;
    
    try {
        // Handle state changes for controlling devices
        const deviceId = id.replace(this.namespace + '.', '');
        this.sendCommand(deviceId, state.val);
    } catch (error) {
        this.log.error(`Error handling state change: ${error.message}`);
    }
}
```

### HTTP Communication Patterns

For adapters like Helios that use HTTP communication:

```javascript
const axios = require('axios');

// HTTP request with proper error handling
async function makeRequest(url, options = {}) {
    try {
        const response = await axios({
            url: url,
            timeout: 10000,
            ...options
        });
        return response.data;
    } catch (error) {
        if (error.code === 'ECONNREFUSED') {
            throw new Error('Device not reachable - check IP address and network connection');
        } else if (error.response && error.response.status === 401) {
            throw new Error('Authentication failed - check password');
        } else if (error.code === 'ETIMEDOUT') {
            throw new Error('Request timeout - device may be overloaded');
        } else {
            throw error;
        }
    }
}
```

### Configuration Validation
```javascript
// Validate required configuration
onReady() {
    if (!this.config.ip) {
        this.log.error('IP address is required');
        return;
    }
    
    if (!this.config.password) {
        this.log.error('Password is required');
        return;
    }
    
    // Continue with adapter initialization
    this.main();
}
```

### Resource Cleanup
```javascript
async unload(callback) {
  try {
    // Clear all intervals and timeouts
    if (this.updateInterval) {
      this.clearInterval(this.updateInterval);
      this.updateInterval = undefined;
    }
    if (this.connectionTimer) {
      this.clearTimeout(this.connectionTimer);
      this.connectionTimer = undefined;
    }
    // Close connections, clean up resources
    callback();
  } catch (e) {
    callback();
  }
}
```

## Code Style and Standards

- Follow JavaScript/TypeScript best practices
- Use async/await for asynchronous operations
- Implement proper resource cleanup in `unload()` method
- Use semantic versioning for adapter releases
- Include proper JSDoc comments for public methods

## CI/CD and Testing Integration

### GitHub Actions for API Testing
For adapters with external API dependencies, implement separate CI/CD jobs:

```yaml
# Tests API connectivity with demo credentials (runs separately)
demo-api-tests:
  if: contains(github.event.head_commit.message, '[skip ci]') == false
  
  runs-on: ubuntu-22.04
  
  steps:
    - name: Checkout code
      uses: actions/checkout@v4
      
    - name: Use Node.js 20.x
      uses: actions/setup-node@v4
      with:
        node-version: 20.x
        cache: 'npm'
        
    - name: Install dependencies
      run: npm ci
      
    - name: Run demo API tests
      run: npm run test:integration-demo
```

### CI/CD Best Practices
- Run credential tests separately from main test suite
- Use ubuntu-22.04 for consistency
- Don't make credential tests required for deployment
- Provide clear failure messages for API connectivity issues
- Use appropriate timeouts for external API calls (120+ seconds)

### Package.json Script Integration
Add dedicated script for credential testing:
```json
{
  "scripts": {
    "test:integration-demo": "mocha test/integration-demo --exit"
  }
}
```

### Practical Example: Complete API Testing Implementation
Here's a complete example based on lessons learned from the Discovergy adapter:

#### test/integration-demo.js
```javascript
const path = require("path");
const { tests } = require("@iobroker/testing");

// Helper function to encrypt password using ioBroker's encryption method
async function encryptPassword(harness, password) {
    const systemConfig = await harness.objects.getObjectAsync("system.config");
    
    if (!systemConfig || !systemConfig.native || !systemConfig.native.secret) {
        throw new Error("Could not retrieve system secret for password encryption");
    }
    
    const secret = systemConfig.native.secret;
    let result = '';
    for (let i = 0; i < password.length; ++i) {
        result += String.fromCharCode(secret[i % secret.length].charCodeAt(0) ^ password.charCodeAt(i));
    }
    
    return result;
}

// Run integration tests with demo credentials
tests.integration(path.join(__dirname, ".."), {
    defineAdditionalTests({ suite }) {
        suite("API Testing with Demo Credentials", (getHarness) => {
            let harness;
            
            before(() => {
                harness = getHarness();
            });

            it("Should connect to API and initialize with demo credentials", async () => {
                console.log("Setting up demo credentials...");
                
                if (harness.isAdapterRunning()) {
                    await harness.stopAdapter();
                }
                
                const encryptedPassword = await encryptPassword(harness, "demo_password");
                
                await harness.changeAdapterConfig("your-adapter", {
                    native: {
                        username: "demo@provider.com",
                        password: encryptedPassword,
                        // other config options
                    }
                });

                console.log("Starting adapter with demo credentials...");
                await harness.startAdapter();
                
                // Wait for API calls and initialization
                await new Promise(resolve => setTimeout(resolve, 60000));
                
                const connectionState = await harness.states.getStateAsync("your-adapter.0.info.connection");
                
                if (connectionState && connectionState.val === true) {
                    console.log("✅ SUCCESS: API connection established");
                    return true;
                } else {
                    throw new Error("API Test Failed: Expected API connection to be established with demo credentials. " +
                        "Check logs above for specific API errors (DNS resolution, 401 Unauthorized, network issues, etc.)");
                }
            }).timeout(120000);
        });
    }
});
```

### Helios-Specific HTTP Testing Patterns

For the Helios adapter specifically, consider these patterns:

```javascript
// Mock Helios easyControls responses for testing
const mockHeliosResponses = {
    'info.htm': 'v00102=1&v00103=0&v00104=2&v00106=1', // Fan speed and mode
    'anzeig.htm': 'v00104=2&v00105=50&v00348=20.5&v00349=18.2', // System status and temperatures
    'woche.htm': 'v01033=1&v01034=2&v01035=3', // Weekly schedule data
    'party.htm': 'v00094=0&v00095=0', // Party mode settings
};

// Test HTTP endpoint parsing
describe('Helios Data Parsing', () => {
    test('should parse info.htm response correctly', () => {
        const data = parseHeliosResponse(mockHeliosResponses['info.htm']);
        expect(data['v00102']).toBe('1'); // Fan speed
        expect(data['v00104']).toBe('2'); // Operating mode
    });
});
```