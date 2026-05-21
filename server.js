const express = require('express');
const cors = require('cors');
const path = require('path');
const https = require('https');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Disable caching for API endpoints
app.use('/api', (req, res, next) => {
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Surrogate-Control': 'no-store'
  });
  next();
});

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Proxy endpoint
app.post('/proxy', async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { method, url, headers, body } = req.body;

    console.log('\n==================== Proxy Request ====================');
    console.log('Method:', method);
    console.log('URL:', url);
    console.log('Headers:', headers);
    console.log('Body:', body);
    console.log('=======================================================\n');

    // Validate required fields
    if (!method || !url) {
      return res.status(400).json({
        error: 'Missing required fields: method and url are required'
      });
    }

    // Prepare fetch options
    const fetchOptions = {
      method: method.toUpperCase(),
      headers: headers || {}
    };

    // Add body for non-GET requests
    if (method.toUpperCase() !== 'GET' && method.toUpperCase() !== 'HEAD' && body) {
      if (typeof body === 'string') {
        fetchOptions.body = body;
      } else {
        fetchOptions.body = JSON.stringify(body);
      }
    }

    // Make the request
    console.log('Fetching:', url);
    const response = await fetch(url, fetchOptions);
    console.log('Response status:', response.status, response.statusText);
    
    // Get response headers as object
    const responseHeaders = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    // Get response body
    const contentType = response.headers.get('content-type') || '';
    let responseBody;
    
    if (contentType.includes('application/json')) {
      try {
        responseBody = await response.json();
      } catch (e) {
        responseBody = await response.text();
      }
    } else {
      responseBody = await response.text();
    }

    console.log('Response body:', responseBody);

    // Calculate response time
    const responseTime = Date.now() - startTime;

    // Send response back to client
    res.json({
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
      body: responseBody,
      responseTime
    });

  } catch (error) {
    const responseTime = Date.now() - startTime;
    
    console.error('==================== Proxy Error ====================');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    console.error('====================================================\n');
    
    res.status(500).json({
      status: 500,
      statusText: 'Proxy Error',
      error: 'Proxy request failed',
      message: error.message,
      body: { error: error.message },
      responseTime
    });
  }
});

// API Docs - List OpenAPI spec files in a folder
app.post('/api/list-specs', async (req, res) => {
  const fs = require('fs').promises;
  const { source, folderPath, githubUrl } = req.body;
  
  if (!source) {
    return res.status(400).json({ error: 'Source type is required' });
  }
  
  try {
    if (source === 'local') {
      if (!folderPath) {
        return res.status(400).json({ error: 'Folder path is required' });
      }
      
      const items = await fs.readdir(folderPath, { withFileTypes: true });
      
      // Separate folders and files
      const folders = items
        .filter(item => item.isDirectory())
        .map(item => item.name);
      
      const jsonFiles = items
        .filter(item => item.isFile() && item.name.endsWith('.json'))
        .map(item => item.name);
      
      res.json({ folders, files: jsonFiles });
    } else if (source === 'github') {
      if (!githubUrl) {
        return res.status(400).json({ error: 'GitHub URL is required' });
      }
      
      // Parse GitHub URL to extract owner, repo, branch, and path
      const githubInfo = parseGithubUrl(githubUrl);
      if (!githubInfo) {
        return res.status(400).json({ error: 'Invalid GitHub URL format' });
      }
      
      // Fetch folder contents from GitHub API
      const contents = await fetchGithubFolderContents(githubInfo);
      
      // Separate folders and files
      const folders = contents
        .filter(item => item.type === 'dir')
        .map(item => ({
          name: item.name,
          path: `${githubInfo.owner}/${githubInfo.repo}/${githubInfo.branch}/${item.path}`
        }));
      
      const jsonFiles = contents
        .filter(item => item.type === 'file' && item.name.endsWith('.json'))
        .map(item => ({
          name: item.name,
          download_url: item.download_url,
          path: item.path
        }));
      
      res.json({ folders, files: jsonFiles, githubInfo });
    } else {
      res.status(400).json({ error: 'Invalid source type' });
    }
  } catch (error) {
    console.error('Error listing API spec files:', error);
    res.status(500).json({ error: error.message });
  }
});

// API Docs - List files in a specific local or GitHub folder
app.post('/api/list-folder-contents', async (req, res) => {
  const fs = require('fs').promises;
  const { source, folderPath } = req.body;
  
  if (!source || !folderPath) {
    return res.status(400).json({ error: 'Source and folder path are required' });
  }
  
  try {
    if (source === 'local') {
      const items = await fs.readdir(folderPath, { withFileTypes: true });
      
      // Separate folders and files
      const folders = items
        .filter(item => item.isDirectory())
        .map(item => item.name);
      
      const jsonFiles = items
        .filter(item => item.isFile() && item.name.endsWith('.json'))
        .map(item => item.name);
      
      res.json({ folders, files: jsonFiles });
    } else {
      res.status(400).json({ error: 'Invalid source type for this endpoint' });
    }
  } catch (error) {
    console.error('Error listing folder contents:', error);
    res.status(500).json({ error: error.message });
  }
});

// API Docs - List files in a specific GitHub folder
app.post('/api/list-github-files', async (req, res) => {
  const { folderPath } = req.body;
  
  if (!folderPath) {
    return res.status(400).json({ error: 'Folder path is required' });
  }
  
  try {
    // The folderPath here is the GitHub API contents URL path
    // We need to reconstruct from stored settings or pass complete info
    // For now, we'll use a simpler approach: store githubInfo in the initial response
    
    // Parse the folder path which should be in format: owner/repo/branch/path
    const parts = folderPath.split('/');
    const owner = parts[0];
    const repo = parts[1];
    const branch = parts[2];
    const path = parts.slice(3).join('/');
    
    // Fetch folder contents from GitHub API
    const contents = await fetchGithubFolderContents({ owner, repo, branch, path });
    
    // Filter for JSON files
    const jsonFiles = contents.filter(item => item.type === 'file' && item.name.endsWith('.json'));
    
    res.json({ 
      files: jsonFiles.map(file => ({
        name: file.name,
        download_url: file.download_url,
        path: file.path
      }))
    });
  } catch (error) {
    console.error('Error listing GitHub folder contents:', error);
    res.status(500).json({ error: error.message });
  }
});

// API Docs - Load a specific OpenAPI spec file
app.post('/api/load-spec', async (req, res) => {
  const fs = require('fs').promises;
  const { source, folderPath, fileName, downloadUrl } = req.body;
  
  if (!source) {
    return res.status(400).json({ error: 'Source type is required' });
  }
  
  try {
    if (source === 'local') {
      if (!folderPath || !fileName) {
        return res.status(400).json({ error: 'Folder path and file name are required' });
      }
      
      const filePath = path.join(folderPath, fileName);
      const fileContent = await fs.readFile(filePath, 'utf-8');
      const spec = JSON.parse(fileContent);
      res.json(spec);
    } else if (source === 'github') {
      if (!downloadUrl) {
        return res.status(400).json({ error: 'Download URL is required' });
      }
      
      // Fetch raw file content from GitHub
      const content = await fetchGithubRawContent(downloadUrl);
      const spec = JSON.parse(content);
      res.json(spec);
    } else {
      res.status(400).json({ error: 'Invalid source type' });
    }
  } catch (error) {
    console.error('Error loading API spec file:', error);
    res.status(500).json({ error: error.message });
  }
});

// Helper function to parse GitHub URL
function parseGithubUrl(url) {
  // Expected format: https://github.com/{owner}/{repo}/tree/{branch}/{path}
  const regex = /github\.com\/([^\/]+)\/([^\/]+)\/tree\/([^\/]+)\/(.+)/;
  const match = url.match(regex);
  
  if (!match) {
    return null;
  }
  
  return {
    owner: match[1],
    repo: match[2],
    branch: match[3],
    path: match[4]
  };
}

// Helper function to fetch raw file content from GitHub
function fetchGithubRawContent(downloadUrl) {
  return new Promise((resolve, reject) => {
    https.get(downloadUrl, {
      headers: {
        'User-Agent': 'hconnect-api-client'
      }
    }, (response) => {
      let data = '';
      
      response.on('data', (chunk) => {
        data += chunk;
      });
      
      response.on('end', () => {
        if (response.statusCode === 200) {
          resolve(data);
        } else {
          reject(new Error(`Failed to fetch file: status ${response.statusCode}`));
        }
      });
    }).on('error', reject);
  });
}

// Helper function to fetch contents of a specific folder from GitHub API
function fetchGithubFolderContents(githubInfo) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      path: `/repos/${githubInfo.owner}/${githubInfo.repo}/contents/${githubInfo.path}?ref=${githubInfo.branch}`,
      method: 'GET',
      headers: {
        'User-Agent': 'hconnect-api-client',
        'Accept': 'application/vnd.github.v3+json'
      }
    };
    
    const req = https.request(options, (response) => {
      let data = '';
      
      response.on('data', (chunk) => {
        data += chunk;
      });
      
      response.on('end', () => {
        if (response.statusCode === 200) {
          resolve(JSON.parse(data));
        } else {
          reject(new Error(`GitHub API returned status ${response.statusCode}`));
        }
      });
    });
    
    req.on('error', reject);
    req.end();
  });
}

// API Docs - Download all specs from GitHub to local folder
app.post('/api/download-github-specs', async (req, res) => {
  const fs = require('fs').promises;
  const { githubUrl, localPath } = req.body;
  
  if (!githubUrl || !localPath) {
    return res.status(400).json({ error: 'GitHub URL and local path are required' });
  }
  
  try {
    // Parse GitHub URL
    const githubInfo = parseGithubUrl(githubUrl);
    if (!githubInfo) {
      return res.status(400).json({ error: 'Invalid GitHub URL format' });
    }
    
    // Ensure base folder exists
    await fs.mkdir(localPath, { recursive: true });
    
    // Download all files recursively
    const stats = { 
      filesDownloaded: 0, 
      foldersCreated: 0, 
      errors: [] 
    };
    
    await downloadGithubFolder(githubInfo, localPath, '', stats);
    
    res.json({ 
      success: true, 
      message: `Downloaded ${stats.filesDownloaded} files in ${stats.foldersCreated} folders`,
      stats 
    });
  } catch (error) {
    console.error('Error downloading GitHub specs:', error);
    res.status(500).json({ error: error.message });
  }
});

// Recursive function to download all files from a GitHub folder
async function downloadGithubFolder(githubInfo, localBasePath, relativePath, stats) {
  const fs = require('fs').promises;
  
  // Fetch contents of current folder
  const currentGithubInfo = {
    ...githubInfo,
    path: relativePath ? `${githubInfo.path}/${relativePath}` : githubInfo.path
  };
  
  const contents = await fetchGithubFolderContents(currentGithubInfo);
  
  for (const item of contents) {
    const itemRelativePath = relativePath ? `${relativePath}/${item.name}` : item.name;
    const itemLocalPath = path.join(localBasePath, itemRelativePath);
    
    if (item.type === 'dir') {
      // Create directory
      await fs.mkdir(itemLocalPath, { recursive: true });
      stats.foldersCreated++;
      
      // Recursively download contents
      await downloadGithubFolder(githubInfo, localBasePath, itemRelativePath, stats);
    } else if (item.type === 'file' && item.name.endsWith('.json')) {
      // Download file
      try {
        const content = await fetchGithubRawContent(item.download_url);
        await fs.writeFile(itemLocalPath, content, 'utf-8');
        stats.filesDownloaded++;
        console.log(`Downloaded: ${itemRelativePath}`);
      } catch (error) {
        console.error(`Error downloading ${itemRelativePath}:`, error.message);
        stats.errors.push({ file: itemRelativePath, error: error.message });
      }
    }
  }
}

// ==================== Database API Endpoints ====================

// Environments
app.get('/api/environments', (req, res) => {
  try {
    const environments = db.getAllEnvironments();
    res.json(environments);
  } catch (error) {
    console.error('Error getting environments:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/environments/:id', (req, res) => {
  try {
    const environment = db.getEnvironment(req.params.id);
    if (environment) {
      res.json(environment);
    } else {
      res.status(404).json({ error: 'Environment not found' });
    }
  } catch (error) {
    console.error('Error getting environment:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/environments', (req, res) => {
  try {
    const environment = db.saveEnvironment(req.body);
    res.json(environment);
  } catch (error) {
    console.error('Error saving environment:', error);
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/environments/:id', (req, res) => {
  try {
    const environment = db.saveEnvironment({ ...req.body, id: req.params.id });
    res.json(environment);
  } catch (error) {
    console.error('Error updating environment:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/environments/:id', (req, res) => {
  try {
    db.deleteEnvironment(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting environment:', error);
    res.status(500).json({ error: error.message });
  }
});

// Collections
app.get('/api/collections', (req, res) => {
  try {
    const collections = db.getAllCollections();
    res.json(collections);
  } catch (error) {
    console.error('Error getting collections:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/collections/:id', (req, res) => {
  try {
    const collection = db.getCollection(req.params.id);
    if (collection) {
      res.json(collection);
    } else {
      res.status(404).json({ error: 'Collection not found' });
    }
  } catch (error) {
    console.error('Error getting collection:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/collections', (req, res) => {
  try {
    const collection = db.saveCollection(req.body);
    res.json(collection);
  } catch (error) {
    console.error('Error saving collection:', error);
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/collections/:id', (req, res) => {
  try {
    const collection = db.saveCollection({ ...req.body, id: req.params.id });
    res.json(collection);
  } catch (error) {
    console.error('Error updating collection:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/collections/:id', (req, res) => {
  try {
    db.deleteCollection(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting collection:', error);
    res.status(500).json({ error: error.message });
  }
});

// Settings
app.get('/api/settings/:key', (req, res) => {
  try {
    const setting = db.getSetting(req.params.key);
    if (setting) {
      res.json(setting);
    } else {
      res.status(404).json({ error: 'Setting not found' });
    }
  } catch (error) {
    console.error('Error getting setting:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/settings', (req, res) => {
  try {
    const { key, value } = req.body;
    const setting = db.saveSetting(key, value);
    res.json(setting);
  } catch (error) {
    console.error('Error saving setting:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/settings/:key', (req, res) => {
  try {
    db.deleteSetting(req.params.key);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting setting:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== End Database API ====================

// ==================== In-Memory Payload Queue ====================
const payloadQueue = [];

app.post('/api/queue', (req, res) => {
  const item = { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, ...req.body, queuedAt: new Date().toISOString() };
  payloadQueue.push(item);
  res.json({ queued: payloadQueue.length, id: item.id });
});

app.get('/api/queue/count', (req, res) => {
  res.json({ count: payloadQueue.length });
});

app.get('/api/queue/next', (req, res) => {
  const item = payloadQueue.shift();
  if (!item) return res.status(204).send();

  if (item.contentType && item.contentType.includes('xml')) {
    res.set('Content-Type', 'application/xml');
    res.set('X-Queue-Id', item.id);
    res.set('X-Queue-Name', item.name || '');
    res.set('X-Queue-Remaining', String(payloadQueue.length));
    return res.send(item.body);
  }

  res.json(item);
});

app.delete('/api/queue', (req, res) => {
  const count = payloadQueue.length;
  payloadQueue.length = 0;
  res.json({ cleared: count });
});
// ==================== End In-Memory Payload Queue ====================

// Version endpoint
const { version: APP_VERSION } = require('./package.json');
app.get('/api/version', (req, res) => {
  res.json({ version: APP_VERSION });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Catch-all route to serve index.html for SPA routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start the server — called directly when run with `node server.js`, or by main.js in Electron
function start(port, callback) {
  const listenPort = port || PORT;
  const httpServer = app.listen(listenPort, () => {
    console.log(`🚀 hconnect API Client server running on http://localhost:${listenPort}`);
    console.log(`📁 Serving files from: ${path.join(__dirname, 'public')}`);
    console.log(`🔄 Proxy endpoint available at: http://localhost:${listenPort}/proxy`);
    console.log(`📖 API Docs endpoints available at: http://localhost:${listenPort}/api/list-specs and /api/load-spec`);
    if (callback) callback();
  });
  return httpServer;
}

if (require.main === module) {
  start();
}

module.exports = { app, start };
